from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.client import is_configured
from app.core.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.circular import Circular
from app.models.enums import Role
from app.models.user import User
from app.modules.analysis import service as analysis_service
from app.modules.circulars import service as circulars_service
from app.modules.rcm import review, service
from app.modules.rcm.schemas import (
    RcmOut,
    RcmPublishResult,
    RcmRowCreate,
    RcmRowPatch,
    RcmRunAccepted,
)
from app.modules.rcm.service import NotReady

router = APIRouter(prefix="/circulars", tags=["rcm"])
rows_router = APIRouter(prefix="/rcm-rows", tags=["rcm"])
rcm_router = APIRouter(prefix="/rcms", tags=["rcm"])


async def _require_circular(db: AsyncSession, circular_id: uuid.UUID) -> Circular:
    circular = await circulars_service.get(db, circular_id)
    if circular is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Circular not found")
    return circular


async def _require_rcm(db: AsyncSession, circular_id: uuid.UUID):  # noqa: ANN202
    rcm = await service.get_for_circular(db, circular_id)
    if rcm is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This circular has no RCM yet.")
    return rcm


@router.post("/{circular_id}/rcm", response_model=RcmRunAccepted)
async def build_rcm(
    circular_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),  # noqa: ARG001 — auth only
) -> RcmRunAccepted:
    """Generate (or regenerate) the draft RCM. Queued to the worker; runs inline if
    the queue is unreachable, for the same reason analysis does."""
    circular = await _require_circular(db, circular_id)

    # Check readiness here rather than only in the worker: queueing a job that will
    # immediately skip leaves the user watching a spinner with no explanation.
    try:
        service.assert_ready(circular, await analysis_service.latest_analysis(db, circular_id))
    except NotReady as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc

    existing = await service.get_for_circular(db, circular_id)
    if existing is not None:
        review.assert_editable(existing)

    if not is_configured():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "No API key for the configured model. Set GEMINI_API_KEY in .env and restart.",
        )

    from app.worker.queue import enqueue_rcm

    if await enqueue_rcm(circular.id):
        return RcmRunAccepted(
            circular_id=circular.id,
            queued=True,
            detail="Building the matrix. This usually takes 20-60 seconds.",
        )

    rcm = await service.generate(db, circular)
    return RcmRunAccepted(
        circular_id=circular.id,
        queued=False,
        detail=(
            "Queue unavailable, so the matrix was built inline."
            if rcm
            else "The model could not be reached. Build the matrix by hand, or try again."
        ),
    )


@router.get("/{circular_id}/rcm", response_model=RcmOut | None)
async def get_rcm(
    circular_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> RcmOut | None:
    """The circular's RCM, or null if one has not been built."""
    await _require_circular(db, circular_id)
    rcm = await service.get_for_circular(db, circular_id)
    return await service.build_output(db, rcm) if rcm else None


@router.post(
    "/{circular_id}/rcm/rows", response_model=RcmOut, status_code=status.HTTP_201_CREATED
)
async def add_row(
    circular_id: uuid.UUID,
    payload: RcmRowCreate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> RcmOut:
    """Add a risk the model missed."""
    await _require_circular(db, circular_id)
    rcm = await _require_rcm(db, circular_id)
    await review.create_row(db, rcm, payload, actor)
    return await service.build_output(db, await _require_rcm(db, circular_id))


@rows_router.patch("/{row_id}", response_model=RcmOut)
async def edit_row(
    row_id: uuid.UUID,
    changes: RcmRowPatch,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> RcmOut:
    row = await review.get_row(db, row_id)
    rcm = await review.get_rcm(db, row.rcm_id)
    await review.patch_row(db, rcm, row, changes, actor)
    return await service.build_output(db, await _require_rcm(db, rcm.circular_id))


@rows_router.delete("/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_row(
    row_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> None:
    row = await review.get_row(db, row_id)
    rcm = await review.get_rcm(db, row.rcm_id)
    await review.delete_row(db, rcm, row, actor)


@rcm_router.post("/{rcm_id}/publish", response_model=RcmPublishResult)
async def publish_rcm(
    rcm_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(Role.REVIEWER, Role.OWNER)),
) -> RcmPublishResult:
    """Approve the matrix. Reviewers and owners only, exactly as for an analysis."""
    rcm = await review.get_rcm(db, rcm_id)  # rows are eager-loaded
    await review.publish(db, rcm, actor)
    return RcmPublishResult(
        rcm_id=rcm.id,
        circular_id=rcm.circular_id,
        status=rcm.status,
        published_at=rcm.published_at,
        reviewed_by=actor.full_name,
        detail=f"RCM approved by {actor.full_name}.",
    )
