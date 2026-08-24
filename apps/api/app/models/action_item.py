from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPkMixin
from app.models.enums import ActionItemStatus, AssertionSource, Priority


class ActionItem(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "action_items"

    circular_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("circulars.id", ondelete="CASCADE"), index=True
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    # Which department must act. The model proposes this from the circular; a named
    # person (owner_id) is assigned by a human in the Stage 6 tracker.
    owner_function_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("functions.id"), index=True
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id"), index=True
    )
    due_date: Mapped[date | None] = mapped_column(Date, index=True)
    status: Mapped[ActionItemStatus] = mapped_column(
        Enum(ActionItemStatus, name="action_item_status"),
        default=ActionItemStatus.OPEN,
        index=True,
    )
    priority: Mapped[Priority] = mapped_column(
        Enum(Priority, name="action_item_priority"), default=Priority.MEDIUM
    )
    # Closure evidence. The state machine refuses CLOSED without one of these, because
    # "we did it, trust us" is not a closure a regulator accepts.
    evidence_url: Mapped[str | None] = mapped_column(String(1024))
    closure_note: Mapped[str | None] = mapped_column(Text)
    closed_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id")
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # When the overdue sweep last raised this item. Makes the cron idempotent: a second
    # run on the same day re-notifies nobody.
    last_reminder_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source: Mapped[AssertionSource] = mapped_column(
        Enum(AssertionSource, name="assertion_source_ai"), default=AssertionSource.AI
    )
    # Idempotency: `circular_id:normalized(description)` — a retried AI job never
    # double-creates the same action item.
    dedup_key: Mapped[str] = mapped_column(String(512), unique=True, index=True)
