"""Human review: edit the model's draft, then approve it.

The rule this file enforces, and the reason it exists as its own module: **a
PUBLISHED analysis is frozen.** Editing is only possible while the analysis is a
DRAFT. That is what makes "approved" mean something — an approval that could be
silently rewritten afterwards is not an approval, and a regulator asking "what did
the reviewer actually sign off?" needs one answer, not the latest one.

Re-running the AI on a published circular is still allowed: it creates a *new* DRAFT
version and leaves the published one intact and SUPERSEDED-free.

Every mutation here writes an audit row before committing. If the audit write fails,
the change fails with it.
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.action_item import ActionItem
from app.models.analysis import AIAnalysis
from app.models.circular import Circular, CircularFunction, Function
from app.models.enums import (
    ActionItemStatus,
    ActorKind,
    AnalysisStatus,
    AssertionSource,
    CircularStatus,
)
from app.models.user import User
from app.modules.analysis.schemas import (
    ActionItemCreate,
    ActionItemPatch,
    AnalysisPatch,
    FunctionAssert,
)
from app.modules.audit import service as audit

log = get_logger("analysis.review")


def assert_editable(analysis: AIAnalysis) -> None:
    if analysis.status == AnalysisStatus.PUBLISHED:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This analysis is published and cannot be changed. Re-run the AI to "
            "produce a new draft, or edit that draft instead.",
        )
    if analysis.status == AnalysisStatus.SUPERSEDED:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This is an older version, kept for the audit trail. Edit the current draft.",
        )


async def _function_by_code(db: AsyncSession, code: str | None) -> Function | None:
    if not code:
        return None
    function = (
        await db.execute(select(Function).where(Function.code == code.strip().upper()))
    ).scalar_one_or_none()
    if function is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"No such department: {code}")
    return function


# ---------------------------------------------------------------------------
# Editing the analysis itself
# ---------------------------------------------------------------------------
async def patch_analysis(
    db: AsyncSession, analysis: AIAnalysis, changes: AnalysisPatch, actor: User
) -> AIAnalysis:
    assert_editable(analysis)
    fields = changes.model_dump(exclude_unset=True)
    if not fields:
        return analysis

    before = {key: _plain(getattr(analysis, key)) for key in fields}
    for key, value in fields.items():
        setattr(analysis, key, value)
    after = {key: _plain(getattr(analysis, key)) for key in fields}

    if before == after:
        return analysis  # a no-op edit should not pollute the trail

    analysis.edited_by = actor.id
    await audit.record(
        db,
        entity_type="ai_analysis",
        entity_id=analysis.id,
        action="HUMAN_EDITED",
        actor_id=actor.id,
        actor_kind=ActorKind.HUMAN,
        before=before,
        after=after,
    )
    await db.commit()
    log.info("analysis_edited", analysis_id=str(analysis.id), fields=sorted(fields))
    return analysis


def _plain(value: object) -> object:
    """Flatten a model attribute for an audit payload: enums to their value, and
    UUIDs/dates to strings. `audit.jsonable` would catch anything missed, but keeping
    payloads readable here means the trail shows "HIGH", not "Priority.HIGH"."""
    if value is None:
        return None
    if isinstance(value, uuid.UUID | date | datetime):
        return str(value)
    return getattr(value, "value", value)


# ---------------------------------------------------------------------------
# Impacted departments
# ---------------------------------------------------------------------------
async def add_function(
    db: AsyncSession, analysis: AIAnalysis, payload: FunctionAssert, actor: User
) -> None:
    assert_editable(analysis)
    function = await _function_by_code(db, payload.code)
    assert function is not None

    existing = (
        await db.execute(
            select(CircularFunction).where(
                CircularFunction.circular_id == analysis.circular_id,
                CircularFunction.function_id == function.id,
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        # Already listed. Promote it to a human assertion so a later AI re-run cannot
        # delete it — `_replace_impacted_functions` only clears AI-sourced rows.
        existing.source = AssertionSource.HUMAN
        existing.reasoning = payload.reasoning or existing.reasoning
        existing.confidence = 1.0
    else:
        db.add(
            CircularFunction(
                circular_id=analysis.circular_id,
                function_id=function.id,
                confidence=1.0,  # a human said so
                reasoning=payload.reasoning,
                source=AssertionSource.HUMAN,
            )
        )

    await audit.record(
        db,
        entity_type="circular_function",
        entity_id=analysis.circular_id,
        action="HUMAN_ADDED_FUNCTION",
        actor_id=actor.id,
        after={"code": function.code, "reasoning": payload.reasoning},
    )
    await db.commit()


async def remove_function(
    db: AsyncSession, analysis: AIAnalysis, code: str, actor: User
) -> None:
    assert_editable(analysis)
    function = await _function_by_code(db, code)
    assert function is not None

    link = (
        await db.execute(
            select(CircularFunction).where(
                CircularFunction.circular_id == analysis.circular_id,
                CircularFunction.function_id == function.id,
            )
        )
    ).scalar_one_or_none()
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{code} is not listed as impacted.")

    await audit.record(
        db,
        entity_type="circular_function",
        entity_id=analysis.circular_id,
        action="HUMAN_REMOVED_FUNCTION",
        actor_id=actor.id,
        before={"code": function.code, "reasoning": link.reasoning},
    )
    await db.delete(link)
    await db.commit()


# ---------------------------------------------------------------------------
# Action items
# ---------------------------------------------------------------------------
async def get_action_item(db: AsyncSession, item_id: uuid.UUID) -> ActionItem:
    item = (
        await db.execute(select(ActionItem).where(ActionItem.id == item_id))
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Action item not found")
    return item


async def create_action_item(
    db: AsyncSession, circular: Circular, payload: ActionItemCreate, actor: User
) -> ActionItem:
    owner = await _function_by_code(db, payload.owner_function_code)
    item = ActionItem(
        circular_id=circular.id,
        description=payload.description.strip(),
        owner_function_id=owner.id if owner else None,
        due_date=payload.due_date,
        status=ActionItemStatus.OPEN,
        priority=payload.priority,
        source=AssertionSource.HUMAN,
        # Namespaced by the row's own id so a human item can never collide with an
        # AI one, and so two reviewers adding the same wording both succeed.
        dedup_key=f"{circular.id}:human:{uuid.uuid4()}",
    )
    db.add(item)
    await db.flush()

    await audit.record(
        db,
        entity_type="action_item",
        entity_id=item.id,
        action="HUMAN_ADDED",
        actor_id=actor.id,
        after={"description": item.description, "priority": item.priority.value},
    )
    await db.commit()
    return item


async def patch_action_item(
    db: AsyncSession, item: ActionItem, changes: ActionItemPatch, actor: User
) -> ActionItem:
    fields = changes.model_dump(exclude_unset=True)
    if not fields:
        return item

    owner_code = fields.pop("owner_function_code", ...)
    before: dict = {key: _plain(getattr(item, key)) for key in fields}
    for key, value in fields.items():
        setattr(item, key, value)

    if owner_code is not ...:
        owner = await _function_by_code(db, owner_code)
        current = item.owner_function_id
        before["owner_function_id"] = str(current) if current else None
        item.owner_function_id = owner.id if owner else None

    after = {key: _plain(getattr(item, key)) for key in before}
    if before == after:
        return item

    await audit.record(
        db,
        entity_type="action_item",
        entity_id=item.id,
        action="HUMAN_EDITED",
        actor_id=actor.id,
        before=before,
        after=after,
    )
    await db.commit()
    return item


async def delete_action_item(db: AsyncSession, item: ActionItem, actor: User) -> None:
    await audit.record(
        db,
        entity_type="action_item",
        entity_id=item.id,
        action="HUMAN_DELETED",
        actor_id=actor.id,
        before={"description": item.description, "source": item.source.value},
    )
    await db.delete(item)
    await db.commit()


# ---------------------------------------------------------------------------
# Publishing — the human decision the whole product turns on
# ---------------------------------------------------------------------------
async def publish(
    db: AsyncSession, analysis: AIAnalysis, circular: Circular, actor: User
) -> AIAnalysis:
    if analysis.status == AnalysisStatus.PUBLISHED:
        raise HTTPException(status.HTTP_409_CONFLICT, "This analysis is already published.")
    if analysis.status == AnalysisStatus.SUPERSEDED:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This is an older version. Publish the current draft instead.",
        )
    if not (analysis.summary or "").strip():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "An analysis needs a summary before it can be published.",
        )
    if analysis.risk_rating is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "An analysis needs a risk rating before it can be published.",
        )

    # Any other version of this circular that was previously published steps down, so
    # exactly one published analysis exists per circular at any time.
    others = (
        await db.execute(
            select(AIAnalysis).where(
                AIAnalysis.circular_id == analysis.circular_id,
                AIAnalysis.id != analysis.id,
                AIAnalysis.status == AnalysisStatus.PUBLISHED,
            )
        )
    ).scalars().all()
    for row in others:
        row.status = AnalysisStatus.SUPERSEDED

    before = {"status": analysis.status.value}
    analysis.status = AnalysisStatus.PUBLISHED
    analysis.reviewed_by = actor.id
    analysis.published_at = datetime.now(tz=UTC)
    circular.status = CircularStatus.PUBLISHED

    await audit.record(
        db,
        entity_type="ai_analysis",
        entity_id=analysis.id,
        action="PUBLISHED",
        actor_id=actor.id,
        actor_kind=ActorKind.HUMAN,
        before=before,
        after={
            "status": analysis.status.value,
            "version": analysis.version,
            "risk_rating": analysis.risk_rating.value,
            "superseded_versions": [r.version for r in others],
        },
    )
    await db.commit()
    log.info(
        "analysis_published",
        analysis_id=str(analysis.id),
        version=analysis.version,
        reviewer=actor.email,
    )
    return analysis
