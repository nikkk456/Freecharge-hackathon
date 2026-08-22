from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import (
    ActionItemStatus,
    AnalysisStatus,
    AssertionSource,
    Priority,
    RiskRating,
)

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


def evidence_string(value: object) -> str:
    """Evidence is always a string — never None — so grounding can report a missing
    quote as an unverified citation rather than silently dropping the claim.

    Some models return a list of quotes despite being asked for one; take the first
    rather than discarding evidence over a shape mismatch.
    """
    if value is None:
        return ""
    if isinstance(value, list):
        value = next((v for v in value if isinstance(v, str) and v.strip()), "")
    if not isinstance(value, str):
        return ""
    return "" if value.strip().lower() in {"null", "none", "n/a", "-"} else value.strip()


class ImpactedFunctionDraft(BaseModel):
    code: str
    confidence: float = 0.5
    reasoning: str | None = None
    evidence: str = ""

    @field_validator("code")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("evidence", mode="before")
    @classmethod
    def _evidence(cls, v: object) -> object:
        return evidence_string(v)

    @field_validator("confidence", mode="before")
    @classmethod
    def _scale(cls, v: object) -> object:
        return normalise_confidence(v)


class ActionItemDraft(BaseModel):
    description: str
    priority: Priority = Priority.MEDIUM
    owner_function: str | None = None
    due_date: date | None = None
    evidence: str = ""

    @field_validator("evidence", mode="before")
    @classmethod
    def _evidence(cls, v: object) -> object:
        return evidence_string(v)

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
    risk_evidence: str = ""
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
        return normalise_confidence(v)

    @field_validator("title", "effective_date", mode="before")
    @classmethod
    def _empty(cls, v: object) -> object:
        return _blank_to_none(v)

    @field_validator("risk_evidence", mode="before")
    @classmethod
    def _evidence(cls, v: object) -> object:
        return evidence_string(v)


def normalise_confidence(value: object) -> object:
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
class CitationOut(BaseModel):
    """A claim, its quote, and what verification actually found.

    `verified` means our code located the quote in `raw_text` — not that the model
    said so. `match` records how it was found, so a reviewer can tell an exact hit
    from one that needed case folding.
    """

    claim: str
    quote: str
    target_kind: Literal["risk", "function", "action_item", "summary", "rcm_row"]
    target_ref: str | None = None
    char_start: int | None = None
    char_end: int | None = None
    page: int | None = None
    verified: bool = False
    match: Literal[
        "exact", "normalised", "case_insensitive", "not_found", "too_short", "empty"
    ] = "empty"
    occurrences: int = 0
    source_text: str | None = None


class ImpactedFunctionOut(BaseModel):
    code: str
    name: str
    confidence: float | None
    reasoning: str | None
    source: AssertionSource
    citation: CitationOut | None = None


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
    citation: CitationOut | None = None


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
    published_at: datetime | None = None
    reviewed_by_name: str | None = None
    edited_by_name: str | None = None
    editable: bool = True
    needs_review: bool = False
    # Grounding summary — "7 of 8 claims verified" is the headline of the whole product.
    citations_total: int = 0
    citations_verified: int = 0
    risk_citation: CitationOut | None = None
    citations: list[CitationOut] = Field(default_factory=list)
    impacted_functions: list[ImpactedFunctionOut] = Field(default_factory=list)
    action_items: list[ActionItemOut] = Field(default_factory=list)


class AnalysisPatch(BaseModel):
    """A reviewer's override of the model's wording. Every field optional; only what
    is sent is changed, so two reviewers editing different fields do not clobber
    each other."""

    summary: str | None = None
    risk_rating: RiskRating | None = None
    risk_reasoning: str | None = None


class ActionItemPatch(BaseModel):
    description: str | None = None
    priority: Priority | None = None
    owner_function_code: str | None = None
    due_date: date | None = None
    status: ActionItemStatus | None = None


class ActionItemCreate(BaseModel):
    """An obligation the reviewer spotted that the model missed."""

    description: str = Field(min_length=3)
    priority: Priority = Priority.MEDIUM
    owner_function_code: str | None = None
    due_date: date | None = None


class FunctionAssert(BaseModel):
    """A reviewer adding or correcting an impacted department."""

    code: str
    reasoning: str | None = None


class PublishResult(BaseModel):
    analysis_id: uuid.UUID
    circular_id: uuid.UUID
    status: AnalysisStatus
    version: int
    published_at: datetime | None
    reviewed_by: str
    detail: str


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
