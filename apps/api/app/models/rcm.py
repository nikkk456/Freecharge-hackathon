from __future__ import annotations

import uuid

from sqlalchemy import Enum, Float, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPkMixin
from app.models.enums import AssertionSource, RcmStatus


class Rcm(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "rcms"

    circular_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("circulars.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )
    status: Mapped[RcmStatus] = mapped_column(
        Enum(RcmStatus, name="rcm_status"), default=RcmStatus.DRAFT
    )

    rows: Mapped[list["RcmRow"]] = relationship(
        back_populates="rcm", cascade="all, delete-orphan"
    )


class RcmRow(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "rcm_rows"

    rcm_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("rcms.id", ondelete="CASCADE"), index=True
    )
    risk_text: Mapped[str] = mapped_column(Text, nullable=False)
    control_text: Mapped[str] = mapped_column(Text, nullable=False)
    mapped_control_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("controls.id")
    )
    mapped_kci_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("kcis.id")
    )
    confidence: Mapped[float | None] = mapped_column(Float)
    source: Mapped[AssertionSource] = mapped_column(
        Enum(AssertionSource, name="assertion_source_rcm"), default=AssertionSource.AI
    )

    rcm: Mapped[Rcm] = relationship(back_populates="rows")
