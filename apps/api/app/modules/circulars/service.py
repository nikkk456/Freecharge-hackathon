from __future__ import annotations

import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.config import settings
from app.core.logging import get_logger
from app.models.circular import Circular
from app.models.enums import CircularSource, CircularStatus
from app.modules.circulars.parser import PdfParseError, parse_pdf
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


async def ingest(
    db: AsyncSession,
    *,
    data: bytes,
    filename: str,
    source: CircularSource,
    uploaded_by: uuid.UUID | None = None,
) -> Circular:
    """Store the PDF, extract its text, and persist the result.

    A parse failure still produces a row with status FAILED and a readable
    `parse_error`, because a human must be able to see what went wrong and fix the
    metadata by hand. Only a rejected *upload* raises.
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
        parsed = parse_pdf(data)
        if parsed.char_count < settings.min_extracted_chars:
            raise PdfParseError(
                f"Only {parsed.char_count} characters of text were found across "
                f"{parsed.page_count} page(s). This looks like a scanned PDF — it needs "
                "OCR, which is not enabled."
            )
    except PdfParseError as exc:
        circular.status = CircularStatus.FAILED
        circular.parse_error = str(exc)
        await db.commit()
        log.warning("parse_failed", circular_id=str(circular.id), error=str(exc))
        return circular

    circular.raw_text = parsed.raw_text
    circular.page_count = parsed.page_count
    circular.page_map = [span.as_dict() for span in parsed.pages]
    circular.ref_no = parsed.ref_no
    circular.issued_date = parsed.issued_date
    circular.status = CircularStatus.PARSED
    circular.parse_error = None
    await db.commit()

    log.info(
        "circular_parsed",
        circular_id=str(circular.id),
        pages=parsed.page_count,
        chars=parsed.char_count,
        ref_no=parsed.ref_no,
    )
    return circular


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


async def delete(db: AsyncSession, circular: Circular) -> None:
    key = circular.pdf_object_key
    await db.delete(circular)
    await db.commit()
    if key:
        try:
            storage.delete_object(key)
        except Exception as exc:  # noqa: BLE001 — an orphaned object is not worth a 500
            log.warning("pdf_delete_failed", key=key, error=str(exc))
