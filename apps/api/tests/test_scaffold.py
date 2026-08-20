"""Scaffold sanity check: the data model maps and the expected tables exist.
Replace/extend with real feature tests as you build modules."""
from __future__ import annotations

import app.models  # noqa: F401  (registers all models on Base.metadata)
from app.db.base import Base

EXPECTED_TABLES = {
    "users", "circulars", "circular_chunks", "functions", "circular_functions",
    "ai_analyses", "action_items", "controls", "kcis", "rcms", "rcm_rows",
    "submissions", "audit_logs",
}


def test_all_tables_registered():
    assert EXPECTED_TABLES.issubset(set(Base.metadata.tables.keys()))
