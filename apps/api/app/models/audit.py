from __future__ import annotations

import uuid

from sqlalchemy import BigInteger, Enum, ForeignKey, Identity, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPkMixin
from app.models.enums import ActorKind


class AuditLog(UUIDPkMixin, TimestampMixin, Base):
    """Append-only, hash-chained. NEVER updated or deleted.

    Each row's `hash` covers its own content plus the previous row's hash, so
    altering or removing any row breaks every hash after it. `GET /api/v1/audit/verify`
    walks the chain and reports the first break.
    """

    __tablename__ = "audit_logs"

    # Chain order. `created_at` is not sufficient: two rows written in the same
    # millisecond would have no defined predecessor, and the chain needs exactly one.
    seq: Mapped[int] = mapped_column(BigInteger, Identity(), unique=True, index=True)
    entity_type: Mapped[str] = mapped_column(String(64), index=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), index=True)
    action: Mapped[str] = mapped_column(String(64))
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id")
    )
    actor_kind: Mapped[ActorKind] = mapped_column(
        Enum(ActorKind, name="actor_kind"), default=ActorKind.SYSTEM
    )
    before: Mapped[dict | None] = mapped_column(JSONB)
    after: Mapped[dict | None] = mapped_column(JSONB)
    prev_hash: Mapped[str | None] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64), nullable=False)
