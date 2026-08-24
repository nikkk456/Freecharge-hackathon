from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from fastapi import HTTPException
from fastapi import status as http
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.action_item import ActionItem
from app.models.circular import Circular, Function
from app.models.enums import ActionItemStatus as S
from app.models.user import User
from app.modules.tracker.schemas import OwnerOut, TrackedItemOut, TrackerStats

log = get_logger("tracker")

# ---------------------------------------------------------------------------
# The state machine
# ---------------------------------------------------------------------------
# Written as data rather than as branching code, so the legal moves are readable at a
# glance and the UI can be driven from the same table the API enforces.
#
# CLOSED is reachable only from SUBMITTED, deliberately: work must be put forward for
# review before anyone signs it off. Allowing IN_PROGRESS -> CLOSED would let the
# person who did the work also approve it, which is exactly the separation a
# compliance function gets audited on.
TRANSITIONS: dict[S, frozenset[S]] = {
    S.OPEN: frozenset({S.IN_PROGRESS, S.BLOCKED, S.SUBMITTED}),
    S.IN_PROGRESS: frozenset({S.OPEN, S.BLOCKED, S.SUBMITTED}),
    S.BLOCKED: frozenset({S.OPEN, S.IN_PROGRESS, S.SUBMITTED}),
    # Rejected back to the doer, or signed off.
    S.SUBMITTED: frozenset({S.IN_PROGRESS, S.BLOCKED, S.CLOSED}),
    # Reopening closed work is allowed — evidence can turn out to be wrong — but it is
    # a transition like any other, so it is audited rather than silent.
    S.CLOSED: frozenset({S.IN_PROGRESS}),
}

TERMINAL = S.CLOSED


class InvalidTransition(Exception):
    """The requested status change is not a legal move."""


def allowed_next(current: S) -> list[S]:
    return sorted(TRANSITIONS.get(current, frozenset()), key=lambda s: s.value)


def assert_transition(current: S, target: S) -> None:
    if current == target:
        raise InvalidTransition(f"This item is already {current.value}.")
    if target not in TRANSITIONS.get(current, frozenset()):
        legal = ", ".join(s.value for s in allowed_next(current)) or "nothing"
        raise InvalidTransition(
            f"An item that is {current.value} cannot move straight to {target.value}. "
            f"From here it can go to: {legal}."
        )


def has_evidence(item: ActionItem) -> bool:
    return bool((item.evidence_url or "").strip() or (item.closure_note or "").strip())


# ---------------------------------------------------------------------------
# Derived state
# ---------------------------------------------------------------------------
def today_utc() -> date:
    return datetime.now(tz=UTC).date()


def is_overdue(item: ActionItem, today: date | None = None) -> bool:
    """Late is a fact about the due date, not a status someone sets.

    Closed work is never overdue — it is done, whenever it was done.
    """
    if item.due_date is None or item.status == TERMINAL:
        return False
    return item.due_date < (today or today_utc())


def days_until_due(item: ActionItem, today: date | None = None) -> int | None:
    if item.due_date is None:
        return None
    return (item.due_date - (today or today_utc())).days


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------
def _base_query() -> Select:
    return (
        select(ActionItem, Circular, Function, User)
        .join(Circular, ActionItem.circular_id == Circular.id)
        .outerjoin(Function, ActionItem.owner_function_id == Function.id)
        .outerjoin(User, ActionItem.owner_id == User.id)
    )


async def list_items(
    db: AsyncSession,
    *,
    status_filter: S | None = None,
    owner_id: uuid.UUID | None = None,
    circular_id: uuid.UUID | None = None,
    overdue_only: bool = False,
    unassigned_only: bool = False,
) -> list[TrackedItemOut]:
    query = _base_query()
    if status_filter is not None:
        query = query.where(ActionItem.status == status_filter)
    if owner_id is not None:
        query = query.where(ActionItem.owner_id == owner_id)
    if circular_id is not None:
        query = query.where(ActionItem.circular_id == circular_id)
    if unassigned_only:
        query = query.where(ActionItem.owner_id.is_(None))
    if overdue_only:
        # Mirrors `is_overdue` in SQL, so the filter and the flag cannot disagree.
        query = query.where(
            ActionItem.due_date.is_not(None),
            ActionItem.due_date < today_utc(),
            ActionItem.status != TERMINAL,
        )

    # Most urgent first. Closed work sinks; undated work sits below dated work rather
    # than above it, because a missing date is not urgency.
    query = query.order_by(
        (ActionItem.status == TERMINAL),
        ActionItem.due_date.is_(None),
        ActionItem.due_date,
        ActionItem.created_at,
    )
    rows = (await db.execute(query)).all()
    closers = await _closer_names(db, [item.closed_by for item, *_ in rows])
    return [_to_out(item, circ, fn, owner, closers) for item, circ, fn, owner in rows]


async def _closer_names(db: AsyncSession, ids: list[uuid.UUID | None]) -> dict[uuid.UUID, str]:
    wanted = {i for i in ids if i}
    if not wanted:
        return {}
    rows = (await db.execute(select(User).where(User.id.in_(wanted)))).scalars()
    return {u.id: u.full_name for u in rows}


def _to_out(
    item: ActionItem,
    circular: Circular,
    function: Function | None,
    owner: User | None,
    closers: dict[uuid.UUID, str],
) -> TrackedItemOut:
    return TrackedItemOut(
        id=item.id,
        circular_id=item.circular_id,
        circular_ref=circular.ref_no,
        circular_title=circular.title,
        description=item.description,
        status=item.status,
        priority=item.priority,
        source=item.source,
        due_date=item.due_date,
        owner=OwnerOut.model_validate(owner) if owner else None,
        owner_function_code=function.code if function else None,
        owner_function_name=function.name if function else None,
        evidence_url=item.evidence_url,
        closure_note=item.closure_note,
        closed_by_name=closers.get(item.closed_by) if item.closed_by else None,
        closed_at=item.closed_at,
        last_reminder_at=item.last_reminder_at,
        created_at=item.created_at,
        is_overdue=is_overdue(item),
        days_until_due=days_until_due(item),
        allowed_transitions=allowed_next(item.status),
    )


async def stats(db: AsyncSession) -> TrackerStats:
    today = today_utc()
    rows = list((await db.execute(select(ActionItem))).scalars())
    by_status = dict.fromkeys(S, 0)
    for item in rows:
        by_status[item.status] += 1
    return TrackerStats(
        total=len(rows),
        open=by_status[S.OPEN],
        in_progress=by_status[S.IN_PROGRESS],
        blocked=by_status[S.BLOCKED],
        submitted=by_status[S.SUBMITTED],
        closed=by_status[S.CLOSED],
        overdue=sum(1 for i in rows if is_overdue(i, today)),
        due_soon=sum(
            1
            for i in rows
            if i.status != TERMINAL
            and i.due_date is not None
            and 0 <= (i.due_date - today).days <= 7
        ),
        unassigned=sum(1 for i in rows if i.owner_id is None and i.status != TERMINAL),
    )


async def get(db: AsyncSession, item_id: uuid.UUID) -> ActionItem:
    item = (
        await db.execute(select(ActionItem).where(ActionItem.id == item_id))
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(http.HTTP_404_NOT_FOUND, "Action item not found")
    return item


async def item_out(db: AsyncSession, item: ActionItem) -> TrackedItemOut:
    found, circular, function, owner = (
        await db.execute(_base_query().where(ActionItem.id == item.id))
    ).one()
    closers = await _closer_names(db, [found.closed_by])
    return _to_out(found, circular, function, owner, closers)
