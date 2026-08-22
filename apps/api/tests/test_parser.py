"""Tests for the deterministic half of PDF ingestion.

The page-span round-trip guarantee is asserted inside `assemble` itself, and is
exercised directly here. What needs a real PDF (the text-layer read, rasterising,
OCR) is covered by the fixtures in test_ingestion.py.
"""
from __future__ import annotations

from datetime import date

import pytest

from app.modules.circulars.parser import (
    PageText,
    PdfEncrypted,
    PdfParseError,
    _as_parse_error,
    assemble,
    clean_page_text,
    page_for_offset,
    pages_needing_ocr,
    sniff_issued_date,
    sniff_ref_no,
    strip_page_number,
)


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
def test_clean_normalises_the_characters_that_break_quote_matching():
    # Written with the awkward characters inline on purpose: curly quotes, en dash,
    # soft hyphen and non-breaking space all appear in RBI PDFs, and each one would
    # stop a model's quote from matching `raw_text` if left alone.
    raw = "The bank’s “policy” – see para­graph 454"
    assert clean_page_text(raw) == 'The bank\'s "policy" - see paragraph 454'


def test_clean_strips_trailing_spaces_and_collapses_blank_runs():
    assert clean_page_text("line one   \nline two") == "line one\nline two"
    assert clean_page_text("a\n\n\n\n\n\nb") == "a\n\n\nb"


def test_clean_trims_surrounding_whitespace_and_drops_nul_bytes():
    assert clean_page_text("\n\n  hello  \n\n") == "hello"
    assert clean_page_text("he\x00llo") == "hello"


# ---------------------------------------------------------------------------
# Page furniture — a footer dropped mid-sentence breaks a real citation
# ---------------------------------------------------------------------------
def test_a_trailing_page_number_is_removed():
    assert strip_page_number("body of the page\n3", 3) == "body of the page"


def test_a_leading_page_number_is_removed():
    assert strip_page_number("4\nbody of the page", 4) == "body of the page"


def test_both_ends_are_cleaned_on_the_same_page():
    assert strip_page_number("5\nbody\n5", 5) == "body"


def test_a_number_that_is_not_this_pages_number_is_left_alone():
    # Only the page's own number is furniture. Anything else may be content.
    assert strip_page_number("body\n7", 3) == "body\n7"


def test_a_number_in_the_middle_of_the_page_is_never_touched():
    assert strip_page_number("first line\n3\nlast line", 3) == "first line\n3\nlast line"


def test_a_numbered_line_with_other_content_is_kept():
    assert strip_page_number("3. A bank shall act", 3) == "3. A bank shall act"
    assert strip_page_number("page 3", 3) == "page 3"


def test_surrounding_whitespace_on_the_marker_line_still_matches():
    assert strip_page_number("body\n  3  ", 3) == "body"


def test_a_page_that_is_only_its_own_number_becomes_empty():
    # Which correctly marks the page as needing OCR rather than as having content.
    assert strip_page_number("9", 9) == ""


def test_stripping_is_safe_on_empty_text():
    assert strip_page_number("", 1) == ""


# ---------------------------------------------------------------------------
# Metadata sniffing
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Assembly — the offset guarantee
# ---------------------------------------------------------------------------
def _pages(*texts: str) -> list[PageText]:
    return [
        PageText(page=i, text=t, source="text_layer" if t else "empty")
        for i, t in enumerate(texts, start=1)
    ]


def test_assemble_spans_round_trip_to_the_exact_page_text():
    pages = _pages("first page", "second page text", "third")
    parsed = assemble(pages)
    for span, page in zip(parsed.pages, pages, strict=True):
        assert parsed.raw_text[span.char_start : span.char_end] == page.text


def test_assemble_round_trips_even_with_an_empty_page_in_the_middle():
    pages = _pages("alpha", "", "omega")
    parsed = assemble(pages)
    assert parsed.raw_text[parsed.pages[1].char_start : parsed.pages[1].char_end] == ""
    assert parsed.raw_text[parsed.pages[2].char_start : parsed.pages[2].char_end] == "omega"


def test_assemble_records_where_each_page_text_came_from():
    pages = [
        PageText(page=1, text="typed", source="text_layer"),
        PageText(page=2, text="scanned", source="ocr"),
    ]
    parsed = assemble(pages)
    assert [s.source for s in parsed.pages] == ["text_layer", "ocr"]
    assert parsed.ocr_page_count == 1


def test_assemble_lifts_metadata_out_of_the_joined_text():
    parsed = assemble(_pages("RBI/2026-27/223 dated August 6, 2026", "body"))
    assert parsed.ref_no == "RBI/2026-27/223"
    assert parsed.issued_date == date(2026, 8, 6)


# ---------------------------------------------------------------------------
# Per-page OCR routing — the hybrid-document case
# ---------------------------------------------------------------------------
def test_pages_needing_ocr_selects_only_the_image_pages():
    pages = [
        PageText(page=1, text="a real page of text", source="text_layer"),
        PageText(page=2, text="", source="empty"),
        PageText(page=3, text="more real text", source="text_layer"),
        PageText(page=4, text="", source="empty"),
    ]
    assert pages_needing_ocr(pages) == [2, 4]


def test_pages_needing_ocr_is_empty_for_a_fully_typed_document():
    assert pages_needing_ocr(_pages("one", "two")) == []


# ---------------------------------------------------------------------------
# Error classification
# ---------------------------------------------------------------------------
def test_a_password_failure_is_reported_as_encrypted_not_as_corruption():
    err = _as_parse_error(Exception("File has not been decrypted: incorrect password"))
    assert isinstance(err, PdfEncrypted)
    assert "password-protected" in str(err)


def test_any_other_failure_is_a_plain_parse_error():
    err = _as_parse_error(Exception("No /Root object!"))
    assert isinstance(err, PdfParseError)
    assert not isinstance(err, PdfEncrypted)


# ---------------------------------------------------------------------------
# Offset -> page lookup (what citation display uses)
# ---------------------------------------------------------------------------
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


@pytest.mark.parametrize("offset", [-1, -100])
def test_page_for_offset_rejects_a_negative_offset(offset: int):
    assert page_for_offset(PAGES, offset) is None
