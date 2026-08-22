"""Citation verification.

This is the module the product's central claim rests on: that a quote attributed to
the circular really is in the circular, at offsets our own code determined. It gets
the most adversarial tests in the suite — a false "verified" here is worse than a
crash, because it looks like proof.
"""
from __future__ import annotations

import pytest

from app.ai.grounding import (
    Citation,
    locate,
    normalise_with_map,
    page_for_offset,
    verify,
    verify_all,
)
from app.core.config import settings

# Shaped like real extracted text: wrapped mid-sentence, hyphenated across a break.
TEXT = (
    "454Y. A bank shall ensure that its employee / recovery agent engaged in\n"
    "activities related to collection / recovery of loan dues adheres to the\n"
    "following:\n\n"
    "(4) An employee / recovery agent shall contact / visit the borrower /\n"
    "guarantor only between 08:00 hours and 19:00 hours. Calls / visits\n"
    "earlier or later than the prescribed time period shall be done only when\n"
    "the borrower / guarantor has expressly given a request or authorisation.\n\n"
    "454I. A bank shall ensure that the recovery agency engages only those agents\n"
    "who have obtained the certificate from Indian Institute of Banking and Finance."
)

PAGE_MAP = [
    {"page": 1, "char_start": 0, "char_end": 150},
    {"page": 2, "char_start": 152, "char_end": len(TEXT)},
]


def _cite(quote: str, **kw) -> Citation:
    return Citation(claim="a claim", quote=quote, target_kind="risk", **kw)


# ---------------------------------------------------------------------------
# Normalisation and its index map — everything else depends on this being right
# ---------------------------------------------------------------------------
def test_whitespace_runs_collapse_to_a_single_space():
    assert normalise_with_map("a   b\n\n\nc")[0] == "a b c"


def test_the_index_map_points_at_the_original_offset_of_every_character():
    text = "ab  cd"
    normalised, index_map = normalise_with_map(text)
    assert normalised == "ab cd"
    assert len(index_map) == len(normalised)
    # Every mapped position must hold either the same character, or whitespace where
    # the normalised copy has its single collapsed space.
    for i, char in enumerate(normalised):
        original = text[index_map[i]]
        assert original == char or (char == " " and original.isspace())


def test_a_word_hyphenated_across_a_line_break_is_rejoined():
    assert normalise_with_map("para-\ngraph 454")[0] == "paragraph 454"


def test_leading_and_trailing_whitespace_never_becomes_a_mapped_space():
    normalised, index_map = normalise_with_map("   hello   ")
    assert normalised == "hello"
    assert len(index_map) == len(normalised)


def test_an_empty_or_whitespace_only_text_maps_to_nothing():
    assert normalise_with_map("")[0] == ""
    assert normalise_with_map("   \n\t ")[0] == ""


# ---------------------------------------------------------------------------
# Locating — the offsets must be OURS, and they must be right
# ---------------------------------------------------------------------------
def test_an_exact_quote_is_located_and_the_offsets_slice_back_to_it():
    quote = "only between 08:00 hours and 19:00 hours"
    found = locate(TEXT, quote)
    assert found is not None
    assert found.match == "exact"
    assert TEXT[found.char_start : found.char_end] == quote


def test_a_quote_spanning_a_line_break_still_matches():
    # This is the normal case: the model writes one sentence, the PDF wrapped it.
    quote = "An employee / recovery agent shall contact / visit the borrower / guarantor"
    found = locate(TEXT, quote)
    assert found is not None
    assert found.match == "normalised"
    # The slice contains the newline the model flattened, and nothing beyond the quote.
    sliced = TEXT[found.char_start : found.char_end]
    assert sliced.startswith("An employee")
    assert sliced.endswith("guarantor")
    assert "\n" in sliced


def test_the_located_span_ends_on_the_last_matched_character_not_past_it():
    quote = "Indian Institute of Banking and Finance"
    found = locate(TEXT, quote)
    assert found is not None
    assert TEXT[found.char_start : found.char_end] == quote
    assert TEXT[found.char_end - 1] == "e"


def test_a_hyphenated_word_in_the_source_matches_the_joined_quote():
    text = "the bank shall docu-\nment the time of calls"
    found = locate(text, "shall document the time")
    assert found is not None
    assert found.match == "normalised"
    assert "docu-\nment" in text[found.char_start : found.char_end]


def test_case_differences_are_matched_but_reported_as_such():
    found = locate(TEXT, "INDIAN INSTITUTE OF BANKING AND FINANCE")
    assert found is not None
    assert found.match == "case_insensitive"


def test_a_quote_that_is_not_in_the_document_is_not_located():
    assert locate(TEXT, "agents must wear a uniform at all times") is None


def test_a_paraphrase_is_not_located():
    # The meaning is right and the words are not. This must fail — it is the whole point.
    assert locate(TEXT, "agents may only call people between 8am and 7pm") is None


def test_curly_quotes_and_dashes_in_the_model_output_still_match():
    # raw_text was normalised at parse time; the model may emit the typographic forms.
    text = "the bank's policy - see paragraph 454"
    assert locate(text, "the bank’s policy – see paragraph 454") is not None


