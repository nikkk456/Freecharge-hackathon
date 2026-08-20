from __future__ import annotations

import uuid

from sqlalchemy import Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPkMixin
from app.models.enums import SourceSystem, SubmissionStatus


class Submission(UUIDPkMixin, TimestampMixin, Base):
    """A response pulled from CAMS/GCM (mocked in MVP) or entered manually.
    `gap_analysis` holds the AI verdict: does this actually address the obligation?"""

    __tablename__ = "submissions"

    circular_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("circulars.id", ondelete="CASCADE"), index=True
    )
    action_item_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("action_items.id"), index=True
    )
    source_system: Mapped[SourceSystem] = mapped_column(
        Enum(SourceSystem, name="source_system"), default=SourceSystem.MANUAL
    )
    content: Mapped[str | None] = mapped_column(Text)
    gap_analysis: Mapped[dict | None] = mapped_column(JSONB)
    status: Mapped[SubmissionStatus] = mapped_column(
        Enum(SubmissionStatus, name="submission_status"), default=SubmissionStatus.RECEIVED
    )
