"""Human review of the matrix — same state machine as an analysis.

A PUBLISHED RCM is frozen. Regenerating replaces the model's rows and never a
human's, so a reviewer's judgement survives a re-run.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.logging import get_logger
from app.models.control import Control
from app.models.enums import ActorKind, AssertionSource, Coverage, RcmStatus
from app.models.rcm import Rcm, RcmRow
from app.models.user import User
from app.modules.audit import service as audit
from app.modules.rcm.schemas import RcmRowCreate, RcmRowPatch

log = get_logger("rcm.review")


def assert_editable(rcm: Rcm) -> None:
    if rcm.status == RcmStatus.PUBLISHED:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This RCM is published and cannot be changed. Regenerate it to produce a "
            "new draft.",
        )


async def _control_by_code(db: AsyncSession, code: str | None) -> Control | None:
    """`kcis` is eager-loaded because callers read `control.kcis[0]` to derive the
    mapped KCI — a lazy load there raises MissingGreenlet on an async session."""
    if not code:
        return None
    control = (
        await db.execute(
            select(Control)
            .options(selectinload(Control.kcis))
            .where(Control.code == code.strip().upper())
        )
    ).scalar_one_or_none()
    if control is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"No such control: {code}"
        )
    return control


async def get_row(db: AsyncSession, row_id: uuid.UUID) -> RcmRow:
    row = (await db.execute(select(RcmRow).where(RcmRow.id == row_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "RCM row not found")
    return row


async def get_rcm(db: AsyncSession, rcm_id: uuid.UUID) -> Rcm:
    """Rows are eager-loaded: callers read `rcm.rows`, and a lazy load on an async
    session raises MissingGreenlet rather than quietly fetching."""
    rcm = (
        await db.execute(
            select(Rcm).options(selectinload(Rcm.rows)).where(Rcm.id == rcm_id)
        )
    ).scalar_one_or_none()
    if rcm is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "RCM not found")
    return rcm


def _plain(value: object) -> object:
    if value is None:
        return None
    if isinstance(value, uuid.UUID | datetime):
        return str(value)
    return getattr(value, "value", value)


async def patch_row(
    db: AsyncSession, rcm: Rcm, row: RcmRow, changes: RcmRowPatch, actor: User
) -> RcmRow:
    assert_editable(rcm)
    fields = changes.model_dump(exclude_unset=True)
    if not fields:
        return row

    control_code = fields.pop("mapped_control_code", ...)
    before = {key: _plain(getattr(row, key)) for key in fields}
    for key, value in fields.items():
        setattr(row, key, value)

    if control_code is not ...:
        control = await _control_by_code(db, control_code)
        before["mapped_control_id"] = _plain(row.mapped_control_id)
        row.mapped_control_id = control.id if control else None
        row.mapped_kci_id = control.kcis[0].id if control and control.kcis else None
        # The same guard the generator applies: coverage can never outrun its control.
        if control is None:
            row.coverage = Coverage.GAP

    after = {key: _plain(getattr(row, key)) for key in before}
    if before == after:
        return row

    await audit.record(
        db,
        entity_type="rcm_row",
        entity_id=row.id,
        action="HUMAN_EDITED",
        actor_id=actor.id,
        actor_kind=ActorKind.HUMAN,
        before=before,
        after=after,
    )
    await db.commit()
    return row


async def create_row(
    db: AsyncSession, rcm: Rcm, payload: RcmRowCreate, actor: User
) -> RcmRow:
    assert_editable(rcm)
    control = await _control_by_code(db, payload.mapped_control_code)
    # `or -1` would be wrong here: the first row's position is 0, which is falsy, so
    # every subsequent row would also land at 0. Test the None explicitly.
    highest = (
        await db.execute(select(func.max(RcmRow.position)).where(RcmRow.rcm_id == rcm.id))
    ).scalar()
    next_position = 0 if highest is None else highest + 1

    row = RcmRow(
        rcm_id=rcm.id,
        position=next_position,
        risk_text=payload.risk_text.strip(),
        control_text=payload.control_text.strip() or (control.name if control else ""),
        coverage=payload.coverage if control else Coverage.GAP,
        reasoning=payload.reasoning,
        mapped_control_id=control.id if control else None,
        mapped_kci_id=control.kcis[0].id if control and control.kcis else None,
        confidence=1.0,  # a human said so
        source=AssertionSource.HUMAN,
    )
    db.add(row)
    await db.flush()

    await audit.record(
        db,
        entity_type="rcm_row",
        entity_id=row.id,
        action="HUMAN_ADDED",
        actor_id=actor.id,
        after={"risk_text": row.risk_text, "coverage": row.coverage.value},
    )
    await db.commit()
    return row


async def delete_row(db: AsyncSession, rcm: Rcm, row: RcmRow, actor: User) -> None:
    assert_editable(rcm)
    await audit.record(
        db,
        entity_type="rcm_row",
        entity_id=row.id,
        action="HUMAN_DELETED",
        actor_id=actor.id,
        before={"risk_text": row.risk_text, "source": row.source.value},
    )
    await db.delete(row)
    await db.commit()


async def publish(db: AsyncSession, rcm: Rcm, actor: User) -> Rcm:
    if rcm.status == RcmStatus.PUBLISHED:
        raise HTTPException(status.HTTP_409_CONFLICT, "This RCM is already published.")
    if not rcm.rows:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "An RCM needs at least one risk row before it can be published.",
        )

    rcm.status = RcmStatus.PUBLISHED
    rcm.reviewed_by = actor.id
    rcm.published_at = datetime.now(tz=UTC)

    await audit.record(
        db,
        entity_type="rcm",
        entity_id=rcm.id,
        action="PUBLISHED",
        actor_id=actor.id,
        actor_kind=ActorKind.HUMAN,
        before={"status": RcmStatus.DRAFT.value},
        after={
            "status": rcm.status.value,
            "rows": len(rcm.rows),
            "gaps": sum(1 for r in rcm.rows if r.coverage is Coverage.GAP),
        },
    )
    await db.commit()
    log.info("rcm_published", rcm_id=str(rcm.id), reviewer=actor.email)
    return rcm
