"""Ingestion against real PDFs, built here rather than committed as binaries.

Fixtures are generated with pypdfium2 + Pillow, which are already dependencies:

* `typed_pdf`   — a normal born-digital PDF with a text layer
* `scanned_pdf` — the same pages rendered to images, so the text layer is gone
* `hybrid_pdf`  — typed pages with one scanned page in the middle (the realistic case)

The OCR test is skipped when no engine is installed, so the suite still passes on a
machine without one.
"""
from __future__ import annotations

import io

import pypdfium2 as pdfium
import pytest
from PIL import Image, ImageDraw

from app.modules.circulars.ocr import available_engines
from app.modules.circulars.parser import (
    PdfParseError,
    extract_text_layer,
    pages_needing_ocr,
    render_pages,
)
from app.modules.circulars.service import UploadRejected, validate_upload

LINES = [
    "RBI/2026-27/223",
    "DOR.MCS.REC.No.193/01-01-032/2026-27 August 6, 2026",
    "An employee or recovery agent shall contact the borrower",
    "only between 08:00 hours and 19:00 hours on any day.",
    "Agents must hold the IIBF certificate before engagement.",
]


def _escape(text: str) -> str:
    for bad, good in (("\\", r"\\"), ("(", r"\("), (")", r"\)")):
        text = text.replace(bad, good)
    return text


def _typed_page_pdf(pages: int = 2) -> bytes:
    """A PDF with a genuine text layer, assembled by hand.

    Written out object by object with a real cross-reference table rather than via a
    library: it is a few lines, it has no extra dependency, and the bytes are
    identical on every machine — which is what a fixture should be. (pypdfium2 5.x
    dropped the simple font helper that would otherwise have done this.)
    """
    objects: list[bytes] = []

    def add(body: str | bytes) -> int:
        objects.append(body.encode() if isinstance(body, str) else body)
        return len(objects)  # 1-based object number

    catalog, page_tree, font = 1, 2, 3
    add("<< /Type /Catalog /Pages 2 0 R >>")  # 1
    add("")  # 2 — page tree, filled in once the page objects exist
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")  # 3

    page_refs: list[str] = []
    for index in range(pages):
        rows = "".join(
            f"({_escape(f'Page {index + 1}: {line}')}) Tj 0 -24 Td\n" for line in LINES
        )
        stream = f"BT /F1 12 Tf 50 760 Td\n{rows}ET".encode()
        content = add(b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream))
        page = add(
            f"<< /Type /Page /Parent {page_tree} 0 R /MediaBox [0 0 595 842] "
            f"/Resources << /Font << /F1 {font} 0 R >> >> /Contents {content} 0 R >>"
        )
        page_refs.append(f"{page} 0 R")

    objects[page_tree - 1] = (
        f"<< /Type /Pages /Kids [{' '.join(page_refs)}] /Count {pages} >>".encode()
    )

    out = bytearray(b"%PDF-1.4\n")
    offsets: list[int] = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % number + body + b"\nendobj\n"

    xref_at = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for offset in offsets:
        out += b"%010d 00000 n \n" % offset
    out += b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objects) + 1,
        catalog,
        xref_at,
    )
    return bytes(out)


def _image_page(text: str) -> Image.Image:
    """A page-sized image containing text — i.e. what a scan looks like."""
    image = Image.new("RGB", (1240, 1754), "white")
    draw = ImageDraw.Draw(image)
    for row, line in enumerate(LINES):
        draw.text((80, 120 + row * 60), f"{text}: {line}", fill="black")
    return image


@pytest.fixture(scope="module")
def typed_pdf() -> bytes:
    return _typed_page_pdf()


@pytest.fixture(scope="module")
def scanned_pdf() -> bytes:
    buffer = io.BytesIO()
    pages = [_image_page("Scan 1"), _image_page("Scan 2")]
    pages[0].save(buffer, format="PDF", save_all=True, append_images=pages[1:])
    return buffer.getvalue()


@pytest.fixture(scope="module")
def hybrid_pdf(typed_pdf: bytes, scanned_pdf: bytes) -> bytes:
    typed, scan = pdfium.PdfDocument(typed_pdf), pdfium.PdfDocument(scanned_pdf)
    out = pdfium.PdfDocument.new()
    out.import_pages(typed, [0])
    out.import_pages(scan, [0])
    out.import_pages(typed, [1])
    buffer = io.BytesIO()
    out.save(buffer)
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# Upload validation
# ---------------------------------------------------------------------------
def test_empty_upload_is_rejected():
    with pytest.raises(UploadRejected, match="empty"):
        validate_upload(b"", "x.pdf")


