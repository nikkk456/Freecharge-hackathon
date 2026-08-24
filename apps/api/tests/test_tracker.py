"""The action-item tracker.

Two invariants are on trial here, and both are the kind that look fine until the day
someone audits them:

* **Nothing closes itself.** CLOSED needs a legal transition, a human, and evidence.
* **Overdue is derived.** Being late never overwrites what was happening to the work.

The pure state-machine tests need no database. The workflow tests do, and are skipped
without one; they commit, so like the other DB-backed suites they append to the audit
trail.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.pool import NullPool

from app.models.action_item import ActionItem
from app.models.audit import AuditLog
from app.models.circular import Circular
from app.models.enums import ActionItemStatus as S
from app.models.enums import ActorKind, AssertionSource, CircularStatus, Priority, Role
from app.models.user import User
from app.modules.tracker import service, workflow
from app.modules.tracker.schemas import CloseRequest, ItemPatch, StatusChange
from app.modules.tracker.service import InvalidTransition

TODAY = date(2026, 8, 24)


# ---------------------------------------------------------------------------
# The state machine — pure, no database
# ---------------------------------------------------------------------------
def test_the_normal_path_is_legal():
    service.assert_transition(S.OPEN, S.IN_PROGRESS)
    service.assert_transition(S.IN_PROGRESS, S.SUBMITTED)
    service.assert_transition(S.SUBMITTED, S.CLOSED)


@pytest.mark.parametrize("current", [S.OPEN, S.IN_PROGRESS, S.BLOCKED])
def test_work_cannot_jump_straight_to_closed(current: S):
    # Maker-checker: work must be submitted before anyone can sign it off, so the
    # person doing it cannot also approve it.
    with pytest.raises(InvalidTransition, match="cannot move straight to CLOSED"):
        service.assert_transition(current, S.CLOSED)


def test_closed_is_reachable_only_from_submitted():
    reachable = [s for s in S if S.CLOSED in service.TRANSITIONS[s]]
    assert reachable == [S.SUBMITTED]


def test_a_transition_to_the_same_status_is_rejected():
    with pytest.raises(InvalidTransition, match="already"):
        service.assert_transition(S.OPEN, S.OPEN)


def test_the_error_names_the_legal_moves():
    with pytest.raises(InvalidTransition, match="OPEN, SUBMITTED"):
        service.assert_transition(S.BLOCKED, S.CLOSED)


def test_closed_work_can_be_reopened_but_only_to_in_progress():
    assert service.allowed_next(S.CLOSED) == [S.IN_PROGRESS]


def test_every_status_has_a_transition_entry():
    # A status missing from the table would silently become a dead end.
    assert set(service.TRANSITIONS) == set(S)


def test_no_transition_table_entry_points_at_a_status_that_does_not_exist():
    for targets in service.TRANSITIONS.values():
        assert targets <= set(S)


# ---------------------------------------------------------------------------
# Overdue is derived
# ---------------------------------------------------------------------------
def _item(**kw) -> ActionItem:
    defaults = {
        "description": "Do the thing",
        "status": S.OPEN,
        "priority": Priority.MEDIUM,
        "dedup_key": str(uuid.uuid4()),
    }
    return ActionItem(**{**defaults, **kw})


def test_an_item_past_its_due_date_is_overdue():
    assert service.is_overdue(_item(due_date=TODAY - timedelta(days=1)), TODAY) is True


def test_an_item_due_today_is_not_yet_overdue():
    assert service.is_overdue(_item(due_date=TODAY), TODAY) is False


def test_an_item_with_no_due_date_is_never_overdue():
    assert service.is_overdue(_item(due_date=None), TODAY) is False


def test_closed_work_is_never_overdue():
    # It is done, whenever it was done. Nagging about it would be noise.
    late = _item(due_date=TODAY - timedelta(days=30), status=S.CLOSED)
    assert service.is_overdue(late, TODAY) is False


@pytest.mark.parametrize("status", [S.OPEN, S.IN_PROGRESS, S.BLOCKED, S.SUBMITTED])
def test_every_live_status_can_be_overdue(status: S):
    # The point of deriving it: an item is late *and* still in whatever state it was.
    late = _item(due_date=TODAY - timedelta(days=1), status=status)
    assert service.is_overdue(late, TODAY) is True
    assert late.status is status, "being late must not overwrite the workflow state"


def test_days_until_due_counts_both_directions():
    assert service.days_until_due(_item(due_date=TODAY + timedelta(days=3)), TODAY) == 3
    assert service.days_until_due(_item(due_date=TODAY - timedelta(days=2)), TODAY) == -2
    assert service.days_until_due(_item(due_date=None), TODAY) is None


# ---------------------------------------------------------------------------
# Database-backed workflow
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def db():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.config import settings

    engine = create_async_engine(settings.sqlalchemy_dsn, poolclass=NullPool)
    try:
        async with engine.connect():
            pass
    except Exception:  # noqa: BLE001
        await engine.dispose()
        pytest.skip("no database (run: docker compose up -d db)")

    session = async_sessionmaker(engine, expire_on_commit=False)()
    try:
        yield session
    finally:
        await session.rollback()
        await session.close()
        await engine.dispose()


@pytest_asyncio.fixture
async def actor(db) -> User:
    user = User(
        email=f"tracker-{uuid.uuid4()}@test.dev",
        full_name="Test Owner",
        hashed_password="x",
        role=Role.OWNER,
    )
    db.add(user)
    await db.flush()
    return user


@pytest_asyncio.fixture
async def item(db) -> ActionItem:
    circular = Circular(
        title="Fixture", raw_text="text", status=CircularStatus.ANALYZED, page_count=1
    )
    db.add(circular)
    await db.flush()
    row = ActionItem(
        circular_id=circular.id,
        description="Obtain IIBF certification for all recovery agents",
        status=S.OPEN,
        priority=Priority.HIGH,
        source=AssertionSource.AI,
        dedup_key=f"{circular.id}:{uuid.uuid4()}",
    )
    db.add(row)
    await db.flush()
    return row


async def _latest_audit(db) -> AuditLog:
    return (
        await db.execute(select(AuditLog).order_by(AuditLog.seq.desc()).limit(1))
    ).scalar_one()


# --- assignment ---
async def test_assigning_an_owner_is_recorded(db, item, actor):
    await workflow.patch(db, item, ItemPatch(owner_id=actor.id), actor)
    assert item.owner_id == actor.id

    row = await _latest_audit(db)
    assert row.action == "HUMAN_EDITED"
    assert row.after["owner_id"] == str(actor.id)


async def test_a_due_date_can_be_set(db, item, actor):
    due = TODAY + timedelta(days=10)
    await workflow.patch(db, item, ItemPatch(due_date=due), actor)
    assert item.due_date == due


async def test_assigning_an_unknown_user_is_refused(db, item, actor):
    with pytest.raises(HTTPException) as caught:
        await workflow.patch(db, item, ItemPatch(owner_id=uuid.uuid4()), actor)
    assert caught.value.status_code == 422


async def test_a_disabled_account_cannot_own_work(db, item, actor):
    disabled = User(
        email=f"gone-{uuid.uuid4()}@test.dev",
        full_name="Departed",
        hashed_password="x",
        role=Role.ANALYST,
        is_active=False,
    )
    db.add(disabled)
    await db.flush()

    with pytest.raises(HTTPException, match="disabled"):
        await workflow.patch(db, item, ItemPatch(owner_id=disabled.id), actor)


async def test_a_no_op_edit_writes_nothing(db, item, actor):
    before = len(list((await db.execute(select(AuditLog))).scalars()))
    await workflow.patch(db, item, ItemPatch(priority=Priority.HIGH), actor)
    after = len(list((await db.execute(select(AuditLog))).scalars()))
    assert after == before


# --- transitions ---
async def test_moving_to_in_progress_is_audited(db, item, actor):
    await workflow.change_status(db, item, StatusChange(status=S.IN_PROGRESS), actor)
    assert item.status is S.IN_PROGRESS

    row = await _latest_audit(db)
    assert row.action == "STATUS_CHANGED"
    assert row.before == {"status": "OPEN"}
    assert row.after["status"] == "IN_PROGRESS"


async def test_an_illegal_transition_is_refused(db, item, actor):
    with pytest.raises(HTTPException) as caught:
        await workflow.change_status(db, item, StatusChange(status=S.CLOSED), actor)
    assert caught.value.status_code == 409
    assert item.status is S.OPEN


async def test_closing_via_the_status_endpoint_is_refused_with_a_useful_message(
    db, item, actor
):
    await workflow.change_status(db, item, StatusChange(status=S.SUBMITTED), actor)
    with pytest.raises(HTTPException, match="needs evidence"):
        await workflow.change_status(db, item, StatusChange(status=S.CLOSED), actor)
    assert item.status is S.SUBMITTED


# --- closure ---
async def test_closing_requires_evidence(db, item, actor):
    await workflow.change_status(db, item, StatusChange(status=S.SUBMITTED), actor)
    with pytest.raises(HTTPException) as caught:
        await workflow.close(db, item, CloseRequest(), actor)
    assert caught.value.status_code == 422
    assert item.status is S.SUBMITTED, "a refused close must not half-apply"


async def test_whitespace_is_not_evidence(db, item, actor):
    await workflow.change_status(db, item, StatusChange(status=S.SUBMITTED), actor)
    with pytest.raises(HTTPException, match="needs evidence"):
        await workflow.close(
            db, item, CloseRequest(evidence_url="   ", closure_note="  "), actor
        )


async def test_a_closure_note_alone_is_enough_evidence(db, item, actor):
    await workflow.change_status(db, item, StatusChange(status=S.SUBMITTED), actor)
    await workflow.close(db, item, CloseRequest(closure_note="Policy signed 14 Aug"), actor)
    assert item.status is S.CLOSED
    assert item.closed_by == actor.id
    assert item.closed_at is not None


async def test_closing_records_who_and_what(db, item, actor):
    await workflow.change_status(db, item, StatusChange(status=S.SUBMITTED), actor)
    await workflow.close(
        db, item, CloseRequest(evidence_url="https://intranet/policy.pdf"), actor
    )
    row = await _latest_audit(db)
    assert row.action == "CLOSED"
    assert row.actor_id == actor.id
    assert row.actor_kind is ActorKind.HUMAN
    assert row.after["evidence_url"] == "https://intranet/policy.pdf"


async def test_a_closed_item_cannot_be_edited(db, item, actor):
    await workflow.change_status(db, item, StatusChange(status=S.SUBMITTED), actor)
    await workflow.close(db, item, CloseRequest(closure_note="Done"), actor)

    with pytest.raises(HTTPException) as caught:
        await workflow.patch(db, item, ItemPatch(priority=Priority.LOW), actor)
    assert caught.value.status_code == 409


async def test_reopening_clears_the_closure_record(db, item, actor):
    await workflow.change_status(db, item, StatusChange(status=S.SUBMITTED), actor)
    await workflow.close(db, item, CloseRequest(closure_note="Done"), actor)

    await workflow.change_status(db, item, StatusChange(status=S.IN_PROGRESS), actor)
    assert item.status is S.IN_PROGRESS
    assert item.closed_by is None, "live work must not carry a stale sign-off"
    assert item.closed_at is None

    row = await _latest_audit(db)
    assert row.action == "REOPENED"


# --- the overdue sweep ---
async def test_the_sweep_raises_overdue_work_once_per_day(db, item, actor):
    item.due_date = service.today_utc() - timedelta(days=3)
    await db.flush()

    first = await workflow.sweep_overdue(db)
    assert first["reminded"] >= 1
    assert item.last_reminder_at is not None

    second = await workflow.sweep_overdue(db)
    assert second["reminded"] == 0, "a second run the same day must notify nobody"


async def test_the_sweep_never_changes_a_status(db, item, actor):
    item.due_date = service.today_utc() - timedelta(days=1)
    item.status = S.IN_PROGRESS
    await db.flush()

    await workflow.sweep_overdue(db)
    assert item.status is S.IN_PROGRESS, "an alarm is not progress"


async def test_the_sweep_ignores_closed_work(db, item, actor):
    await workflow.change_status(db, item, StatusChange(status=S.SUBMITTED), actor)
    await workflow.close(db, item, CloseRequest(closure_note="Done"), actor)
    item.due_date = service.today_utc() - timedelta(days=30)
    await db.flush()

    await workflow.sweep_overdue(db)
    assert item.last_reminder_at is None


async def test_the_sweep_writes_a_system_audit_row(db, item, actor):
    item.due_date = service.today_utc() - timedelta(days=2)
    await db.flush()
    await workflow.sweep_overdue(db)

    row = (
        await db.execute(
            select(AuditLog)
            .where(AuditLog.entity_id == item.id, AuditLog.action == "OVERDUE_REMINDER")
            .order_by(AuditLog.seq.desc())
            .limit(1)
        )
    ).scalar_one()
    assert row.actor_kind is ActorKind.SYSTEM
    assert row.actor_id is None, "a scheduled job is not a person"
    assert row.after["days_overdue"] == 2


async def test_a_sweep_leaves_work_that_is_not_yet_due_alone(db, item, actor):
    # Asserted on this item, not on the sweep's totals: these tests commit, so the
    # sweep legitimately sees rows left behind by every other test in the file.
    item.due_date = service.today_utc() + timedelta(days=5)
    await db.flush()
    await workflow.sweep_overdue(db)
    assert item.last_reminder_at is None


# --- reads ---
async def test_the_item_view_exposes_only_legal_next_states(db, item, actor):
    out = await service.item_out(db, item)
    assert out.status is S.OPEN
    assert S.CLOSED not in out.allowed_transitions
    assert set(out.allowed_transitions) == {S.IN_PROGRESS, S.BLOCKED, S.SUBMITTED}


async def test_the_overdue_filter_and_the_flag_agree(db, item, actor):
    item.due_date = service.today_utc() - timedelta(days=1)
    await db.flush()

    listed = await service.list_items(db, overdue_only=True, circular_id=item.circular_id)
    assert [row.id for row in listed] == [item.id]
    assert listed[0].is_overdue is True


async def test_closed_work_is_excluded_from_the_overdue_filter(db, item, actor):
    item.due_date = service.today_utc() - timedelta(days=1)
    await workflow.change_status(db, item, StatusChange(status=S.SUBMITTED), actor)
    await workflow.close(db, item, CloseRequest(closure_note="Done"), actor)

    listed = await service.list_items(db, overdue_only=True, circular_id=item.circular_id)
    assert listed == []


async def test_stats_count_derived_overdue_not_a_status(db, item, actor):
    item.due_date = service.today_utc() - timedelta(days=1)
    await db.flush()
    counts = await service.stats(db)
    assert counts.overdue >= 1
    assert counts.open >= 1, "an overdue item is still OPEN"
