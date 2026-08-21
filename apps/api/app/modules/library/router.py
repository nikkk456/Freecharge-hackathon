from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.library import service
from app.modules.library.schemas import (
    ControlOut,
    FunctionOut,
    KciOut,
    KciWithControlOut,
    LibraryStats,
)

router = APIRouter(prefix="/library", tags=["library"])


@router.get("/stats", response_model=LibraryStats)
async def get_stats(db: AsyncSession = Depends(get_db)) -> LibraryStats:
    """One call the UI can use to prove the whole stack is wired: API -> DB -> seed data."""
    return LibraryStats(**await service.stats(db))


@router.get("/functions", response_model=list[FunctionOut])
async def get_functions(db: AsyncSession = Depends(get_db)) -> list[FunctionOut]:
    return [FunctionOut.model_validate(f) for f in await service.list_functions(db)]


@router.get("/controls", response_model=list[ControlOut])
async def get_controls(db: AsyncSession = Depends(get_db)) -> list[ControlOut]:
    return [ControlOut.model_validate(c) for c in await service.list_controls(db)]


@router.get("/kcis", response_model=list[KciWithControlOut])
async def get_kcis(db: AsyncSession = Depends(get_db)) -> list[KciWithControlOut]:
    return [
        KciWithControlOut(
            **KciOut.model_validate(kci).model_dump(),
            control_code=control.code,
            control_name=control.name,
        )
        for kci, control in await service.list_kcis(db)
    ]
