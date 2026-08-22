from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import AssertionSource, Coverage, RcmStatus
from app.modules.analysis.schemas import (
    CitationOut,
    evidence_string,
    normalise_confidence,
)


# ---------------------------------------------------------------------------
# What we accept back from the model
# ---------------------------------------------------------------------------
class RcmRowDraft(BaseModel):
    risk_text: str
    control_text: str = ""
    mapped_control: str | None = None
    coverage: Coverage = Coverage.GAP
    confidence: float = 0.5
    reasoning: str | None = None
    evidence: str = ""

    @field_validator("coverage", mode="before")
    @classmethod
    def _coverage(cls, v: object) -> object:
        if isinstance(v, str):
            cleaned = v.strip().upper().replace(" ", "_")
            return cleaned if cleaned in Coverage.__members__ else Coverage.GAP
        return v

    @field_validator("confidence", mode="before")
    @classmethod
    def _scale(cls, v: object) -> object:
        return normalise_confidence(v)

    @field_validator("evidence", mode="before")
    @classmethod
    def _evidence(cls, v: object) -> object:
        return evidence_string(v)

    @field_validator("mapped_control", mode="before")
    @classmethod
    def _code(cls, v: object) -> object:
        if not isinstance(v, str):
            return None
        cleaned = v.strip().upper()
        return None if cleaned in {"", "NULL", "NONE", "N/A", "-"} else cleaned


class RcmDraft(BaseModel):
    rows: list[RcmRowDraft] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# What we return to the UI
# ---------------------------------------------------------------------------
class MappedControlOut(BaseModel):
    code: str
    name: str
    owner_function_code: str | None
    owner_function_name: str | None
    kci_code: str | None
    kci_name: str | None
    kci_status: str | None
    kci_target: str | None
    kci_current_value: str | None


class RcmRowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    position: int
    risk_text: str
    control_text: str
    coverage: Coverage
    reasoning: str | None
    confidence: float | None
    source: AssertionSource
    control: MappedControlOut | None = None
    citation: CitationOut | None = None


class RcmOut(BaseModel):
    id: uuid.UUID
    circular_id: uuid.UUID
    status: RcmStatus
    model_name: str | None
    created_at: datetime
    published_at: datetime | None
    reviewed_by_name: str | None
    editable: bool
    rows: list[RcmRowOut] = Field(default_factory=list)
    # Headline counts — "3 of 9 risks have no control behind them" is the finding.
    covered: int = 0
    partial: int = 0
    gaps: int = 0
    citations_verified: int = 0
    citations_total: int = 0


class RcmRunAccepted(BaseModel):
    circular_id: uuid.UUID
    queued: bool
    detail: str


# ---------------------------------------------------------------------------
# Human edits
# ---------------------------------------------------------------------------
class RcmRowPatch(BaseModel):
    risk_text: str | None = None
    control_text: str | None = None
    coverage: Coverage | None = None
    reasoning: str | None = None
    mapped_control_code: str | None = None


class RcmRowCreate(BaseModel):
    risk_text: str = Field(min_length=3)
    control_text: str = ""
    coverage: Coverage = Coverage.GAP
    reasoning: str | None = None
    mapped_control_code: str | None = None


class RcmPublishResult(BaseModel):
    rcm_id: uuid.UUID
    circular_id: uuid.UUID
    status: RcmStatus
    published_at: datetime | None
    reviewed_by: str
    detail: str

