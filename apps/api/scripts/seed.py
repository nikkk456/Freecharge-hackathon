"""Create the database schema and load the foundation layer.

    python -m scripts.seed              # create schema (if absent) + upsert all seed data
    python -m scripts.seed --reset      # DROP everything first, then rebuild from scratch

What gets seeded:
  * demo users (so you can log in once auth exists)
  * functions      <- scripts/data/functions.json   (18 impacted departments)
  * controls       <- scripts/data/controls.json    (36 mock control-library entries)
  * kcis           <- scripts/data/kcis.json        (31 key control indicators)

Idempotent: every row is matched on its business code (F01 / C-001 / K-001), so
re-running updates in place instead of duplicating. Every foreign key in the JSON is
validated *before* anything is written, so a typo fails loudly instead of silently
producing a dangling reference.
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import configure_logging, get_logger
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.circular import Function
from app.models.control import Control, Kci
from app.models.enums import KciStatus, Role
from app.models.user import User

log = get_logger("seed")

DATA_DIR = Path(__file__).parent / "data"

DEMO_USERS = [
    ("admin@cac.dev", "Admin User", Role.ADMIN, "admin123"),
    ("analyst@cac.dev", "Ava Analyst", Role.ANALYST, "analyst123"),
    ("reviewer@cac.dev", "Ravi Reviewer", Role.REVIEWER, "reviewer123"),
    ("owner@cac.dev", "Omar Owner", Role.OWNER, "owner123"),
]


def _load(name: str) -> list[dict]:
    return json.loads((DATA_DIR / f"{name}.json").read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------
async def _drop_everything() -> None:
    """Nuke the public schema. Cleaner than drop_all because it also removes the
    Postgres ENUM types, which otherwise survive and collide on re-create."""
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
    log.warning("schema_dropped")


async def _create_schema() -> None:
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
        await conn.run_sync(Base.metadata.create_all)


# ---------------------------------------------------------------------------
# Validation — fail before writing, never after
# ---------------------------------------------------------------------------
def _validate(functions: list[dict], controls: list[dict], kcis: list[dict]) -> None:
    function_ids = {f["id"] for f in functions}
    control_ids = {c["control_id"] for c in controls}
    kci_ids = {k["kci_id"] for k in kcis}
    errors: list[str] = []

    for c in controls:
        if c["owner_function"] not in function_ids:
            errors.append(f"{c['control_id']}: owner_function {c['owner_function']} not found")
        if c["linked_kci"] and c["linked_kci"] not in kci_ids:
            errors.append(f"{c['control_id']}: linked_kci {c['linked_kci']} not found")
    for k in kcis:
        if k["linked_control"] not in control_ids:
            errors.append(f"{k['kci_id']}: linked_control {k['linked_control']} not found")
        if k["status"] not in {s.value for s in KciStatus}:
            errors.append(f"{k['kci_id']}: status '{k['status']}' is not a valid RAG value")

    if errors:
        raise SystemExit("Seed data has dangling references:\n  " + "\n  ".join(errors))


# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------
async def _seed_users(db: AsyncSession) -> None:
    for email, name, role, pw in DEMO_USERS:
        row = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if row is None:
            db.add(User(
                email=email, full_name=name, role=role, hashed_password=hash_password(pw)
            ))
    await db.flush()


async def _seed_functions(db: AsyncSession, functions: list[dict]) -> dict[str, Function]:
    by_code = {
        f.code: f for f in (await db.execute(select(Function))).scalars().all()
    }
    for item in functions:
        row = by_code.get(item["id"])
        if row is None:
            row = Function(code=item["id"])
            db.add(row)
            by_code[item["id"]] = row
        row.name = item["name"]
        row.description = item["description"]
    await db.flush()
    return by_code


async def _seed_controls(
    db: AsyncSession, controls: list[dict], functions: dict[str, Function]
) -> dict[str, Control]:
    by_code = {c.code: c for c in (await db.execute(select(Control))).scalars().all()}
    for item in controls:
        row = by_code.get(item["control_id"])
        if row is None:
            row = Control(code=item["control_id"])
            db.add(row)
            by_code[item["control_id"]] = row
        row.name = item["control_name"]
        row.description = item["description"]
        row.owner_function_id = functions[item["owner_function"]].id
    await db.flush()
    return by_code


async def _seed_kcis(db: AsyncSession, kcis: list[dict], controls: dict[str, Control]) -> None:
    by_code = {k.code: k for k in (await db.execute(select(Kci))).scalars().all()}
    for item in kcis:
        row = by_code.get(item["kci_id"])
        if row is None:
            row = Kci(code=item["kci_id"])
            db.add(row)
            by_code[item["kci_id"]] = row
        row.name = item["kci_name"]
        row.control_id = controls[item["linked_control"]].id
        row.target = item["target"]
        row.current_value = item["current_value"]
        row.status = KciStatus(item["status"])
    await db.flush()


async def main() -> None:
    configure_logging()
    reset = "--reset" in sys.argv

    functions = _load("functions")
    controls = _load("controls")
    kcis = _load("kcis")
    _validate(functions, controls, kcis)

    if reset:
        await _drop_everything()
    await _create_schema()

    async with SessionLocal() as db:
        await _seed_users(db)
        fn_map = await _seed_functions(db, functions)
        ctl_map = await _seed_controls(db, controls, fn_map)
        await _seed_kcis(db, kcis, ctl_map)
        await db.commit()

    status_mix: dict[str, int] = {}
    for k in kcis:
        status_mix[k["status"]] = status_mix.get(k["status"], 0) + 1
    uncovered = [c["control_id"] for c in controls if not c["linked_kci"]]

    log.info(
        "seed_complete",
        users=len(DEMO_USERS),
        functions=len(functions),
        controls=len(controls),
        kcis=len(kcis),
        kci_status_mix=status_mix,
        controls_without_kci=uncovered,
    )


if __name__ == "__main__":
    asyncio.run(main())
