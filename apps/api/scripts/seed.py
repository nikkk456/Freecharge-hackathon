"""Create the database schema (+ a couple of demo users so you can log in once you
build auth).

    python -m scripts.seed

Idempotent. This is scaffolding only — it does NOT create any domain/feature data.
Add seeding for your own entities here as you build features.
"""
from __future__ import annotations

import asyncio

from sqlalchemy import select, text

from app.core.logging import configure_logging, get_logger
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.enums import Role
from app.models.user import User

log = get_logger("seed")

DEMO_USERS = [
    ("admin@cac.dev", "Admin User", Role.ADMIN, "admin123"),
    ("analyst@cac.dev", "Ava Analyst", Role.ANALYST, "analyst123"),
    ("reviewer@cac.dev", "Ravi Reviewer", Role.REVIEWER, "reviewer123"),
    ("owner@cac.dev", "Omar Owner", Role.OWNER, "owner123"),
]


async def _create_schema() -> None:
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
        await conn.run_sync(Base.metadata.create_all)


async def _seed_users() -> None:
    async with SessionLocal() as db:
        for email, name, role, pw in DEMO_USERS:
            exists = (
                await db.execute(select(User).where(User.email == email))
            ).scalar_one_or_none()
            if not exists:
                db.add(User(
                    email=email, full_name=name, role=role, hashed_password=hash_password(pw)
                ))
        await db.commit()
    log.info("seed_complete", users=len(DEMO_USERS))


async def main() -> None:
    configure_logging()
    await _create_schema()
    await _seed_users()


if __name__ == "__main__":
    asyncio.run(main())
