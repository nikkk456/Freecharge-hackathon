from __future__ import annotations

import uuid

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPkMixin
from app.models.enums import ActorKind


class AuditLog(UUIDPkMixin, TimestampMixin, Base):
    """Append-only, hash-chained. NEVER updated or deleted. Each row's `hash`
    chains to `prev_hash`, so any tampering breaks the chain — the 'regulators
    will ask' story. (Chain-writing logic to be added when you build the audit module.)"""

    __tablename__ = "audit_logs"

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
