"""RCM generation and review.

The rule under test throughout: **a row may never claim more coverage than it can
point at.** Reporting a risk as COVERED when no control backs it hides work, and
hidden work is the failure mode this whole feature exists to prevent — worse than
reporting a gap that turns out to be covered, which a reviewer simply corrects.

The DB-backed tests need a live Postgres and are skipped without one. They commit
(the review functions do), so like the Stage 4 tests they append to the audit trail.
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.pool import NullPool

from app.models.circular import Circular
from app.models.control import Control
from app.models.enums import (
    AssertionSource,
    CircularStatus,
    Coverage,
    RcmStatus,
    Role,
)
from app.models.rcm import Rcm, RcmRow
from app.models.user import User
from app.modules.rcm import review
from app.modules.rcm.schemas import RcmDraft, RcmRowCreate, RcmRowDraft, RcmRowPatch
from app.modules.rcm.service import _reconcile


# ---------------------------------------------------------------------------
# Model output coercion — no database needed
# ---------------------------------------------------------------------------
def test_coverage_is_case_insensitive():
    assert RcmRowDraft(risk_text="r", coverage="covered").coverage is Coverage.COVERED


def test_an_invented_coverage_value_falls_back_to_gap():
    # Toward more work, never less: an unrecognised verdict must not read as COVERED.
    assert RcmRowDraft(risk_text="r", coverage="MOSTLY_FINE").coverage is Coverage.GAP


@pytest.mark.parametrize("given", ["", "null", "none", "N/A", "-", "  "])
def test_stringly_typed_null_control_codes_become_none(given: str):
    assert RcmRowDraft(risk_text="r", mapped_control=given).mapped_control is None


def test_control_codes_are_normalised_to_upper_case():
    assert RcmRowDraft(risk_text="r", mapped_control=" c-006 ").mapped_control == "C-006"


def test_a_non_string_control_code_is_discarded_rather_than_crashing():
    assert RcmRowDraft(risk_text="r", mapped_control=42).mapped_control is None


def test_confidence_coercion_is_shared_with_the_analysis_schema():
    assert RcmRowDraft(risk_text="r", confidence="85%").confidence == pytest.approx(0.85)


def test_a_draft_with_no_rows_is_valid():
    assert RcmDraft().rows == []


def test_risk_text_is_required():
    with pytest.raises(ValidationError):
        RcmRowDraft(control_text="something")


# ---------------------------------------------------------------------------
# The coverage guard
# ---------------------------------------------------------------------------
class _FakeControl:
    """Stands in for a Control — `_reconcile` only cares whether one exists."""


@pytest.mark.parametrize("claimed", [Coverage.COVERED, Coverage.PARTIAL, Coverage.GAP])
def test_no_control_always_means_gap(claimed: Coverage):
    assert _reconcile(claimed, None) is Coverage.GAP


@pytest.mark.parametrize("claimed", [Coverage.COVERED, Coverage.PARTIAL, Coverage.GAP])
def test_a_real_control_leaves_the_verdict_alone(claimed: Coverage):
    # Including GAP: "this control exists and does not answer the risk" is a finding,
    # not a contradiction, and upgrading it would understate the work.
    assert _reconcile(claimed, _FakeControl()) is claimed


# ---------------------------------------------------------------------------
# Database-backed review
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
async def reviewer(db) -> User:
    user = User(
        email=f"rcm-{uuid.uuid4()}@test.dev",
        full_name="Test Reviewer",
        hashed_password="x",
        role=Role.REVIEWER,
    )
    db.add(user)
    await db.flush()
    return user


@pytest_asyncio.fixture
async def rcm(db) -> Rcm:
    circular = Circular(
        title="Fixture", raw_text="text", status=CircularStatus.ANALYZED, page_count=1
    )
    db.add(circular)
    await db.flush()
    row = Rcm(circular_id=circular.id, status=RcmStatus.DRAFT)
    db.add(row)
    await db.flush()
    # Eager-load `rows` so the fixture behaves like a real `get_rcm` result.
    return (
        await db.execute(
            select(Rcm).options(selectinload(Rcm.rows)).where(Rcm.id == row.id)
        )
    ).scalar_one()


@pytest_asyncio.fixture
async def controls(db) -> dict[str, Control]:
    rows = (
        await db.execute(select(Control).options(selectinload(Control.kcis)))
    ).scalars().all()
    if not rows:
        pytest.skip("control library not seeded (run: python -m scripts.seed)")
    return {c.code: c for c in rows}


async def test_a_reviewer_can_add_a_risk_the_model_missed(db, rcm, reviewer, controls):
    row = await review.create_row(
        db, rcm, RcmRowCreate(risk_text="Board not briefed in time"), reviewer
    )
    assert row.source is AssertionSource.HUMAN
    assert row.coverage is Coverage.GAP  # no control named
    assert row.confidence == 1.0


async def test_adding_a_row_with_a_control_carries_its_kci(db, rcm, reviewer, controls):
    row = await review.create_row(
        db,
        rcm,
        RcmRowCreate(risk_text="Recovery calls out of hours", mapped_control_code="C-006"),
        reviewer,
    )
    assert row.mapped_control_id == controls["C-006"].id
    assert row.mapped_kci_id == controls["C-006"].kcis[0].id, "the KCI is derived, not asked for"


async def test_clearing_the_control_forces_the_row_back_to_gap(db, rcm, reviewer, controls):
    row = await review.create_row(
        db,
        rcm,
        RcmRowCreate(
            risk_text="Something", coverage=Coverage.COVERED, mapped_control_code="C-006"
        ),
        reviewer,
    )
    assert row.coverage is Coverage.COVERED

    await review.patch_row(
        db, rcm, row, RcmRowPatch(mapped_control_code=None, coverage=Coverage.COVERED), reviewer
    )
    assert row.coverage is Coverage.GAP, "coverage cannot outrun its control"
    assert row.mapped_control_id is None
    assert row.mapped_kci_id is None


async def test_an_unknown_control_code_is_refused(db, rcm, reviewer, controls):
    with pytest.raises(HTTPException) as caught:
        await review.create_row(
            db, rcm, RcmRowCreate(risk_text="x y z", mapped_control_code="C-999"), reviewer
        )
    assert caught.value.status_code == 422


async def test_control_codes_are_matched_case_insensitively(db, rcm, reviewer, controls):
    row = await review.create_row(
        db, rcm, RcmRowCreate(risk_text="x y z", mapped_control_code=" c-006 "), reviewer
    )
    assert row.mapped_control_id == controls["C-006"].id


async def test_rows_are_appended_after_the_existing_ones(db, rcm, reviewer, controls):
    first = await review.create_row(db, rcm, RcmRowCreate(risk_text="First risk"), reviewer)
    second = await review.create_row(db, rcm, RcmRowCreate(risk_text="Second risk"), reviewer)
    assert second.position > first.position


async def test_a_published_matrix_is_frozen(db, rcm, reviewer, controls):
    await review.create_row(db, rcm, RcmRowCreate(risk_text="A risk"), reviewer)
    await db.refresh(rcm, ["rows"])
    await review.publish(db, rcm, reviewer)

    with pytest.raises(HTTPException) as caught:
        await review.create_row(db, rcm, RcmRowCreate(risk_text="Another"), reviewer)
    assert caught.value.status_code == 409


async def test_publishing_an_empty_matrix_is_refused(db, rcm, reviewer):
    with pytest.raises(HTTPException) as caught:
        await review.publish(db, rcm, reviewer)
    assert caught.value.status_code == 422


async def test_publishing_twice_is_refused(db, rcm, reviewer, controls):
    await review.create_row(db, rcm, RcmRowCreate(risk_text="A risk"), reviewer)
    await db.refresh(rcm, ["rows"])
    await review.publish(db, rcm, reviewer)
    with pytest.raises(HTTPException) as caught:
        await review.publish(db, rcm, reviewer)
    assert caught.value.status_code == 409


async def test_publishing_records_the_reviewer(db, rcm, reviewer, controls):
    await review.create_row(db, rcm, RcmRowCreate(risk_text="A risk"), reviewer)
    await db.refresh(rcm, ["rows"])
    await review.publish(db, rcm, reviewer)
    assert rcm.status is RcmStatus.PUBLISHED
    assert rcm.reviewed_by == reviewer.id
    assert rcm.published_at is not None


async def test_deleting_a_row_removes_it(db, rcm, reviewer, controls):
    row = await review.create_row(db, rcm, RcmRowCreate(risk_text="Temporary risk"), reviewer)
    row_id = row.id
    await review.delete_row(db, rcm, row, reviewer)
    assert (
        await db.execute(select(RcmRow).where(RcmRow.id == row_id))
    ).scalar_one_or_none() is None


async def test_a_no_op_edit_changes_nothing(db, rcm, reviewer, controls):
    row = await review.create_row(db, rcm, RcmRowCreate(risk_text="Stable risk"), reviewer)
    await review.patch_row(db, rcm, row, RcmRowPatch(risk_text="Stable risk"), reviewer)
    assert row.risk_text == "Stable risk"


async def test_a_too_short_risk_is_refused_before_it_reaches_the_database():
    with pytest.raises(ValidationError):
        RcmRowCreate(risk_text="x")
