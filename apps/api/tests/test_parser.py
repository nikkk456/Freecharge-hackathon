"""Tests for the deterministic half of PDF ingestion.

The page-span round-trip guarantee is asserted inside `parse_pdf` itself (it needs a
real PDF), so what is covered here is everything that can be checked without one:
text cleanup, the metadata sniffers, and the offset -> page lookup that Stage 3's
citation display is built on.
"""
from __future__ import annotations

from datetime import date

from app.modules.circulars.parser import (
    clean_page_text,
    page_for_offset,
    sniff_issued_date,
    sniff_ref_no,
)


def test_clean_normalises_the_characters_that_break_quote_matching():
    # Written as escapes on purpose: soft hyphen and non-breaking space are
    # invisible in an editor, and these are exactly the characters in RBI PDFs
    # that would otherwise stop a model's quote from matching `raw_text`.
    raw = (
        "The bank’s “policy” – see"
        " para­graph 454"
    )
    assert clean_page_text(raw) == 'The bank\'s "policy" - see paragraph 454'


def test_clean_strips_trailing_spaces_and_collapses_blank_runs():
    assert clean_page_text("line one   \nline two") == "line one\nline two"
    assert clean_page_text("a\n\n\n\n\n\nb") == "a\n\n\nb"


def test_clean_trims_surrounding_whitespace():
    assert clean_page_text("\n\n  hello  \n\n") == "hello"


def test_sniff_ref_no_finds_the_rbi_reference():
    text = "RBI/2026-27/223\nDOR.MCS.REC.No.193/01-01-032/2026-27 August 6, 2026"
    assert sniff_ref_no(text) == "RBI/2026-27/223"


def test_sniff_ref_no_returns_none_when_absent():
    assert sniff_ref_no("A circular with no reference number at all") is None


def test_sniff_ref_no_ignores_a_match_past_the_header_window():
    assert sniff_ref_no(("x" * 5000) + "RBI/2026-27/223") is None


def test_sniff_issued_date_parses_the_long_form_date():
    assert sniff_issued_date("DOR.MCS.REC.No.193 August 6, 2026") == date(2026, 8, 6)


def test_sniff_issued_date_returns_none_for_an_impossible_date():
    assert sniff_issued_date("February 31, 2026") is None


PAGES = [
    {"page": 1, "char_start": 0, "char_end": 100},
    {"page": 2, "char_start": 102, "char_end": 250},
]


def test_page_for_offset_maps_an_offset_to_its_page():
    assert page_for_offset(PAGES, 0) == 1
    assert page_for_offset(PAGES, 99) == 1
    assert page_for_offset(PAGES, 102) == 2
    assert page_for_offset(PAGES, 249) == 2


def test_page_for_offset_is_none_in_the_gap_and_past_the_end():
    assert page_for_offset(PAGES, 101) is None  # the page separator itself
    assert page_for_offset(PAGES, 250) is None  # end is exclusive
    assert page_for_offset(PAGES, 9999) is None
