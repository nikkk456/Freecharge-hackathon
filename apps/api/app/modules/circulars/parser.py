"""PDF -> clean text, with the character offsets everything downstream depends on.

The contract this module guarantees, and which Stage 3's citation verification
relies on absolutely:

    raw_text[span.char_start : span.char_end] == the text of that page

So once a model claims "the circular says X", we can check that the quoted span
really exists in `raw_text`, and say which page it came from. If this file ever
stops being byte-exact, citation verification silently becomes a lie — hence the
round-trip assertion in `assemble`.

**Text layer vs OCR is decided per page, not per document.** Real filings are
routinely hybrid: born-digital body pages plus a scanned annexure or a signed page.
Deciding once for the whole file would either skip OCR on the scanned pages or waste
minutes re-OCRing pages whose text was already perfect.

pdfplumber (MIT) for the text layer, pypdfium2 (Apache-2.0/BSD, already a pdfplumber
dependency) for rasterising. Not PyMuPDF: AGPL-3.0 needs a paid Artifex licence to
ship inside a bank.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import TYPE_CHECKING, Literal

import pdfplumber
import pypdfium2 as pdfium

from app.core.config import settings
from app.core.logging import get_logger

if TYPE_CHECKING:  # pragma: no cover - typing only
    from PIL.Image import Image

log = get_logger("circulars.parser")

PAGE_SEPARATOR = "\n\n"
TextSource = Literal["text_layer", "ocr", "empty"]


class PdfParseError(Exception):
    """The PDF cannot be turned into usable text. Message is shown to the human."""


class PdfEncrypted(PdfParseError):
    """Password-protected — a distinct case, because the human can actually fix it."""


@dataclass
class PageText:
    page: int  # 1-based
    text: str
    source: TextSource


@dataclass(frozen=True)
class PageSpan:
    page: int
    char_start: int
    char_end: int
    source: TextSource

    def as_dict(self) -> dict:
        return {
            "page": self.page,
            "char_start": self.char_start,
            "char_end": self.char_end,
            "source": self.source,
        }


@dataclass(frozen=True)
class ParsedPdf:
    raw_text: str
    pages: list[PageSpan]
    page_count: int
    ref_no: str | None
    issued_date: date | None

    @property
    def char_count(self) -> int:
        return len(self.raw_text)

    @property
    def ocr_page_count(self) -> int:
        return sum(1 for p in self.pages if p.source == "ocr")


# --------------------------------------------------------------------------
# Text cleanup — conservative on purpose
# --------------------------------------------------------------------------
# Each page is cleaned BEFORE its span is measured. Never mutate `raw_text` after
# the spans are computed, or every stored offset silently shifts.

_TRAILING_WS = re.compile(r"[ \t]+(?=\n)")
_MANY_BLANK_LINES = re.compile(r"\n{4,}")
_LIGATURES = {
    "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl",
    "­": "",  # soft hyphen
    "‘": "'", "’": "'", "“": '"', "”": '"',
    "–": "-", "—": "-", "‑": "-",
    " ": " ",  # non-breaking space
    "\x00": "",  # NUL bytes appear in some malformed text layers
}


def clean_page_text(text: str) -> str:
    for bad, good in _LIGATURES.items():
        text = text.replace(bad, good)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _TRAILING_WS.sub("", text)
    text = _MANY_BLANK_LINES.sub("\n\n\n", text)
    return text.strip()


# --------------------------------------------------------------------------
# Deterministic metadata extraction (no AI — the model refines this at Stage 2)
# --------------------------------------------------------------------------
_REF_NO = re.compile(r"\bRBI/\d{4}-\d{2,4}/\d+\b")
_ISSUED_DATE = re.compile(
    r"\b(January|February|March|April|May|June|July|August|September|October|"
    r"November|December)\s+(\d{1,2}),\s*(\d{4})\b"
)


def sniff_ref_no(text: str) -> str | None:
    match = _REF_NO.search(text[:4000])
    return match.group(0) if match else None


def sniff_issued_date(text: str) -> date | None:
    match = _ISSUED_DATE.search(text[:4000])
    if not match:
        return None
    try:
        return datetime.strptime(
            f"{match.group(1)} {match.group(2)} {match.group(3)}", "%B %d %Y"
        ).date()
    except ValueError:
        return None


# --------------------------------------------------------------------------
# Stage A — read whatever text layer exists
# --------------------------------------------------------------------------
_PASSWORD_HINTS = ("password", "encrypt")


def _as_parse_error(exc: Exception) -> PdfParseError:
    message = str(exc).lower()
    if any(hint in message for hint in _PASSWORD_HINTS):
        return PdfEncrypted(
            "This PDF is password-protected. Remove the password and upload it again."
        )
    return PdfParseError(f"Could not read the PDF: {exc}")


def extract_text_layer(data: bytes) -> list[PageText]:
    """Read the embedded text of every page. Pages with too little text are marked
    `empty`, which is the signal for the OCR pass — never an error on its own."""
    pages: list[PageText] = []
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            if not pdf.pages:
                raise PdfParseError("This PDF has no pages.")
            for index, page in enumerate(pdf.pages, start=1):
                try:
                    text = clean_page_text(page.extract_text() or "")
                except Exception as exc:  # noqa: BLE001 — one bad page must not kill the file
                    log.warning("page_text_failed", page=index, error=str(exc))
                    text = ""
                source: TextSource = (
                    "text_layer" if len(text) >= settings.ocr_min_page_chars else "empty"
                )
                pages.append(PageText(page=index, text=text, source=source))
    except PdfParseError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise _as_parse_error(exc) from exc
    return pages


def pages_needing_ocr(pages: list[PageText]) -> list[int]:
    return [p.page for p in pages if p.source == "empty"]


# --------------------------------------------------------------------------
# Stage B — rasterise the pages that need OCR
# --------------------------------------------------------------------------
def render_pages(data: bytes, page_numbers: list[int]) -> dict[int, Image]:
    """Render the given 1-based pages to PIL images at the configured DPI.

    pypdfium2 applies each page's own rotation, so a sideways scan arrives upright.
    """
    images: dict[int, Image] = {}
    scale = settings.ocr_dpi / 72
    try:
        document = pdfium.PdfDocument(data)
    except Exception as exc:  # noqa: BLE001
        raise _as_parse_error(exc) from exc

    try:
        total = len(document)
        for number in page_numbers:
            if not 1 <= number <= total:
                continue
            try:
                bitmap = document[number - 1].render(scale=scale)
                images[number] = bitmap.to_pil().convert("RGB")
            except Exception as exc:  # noqa: BLE001 — skip an unrenderable page, keep the rest
                log.warning("page_render_failed", page=number, error=str(exc))
    finally:
        document.close()
    return images


# --------------------------------------------------------------------------
# Stage C — assemble, and prove the offsets
# --------------------------------------------------------------------------
def assemble(pages: list[PageText]) -> ParsedPdf:
    """Join page texts and record each page's span. The only place spans are made."""
    chunks: list[str] = []
    spans: list[PageSpan] = []
    cursor = 0

    for position, page in enumerate(pages):
        if position > 0:
            chunks.append(PAGE_SEPARATOR)
            cursor += len(PAGE_SEPARATOR)
        chunks.append(page.text)
        spans.append(
            PageSpan(
                page=page.page,
                char_start=cursor,
                char_end=cursor + len(page.text),
                source=page.source,
            )
        )
        cursor += len(page.text)

    raw_text = "".join(chunks)

    # The guarantee this module exists for. Cheap to check, catastrophic to lose.
    for span, page in zip(spans, pages, strict=True):
        assert raw_text[span.char_start : span.char_end] == page.text, (
            f"page {span.page} span does not round-trip"
        )

    return ParsedPdf(
        raw_text=raw_text,
        pages=spans,
        page_count=len(pages),
        ref_no=sniff_ref_no(raw_text),
        issued_date=sniff_issued_date(raw_text),
    )


def page_for_offset(pages: list[dict], offset: int) -> int | None:
    """Which page does this character offset fall on? Used by citation display."""
    for span in pages:
        if span["char_start"] <= offset < span["char_end"]:
            return span["page"]
    return None
