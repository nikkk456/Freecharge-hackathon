from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.db.session import get_db
from app.models.circular import Circular
from app.models.enums import CircularSource
from app.modules.circulars import service
from app.modules.circulars.schemas import CircularDetail, CircularPatch, CircularSummary
from app.modules.circulars.service import UploadRejected

router = APIRouter(prefix="/circulars", tags=["circulars"])


def _detail(circular: Circular) -> CircularDetail:
    return CircularDetail(
        **CircularSummary.model_validate(circular).model_dump(),
        raw_text=circular.raw_text,
        page_map=circular.page_map,
        char_count=len(circular.raw_text or ""),
    )


async def _require(db: AsyncSession, circular_id: uuid.UUID) -> Circular:
    circular = await service.get(db, circular_id)
    if circular is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Circular not found")
    return circular


@router.post("", response_model=CircularDetail, status_code=status.HTTP_201_CREATED)
async def upload_circular(
    file: UploadFile = File(...),
    source: CircularSource = Form(CircularSource.RBI),
    db: AsyncSession = Depends(get_db),
) -> CircularDetail:
    """Upload a circular PDF. Stores the file, extracts the text, returns both.

    A PDF whose text cannot be extracted still returns 201 with status FAILED and a
    readable `parse_error` — the human keeps control instead of hitting a dead end.
    """
    data = await file.read()
    try:
        circular = await service.ingest(
            db, data=data, filename=file.filename or "circular.pdf", source=source
        )
    except UploadRejected as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return _detail(circular)


@router.get("", response_model=list[CircularSummary])
async def list_circulars(db: AsyncSession = Depends(get_db)) -> list[CircularSummary]:
    return [CircularSummary.model_validate(c) for c in await service.list_circulars(db)]


@router.get("/{circular_id}", response_model=CircularDetail)
async def get_circular(
    circular_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> CircularDetail:
    return _detail(await _require(db, circular_id))


@router.patch("/{circular_id}", response_model=CircularDetail)
async def patch_circular(
    circular_id: uuid.UUID, changes: CircularPatch, db: AsyncSession = Depends(get_db)
) -> CircularDetail:
    """Correct what the parser guessed — reference number, title, issued date."""
    circular = await _require(db, circular_id)
    return _detail(await service.patch(db, circular, changes))


@router.get("/{circular_id}/pdf")
async def get_circular_pdf(
    circular_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> RedirectResponse:
    """Redirect to a short-lived presigned URL for the original PDF."""
    circular = await _require(db, circular_id)
    if not circular.pdf_object_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No stored PDF for this circular")
    return RedirectResponse(storage.presigned_url(circular.pdf_object_key))


@router.delete("/{circular_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_circular(circular_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    await service.delete(db, await _require(db, circular_id))
