"""PDF -> clean text, with the character offsets everything downstream depends on.

The contract this module guarantees, and which Stage 3's citation verification
relies on absolutely:

    raw_text[span.char_start : span.char_end] == the text of that page

So once a model claims "the circular says X", we can check that the quoted span
really exists in `raw_text`, and say which page it came from. If this file ever
stops being byte-exact, citation verification silently becomes a lie — hence the
round-trip assertion in `parse_pdf`.

pdfplumber (MIT, pure Python) rather than PyMuPDF (AGPL-3.0, needs a paid Artifex
licence to ship in a bank) or pypdf (no per-character geometry).
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass
from datetime import date, datetime

import pdfplumber

from app.core.logging import get_logger

log = get_logger("circulars.parser")

PAGE_SEPARATOR = "\n\n"


class PdfParseError(Exception):
    """Raised when a PDF cannot be turned into usable text."""


@dataclass(frozen=True)
class PageSpan:
    page: int  # 1-based
    char_start: int
    char_end: int

    def as_dict(self) -> dict:
        return {"page": self.page, "char_start": self.char_start, "char_end": self.char_end}


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


# --------------------------------------------------------------------------
# Text cleanup — conservative on purpose
# --------------------------------------------------------------------------
# Every transform here must be *length-preserving on the surviving characters*
# in the sense that we clean each page BEFORE measuring its span. Never mutate
# `raw_text` after the spans are computed, or the offsets stop matching.

_TRAILING_WS = re.compile(r"[ \t]+(?=\n)")
_MANY_BLANK_LINES = re.compile(r"\n{4,}")
# PDF text layers often carry a soft hyphen / ligature zoo; normalise the few that
# actually show up in RBI circulars and would otherwise break quote matching.
_LIGATURES = {
    "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl",
    "­": "",  # soft hyphen
    "‘": "'", "’": "'", "“": '"', "”": '"',
    "–": "-", "—": "-", "‑": "-",
    " ": " ",  # non-breaking space
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
# RBI circulars open with a reference like "RBI/2026-27/223" and a dated line
# like "DOR.MCS.REC.No.193/01-01-032/2026-27      August 6, 2026".
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
# The parse
# --------------------------------------------------------------------------
def parse_pdf(data: bytes) -> ParsedPdf:
    """Extract text page by page, recording each page's span in the joined text."""
    pages: list[PageSpan] = []
    chunks: list[str] = []
    cursor = 0

    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            page_count = len(pdf.pages)
            for index, page in enumerate(pdf.pages, start=1):
                text = clean_page_text(page.extract_text() or "")
                if index > 1:
                    chunks.append(PAGE_SEPARATOR)
                    cursor += len(PAGE_SEPARATOR)
                chunks.append(text)
                pages.append(PageSpan(page=index, char_start=cursor, char_end=cursor + len(text)))
                cursor += len(text)
    except PdfParseError:
        raise
    except Exception as exc:  # noqa: BLE001 — surface any pdfminer failure as one error
        raise PdfParseError(f"Could not read the PDF: {exc}") from exc

    raw_text = "".join(chunks)

    # The guarantee this whole module exists for. Cheap to check, catastrophic to lose.
    for span in pages:
        assert raw_text[span.char_start : span.char_end] == _page_text(chunks, span.page), (
            f"page {span.page} span does not round-trip"
        )

    return ParsedPdf(
        raw_text=raw_text,
        pages=pages,
        page_count=page_count,
        ref_no=sniff_ref_no(raw_text),
        issued_date=sniff_issued_date(raw_text),
    )


def _page_text(chunks: list[str], page: int) -> str:
    """chunks alternate [page1, sep, page2, sep, page3...] — page N is index 2*(N-1)."""
    return chunks[2 * (page - 1)]


def page_for_offset(pages: list[dict], offset: int) -> int | None:
    """Which page does this character offset fall on? Used by citation display."""
    for span in pages:
        if span["char_start"] <= offset < span["char_end"]:
            return span["page"]
    return None