def test_repeated_quotes_report_how_many_times_they_occur():
    text = "shall ensure that. " * 3
    found = locate(text, "shall ensure that.")
    assert found is not None
    assert found.occurrences == 3
    assert found.char_start == 0  # the first occurrence is the one cited


def test_empty_inputs_locate_nothing():
    assert locate("", "anything") is None
    assert locate(TEXT, "") is None
    assert locate(TEXT, "   \n  ") is None


def test_a_quote_longer_than_the_document_locates_nothing():
    assert locate("short", "a very much longer quote than the document itself") is None


# ---------------------------------------------------------------------------
# Verification verdicts
# ---------------------------------------------------------------------------
def test_a_verified_citation_carries_offsets_page_and_the_source_wording():
    citation = verify(_cite("only between 08:00 hours and 19:00 hours"), TEXT, PAGE_MAP)
    assert citation.verified is True
    assert citation.match == "exact"
    assert citation.page == 2
    assert citation.source_text == TEXT[citation.char_start : citation.char_end]


def test_source_text_is_the_documents_wording_not_the_models():
    # The model flattens the line break; source_text must show what the PDF really says.
    quote = "An employee / recovery agent shall contact / visit the borrower / guarantor"
    citation = verify(_cite(quote), TEXT, PAGE_MAP)
    assert citation.verified is True
    assert citation.source_text != quote
    assert "\n" in (citation.source_text or "")


def test_an_unfindable_quote_is_reported_unverified_with_no_offsets():
    citation = verify(_cite("agents must wear a uniform at all times"), TEXT, PAGE_MAP)
    assert citation.verified is False
    assert citation.match == "not_found"
    assert citation.char_start is None
    assert citation.page is None
    assert citation.source_text is None


def test_a_missing_quote_is_reported_rather_than_dropped():
    citation = verify(_cite(""), TEXT, PAGE_MAP)
    assert citation.verified is False
    assert citation.match == "empty"


def test_a_quote_too_short_to_prove_anything_is_not_accepted():
    # "the bank" occurs everywhere; locating it would say nothing about which
    # occurrence supports the claim, so it is refused rather than shown as proof.
    short = "a" * (settings.min_citation_quote_chars - 1)
    citation = verify(_cite(short), "x" + short + "y", PAGE_MAP)
    assert citation.verified is False
    assert citation.match == "too_short"
    assert citation.char_start is None


def test_a_quote_exactly_at_the_length_threshold_is_accepted():
    quote = "b" * settings.min_citation_quote_chars
    citation = verify(_cite(quote), f"prefix {quote} suffix", None)
    assert citation.verified is True


def test_verification_never_raises_on_an_empty_document():
    citation = verify(_cite("anything at all here"), "", PAGE_MAP)
    assert citation.verified is False
    assert citation.match == "not_found"


def test_a_citation_outside_any_mapped_page_still_verifies_with_no_page():
    citation = verify(_cite("only between 08:00 hours and 19:00 hours"), TEXT, [])
    assert citation.verified is True
    assert citation.page is None


def test_page_map_may_be_missing_entirely():
    citation = verify(_cite("only between 08:00 hours and 19:00 hours"), TEXT, None)
    assert citation.verified is True


# ---------------------------------------------------------------------------
# Batch reporting — the "7 of 8 verified" headline
# ---------------------------------------------------------------------------
def test_the_report_counts_verified_against_total():
    report = verify_all(
        [
            _cite("only between 08:00 hours and 19:00 hours"),
            _cite("Indian Institute of Banking and Finance"),
            _cite("a claim the circular never makes anywhere"),
            _cite(""),
        ],
        TEXT,
        PAGE_MAP,
    )
    assert report.total == 4
    assert report.verified == 2
    assert report.ratio == pytest.approx(0.5)


def test_an_empty_report_has_a_zero_ratio_and_does_not_divide_by_zero():
    report = verify_all([], TEXT, PAGE_MAP)
    assert report.total == 0
    assert report.ratio == 0.0


def test_a_citation_round_trips_through_its_dict_form():
    citation = verify(_cite("Indian Institute of Banking and Finance"), TEXT, PAGE_MAP)
    data = citation.as_dict()
    assert data["verified"] is True
    assert data["match"] == "exact"
    assert TEXT[data["char_start"] : data["char_end"]] == data["source_text"]


# ---------------------------------------------------------------------------
# Offset -> page
# ---------------------------------------------------------------------------
def test_offsets_resolve_to_the_page_that_contains_them():
    assert page_for_offset(PAGE_MAP, 0) == 1
    assert page_for_offset(PAGE_MAP, 149) == 1
    assert page_for_offset(PAGE_MAP, 152) == 2


def test_offsets_in_a_gap_or_past_the_end_resolve_to_nothing():
    assert page_for_offset(PAGE_MAP, 151) is None
    assert page_for_offset(PAGE_MAP, 10**6) is None
    assert page_for_offset(None, 5) is None
