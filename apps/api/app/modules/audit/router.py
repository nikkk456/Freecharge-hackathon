from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.enums import ActorKind
from app.modules.audit import service

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    seq: int
    entity_type: str
    entity_id: uuid.UUID
    action: str
    actor_id: uuid.UUID | None
    actor_kind: ActorKind
    before: dict | None
    after: dict | None
    prev_hash: str | None
    hash: str
    created_at: datetime


class ChainOut(BaseModel):
    total: int
    intact: bool
    broken_at_seq: int | None
    detail: str


@router.get("/verify", response_model=ChainOut)
async def verify(db: AsyncSession = Depends(get_db)) -> ChainOut:
    """Recompute every hash in the chain and report the first break, if any.

    Static route, declared before /{...} routes so it cannot be captured by one.
    """
    report = await service.verify_chain(db)
    return ChainOut(
        total=report.total,
        intact=report.intact,
        broken_at_seq=report.broken_at_seq,
        detail=report.detail,
    )


@router.get("", response_model=list[AuditEntryOut])
async def list_entries(
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> list[AuditEntryOut]:
    """Newest first. Filter by entity to reconstruct one record's history."""
    rows = await service.history(
        db, entity_type=entity_type, entity_id=entity_id, limit=limit
    )
    return [AuditEntryOut.model_validate(row) for row in rows]
