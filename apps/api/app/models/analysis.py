from __future__ import annotations

import uuid

from sqlalchemy import Enum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPkMixin
from app.models.enums import AnalysisStatus, RiskRating


class AIAnalysis(UUIDPkMixin, TimestampMixin, Base):
    """One versioned model output for a circular. Re-running creates a new version;
    older versions become SUPERSEDED but are never deleted (audit)."""

    __tablename__ = "ai_analyses"
    __table_args__ = (
        UniqueConstraint("circular_id", "version", name="uq_analysis_circular_version"),
    )

    circular_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("circulars.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[AnalysisStatus] = mapped_column(
        Enum(AnalysisStatus, name="analysis_status"), default=AnalysisStatus.DRAFT
    )
    summary: Mapped[str | None] = mapped_column(Text)
    risk_rating: Mapped[RiskRating | None] = mapped_column(Enum(RiskRating, name="risk_rating"))
    risk_reasoning: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float)

    # List of {claim, quote, char_start, char_end, verified} — the verifiable citations.
    citations: Mapped[list | None] = mapped_column(JSONB)

    model_name: Mapped[str | None] = mapped_column(String(255))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id")
    )
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id")
    )
