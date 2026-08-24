from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ActionItemStatus, AssertionSource, Priority


class OwnerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: str


class TrackedItemOut(BaseModel):
    """One action item as the tracker shows it."""

    id: uuid.UUID
    circular_id: uuid.UUID
    circular_ref: str | None
    circular_title: str | None
    description: str
    status: ActionItemStatus
    priority: Priority
    source: AssertionSource
    due_date: date | None
    owner: OwnerOut | None
    owner_function_code: str | None
    owner_function_name: str | None
    evidence_url: str | None
    closure_note: str | None
    closed_by_name: str | None
    closed_at: datetime | None
    last_reminder_at: datetime | None
    created_at: datetime
    # Derived, never stored — see ActionItemStatus.
    is_overdue: bool
    days_until_due: int | None
    # Which statuses this item may legally move to next, so the UI offers only those.
    allowed_transitions: list[ActionItemStatus] = Field(default_factory=list)


class TrackerStats(BaseModel):
    total: int
    open: int
    in_progress: int
    blocked: int
    submitted: int
    closed: int
    overdue: int
    due_soon: int  # due within the next 7 days and not yet closed
    unassigned: int


class ItemPatch(BaseModel):
    """Field edits. Status changes go through /status so the state machine runs."""

    description: str | None = None
    priority: Priority | None = None
    due_date: date | None = None
    owner_id: uuid.UUID | None = None
    owner_function_code: str | None = None


class StatusChange(BaseModel):
    status: ActionItemStatus
    note: str | None = None


class CloseRequest(BaseModel):
    """Closure needs proof. One of these two must be present, and the API says so
    rather than silently accepting an empty close."""

    evidence_url: str | None = None
    closure_note: str | None = None


class SweepResult(BaseModel):
    checked: int
    newly_overdue: int
    reminded: int
    detail: str
