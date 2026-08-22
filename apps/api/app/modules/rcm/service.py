from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.client import LlmBadOutput, LlmResult, LlmUnavailable, complete_json
from app.ai.grounding import Citation, verify_all
from app.ai.prompts import RCM_SYSTEM, ControlChoice, build_rcm_prompt
from app.core.logging import get_logger
from app.models.action_item import ActionItem
from app.models.analysis import AIAnalysis
from app.models.circular import Circular, Function
from app.models.control import Control, Kci
from app.models.enums import ActorKind, AssertionSource, Coverage, RcmStatus
from app.models.rcm import Rcm, RcmRow
from app.models.user import User
from app.modules.analysis.schemas import CitationOut
from app.modules.audit import service as audit
from app.modules.rcm.schemas import (
    MappedControlOut,
    RcmDraft,
    RcmOut,
    RcmRowOut,
)

log = get_logger("rcm.service")


class NotReady(Exception):
    """The circular is not in a state where an RCM can be built."""


def assert_ready(circular: Circular, analysis: AIAnalysis | None) -> None:
    if analysis is None:
        raise NotReady("Analyse this circular before building its RCM.")
    if not (circular.raw_text or "").strip():
        raise NotReady("This circular has no extracted text.")


# ---------------------------------------------------------------------------
# The control library, loaded once per run
# ---------------------------------------------------------------------------
async def load_controls(db: AsyncSession) -> list[Control]:
    result = await db.execute(
        select(Control)
        .options(selectinload(Control.owner_function), selectinload(Control.kcis))
        .order_by(Control.code)
    )
    return list(result.scalars().all())


