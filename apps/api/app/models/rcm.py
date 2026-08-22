from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPkMixin
from app.models.enums import AssertionSource, Coverage, RcmStatus


class Rcm(UUIDPkMixin, TimestampMixin, Base):
    """One Risk & Control Matrix per circular.

    Regenerating replaces the draft in place rather than versioning, unlike
    AIAnalysis: the RCM is derived from an analysis whose version is already under
    audit. A PUBLISHED RCM is frozen, exactly as a published analysis is.
    """

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
    model_name: Mapped[str | None] = mapped_column(String(255))
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id")
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    rows: Mapped[list[RcmRow]] = relationship(
        back_populates="rcm", cascade="all, delete-orphan"
    )


class RcmRow(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "rcm_rows"

    rcm_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("rcms.id", ondelete="CASCADE"), index=True
    )
    # Display order. Without it a regenerated matrix comes back shuffled and a
    # reviewer cannot tell what changed.
    position: Mapped[int] = mapped_column(Integer, default=0)
    risk_text: Mapped[str] = mapped_column(Text, nullable=False)
    control_text: Mapped[str] = mapped_column(Text, nullable=False)
    coverage: Mapped[Coverage] = mapped_column(
        Enum(Coverage, name="rcm_coverage"), default=Coverage.GAP, index=True
    )
    # Why the model believes this control does or does not answer the risk.
    reasoning: Mapped[str | None] = mapped_column(Text)
    mapped_control_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("controls.id")
    )
    # Derived from the mapped control, never asked of the model: control -> KCI is a
    # fact in our own data, and asking would invite the model to invent one.
    mapped_kci_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("kcis.id")
    )
    confidence: Mapped[float | None] = mapped_column(Float)
    # The verified citation grounding this risk in the circular — same shape and same
    # guarantee as an analysis citation (see ai/grounding.py).
    citation: Mapped[dict | None] = mapped_column(JSONB)
    source: Mapped[AssertionSource] = mapped_column(
        Enum(AssertionSource, name="assertion_source_rcm"), default=AssertionSource.AI
    )

    rcm: Mapped[Rcm] = relationship(back_populates="rows")
