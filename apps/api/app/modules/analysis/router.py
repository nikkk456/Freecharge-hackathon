from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.client import is_configured
from app.core.config import settings
from app.db.session import get_db
from app.models.enums import CircularStatus
from app.modules.analysis import service
from app.modules.analysis.schemas import AnalysisOut, AnalysisRunAccepted, LlmStatus
from app.modules.analysis.service import NotAnalysable
from app.modules.circulars import service as circulars_service

# Mounted under /circulars so the URLs read naturally; the module stays separate.
router = APIRouter(prefix="/circulars", tags=["analysis"])

# Model diagnostics live on their own prefix. Putting them under /circulars would make
# them collide with the circulars router's /{circular_id}, which is registered first —
# a bug that depends on include order, which is exactly the kind we should not ship.
llm_router = APIRouter(prefix="/llm", tags=["analysis"])


async def _require_circular(db: AsyncSession, circular_id: uuid.UUID):  # noqa: ANN202
    circular = await circulars_service.get(db, circular_id)
    if circular is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Circular not found")
    return circular


@llm_router.get("/status", response_model=LlmStatus)
async def llm_status() -> LlmStatus:
    """Is a model configured at all?"""
    chain = settings.llm_model_chain
    if is_configured():
        detail = f"Ready — {chain[0]}"
        if chain[1:]:
            detail += f", falling back to {', '.join(chain[1:])}"
    else:
        detail = (
            "No API key for the configured model. "
            "Set GEMINI_API_KEY in .env and restart the API."
        )
    return LlmStatus(
        configured=is_configured(), model=chain[0], fallbacks=chain[1:], detail=detail
    )


@router.post("/{circular_id}/analyze", response_model=AnalysisRunAccepted)
async def analyze(
    circular_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> AnalysisRunAccepted:
    """Queue an AI analysis. Returns immediately; the worker does the work.

    Falls back to running inline if the queue is unreachable, for the same reason OCR
    does: a demo must not die because Redis is down.
    """
    circular = await _require_circular(db, circular_id)
    try:
        service.assert_analysable(circular)
    except NotAnalysable as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc

    if not is_configured():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "No API key for the configured model. Set GEMINI_API_KEY in .env and restart.",
        )

    from app.worker.queue import enqueue_analysis

    # Mark ANALYZING and commit BEFORE queueing. The other order races: a fast worker
    # can finish and set ANALYZED, and this request would then overwrite that with
    # ANALYZING, stranding the circular forever.
    circular.status = CircularStatus.ANALYZING
    circular.analysis_error = None
    await db.commit()

    if await enqueue_analysis(circular.id):
        return AnalysisRunAccepted(
            circular_id=circular.id,
            status=circular.status.value,
            queued=True,
            detail="Analysis queued. This usually takes 15-40 seconds.",
        )

    analysis = await service.run_analysis(db, circular)
    return AnalysisRunAccepted(
        circular_id=circular.id,
        status=circular.status.value,
        queued=False,
        detail=(
            "Queue unavailable, so the analysis ran inline."
            if analysis
            else circular.analysis_error or "Analysis failed."
        ),
    )


@router.get("/{circular_id}/analysis", response_model=AnalysisOut | None)
async def get_analysis(
    circular_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> AnalysisOut | None:
    """The latest analysis for a circular, or null if it has never been analysed."""
    await _require_circular(db, circular_id)
    analysis = await service.latest_analysis(db, circular_id)
    return await service.build_output(db, analysis) if analysis else None
