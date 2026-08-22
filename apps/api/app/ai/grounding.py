"""Citation verification — the part that makes the product defensible.

**The model is not trusted to say where its evidence came from.** It returns a
verbatim quote; this module searches `raw_text` for that quote and produces the
character offsets itself. A quote that cannot be located is reported as unverified
rather than quietly shown as fact.

That inversion matters. Asking a model for `char_start`/`char_end` and then checking
those numbers would mean trusting the thing under test — models invent plausible
offsets freely. Quoting is the one part of this a model is genuinely reliable at, so
quoting is the only part we ask for.

Matching cannot be a plain substring search. PDF text wraps mid-sentence, so a model
quoting one sentence produces spaces where `raw_text` has newlines, and words split
across a line break ("para-\\ngraph") appear joined in the quote. So the search runs
over a whitespace-normalised copy of the text, alongside an index map that translates
a position in the normalised copy back to a true offset in the original.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.core.config import settings
from app.modules.circulars.parser import normalise_characters

MatchKind = Literal[
    "exact",  # found byte-for-byte in raw_text
    "normalised",  # found once line wrapping was normalised away
    "case_insensitive",  # found ignoring case as well
    "not_found",  # the quote is not in the document
    "too_short",  # too generic to prove anything, so not searched
    "empty",  # the model supplied no quote at all
]

VERIFIED_KINDS = frozenset({"exact", "normalised", "case_insensitive"})

TargetKind = Literal["risk", "function", "action_item", "summary"]


@dataclass(frozen=True)
class Located:
    char_start: int
    char_end: int
    match: MatchKind
    occurrences: int


@dataclass
class Citation:
    """One claim, the quote offered as evidence, and what verification found."""

    claim: str
    quote: str
    target_kind: TargetKind
    target_ref: str | None = None  # department code, or action-item id
    char_start: int | None = None
    char_end: int | None = None
    page: int | None = None
    verified: bool = False
    match: MatchKind = "empty"
    occurrences: int = 0
    # The text actually sitting at those offsets. Stored so the UI can render the
    # source line without re-slicing, and so a reviewer sees the document's wording
    # rather than the model's paraphrase of it.
    source_text: str | None = None

    def as_dict(self) -> dict:
        return {
            "claim": self.claim,
            "quote": self.quote,
            "target_kind": self.target_kind,
            "target_ref": self.target_ref,
            "char_start": self.char_start,
            "char_end": self.char_end,
            "page": self.page,
            "verified": self.verified,
            "match": self.match,
            "occurrences": self.occurrences,
            "source_text": self.source_text,
        }


# ---------------------------------------------------------------------------
# Normalisation with an index map
# ---------------------------------------------------------------------------
def normalise_with_map(text: str) -> tuple[str, list[int]]:
    """Collapse whitespace and rejoin hyphenated line breaks, keeping a way back.

    Returns the normalised text and a list where `index_map[i]` is the offset in
    `text` that produced normalised character `i`. That map is what lets a match in
    normalised space become a true offset in the original.
    """
    out: list[str] = []
    index_map: list[int] = []
    position = 0
    length = len(text)

    while position < length:
        char = text[position]

        # "para-\ngraph" in the PDF is "paragraph" in a quote: drop the hyphen and
        # the break so the word matches as one.
        if char == "-" and position + 1 < length and text[position + 1] in "\r\n":
            position += 2
            while position < length and text[position] in " \t":
                position += 1
            continue

        if char.isspace():
            # One space stands for any run of whitespace. Leading whitespace is
            # dropped entirely so offsets never start on padding.
            if out and out[-1] != " ":
                out.append(" ")
                index_map.append(position)
            position += 1
            while position < length and text[position].isspace():
                position += 1
            continue

        out.append(char)
        index_map.append(position)
        position += 1

    # A trailing collapsed space would let a match run past its real content.
    if out and out[-1] == " ":
        out.pop()
        index_map.pop()

    return "".join(out), index_map


def _normalise(text: str) -> str:
    return normalise_with_map(text)[0]


# ---------------------------------------------------------------------------
# Locating a quote
# ---------------------------------------------------------------------------
def locate(raw_text: str, quote: str) -> Located | None:
    """Find `quote` in `raw_text`, returning true offsets into `raw_text`.

    Tries progressively more forgiving matches and reports which one succeeded, so a
    reviewer can tell an exact hit from one that needed case folding.
    """
    if not raw_text or not quote:
        return None

    cleaned = normalise_characters(quote).strip()
    if not cleaned:
        return None

    # 1. Exact — the quote survived the PDF's line breaks untouched.
    position = raw_text.find(cleaned)
    if position != -1:
        return Located(
            char_start=position,
            char_end=position + len(cleaned),
            match="exact",
            occurrences=raw_text.count(cleaned),
        )

    # 2 & 3. Normalised, then normalised + case-folded.
    normalised_text, index_map = normalise_with_map(raw_text)
    normalised_quote = _normalise(cleaned)
    if not normalised_quote:
        return None

    for kind, haystack, needle in (
        ("normalised", normalised_text, normalised_quote),
        ("case_insensitive", normalised_text.lower(), normalised_quote.lower()),
    ):
        found = haystack.find(needle)
        if found == -1:
            continue
        end = found + len(needle)
        return Located(
            char_start=index_map[found],
            # index_map[end - 1] is the last matched character; +1 makes the span
            # exclusive and keeps the character itself inside it.
            char_end=index_map[end - 1] + 1,
            match=kind,  # type: ignore[arg-type]
            occurrences=haystack.count(needle),
        )

    return None


def page_for_offset(page_map: list[dict] | None, offset: int) -> int | None:
    for span in page_map or []:
        if span["char_start"] <= offset < span["char_end"]:
            return span["page"]
    return None


# ---------------------------------------------------------------------------
# Verifying a batch
# ---------------------------------------------------------------------------
@dataclass
class GroundingReport:
    citations: list[Citation] = field(default_factory=list)

    @property
    def total(self) -> int:
        return len(self.citations)

    @property
    def verified(self) -> int:
        return sum(1 for c in self.citations if c.verified)

    @property
    def ratio(self) -> float:
        return self.verified / self.total if self.total else 0.0


def verify(citation: Citation, raw_text: str, page_map: list[dict] | None) -> Citation:
    """Fill in offsets, page and verdict for one citation. Never raises."""
    quote = (citation.quote or "").strip()

    if not quote:
        citation.match = "empty"
        citation.verified = False
        return citation

    # A fragment this short would match in a dozen places; locating it would prove
    # nothing about which one supports the claim, so it is not searched at all.
    if len(quote) < settings.min_citation_quote_chars:
        citation.match = "too_short"
        citation.verified = False
        return citation

    found = locate(raw_text, quote)
    if found is None:
        citation.match = "not_found"
        citation.verified = False
        return citation

    citation.char_start = found.char_start
    citation.char_end = found.char_end
    citation.match = found.match
    citation.occurrences = found.occurrences
    citation.page = page_for_offset(page_map, found.char_start)
    citation.source_text = raw_text[found.char_start : found.char_end]
    citation.verified = found.match in VERIFIED_KINDS
    return citation


def verify_all(
    citations: list[Citation], raw_text: str, page_map: list[dict] | None
) -> GroundingReport:
    return GroundingReport([verify(c, raw_text, page_map) for c in citations])
