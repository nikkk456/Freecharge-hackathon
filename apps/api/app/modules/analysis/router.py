from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.client import is_configured
from app.core.config import settings
from app.core.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.analysis import AIAnalysis
from app.models.enums import CircularStatus, Role
from app.models.user import User
from app.modules.analysis import review, service
from app.modules.analysis.schemas import (
    ActionItemCreate,
    ActionItemOut,
    ActionItemPatch,
    AnalysisOut,
    AnalysisPatch,
    AnalysisRunAccepted,
    FunctionAssert,
    LlmStatus,
    PublishResult,
)
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


async def _require_analysis(db: AsyncSession, circular_id: uuid.UUID) -> AIAnalysis:
    analysis = await service.latest_analysis(db, circular_id)
    if analysis is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This circular has not been analysed yet."
        )
    return analysis


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


@router.post(
    "/{circular_id}/action-items", response_model=AnalysisOut, status_code=status.HTTP_201_CREATED
)
async def add_action_item(
    circular_id: uuid.UUID,
    payload: ActionItemCreate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> AnalysisOut:
    """Add an obligation the model missed."""
    circular = await _require_circular(db, circular_id)
    analysis = await _require_analysis(db, circular_id)
    review.assert_editable(analysis)
    await review.create_action_item(db, circular, payload, actor)
    return await service.build_output(db, analysis)


# ---------------------------------------------------------------------------
# Review — editing the draft
# ---------------------------------------------------------------------------
review_router = APIRouter(prefix="/analyses", tags=["review"])


async def _analysis_by_id(db: AsyncSession, analysis_id: uuid.UUID) -> AIAnalysis:
    analysis = (
        await db.execute(select(AIAnalysis).where(AIAnalysis.id == analysis_id))
    ).scalar_one_or_none()
    if analysis is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Analysis not found")
    return analysis


@review_router.patch("/{analysis_id}", response_model=AnalysisOut)
async def edit_analysis(
    analysis_id: uuid.UUID,
    changes: AnalysisPatch,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> AnalysisOut:
    """Override the model's summary, rating or reasoning. Drafts only."""
    analysis = await _analysis_by_id(db, analysis_id)
    await review.patch_analysis(db, analysis, changes, actor)
    return await service.build_output(db, analysis)


@review_router.post("/{analysis_id}/functions", response_model=AnalysisOut)
async def assert_function(
    analysis_id: uuid.UUID,
    payload: FunctionAssert,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> AnalysisOut:
    analysis = await _analysis_by_id(db, analysis_id)
    await review.add_function(db, analysis, payload, actor)
    return await service.build_output(db, analysis)


@review_router.delete("/{analysis_id}/functions/{code}", response_model=AnalysisOut)
async def retract_function(
    analysis_id: uuid.UUID,
    code: str,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> AnalysisOut:
    analysis = await _analysis_by_id(db, analysis_id)
    await review.remove_function(db, analysis, code, actor)
    return await service.build_output(db, analysis)


@review_router.post("/{analysis_id}/publish", response_model=PublishResult)
async def publish_analysis(
    analysis_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(Role.REVIEWER, Role.OWNER)),
) -> PublishResult:
    """Approve the draft. Reviewers and owners only — an analyst drafts, someone else signs."""
    analysis = await _analysis_by_id(db, analysis_id)
    circular = await _require_circular(db, analysis.circular_id)
    await review.publish(db, analysis, circular, actor)
    return PublishResult(
        analysis_id=analysis.id,
        circular_id=analysis.circular_id,
        status=analysis.status,
        version=analysis.version,
        published_at=analysis.published_at,
        reviewed_by=actor.full_name,
        detail=f"Version {analysis.version} approved by {actor.full_name}.",
    )


# ---------------------------------------------------------------------------
# Action items
# ---------------------------------------------------------------------------
items_router = APIRouter(prefix="/action-items", tags=["review"])


@items_router.patch("/{item_id}", response_model=ActionItemOut)
async def edit_action_item(
    item_id: uuid.UUID,
    changes: ActionItemPatch,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> ActionItemOut:
    item = await review.get_action_item(db, item_id)
    await review.patch_action_item(db, item, changes, actor)
    return await service.action_item_out(db, item)


@items_router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_action_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> None:
    item = await review.get_action_item(db, item_id)
    await review.delete_action_item(db, item, actor)
