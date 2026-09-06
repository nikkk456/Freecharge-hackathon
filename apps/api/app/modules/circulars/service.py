from __future__ import annotations

import asyncio
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.config import settings
from app.core.logging import get_logger
from app.models.circular import Circular
from app.models.enums import CircularSource, CircularStatus
from app.modules.circulars.ocr import OcrUnavailable, get_engine
from app.modules.circulars.parser import (
    ParsedPdf,
    PdfParseError,
    assemble,
    clean_page_text,
    drop_unreadable_text,
    extract_text_layer,
    pages_needing_ocr,
    render_pages,
    strip_page_number,
)
from app.modules.circulars.schemas import CircularPatch

log = get_logger("circulars.service")

PDF_MAGIC = b"%PDF-"


class UploadRejected(Exception):
    """The upload never becomes a Circular row — bad input, not a parse failure."""


def validate_upload(data: bytes, filename: str) -> None:
    if not data:
        raise UploadRejected("The file is empty.")
    limit = settings.max_upload_mb * 1024 * 1024
    if len(data) > limit:
        raise UploadRejected(
            f"File is {len(data) / 1024 / 1024:.1f} MB; the limit is {settings.max_upload_mb} MB."
        )
    # Trust the bytes, not the extension.
    if not data.startswith(PDF_MAGIC):
        raise UploadRejected(f"“{filename}” is not a PDF (missing %PDF- header).")


# ---------------------------------------------------------------------------
# The OCR pass — blocking and CPU-bound, so it never runs on the event loop
# ---------------------------------------------------------------------------
def ocr_and_assemble(data: bytes) -> ParsedPdf:
    """Read the text layer, OCR only the pages that lack one, and assemble.

    Synchronous by design: callers wrap it in `asyncio.to_thread` so ~4s/page of
    CPU work cannot stall the worker's event loop.
    """
    pages = extract_text_layer(data)
    pending = pages_needing_ocr(pages)
    if not pending:
        return assemble(pages)

    if len(pending) > settings.ocr_max_pages:
        raise PdfParseError(
            f"{len(pending)} pages need OCR; the limit is {settings.ocr_max_pages}. "
            "Split the document and upload it in parts."
        )

    engine = get_engine()  # raises OcrUnavailable with install instructions
    images = render_pages(data, pending)
    by_number = {page.page: page for page in pages}

    for number in pending:
        image = images.get(number)
        if image is None:
            continue  # unrenderable page; it stays `empty` rather than failing the file
        cleaned, unreadable = drop_unreadable_text(clean_page_text(engine.read(image)))
        text = strip_page_number(cleaned, number)
        if text:
            by_number[number].text = text
            by_number[number].source = "ocr"
            by_number[number].unreadable_chars = unreadable

    log.info("ocr_complete", engine=engine.name, pages=len(pending))
    return assemble(pages)


def _apply(circular: Circular, parsed: ParsedPdf) -> None:
    circular.raw_text = parsed.raw_text
    circular.page_count = parsed.page_count
    circular.page_map = [span.as_dict() for span in parsed.pages]
    # Only overwrite metadata the human has not already corrected.
    circular.ref_no = circular.ref_no or parsed.ref_no
    circular.issued_date = circular.issued_date or parsed.issued_date


def _too_little_text(parsed: ParsedPdf) -> bool:
    return parsed.char_count < settings.min_extracted_chars


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------
async def ingest(
    db: AsyncSession,
    *,
    data: bytes,
    filename: str,
    source: CircularSource,
    uploaded_by: uuid.UUID | None = None,
) -> Circular:
    """Store the PDF and extract its text.

    Fast path — every page has a text layer — finishes inline in about a second.
    A page that needs OCR sends the document to the worker instead, because OCR runs
    at seconds per page and must never hold an HTTP request open.

    A failure still produces a row with status FAILED and a readable `parse_error`:
    the human has to be able to see what went wrong, not hit a dead end.
    """
    validate_upload(data, filename)

    object_key = storage.put_pdf(data, filename)
    circular = Circular(
        source=source,
        title=Path(filename).stem,  # provisional; the model proposes a real title at Stage 2
        pdf_object_key=object_key,
        status=CircularStatus.PARSING,
        uploaded_by=uploaded_by,
    )
    db.add(circular)
    await db.flush()

    try:
        pages = extract_text_layer(data)
    except PdfParseError as exc:
        return await _fail(db, circular, str(exc))

    pending = pages_needing_ocr(pages)

    if not pending:
        parsed = assemble(pages)
        if _too_little_text(parsed):
            return await _fail(
                db,
                circular,
                f"Only {parsed.char_count} characters of text were found across "
                f"{parsed.page_count} page(s), and no page looks like a scan either. "
                "The file may be empty or damaged.",
            )
        return await _succeed(db, circular, parsed)

    # Something needs OCR. Save the text we already have so the human can see
    # partial progress, then hand the document to the worker.
    _apply(circular, assemble(pages))
    circular.status = CircularStatus.PARSING
    circular.parse_error = None
    await db.commit()

    if not settings.ocr_enabled:
        return await _fail(
            db,
            circular,
            f"{len(pending)} of {len(pages)} page(s) are scanned images and OCR is "
            "disabled. Set OCR_ENABLED=true in .env and re-upload.",
        )

    from app.worker.queue import enqueue_ocr  # local import: avoids a cycle at startup

    queued = await enqueue_ocr(circular.id)
    if queued:
        log.info("ocr_queued", circular_id=str(circular.id), pages=len(pending))
        return circular

    # Redis or the worker is unreachable. Rather than leave the document stuck at
    # PARSING forever, do the work here — slower, but the demo never dies.
    log.warning("ocr_queue_unavailable_running_inline", circular_id=str(circular.id))
    return await run_ocr(db, circular)


