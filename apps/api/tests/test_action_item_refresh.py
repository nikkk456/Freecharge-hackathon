"""Re-running an analysis must not accumulate near-duplicate action items.

This is a regression test for a bug that actually shipped into a running system: the
first version keyed action items on their normalised text, assuming a re-run would
produce the same wording. It does not. The model rephrases the same obligation every
time ("Ensure agents hold IIBF certification" / "Obtain IIBF certification for all
recovery agents"), so a second run turned 8 items into 16.

Needs a live Postgres — skipped when there is none, so the rest of the suite still
runs on a bare machine. Everything is rolled back.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.pool import NullPool

from app.models.action_item import ActionItem
from app.models.circular import Circular, Function
from app.models.enums import ActionItemStatus, AssertionSource, CircularStatus
from app.modules.analysis.schemas import AnalysisDraft
from app.modules.analysis.service import _upsert_action_items


@pytest_asyncio.fixture
async def db():
    """A session on an engine built for *this* test's event loop.

    The app's shared engine cannot be reused here: pytest-asyncio gives each test a
    new event loop, and asyncpg connections are bound to the loop that created them.
    Sharing one engine across loops fails intermittently — which it did, as two tests
    skipping at random.
    """
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.config import settings

    engine = create_async_engine(settings.sqlalchemy_dsn, poolclass=NullPool)
    try:
        async with engine.connect():
            pass
    except Exception:  # noqa: BLE001 — any connection failure means "no database"
        await engine.dispose()
        pytest.skip("no database (run: docker compose up -d db)")

    session = async_sessionmaker(engine, expire_on_commit=False)()
    try:
        yield session
    finally:
        # Nothing is ever committed, so one rollback discards the whole test.
        await session.rollback()
        await session.close()
        await engine.dispose()


@pytest_asyncio.fixture
async def circular(db):
    row = Circular(
        title="Fixture circular",
        raw_text="text",
        status=CircularStatus.PARSED,
        page_count=1,
    )
    db.add(row)
    await db.flush()
    return row


@pytest_asyncio.fixture
async def by_code(db) -> dict[str, Function]:
    functions = (await db.execute(select(Function))).scalars().all()
    if not functions:
        pytest.skip("foundation data not seeded (run: python -m scripts.seed)")
    return {f.code: f for f in functions}


def _draft(*descriptions: str) -> AnalysisDraft:
    return AnalysisDraft.model_validate(
        {
            "summary": "s",
            "action_items": [
                {"description": d, "owner_function": "F06"} for d in descriptions
            ],
        }
    )


async def _count(db, circular) -> int:
    return int(
        (
            await db.execute(
                select(func.count())
                .select_from(ActionItem)
                .where(ActionItem.circular_id == circular.id)
            )
        ).scalar_one()
    )


async def test_rewritten_items_replace_rather_than_accumulate(db, circular, by_code):
    first = _draft("Obtain IIBF certification", "Log calls")
    await _upsert_action_items(db, circular, first, by_code)
    await db.flush()
    assert await _count(db, circular) == 2

    # Same two obligations, reworded — exactly what a second model run produces.
    await _upsert_action_items(
        db,
        circular,
        _draft("Ensure all recovery agents hold IIBF certification", "Record every call"),
        by_code,
    )
    await db.flush()
    assert await _count(db, circular) == 2, "re-run must replace, not append"


async def test_identical_wording_is_still_stable(db, circular, by_code):
    for _ in range(3):
        await _upsert_action_items(db, circular, _draft("Do the thing"), by_code)
        await db.flush()
    assert await _count(db, circular) == 1


async def test_an_item_a_human_has_started_survives_a_re_run(db, circular, by_code):
    await _upsert_action_items(db, circular, _draft("Original wording"), by_code)
    await db.flush()

    started = (
        await db.execute(select(ActionItem).where(ActionItem.circular_id == circular.id))
    ).scalar_one()
    started.status = ActionItemStatus.IN_PROGRESS  # a human picked it up
    await db.flush()

    await _upsert_action_items(db, circular, _draft("Completely different wording"), by_code)
    await db.flush()

    rows = (
        await db.execute(select(ActionItem).where(ActionItem.circular_id == circular.id))
    ).scalars().all()
    descriptions = {r.description for r in rows}
    assert "Original wording" in descriptions, "work in progress must never be deleted"
    assert "Completely different wording" in descriptions
    assert len(rows) == 2


async def test_a_human_authored_item_is_never_deleted(db, circular, by_code):
    db.add(
        ActionItem(
            circular_id=circular.id,
            description="Added by a compliance officer",
            status=ActionItemStatus.OPEN,
            source=AssertionSource.HUMAN,
            dedup_key=f"{circular.id}:human",
        )
    )
    await db.flush()

    await _upsert_action_items(db, circular, _draft("An AI item"), by_code)
    await db.flush()

    rows = (
        await db.execute(select(ActionItem).where(ActionItem.circular_id == circular.id))
    ).scalars().all()
    assert {r.source for r in rows} == {AssertionSource.HUMAN, AssertionSource.AI}
    assert len(rows) == 2


async def test_the_owning_department_is_attached(db, circular, by_code):
    await _upsert_action_items(db, circular, _draft("Something for collections"), by_code)
    await db.flush()
    row = (
        await db.execute(select(ActionItem).where(ActionItem.circular_id == circular.id))
    ).scalar_one()
    assert row.owner_function_id == by_code["F06"].id
