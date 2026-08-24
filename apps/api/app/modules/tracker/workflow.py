"""Mutations on a tracked item: assign, move, close, reopen.

Every one writes an audit row before committing, and every status change goes through
`assert_transition`. Nothing here can move work forward on its own — the closest thing
to automation in this module is the overdue sweep, and all it does is raise an alarm.
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from fastapi import HTTPException
from fastapi import status as http
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.action_item import ActionItem
from app.models.circular import Function
from app.models.enums import ActorKind
from app.models.user import User
from app.modules.audit import service as audit
from app.modules.tracker import service
from app.modules.tracker.schemas import CloseRequest, ItemPatch, StatusChange
from app.modules.tracker.service import InvalidTransition

log = get_logger("tracker.workflow")


def _plain(value: object) -> object:
    """Readable, JSON-safe values for the audit payload."""
    if value is None:
        return None
    if isinstance(value, uuid.UUID | date | datetime):
        return str(value)
    return getattr(value, "value", value)


async def _function_by_code(db: AsyncSession, code: str | None) -> Function | None:
    if not code:
        return None
    function = (
        await db.execute(select(Function).where(Function.code == code.strip().upper()))
    ).scalar_one_or_none()
    if function is None:
        raise HTTPException(
            http.HTTP_422_UNPROCESSABLE_CONTENT, f"No such department: {code}"
        )
    return function


async def _user_by_id(db: AsyncSession, user_id: uuid.UUID | None) -> User | None:
    if user_id is None:
        return None
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(http.HTTP_422_UNPROCESSABLE_CONTENT, "No such user")
    if not user.is_active:
        raise HTTPException(
            http.HTTP_422_UNPROCESSABLE_CONTENT,
            "That account is disabled and cannot own work.",
        )
    return user


# ---------------------------------------------------------------------------
# Field edits
# ---------------------------------------------------------------------------
async def patch(
    db: AsyncSession, item: ActionItem, changes: ItemPatch, actor: User
) -> ActionItem:
    """Edit owner, due date, priority or wording. Status is NOT editable here — it
    goes through `change_status` so the state machine always runs."""
    if item.status == service.TERMINAL:
        raise HTTPException(
            http.HTTP_409_CONFLICT,
            "This item is closed. Reopen it before making changes.",
        )

    fields = changes.model_dump(exclude_unset=True)
    if not fields:
        return item

    function_code = fields.pop("owner_function_code", ...)
    owner_id = fields.pop("owner_id", ...)

    before: dict = {key: _plain(getattr(item, key)) for key in fields}
    for key, value in fields.items():
        setattr(item, key, value)

    if function_code is not ...:
        function = await _function_by_code(db, function_code)
        before["owner_function_id"] = _plain(item.owner_function_id)
        item.owner_function_id = function.id if function else None

    if owner_id is not ...:
        owner = await _user_by_id(db, owner_id)
        before["owner_id"] = _plain(item.owner_id)
        item.owner_id = owner.id if owner else None

    after = {key: _plain(getattr(item, key)) for key in before}
    if before == after:
        return item  # a no-op edit must not pollute the trail

    await audit.record(
        db,
        entity_type="action_item",
        entity_id=item.id,
        action="HUMAN_EDITED",
        actor_id=actor.id,
        actor_kind=ActorKind.HUMAN,
        before=before,
        after=after,
    )
    await db.commit()
    return item


# ---------------------------------------------------------------------------
# Status transitions
# ---------------------------------------------------------------------------
async def change_status(
    db: AsyncSession, item: ActionItem, payload: StatusChange, actor: User
) -> ActionItem:
    """Move an item along the workflow.

    Closing is not reachable from here — `close` is a separate call because it needs
    evidence and a different permission. Attempting it lands on a clear 409 rather
    than a silent no-op.
    """
    try:
        service.assert_transition(item.status, payload.status)
    except InvalidTransition as exc:
        raise HTTPException(http.HTTP_409_CONFLICT, str(exc)) from exc

    if payload.status == service.TERMINAL:
        raise HTTPException(
            http.HTTP_409_CONFLICT,
            "Closing an item needs evidence — use the close action, not a status change.",
        )

    before = item.status
    item.status = payload.status
    # Reopening wipes the closure record: leaving a closed_by on live work would
    # misrepresent who is accountable for it now.
    if before == service.TERMINAL:
        item.closed_by = None
        item.closed_at = None

    await audit.record(
        db,
        entity_type="action_item",
        entity_id=item.id,
        action="REOPENED" if before == service.TERMINAL else "STATUS_CHANGED",
        actor_id=actor.id,
        actor_kind=ActorKind.HUMAN,
        before={"status": before.value},
        after={"status": item.status.value, "note": payload.note},
    )
    await db.commit()
    log.info(
        "action_item_status",
        item_id=str(item.id),
        was=before.value,
        now=item.status.value,
        actor=actor.email,
    )
    return item


async def close(
    db: AsyncSession, item: ActionItem, payload: CloseRequest, actor: User
) -> ActionItem:
    """Sign an item off. Requires a legal transition, a human, and evidence.

    The evidence check is the point. "Never auto-close" is only meaningful if closure
    is impossible without something to point at afterwards.
    """
    try:
        service.assert_transition(item.status, service.TERMINAL)
    except InvalidTransition as exc:
        raise HTTPException(http.HTTP_409_CONFLICT, str(exc)) from exc

    evidence_url = (payload.evidence_url or "").strip() or None
    closure_note = (payload.closure_note or "").strip() or None
    if not evidence_url and not closure_note:
        raise HTTPException(
            http.HTTP_422_UNPROCESSABLE_CONTENT,
            "Closing an item needs evidence: a link to the proof, or a note describing "
            "what was done.",
        )

    before = {"status": item.status.value}
    item.status = service.TERMINAL
    item.evidence_url = evidence_url
    item.closure_note = closure_note
    item.closed_by = actor.id
    item.closed_at = datetime.now(tz=UTC)

    await audit.record(
        db,
        entity_type="action_item",
        entity_id=item.id,
        action="CLOSED",
        actor_id=actor.id,
        actor_kind=ActorKind.HUMAN,
        before=before,
        after={
            "status": item.status.value,
            "evidence_url": evidence_url,
            "closure_note": closure_note,
        },
    )
    await db.commit()
    log.info("action_item_closed", item_id=str(item.id), actor=actor.email)
    return item


# ---------------------------------------------------------------------------
# The overdue sweep — the only automated thing in the tracker
# ---------------------------------------------------------------------------
async def sweep_overdue(db: AsyncSession, *, today: date | None = None) -> dict:
    """Find work that has passed its due date and raise it, once.

    Idempotent by `last_reminder_at`: running it twice in a day notifies nobody the
    second time, so an ARQ retry cannot spam an owner. It never changes a status — an
    alarm is not progress, and letting a scheduled job move work would break the rule
    that nothing advances without a human.
    """
    today = today or service.today_utc()
    items = list((await db.execute(select(ActionItem))).scalars())

    overdue = [i for i in items if service.is_overdue(i, today)]
    to_remind = [
        i
        for i in overdue
        if i.last_reminder_at is None or i.last_reminder_at.date() < today
    ]

    for item in to_remind:
        item.last_reminder_at = datetime.now(tz=UTC)
        await audit.record(
            db,
            entity_type="action_item",
            entity_id=item.id,
            action="OVERDUE_REMINDER",
            actor_id=None,
            actor_kind=ActorKind.SYSTEM,
            after={
                "due_date": str(item.due_date),
                "days_overdue": (today - item.due_date).days,
                "status": item.status.value,
                "owner_id": str(item.owner_id) if item.owner_id else None,
            },
        )

    if to_remind:
        await db.commit()

    log.info(
        "overdue_sweep", checked=len(items), overdue=len(overdue), reminded=len(to_remind)
    )
    return {
        "checked": len(items),
        "newly_overdue": len(overdue),
        "reminded": len(to_remind),
        "detail": (
            f"{len(overdue)} item(s) past due; {len(to_remind)} raised now, "
            f"the rest were already raised today."
            if overdue
            else "Nothing is overdue."
        ),
    }