# ---------------------------------------------------------------------------
# The OCR job body — shared by the worker and the inline fallback
# ---------------------------------------------------------------------------
async def run_ocr(db: AsyncSession, circular: Circular) -> Circular:
    """Fetch the stored PDF, OCR its image pages, and finalise the circular.

    Re-derives everything from the stored PDF rather than trusting whatever is in
    the row, so a retried job is idempotent.
    """
    if not circular.pdf_object_key:
        return await _fail(db, circular, "The stored PDF is missing, so OCR cannot run.")

    try:
        data = await asyncio.to_thread(storage.get_object, circular.pdf_object_key)
        parsed = await asyncio.to_thread(ocr_and_assemble, data)
    except OcrUnavailable as exc:
        return await _fail(db, circular, str(exc))
    except PdfParseError as exc:
        return await _fail(db, circular, str(exc))
    except Exception as exc:  # noqa: BLE001 — never leave a document stuck at PARSING
        log.exception("ocr_failed", circular_id=str(circular.id))
        return await _fail(db, circular, f"OCR failed: {exc}")

    if _too_little_text(parsed):
        return await _fail(
            db,
            circular,
            f"OCR produced only {parsed.char_count} characters across "
            f"{parsed.page_count} page(s). The scan may be blank, upside down, or too "
            "low-resolution to read.",
        )
    return await _succeed(db, circular, parsed)


async def _succeed(db: AsyncSession, circular: Circular, parsed: ParsedPdf) -> Circular:
    _apply(circular, parsed)
    circular.status = CircularStatus.PARSED
    circular.parse_error = None
    await db.commit()
    log.info(
        "circular_parsed",
        circular_id=str(circular.id),
        pages=parsed.page_count,
        ocr_pages=parsed.ocr_page_count,
        chars=parsed.char_count,
    )
    return circular


async def _fail(db: AsyncSession, circular: Circular, reason: str) -> Circular:
    circular.status = CircularStatus.FAILED
    circular.parse_error = reason
    await db.commit()
    log.warning("parse_failed", circular_id=str(circular.id), error=reason)
    return circular


# ---------------------------------------------------------------------------
# Reads and edits
# ---------------------------------------------------------------------------
async def list_circulars(db: AsyncSession) -> list[Circular]:
    result = await db.execute(select(Circular).order_by(Circular.created_at.desc()))
    return list(result.scalars().all())


async def get(db: AsyncSession, circular_id: uuid.UUID) -> Circular | None:
    return (
        await db.execute(select(Circular).where(Circular.id == circular_id))
    ).scalar_one_or_none()


async def patch(db: AsyncSession, circular: Circular, changes: CircularPatch) -> Circular:
    """Human override of the parser's guesses. `exclude_unset` so that omitting a
    field leaves it alone, while explicitly sending null clears it."""
    for field, value in changes.model_dump(exclude_unset=True).items():
        setattr(circular, field, value)
    await db.commit()
    return circular


async def retry(db: AsyncSession, circular: Circular) -> Circular:
    """Re-run ingestion for a circular that failed — after installing an OCR engine,
    for instance. Runs inline so the human sees the outcome immediately."""
    circular.status = CircularStatus.PARSING
    circular.parse_error = None
    await db.commit()
    return await run_ocr(db, circular)


async def delete(db: AsyncSession, circular: Circular) -> None:
    key = circular.pdf_object_key
    await db.delete(circular)
    await db.commit()
    if key:
        try:
            storage.delete_object(key)
        except Exception as exc:  # noqa: BLE001 — an orphaned object is not worth a 500
            log.warning("pdf_delete_failed", key=key, error=str(exc))
