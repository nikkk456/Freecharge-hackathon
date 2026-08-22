from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.audit import AuditLog
from app.models.enums import ActorKind

log = get_logger("audit")

GENESIS = "0" * 64  # the prev_hash of the very first row


def jsonable(payload: Any) -> Any:
    """Coerce a payload into something JSONB can actually store.

    Callers naturally hand over UUIDs, dates and enums. The hash tolerated those
    (`default=str`), but the JSONB insert did not — an audit write that raises would
    roll back the very change it was recording. Coercing here means the stored value
    and the hashed value are the same object, so verification stays exact.
    """
    return json.loads(canonical(payload)) if payload is not None else None


def canonical(payload: Any) -> str:
    """Stable JSON for hashing.

    Sorted keys and no incidental whitespace, so the same logical content always
    hashes identically. `default=str` keeps UUIDs, dates and enums hashable instead of
    raising halfway through writing an audit row.
    """
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def compute_hash(
    *,
    prev_hash: str,
    entity_type: str,
    entity_id: uuid.UUID | str,
    action: str,
    actor_id: uuid.UUID | str | None,
    actor_kind: ActorKind | str,
    before: Any,
    after: Any,
    created_at: datetime | str,
) -> str:
    """sha256 over the previous hash plus this row's content.

    Every field a reader would rely on is inside the digest. `seq` and `id` are not:
    they are assigned by the database, and including them would make the hash
    impossible to recompute from the row's meaning alone.
    """
    body = canonical(
        {
            "prev_hash": prev_hash,
            "entity_type": entity_type,
            "entity_id": str(entity_id),
            "action": action,
            "actor_id": str(actor_id) if actor_id else None,
            "actor_kind": getattr(actor_kind, "value", actor_kind),
            "before": before,
            "after": after,
            "created_at": created_at.isoformat()
            if isinstance(created_at, datetime)
            else str(created_at),
        }
    )
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


async def _last_row(db: AsyncSession) -> AuditLog | None:
    """The current tail of the chain, locked for update.

    `with_for_update` serialises concurrent writers: without it two requests could
    read the same tail and both chain onto it, forking the chain and making
    verification fail for reasons that have nothing to do with tampering.
    """
    return (
        await db.execute(
            select(AuditLog).order_by(AuditLog.seq.desc()).limit(1).with_for_update()
        )
    ).scalar_one_or_none()


async def record(
    db: AsyncSession,
    *,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    actor_id: uuid.UUID | None = None,
    actor_kind: ActorKind = ActorKind.HUMAN,
    before: Any = None,
    after: Any = None,
) -> AuditLog:
    """Append one row to the chain. Caller commits.

    Deliberately not wrapped in try/except: an audit write that fails must fail the
    action it was recording. A change that happened without a trail is worse than a
    change that did not happen.
    """
    previous = await _last_row(db)
    prev_hash = previous.hash if previous else GENESIS
    created_at = datetime.now(tz=UTC)
    before, after = jsonable(before), jsonable(after)

    row = AuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        actor_id=actor_id,
        actor_kind=actor_kind,
        before=before,
        after=after,
        prev_hash=prev_hash,
        created_at=created_at,
        hash=compute_hash(
            prev_hash=prev_hash,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            actor_id=actor_id,
            actor_kind=actor_kind,
            before=before,
            after=after,
            created_at=created_at,
        ),
    )
    db.add(row)
    await db.flush()
    return row


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------
@dataclass
class ChainReport:
    total: int
    intact: bool
    broken_at_seq: int | None = None
    reason: str | None = None

    @property
    def detail(self) -> str:
        if self.total == 0:
            return "No audit entries yet — nothing to verify."
        if self.intact:
            return f"All {self.total} entries verified. The chain is unbroken."
        return f"Chain broken at entry #{self.broken_at_seq}: {self.reason}"


async def verify_chain(db: AsyncSession, *, since_seq: int | None = None) -> ChainReport:
    """Recompute every hash in order and find the first row that does not match.

    Two ways a chain breaks, and they are reported separately because they mean
    different things: a row whose own hash no longer matches its content (that row was
    edited), and a row whose `prev_hash` does not match the previous row's hash (a row
    was deleted or inserted).

    `since_seq` verifies only the segment after that entry, anchored on that entry's
    stored hash. Useful for "has anything been altered since the last review?", and
    for tests, which necessarily append to whatever chain they run against.
    """
    query = select(AuditLog).order_by(AuditLog.seq)
    expected_prev = GENESIS

    if since_seq is not None:
        anchor = (
            await db.execute(select(AuditLog).where(AuditLog.seq == since_seq))
        ).scalar_one_or_none()
        if anchor is None:
            return ChainReport(
                total=0, intact=False, broken_at_seq=since_seq,
                reason="the entry to verify from does not exist",
            )
        expected_prev = anchor.hash
        query = query.where(AuditLog.seq > since_seq)

    rows = list((await db.execute(query)).scalars())

    for row in rows:
        if row.prev_hash != expected_prev:
            return ChainReport(
                total=len(rows),
                intact=False,
                broken_at_seq=row.seq,
                reason="its link to the previous entry does not match — an entry was "
                "removed or inserted",
            )
        recomputed = compute_hash(
            prev_hash=row.prev_hash or GENESIS,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            action=row.action,
            actor_id=row.actor_id,
            actor_kind=row.actor_kind,
            before=row.before,
            after=row.after,
            created_at=row.created_at,
        )
        if recomputed != row.hash:
            return ChainReport(
                total=len(rows),
                intact=False,
                broken_at_seq=row.seq,
                reason="its contents no longer match its hash — the entry was altered",
            )
        expected_prev = row.hash

    return ChainReport(total=len(rows), intact=True)


async def history(
    db: AsyncSession,
    *,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    limit: int = 200,
) -> list[AuditLog]:
    query = select(AuditLog).order_by(AuditLog.seq.desc()).limit(limit)
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.where(AuditLog.entity_id == entity_id)
    return list((await db.execute(query)).scalars())
