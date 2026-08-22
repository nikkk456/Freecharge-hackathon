"""Tests for the model-output boundary.

A language model's JSON is untrusted input. These cover the two jobs that boundary
has: coerce sloppy-but-meaningful values rather than discarding a good analysis, and
refuse values that would corrupt the data model (an invented department code, a
fabricated risk level).
"""
from __future__ import annotations

import uuid
from datetime import date

import pytest

from app.ai.client import LlmBadOutput, _parse_json
from app.models.enums import Priority, RiskRating
from app.modules.analysis.schemas import AnalysisDraft, dedup_key

MINIMAL = {"summary": "A circular happened."}


# ---------------------------------------------------------------------------
# JSON extraction — models wrap their output in all sorts of things
# ---------------------------------------------------------------------------
def test_plain_json_is_parsed():
    assert _parse_json('{"a": 1}') == {"a": 1}


def test_a_markdown_fence_is_stripped():
    assert _parse_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert _parse_json("```\n{\"a\": 1}\n```") == {"a": 1}


def test_prose_around_the_object_is_discarded():
    assert _parse_json('Sure! Here is the analysis:\n{"a": 1}\nHope that helps.') == {"a": 1}


def test_output_with_no_object_is_rejected():
    with pytest.raises(LlmBadOutput, match="No JSON object"):
        _parse_json("I am unable to help with that request.")


def test_a_json_array_is_rejected_because_we_asked_for_an_object():
    with pytest.raises(LlmBadOutput, match="Expected a JSON object"):
        _parse_json("[1, 2, 3]")


# ---------------------------------------------------------------------------
# Confidence — the field models are sloppiest about
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("given", "expected"),
    [(0.85, 0.85), ("0.85", 0.85), (85, 0.85), ("85%", 0.85), (1, 1.0), (0, 0.0)],
)
def test_confidence_accepts_every_form_a_model_writes_it_in(given: object, expected: float):
    draft = AnalysisDraft.model_validate({**MINIMAL, "confidence": given})
    assert draft.confidence == pytest.approx(expected)


@pytest.mark.parametrize(("given", "expected"), [(-3, 0.0), (250, 1.0)])
def test_confidence_is_clamped_to_the_zero_one_range(given: float, expected: float):
    assert AnalysisDraft.model_validate({**MINIMAL, "confidence": given}).confidence == expected


@pytest.mark.parametrize("given", [1.7, 2.0])
def test_a_slight_overshoot_of_one_is_a_scale_error_not_a_percentage(given: float):
    # 1.7 means "very confident, sloppily written", never "1.7% confident". Reading it
    # as a percentage would report near-zero confidence — the opposite of the truth.
    assert AnalysisDraft.model_validate({**MINIMAL, "confidence": given}).confidence == 1.0


def test_unparseable_confidence_falls_back_to_neutral():
    assert AnalysisDraft.model_validate({**MINIMAL, "confidence": "very high"}).confidence == 0.5


# ---------------------------------------------------------------------------
# Enums — coerce case, refuse invention
# ---------------------------------------------------------------------------
def test_risk_rating_is_case_insensitive():
    assert AnalysisDraft.model_validate({**MINIMAL, "risk_rating": "high"}).risk_rating is (
        RiskRating.HIGH
    )


def test_an_invented_risk_rating_falls_back_to_medium_rather_than_failing():
    # Losing a whole analysis because the model wrote "SEVERE" would be worse than
    # defaulting; a human reviews the rating anyway.
    assert AnalysisDraft.model_validate({**MINIMAL, "risk_rating": "SEVERE"}).risk_rating is (
        RiskRating.MEDIUM
    )


def test_an_invented_priority_falls_back_to_medium():
    draft = AnalysisDraft.model_validate(
        {**MINIMAL, "action_items": [{"description": "do it", "priority": "URGENT"}]}
    )
    assert draft.action_items[0].priority is Priority.MEDIUM


# ---------------------------------------------------------------------------
# Nulls that arrive as strings
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("given", ["", "null", "none", "N/A", "-", "  "])
def test_stringly_typed_nulls_become_real_nulls(given: str):
    draft = AnalysisDraft.model_validate({**MINIMAL, "effective_date": given, "title": given})
    assert draft.effective_date is None
    assert draft.title is None


def test_a_real_effective_date_is_parsed():
    draft = AnalysisDraft.model_validate({**MINIMAL, "effective_date": "2027-01-01"})
    assert draft.effective_date == date(2027, 1, 1)


def test_owner_function_null_string_does_not_become_a_department_code():
    draft = AnalysisDraft.model_validate(
        {**MINIMAL, "action_items": [{"description": "x", "owner_function": "null"}]}
    )
    assert draft.action_items[0].owner_function is None


def test_department_codes_are_normalised_to_upper_case():
    draft = AnalysisDraft.model_validate(
        {
            **MINIMAL,
            "impacted_functions": [{"code": " f06 ", "confidence": 0.9}],
            "action_items": [{"description": "x", "owner_function": "f15"}],
        }
    )
    assert draft.impacted_functions[0].code == "F06"
    assert draft.action_items[0].owner_function == "F15"


# ---------------------------------------------------------------------------
# Defaults and required fields
# ---------------------------------------------------------------------------
def test_a_summary_is_required():
    with pytest.raises(ValueError):
        AnalysisDraft.model_validate({"risk_rating": "HIGH"})


def test_missing_lists_default_to_empty_rather_than_none():
    draft = AnalysisDraft.model_validate(MINIMAL)
    assert draft.impacted_functions == []
    assert draft.action_items == []
    assert draft.risk_rating is RiskRating.MEDIUM


# ---------------------------------------------------------------------------
# Action-item identity — what makes a re-run idempotent
# ---------------------------------------------------------------------------
def test_dedup_key_ignores_whitespace_and_case():
    cid = uuid.uuid4()
    assert dedup_key(cid, "Obtain  IIBF   certification\n") == dedup_key(
        cid, "obtain iibf certification"
    )


def test_dedup_key_separates_the_same_wording_on_different_circulars():
    assert dedup_key(uuid.uuid4(), "same text") != dedup_key(uuid.uuid4(), "same text")


def test_dedup_key_fits_the_database_column():
    assert len(dedup_key(uuid.uuid4(), "x" * 5000)) <= 512
