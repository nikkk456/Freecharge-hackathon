"""Human review: the state machine that makes "approved" mean something.

Needs a live Postgres — skipped without one. Each test builds its own engine because
pytest-asyncio gives every test a fresh event loop and asyncpg connections are
loop-bound.

**These tests leave audit entries behind.** The review functions commit, and an
append-only log cannot be cleaned up without breaking the very chain it exists to
protect. So they append to whatever database they run against and verify only their
own segment. Run `python -m scripts.seed --reset` if you want a clean trail for a demo.
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.pool import NullPool

from app.models.action_item import ActionItem
from app.models.analysis import AIAnalysis
from app.models.audit import AuditLog
from app.models.circular import Circular, CircularFunction, Function
from app.models.enums import (
    ActionItemStatus,
    ActorKind,
    AnalysisStatus,
    AssertionSource,
    CircularStatus,
    RiskRating,
    Role,
)
from app.models.user import User
from app.modules.analysis import review
from app.modules.analysis.schemas import (
    ActionItemCreate,
    ActionItemPatch,
    AnalysisPatch,
    FunctionAssert,
)
from app.modules.audit import service as audit


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
async def reviewer(db) -> User:
    user = User(
        email=f"reviewer-{uuid.uuid4()}@test.dev",
        full_name="Test Reviewer",
        hashed_password="x",
        role=Role.REVIEWER,
    )
    db.add(user)
    await db.flush()
    return user


@pytest_asyncio.fixture
async def circular(db) -> Circular:
    row = Circular(
        title="Fixture", raw_text="text", status=CircularStatus.ANALYZED, page_count=1
    )
    db.add(row)
    await db.flush()
    return row


@pytest_asyncio.fixture
async def analysis(db, circular) -> AIAnalysis:
    row = AIAnalysis(
        circular_id=circular.id,
        version=1,
        status=AnalysisStatus.DRAFT,
        summary="The model's summary.",
        risk_rating=RiskRating.MEDIUM,
        risk_reasoning="Because.",
        confidence=0.9,
        model_name="test/model",
    )
    db.add(row)
    await db.flush()
    return row


@pytest_asyncio.fixture
async def by_code(db) -> dict[str, Function]:
    rows = (await db.execute(select(Function))).scalars().all()
    if not rows:
        pytest.skip("foundation data not seeded (run: python -m scripts.seed)")
    return {f.code: f for f in rows}


async def _audit_count(db) -> int:
    return int(
        (await db.execute(select(func.count()).select_from(AuditLog))).scalar_one()
    )


# ---------------------------------------------------------------------------
# Editing a draft
# ---------------------------------------------------------------------------
async def test_a_reviewer_can_override_the_risk_rating(db, analysis, reviewer):
    await review.patch_analysis(
        db, analysis, AnalysisPatch(risk_rating=RiskRating.CRITICAL), reviewer
    )
    assert analysis.risk_rating is RiskRating.CRITICAL
    assert analysis.edited_by == reviewer.id


async def test_an_edit_writes_an_audit_row_carrying_before_and_after(db, analysis, reviewer):
    before = await _audit_count(db)
    await review.patch_analysis(
        db, analysis, AnalysisPatch(risk_rating=RiskRating.LOW), reviewer
    )
    assert await _audit_count(db) == before + 1

    row = (
        await db.execute(select(AuditLog).order_by(AuditLog.seq.desc()).limit(1))
    ).scalar_one()
    assert row.action == "HUMAN_EDITED"
    assert row.actor_kind is ActorKind.HUMAN
    assert row.actor_id == reviewer.id
    assert row.before == {"risk_rating": "MEDIUM"}
    assert row.after == {"risk_rating": "LOW"}


async def test_an_edit_that_changes_nothing_leaves_no_trace(db, analysis, reviewer):
    before = await _audit_count(db)
    await review.patch_analysis(
        db, analysis, AnalysisPatch(risk_rating=RiskRating.MEDIUM), reviewer
    )
    assert await _audit_count(db) == before, "a no-op edit must not pollute the trail"


async def test_an_empty_patch_is_a_no_op(db, analysis, reviewer):
    before = await _audit_count(db)
    await review.patch_analysis(db, analysis, AnalysisPatch(), reviewer)
    assert await _audit_count(db) == before


# ---------------------------------------------------------------------------
# The freeze — the whole point of "approved"
# ---------------------------------------------------------------------------
async def test_a_published_analysis_cannot_be_edited(db, analysis, circular, reviewer):
    await review.publish(db, analysis, circular, reviewer)
    with pytest.raises(HTTPException) as caught:
        await review.patch_analysis(
            db, analysis, AnalysisPatch(summary="rewritten"), reviewer
        )
    assert caught.value.status_code == 409
    assert analysis.summary == "The model's summary."


async def test_a_superseded_analysis_cannot_be_edited(db, analysis, reviewer):
    analysis.status = AnalysisStatus.SUPERSEDED
    with pytest.raises(HTTPException) as caught:
        await review.patch_analysis(db, analysis, AnalysisPatch(summary="x"), reviewer)
    assert caught.value.status_code == 409


async def test_publishing_twice_is_refused(db, analysis, circular, reviewer):
    await review.publish(db, analysis, circular, reviewer)
    with pytest.raises(HTTPException) as caught:
        await review.publish(db, analysis, circular, reviewer)
    assert caught.value.status_code == 409


async def test_publishing_records_the_reviewer_and_moves_the_circular(
    db, analysis, circular, reviewer
):
    await review.publish(db, analysis, circular, reviewer)
    assert analysis.status is AnalysisStatus.PUBLISHED
    assert analysis.reviewed_by == reviewer.id
    assert analysis.published_at is not None
    assert circular.status is CircularStatus.PUBLISHED


async def test_publishing_without_a_summary_is_refused(db, analysis, circular, reviewer):
    analysis.summary = "   "
    with pytest.raises(HTTPException) as caught:
        await review.publish(db, analysis, circular, reviewer)
    assert caught.value.status_code == 422


async def test_publishing_without_a_risk_rating_is_refused(db, analysis, circular, reviewer):
    analysis.risk_rating = None
    with pytest.raises(HTTPException) as caught:
        await review.publish(db, analysis, circular, reviewer)
    assert caught.value.status_code == 422


async def test_publishing_a_new_version_steps_the_old_one_down(
    db, analysis, circular, reviewer
):
    await review.publish(db, analysis, circular, reviewer)
    newer = AIAnalysis(
        circular_id=circular.id,
        version=2,
        status=AnalysisStatus.DRAFT,
        summary="Second pass.",
        risk_rating=RiskRating.HIGH,
        confidence=0.9,
    )
    db.add(newer)
    await db.flush()

    await review.publish(db, newer, circular, reviewer)
    assert newer.status is AnalysisStatus.PUBLISHED
    assert analysis.status is AnalysisStatus.SUPERSEDED, "only one published version at a time"


# ---------------------------------------------------------------------------
# Impacted departments
# ---------------------------------------------------------------------------
async def test_a_reviewer_can_add_a_department_the_model_missed(
    db, analysis, circular, reviewer, by_code
):
    await review.add_function(db, analysis, FunctionAssert(code="F17", reasoning="Audit"), reviewer)
    link = (
        await db.execute(
            select(CircularFunction).where(
                CircularFunction.circular_id == circular.id,
                CircularFunction.function_id == by_code["F17"].id,
            )
        )
    ).scalar_one()
    assert link.source is AssertionSource.HUMAN
    assert link.confidence == 1.0


async def test_adding_a_department_the_model_already_found_promotes_it_to_human(
    db, analysis, circular, reviewer, by_code
):
    # A human confirming the AI must survive the next AI re-run, which deletes
    # AI-sourced rows only.
    db.add(
        CircularFunction(
            circular_id=circular.id,
            function_id=by_code["F06"].id,
            confidence=0.8,
            source=AssertionSource.AI,
        )
    )
    await db.flush()

    await review.add_function(db, analysis, FunctionAssert(code="F06"), reviewer)
    link = (
        await db.execute(
            select(CircularFunction).where(
                CircularFunction.circular_id == circular.id,
                CircularFunction.function_id == by_code["F06"].id,
            )
        )
    ).scalar_one()
    assert link.source is AssertionSource.HUMAN


async def test_an_unknown_department_code_is_refused(db, analysis, reviewer, by_code):
    with pytest.raises(HTTPException) as caught:
        await review.add_function(db, analysis, FunctionAssert(code="F99"), reviewer)
    assert caught.value.status_code == 422


async def test_department_codes_are_matched_case_insensitively(
    db, analysis, reviewer, by_code
):
    await review.add_function(db, analysis, FunctionAssert(code=" f17 "), reviewer)  # no raise


async def test_removing_a_department_that_is_not_listed_is_a_404(db, analysis, reviewer, by_code):
    with pytest.raises(HTTPException) as caught:
        await review.remove_function(db, analysis, "F17", reviewer)
    assert caught.value.status_code == 404


# ---------------------------------------------------------------------------
# Action items
# ---------------------------------------------------------------------------
async def test_a_reviewer_can_add_an_action_item(db, circular, reviewer, by_code):
    item = await review.create_action_item(
        db,
        circular,
        ActionItemCreate(description="Brief the board", owner_function_code="F16"),
        reviewer,
    )
    assert item.source is AssertionSource.HUMAN
    assert item.status is ActionItemStatus.OPEN
    assert item.owner_function_id == by_code["F16"].id


async def test_a_too_short_description_is_refused_before_it_reaches_the_database(db):
    with pytest.raises(ValidationError):
        ActionItemCreate(description="X")


async def test_two_reviewers_adding_the_same_wording_both_succeed(db, circular, reviewer):
    first = await review.create_action_item(
        db, circular, ActionItemCreate(description="Same wording"), reviewer
    )
    second = await review.create_action_item(
        db, circular, ActionItemCreate(description="Same wording"), reviewer
    )
    # dedup_key is unique in the database; a collision here would be a 500 in production.
    assert first.dedup_key != second.dedup_key


async def test_editing_an_action_item_records_before_and_after(db, circular, reviewer, by_code):
    item = await review.create_action_item(
        db, circular, ActionItemCreate(description="Do the thing"), reviewer
    )
    await review.patch_action_item(
        db, item, ActionItemPatch(owner_function_code="F17"), reviewer
    )
    assert item.owner_function_id == by_code["F17"].id

    row = (
        await db.execute(select(AuditLog).order_by(AuditLog.seq.desc()).limit(1))
    ).scalar_one()
    assert row.action == "HUMAN_EDITED"
    # The payload must be JSON, not a raw UUID — that combination once broke the insert.
    assert isinstance(row.after["owner_function_id"], str)


async def test_deleting_an_action_item_leaves_its_record_behind(db, circular, reviewer):
    item = await review.create_action_item(
        db, circular, ActionItemCreate(description="Temporary"), reviewer
    )
    item_id = item.id
    await review.delete_action_item(db, item, reviewer)

    assert (
        await db.execute(select(ActionItem).where(ActionItem.id == item_id))
    ).scalar_one_or_none() is None
    row = (
        await db.execute(select(AuditLog).order_by(AuditLog.seq.desc()).limit(1))
    ).scalar_one()
    assert row.action == "HUMAN_DELETED"
    assert row.before["description"] == "Temporary"


# ---------------------------------------------------------------------------
# The chain, end to end against the database
# ---------------------------------------------------------------------------
async def test_a_sequence_of_real_actions_produces_an_intact_chain(
    db, analysis, circular, reviewer, by_code
):
    # Anchored on the current tail: the review functions commit, so this test appends
    # to whatever chain the target database already has. Verifying only our own
    # segment keeps the assertion about our code rather than about the state someone
    # else left behind.
    anchor = (
        await db.execute(select(AuditLog.seq).order_by(AuditLog.seq.desc()).limit(1))
    ).scalar_one_or_none()

    await review.patch_analysis(db, analysis, AnalysisPatch(summary="Edited."), reviewer)
    await review.add_function(db, analysis, FunctionAssert(code="F17"), reviewer)
    await review.create_action_item(
        db, circular, ActionItemCreate(description="Brief the board"), reviewer
    )
    await review.publish(db, analysis, circular, reviewer)

    report = await audit.verify_chain(db, since_seq=anchor)
    assert report.intact, report.detail
    assert report.total == 4, "one entry per action, no more and no fewer"


async def test_verifying_from_an_entry_that_does_not_exist_is_reported_not_crashed(db):
    report = await audit.verify_chain(db, since_seq=10**9)
    assert report.intact is False
    assert "does not exist" in (report.reason or "")
