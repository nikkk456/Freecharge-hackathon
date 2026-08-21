from __future__ import annotations

import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.db.base import Base, TimestampMixin, UUIDPkMixin
from app.models.circular import Function
from app.models.enums import KciFrequency, KciStatus


class Control(UUIDPkMixin, TimestampMixin, Base):
    """The existing control library. Embedded so RAG can find 'controls that
    already cover this' when drafting an RCM."""

    __tablename__ = "controls"

    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # Which department owns this control. Drives "who has to act" on an RCM row.
    owner_function_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("functions.id"), index=True
    )
    embedding: Mapped[list[float] | None] = mapped_column(Vector(settings.active_embedding_dim))

    owner_function: Mapped[Function | None] = relationship()
    kcis: Mapped[list["Kci"]] = relationship(
        back_populates="control", cascade="all, delete-orphan"
    )


class Kci(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "kcis"

    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    control_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("controls.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    target: Mapped[str | None] = mapped_column(String(512))
    # Latest measured value and its RAG health against `target` — this is what makes
    # "the control exists, but it is amber right now" visible on an RCM row.
    current_value: Mapped[str | None] = mapped_column(String(128))
    status: Mapped[KciStatus] = mapped_column(
        Enum(KciStatus, name="kci_status"), default=KciStatus.GREEN, index=True
    )
    frequency: Mapped[KciFrequency] = mapped_column(
        Enum(KciFrequency, name="kci_frequency"), default=KciFrequency.MONTHLY
    )

    control: Mapped[Control] = relationship(back_populates="kcis")