def test_a_file_that_is_not_a_pdf_is_rejected_on_its_bytes_not_its_name():
    with pytest.raises(UploadRejected, match="not a PDF"):
        validate_upload(b"PK\x03\x04 this is a zip", "definitely.pdf")


def test_a_real_pdf_passes_validation(typed_pdf: bytes):
    validate_upload(typed_pdf, "circular.pdf")  # must not raise


def test_an_oversized_upload_is_rejected(monkeypatch: pytest.MonkeyPatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "max_upload_mb", 1)
    with pytest.raises(UploadRejected, match="limit is 1 MB"):
        validate_upload(b"%PDF-" + b"0" * (2 * 1024 * 1024), "big.pdf")


# ---------------------------------------------------------------------------
# Text layer
# ---------------------------------------------------------------------------
def test_a_typed_pdf_needs_no_ocr(typed_pdf: bytes):
    pages = extract_text_layer(typed_pdf)
    assert len(pages) == 2
    assert pages_needing_ocr(pages) == []
    assert all(p.source == "text_layer" for p in pages)
    assert "08:00 hours and 19:00 hours" in pages[0].text


def test_a_scanned_pdf_reports_every_page_as_needing_ocr(scanned_pdf: bytes):
    pages = extract_text_layer(scanned_pdf)
    assert pages_needing_ocr(pages) == [1, 2]
    assert all(p.source == "empty" for p in pages)


def test_a_hybrid_pdf_routes_only_its_image_page_to_ocr(hybrid_pdf: bytes):
    pages = extract_text_layer(hybrid_pdf)
    assert len(pages) == 3
    # This is the whole point of deciding per page: pages 1 and 3 keep their text.
    assert pages_needing_ocr(pages) == [2]
    assert [p.source for p in pages] == ["text_layer", "empty", "text_layer"]


def test_a_corrupt_pdf_raises_a_readable_error():
    with pytest.raises(PdfParseError, match="Could not read the PDF"):
        extract_text_layer(b"%PDF-1.4\n" + b"\x00garbage" * 50)


# ---------------------------------------------------------------------------
# Rasterising
# ---------------------------------------------------------------------------
def test_render_pages_returns_an_image_per_requested_page(scanned_pdf: bytes):
    images = render_pages(scanned_pdf, [1, 2])
    assert sorted(images) == [1, 2]
    assert images[1].width > 0 and images[1].height > 0


def test_render_pages_ignores_page_numbers_outside_the_document(scanned_pdf: bytes):
    assert render_pages(scanned_pdf, [1, 99, 0, -3]) .keys() == {1}


# ---------------------------------------------------------------------------
# OCR (skipped when no engine is installed)
# ---------------------------------------------------------------------------
@pytest.mark.skipif(not available_engines(), reason="no OCR engine installed")
def test_ocr_recovers_text_from_a_scanned_page(scanned_pdf: bytes):
    from app.modules.circulars.service import ocr_and_assemble

    parsed = ocr_and_assemble(scanned_pdf)
    assert parsed.ocr_page_count == 2
    assert parsed.char_count > 0
    # Round-trip must still hold once OCR text has been spliced in.
    for span in parsed.pages:
        assert len(parsed.raw_text[span.char_start : span.char_end]) == (
            span.char_end - span.char_start
        )


@pytest.mark.skipif(not available_engines(), reason="no OCR engine installed")
def test_ocr_leaves_typed_pages_untouched_in_a_hybrid_document(hybrid_pdf: bytes):
    from app.modules.circulars.service import ocr_and_assemble

    before = extract_text_layer(hybrid_pdf)
    parsed = ocr_and_assemble(hybrid_pdf)
    assert [s.source for s in parsed.pages] == ["text_layer", "ocr", "text_layer"]
    # The typed pages must be byte-identical to what the text layer gave us.
    assert parsed.raw_text[parsed.pages[0].char_start : parsed.pages[0].char_end] == before[0].text
    assert parsed.raw_text[parsed.pages[2].char_start : parsed.pages[2].char_end] == before[2].text
