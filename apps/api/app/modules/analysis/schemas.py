from __future__ import annotations

import re
import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import AnalysisStatus, AssertionSource, Priority, RiskRating

# ---------------------------------------------------------------------------
# What we accept back from the model
# ---------------------------------------------------------------------------
# Deliberately forgiving about *shape* and strict about *values*: a model that
# returns "high" instead of "HIGH", or a confidence of 95 instead of 0.95, should be
# coerced rather than binned. A model that invents a department code should not.


def _blank_to_none(value: object) -> object:
    if isinstance(value, str) and value.strip().lower() in {"", "null", "none", "n/a", "-"}:
        return None
    return value


class ImpactedFunctionDraft(BaseModel):
    code: str
    confidence: float = 0.5
    reasoning: str | None = None

    @field_validator("code")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("confidence", mode="before")
    @classmethod
    def _scale(cls, v: object) -> object:
        return _normalise_confidence(v)


class ActionItemDraft(BaseModel):
    description: str
    priority: Priority = Priority.MEDIUM
    owner_function: str | None = None
    due_date: date | None = None

    @field_validator("priority", mode="before")
    @classmethod
    def _priority(cls, v: object) -> object:
        if isinstance(v, str):
            cleaned = v.strip().upper()
            return cleaned if cleaned in Priority.__members__ else Priority.MEDIUM
        return v

    @field_validator("owner_function", "due_date", mode="before")
    @classmethod
    def _empty(cls, v: object) -> object:
        return _blank_to_none(v)

    @field_validator("owner_function")
    @classmethod
    def _upper(cls, v: str | None) -> str | None:
        return v.strip().upper() if v else None


class AnalysisDraft(BaseModel):
    """The validated model output. Anything outside this shape is a bad response."""

    title: str | None = None
    summary: str
    risk_rating: RiskRating = RiskRating.MEDIUM
    risk_reasoning: str | None = None
    confidence: float = 0.5
    effective_date: date | None = None
    impacted_functions: list[ImpactedFunctionDraft] = Field(default_factory=list)
    action_items: list[ActionItemDraft] = Field(default_factory=list)

    @field_validator("risk_rating", mode="before")
    @classmethod
    def _rating(cls, v: object) -> object:
        if isinstance(v, str):
            cleaned = v.strip().upper()
            return cleaned if cleaned in RiskRating.__members__ else RiskRating.MEDIUM
        return v

    @field_validator("confidence", mode="before")
    @classmethod
    def _scale(cls, v: object) -> object:
        return _normalise_confidence(v)

    @field_validator("title", "effective_date", mode="before")
    @classmethod
    def _empty(cls, v: object) -> object:
        return _blank_to_none(v)


def _normalise_confidence(value: object) -> object:
    """Accept 0.85, "0.85", "85%" or 85 — all meaning the same thing.

    The interesting case is a value just above 1. `85` is obviously a percentage, but
    `1.7` is a model overshooting the 0-1 scale it was asked for — reading that as
    1.7% would turn high confidence into near-zero, which is the opposite of the
    truth. So only values above 2 are treated as percentages.
    """
    if isinstance(value, str):
        value = value.strip().rstrip("%")
        try:
            value = float(value)
        except ValueError:
            return 0.5
    if isinstance(value, int | float):
        number = float(value)
        if 2 < number <= 100:
            number /= 100
        return min(max(number, 0.0), 1.0)
    return 0.5


NORMALISE_WS = re.compile(r"\s+")


def dedup_key(circular_id: uuid.UUID, description: str) -> str:
    """Stable identity for an action item, so a re-run updates rather than duplicates."""
    normalised = NORMALISE_WS.sub(" ", description.strip().lower())
    return f"{circular_id}:{normalised}"[:512]


# ---------------------------------------------------------------------------
# What we return to the UI
# ---------------------------------------------------------------------------
class ImpactedFunctionOut(BaseModel):
    code: str
    name: str
    confidence: float | None
    reasoning: str | None
    source: AssertionSource


class ActionItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    description: str
    priority: Priority
    status: str
    due_date: date | None
    owner_function_code: str | None = None
    owner_function_name: str | None = None
    source: AssertionSource


class AnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    circular_id: uuid.UUID
    version: int
    status: AnalysisStatus
    summary: str | None
    risk_rating: RiskRating | None
    risk_reasoning: str | None
    confidence: float | None
    model_name: str | None
    created_at: datetime
    needs_review: bool = False
    impacted_functions: list[ImpactedFunctionOut] = Field(default_factory=list)
    action_items: list[ActionItemOut] = Field(default_factory=list)


class AnalysisRunAccepted(BaseModel):
    circular_id: uuid.UUID
    status: str
    queued: bool
    detail: str


class LlmStatus(BaseModel):
    """Answers 'why did nothing happen?' before the user has to guess."""

    configured: bool
    model: str
    fallbacks: list[str]
    detail: str
