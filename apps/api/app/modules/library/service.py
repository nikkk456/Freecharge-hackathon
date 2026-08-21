from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.circular import Circular, Function
from app.models.control import Control, Kci
from app.models.user import User


async def list_functions(db: AsyncSession) -> list[Function]:
    result = await db.execute(select(Function).order_by(Function.code))
    return list(result.scalars().all())


async def list_controls(db: AsyncSession) -> list[Control]:
    # Eager-load both sides so serialising ControlOut never triggers a lazy load
    # (which would blow up under async SQLAlchemy).
    result = await db.execute(
        select(Control)
        .options(selectinload(Control.owner_function), selectinload(Control.kcis))
        .order_by(Control.code)
    )
    return list(result.scalars().all())


async def list_kcis(db: AsyncSession) -> list[tuple[Kci, Control]]:
    result = await db.execute(
        select(Kci, Control).join(Control, Kci.control_id == Control.id).order_by(Kci.code)
    )
    return [(k, c) for k, c in result.all()]


async def _count(db: AsyncSession, model) -> int:  # noqa: ANN001
    return int((await db.execute(select(func.count()).select_from(model))).scalar_one())


async def stats(db: AsyncSession) -> dict:
    mix_rows = (
        await db.execute(select(Kci.status, func.count()).group_by(Kci.status))
    ).all()
    return {
        "functions": await _count(db, Function),
        "controls": await _count(db, Control),
        "kcis": await _count(db, Kci),
        "users": await _count(db, User),
        "circulars": await _count(db, Circular),
        "kci_status_mix": {status.value: count for status, count in mix_rows},
    }
