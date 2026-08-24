from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.enums import ActionItemStatus, Role
from app.models.user import User
from app.modules.tracker import service, workflow
from app.modules.tracker.schemas import (
    CloseRequest,
    ItemPatch,
    StatusChange,
    SweepResult,
    TrackedItemOut,
    TrackerStats,
)

router = APIRouter(prefix="/action-items", tags=["tracker"])


# --- static routes first: they would otherwise be captured by /{item_id} ---
@router.get("/stats", response_model=TrackerStats)
async def get_stats(db: AsyncSession = Depends(get_db)) -> TrackerStats:
    return await service.stats(db)


@router.post("/sweep", response_model=SweepResult)
async def run_sweep(
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(Role.REVIEWER, Role.OWNER)),  # noqa: ARG001
) -> SweepResult:
    """Run the overdue sweep now.

    The same routine the daily cron runs. Exposed manually because a demo cannot wait
    until 08:00, and because being able to trigger it is how you verify it is honest.
    """
    return SweepResult(**await workflow.sweep_overdue(db))


@router.get("", response_model=list[TrackedItemOut])
async def list_items(
    status_filter: ActionItemStatus | None = Query(default=None, alias="status"),
    owner_id: uuid.UUID | None = None,
    circular_id: uuid.UUID | None = None,
    overdue: bool = False,
    unassigned: bool = False,
    db: AsyncSession = Depends(get_db),
) -> list[TrackedItemOut]:
    """The tracker. Most urgent first; closed work sinks to the bottom."""
    return await service.list_items(
        db,
        status_filter=status_filter,
        owner_id=owner_id,
        circular_id=circular_id,
        overdue_only=overdue,
        unassigned_only=unassigned,
    )


@router.get("/{item_id}", response_model=TrackedItemOut)
async def get_item(
    item_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> TrackedItemOut:
    return await service.item_out(db, await service.get(db, item_id))


@router.patch("/{item_id}", response_model=TrackedItemOut)
async def edit_item(
    item_id: uuid.UUID,
    changes: ItemPatch,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> TrackedItemOut:
    """Assign an owner, set a due date, change priority or wording."""
    item = await service.get(db, item_id)
    await workflow.patch(db, item, changes, actor)
    return await service.item_out(db, item)


@router.post("/{item_id}/status", response_model=TrackedItemOut)
async def move_item(
    item_id: uuid.UUID,
    payload: StatusChange,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> TrackedItemOut:
    """Move the item along the workflow. Closing is a separate call."""
    item = await service.get(db, item_id)
    await workflow.change_status(db, item, payload, actor)
    return await service.item_out(db, item)


@router.post("/{item_id}/close", response_model=TrackedItemOut)
async def close_item(
    item_id: uuid.UUID,
    payload: CloseRequest,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_roles(Role.REVIEWER, Role.OWNER)),
) -> TrackedItemOut:
    """Sign the item off.

    Reviewer or owner only, and never the same call that does the work — the doer
    submits, someone else closes. Requires evidence.
    """
    item = await service.get(db, item_id)
    await workflow.close(db, item, payload, actor)
    return await service.item_out(db, item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> None:
    """Remove an item. Closed work cannot be deleted — it is the record."""
    from app.modules.analysis import review

    item = await service.get(db, item_id)
    if item.status == service.TERMINAL:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Closed items are the compliance record and cannot be deleted.",
        )
    await review.delete_action_item(db, item, actor)
