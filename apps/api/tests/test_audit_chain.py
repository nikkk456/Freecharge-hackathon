"""The hash chain.

If this is wrong the audit trail is decoration: a chain that cannot detect tampering
is worse than no chain, because it invites people to trust it. These tests break the
chain in each way it can actually break and assert that verification says so.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest

from app.models.enums import ActorKind
from app.modules.audit.service import GENESIS, canonical, compute_hash, jsonable

BASE = {
    "prev_hash": GENESIS,
    "entity_type": "ai_analysis",
    "entity_id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
    "action": "PUBLISHED",
    "actor_id": uuid.UUID("22222222-2222-2222-2222-222222222222"),
    "actor_kind": ActorKind.HUMAN,
    "before": {"status": "DRAFT"},
    "after": {"status": "PUBLISHED"},
    "created_at": datetime(2026, 8, 23, 12, 0, tzinfo=UTC),
}


# ---------------------------------------------------------------------------
# Canonical form — the hash is only as stable as this
# ---------------------------------------------------------------------------
def test_key_order_does_not_change_the_canonical_form():
    assert canonical({"b": 1, "a": 2}) == canonical({"a": 2, "b": 1})


def test_canonical_form_has_no_incidental_whitespace():
    assert canonical({"a": 1, "b": [1, 2]}) == '{"a":1,"b":[1,2]}'


def test_values_json_cannot_hold_are_stringified_rather_than_raising():
    # An audit write must never fail because a caller passed a UUID or a date.
    text = canonical({"id": uuid.uuid4(), "when": datetime.now(tz=UTC), "kind": ActorKind.AI})
    assert isinstance(text, str)


def test_jsonable_returns_structures_that_jsonb_can_store():
    payload = jsonable({"id": uuid.uuid4(), "kind": ActorKind.HUMAN, "n": 3})
    assert isinstance(payload["id"], str)
    assert payload["kind"] == "HUMAN"
    assert payload["n"] == 3


def test_jsonable_passes_none_through():
    assert jsonable(None) is None


# ---------------------------------------------------------------------------
# The hash covers everything a reader would rely on
# ---------------------------------------------------------------------------
def test_the_same_content_always_hashes_the_same():
    assert compute_hash(**BASE) == compute_hash(**BASE)


@pytest.mark.parametrize(
    ("field", "tampered"),
    [
        ("prev_hash", "f" * 64),
        ("entity_type", "action_item"),
        ("entity_id", uuid.UUID("33333333-3333-3333-3333-333333333333")),
        ("action", "HUMAN_EDITED"),
        ("actor_id", uuid.UUID("44444444-4444-4444-4444-444444444444")),
        ("actor_kind", ActorKind.AI),
        ("before", {"status": "SUPERSEDED"}),
        ("after", {"status": "DRAFT"}),
        ("created_at", datetime(2026, 8, 23, 12, 0, 1, tzinfo=UTC)),
    ],
)
def test_changing_any_recorded_field_changes_the_hash(field: str, tampered: object):
    assert compute_hash(**{**BASE, field: tampered}) != compute_hash(**BASE)


def test_a_changed_link_changes_the_hash_so_reordering_is_detectable():
    first = compute_hash(**BASE)
    second = compute_hash(**{**BASE, "prev_hash": first})
    assert first != second


def test_the_hash_is_a_full_length_sha256_hex_digest():
    digest = compute_hash(**BASE)
    assert len(digest) == 64
    assert set(digest) <= set("0123456789abcdef")


def test_genesis_is_a_distinct_all_zero_link():
    assert GENESIS == "0" * 64
    assert compute_hash(**BASE) != GENESIS