def _as_choice(control: Control) -> ControlChoice:
    kci = control.kcis[0] if control.kcis else None
    owner = control.owner_function
    return ControlChoice(
        code=control.code,
        name=control.name,
        description=control.description or "",
        owner_code=owner.code if owner else None,
        owner_name=owner.name if owner else None,
        kci_name=kci.name if kci else None,
        kci_status=kci.status.value if kci else None,
    )


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------
async def generate(db: AsyncSession, circular: Circular) -> Rcm | None:
    """Build (or rebuild) the draft RCM for a circular.

    Returns None when the model could not be reached. As everywhere else, the AI is
    never a hard dependency — a reviewer can still build the matrix by hand.
    """
    analysis = (
        await db.execute(
            select(AIAnalysis)
            .where(AIAnalysis.circular_id == circular.id)
            .order_by(AIAnalysis.version.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    assert_ready(circular, analysis)
    assert analysis is not None

    controls = await load_controls(db)
    by_code = {c.code: c for c in controls}

    action_items = list(
        (
            await db.execute(
                select(ActionItem.description).where(ActionItem.circular_id == circular.id)
            )
        ).scalars()
    )

    prompt = build_rcm_prompt(
        circular_text=circular.raw_text or "",
        controls=[_as_choice(c) for c in controls],
        summary=analysis.summary,
        risk_rating=analysis.risk_rating.value if analysis.risk_rating else None,
        action_items=action_items,
    )

    try:
        result: LlmResult = await complete_json(system=RCM_SYSTEM, user=prompt)
        draft = RcmDraft.model_validate(result.data)
    except (LlmUnavailable, LlmBadOutput) as exc:
        log.warning("rcm_failed", circular_id=str(circular.id), error=str(exc)[:300])
        return None
    except Exception:  # noqa: BLE001
        log.exception("rcm_crashed", circular_id=str(circular.id))
        return None

    return await _store(db, circular, draft, result, by_code)


async def _store(
    db: AsyncSession,
    circular: Circular,
    draft: RcmDraft,
    result: LlmResult,
    by_code: dict[str, Control],
) -> Rcm:
    rcm = await get_for_circular(db, circular.id)
    if rcm is None:
        rcm = Rcm(circular_id=circular.id, status=RcmStatus.DRAFT)
        db.add(rcm)
        await db.flush()

    # Query the rows rather than touching `rcm.rows`. On a just-created Rcm that
    # relationship is unloaded, and a lazy load here raises MissingGreenlet — async
    # SQLAlchemy cannot do IO from attribute access.
    existing = list(
        (await db.execute(select(RcmRow).where(RcmRow.rcm_id == rcm.id))).scalars()
    )
    # Regenerating replaces the AI's rows but never a human's. Same rule as action
    # items: the model's opinion is disposable, a person's judgement is not.
    for row in existing:
        if row.source == AssertionSource.AI:
            await db.delete(row)
    await db.flush()

    rcm.model_name = result.model
    rcm.status = RcmStatus.DRAFT

    kept = sum(1 for r in existing if r.source == AssertionSource.HUMAN)
    citations: list[Citation] = []
    rows: list[RcmRow] = []

    for position, item in enumerate(draft.rows, start=kept):
        risk_text = item.risk_text.strip()
        if not risk_text:
            continue

        control = by_code.get(item.mapped_control or "")
        if item.mapped_control and control is None:
            # The model invented a control code. That is exactly the failure this
            # design exists to catch: an unmatched risk is a gap, not a false comfort.
            log.warning(
                "unknown_control_code", code=item.mapped_control, circular_id=str(circular.id)
            )
        coverage = _reconcile(item.coverage, control)

        row = RcmRow(
            rcm_id=rcm.id,
            position=position,
            risk_text=risk_text,
            control_text=(item.control_text or "").strip() or _fallback_control_text(control),
            coverage=coverage,
            reasoning=item.reasoning,
            mapped_control_id=control.id if control else None,
            mapped_kci_id=_kci_id(control),
            confidence=item.confidence,
            source=AssertionSource.AI,
        )
        db.add(row)
        rows.append(row)
        citations.append(
            Citation(
                claim=risk_text,
                quote=item.evidence,
                target_kind="rcm_row",
            )
        )

    await db.flush()

    # Ground every risk in the circular, exactly as analysis claims are grounded.
    report = verify_all(citations, circular.raw_text or "", circular.page_map)
    for row, citation in zip(rows, report.citations, strict=True):
        citation.target_ref = str(row.id)
        row.citation = citation.as_dict()

    await audit.record(
        db,
        entity_type="rcm",
        entity_id=rcm.id,
        action="AI_SUGGESTED",
        actor_id=None,
        actor_kind=ActorKind.AI,
        after={
            "model": result.model,
            "rows": len(rows),
            "covered": sum(1 for r in rows if r.coverage is Coverage.COVERED),
            "partial": sum(1 for r in rows if r.coverage is Coverage.PARTIAL),
            "gaps": sum(1 for r in rows if r.coverage is Coverage.GAP),
            "citations_verified": report.verified,
            "citations_total": report.total,
        },
    )
    await db.commit()
    log.info(
        "rcm_generated",
        circular_id=str(circular.id),
        rows=len(rows),
        gaps=sum(1 for r in rows if r.coverage is Coverage.GAP),
        model=result.model,
    )
    return rcm


def _reconcile(coverage: Coverage, control: Control | None) -> Coverage:
    """A row may never claim more coverage than it can point at.

    Models do occasionally return `coverage: COVERED` with `mapped_control: null`, or
    name a control that does not exist. Storing that as COVERED would hide work — the
    single most damaging error this feature can make — so it becomes a GAP.

    This only ever moves toward *more* work, never less. A row that names a real
    control but still says GAP is left as GAP: that is the model saying "this control
    exists and does not answer the risk", which is a finding, not a contradiction.
    """
    return Coverage.GAP if control is None else coverage


def _fallback_control_text(control: Control | None) -> str:
    if control is not None:
        return control.name
    return "No control currently exists — one must be designed."


def _kci_id(control: Control | None) -> uuid.UUID | None:
    if control is None or not control.kcis:
        return None
    return control.kcis[0].id


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------
async def get_for_circular(db: AsyncSession, circular_id: uuid.UUID) -> Rcm | None:
    """`populate_existing` is not optional here.

    Endpoints add or edit a row and then re-read the matrix to return it. Without
    this, SQLAlchemy hands back the same identity-mapped Rcm with the collection it
    loaded earlier — and the caller gets a response that silently omits the row it
    just created. `expire_on_commit=False` means the commit does not refresh it either.
    """
    return (
        await db.execute(
            select(Rcm)
            .options(selectinload(Rcm.rows))
            .where(Rcm.circular_id == circular_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()


async def build_output(db: AsyncSession, rcm: Rcm) -> RcmOut:
    controls = {
        c.id: c
        for c in (
            await db.execute(
                select(Control).options(
                    selectinload(Control.owner_function), selectinload(Control.kcis)
                )
            )
        ).scalars()
    }
    reviewer = (
        (await db.execute(select(User).where(User.id == rcm.reviewed_by))).scalar_one_or_none()
        if rcm.reviewed_by
        else None
    )

    rows = sorted(rcm.rows, key=lambda r: (r.position, r.created_at))
    out_rows = [RcmRowOut(**_row_fields(row, controls.get(row.mapped_control_id))) for row in rows]

    citations = [r.citation for r in rows if r.citation]
    return RcmOut(
        id=rcm.id,
        circular_id=rcm.circular_id,
        status=rcm.status,
        model_name=rcm.model_name,
        created_at=rcm.created_at,
        published_at=rcm.published_at,
        reviewed_by_name=reviewer.full_name if reviewer else None,
        editable=rcm.status == RcmStatus.DRAFT,
        rows=out_rows,
        covered=sum(1 for r in rows if r.coverage is Coverage.COVERED),
        partial=sum(1 for r in rows if r.coverage is Coverage.PARTIAL),
        gaps=sum(1 for r in rows if r.coverage is Coverage.GAP),
        citations_total=len(citations),
        citations_verified=sum(1 for c in citations if c.get("verified")),
    )


def _row_fields(row: RcmRow, control: Control | None) -> dict:
    return {
        "id": row.id,
        "position": row.position,
        "risk_text": row.risk_text,
        "control_text": row.control_text,
        "coverage": row.coverage,
        "reasoning": row.reasoning,
        "confidence": row.confidence,
        "source": row.source,
        "control": _control_out(control),
        "citation": CitationOut.model_validate(row.citation) if row.citation else None,
    }


def _control_out(control: Control | None) -> MappedControlOut | None:
    if control is None:
        return None
    kci: Kci | None = control.kcis[0] if control.kcis else None
    owner: Function | None = control.owner_function
    return MappedControlOut(
        code=control.code,
        name=control.name,
        owner_function_code=owner.code if owner else None,
        owner_function_name=owner.name if owner else None,
        kci_code=kci.code if kci else None,
        kci_name=kci.name if kci else None,
        kci_status=kci.status.value if kci else None,
        kci_target=kci.target if kci else None,
        kci_current_value=kci.current_value if kci else None,
    )
