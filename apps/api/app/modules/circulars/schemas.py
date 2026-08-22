from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.models.enums import CircularSource, CircularStatus


class PageSpanOut(BaseModel):
    page: int
    char_start: int
    char_end: int
    # Where this page's text came from: the PDF's own text layer, OCR, or nothing
    # readable at all. Shown in the UI so a reviewer knows which pages were machine-read.
    source: Literal["text_layer", "ocr", "empty"] = "text_layer"


class CircularSummary(BaseModel):
    """List-view shape — deliberately excludes `raw_text`, which can be 50k+ chars."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source: CircularSource
    ref_no: str | None
    title: str | None
    issued_date: date | None
    status: CircularStatus
    page_count: int | None
    parse_error: str | None
    analysis_error: str | None
    created_at: datetime


class CircularDetail(CircularSummary):
    raw_text: str | None
    page_map: list[PageSpanOut] | None
    char_count: int


class OcrStatus(BaseModel):
    """Diagnostics for the upload screen — answers 'why is nothing happening?'."""

    enabled: bool
    configured_engine: str
    available_engines: list[str]
    ready: bool
    detail: str


class CircularPatch(BaseModel):
    """The human's correction of what the parser guessed. Every field optional."""

    source: CircularSource | None = None
    ref_no: str | None = None
    title: str | None = None
    issued_date: date | None = None
