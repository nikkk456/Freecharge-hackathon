from __future__ import annotations

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.client import LlmBadOutput, LlmResult, LlmUnavailable, complete_json
from app.ai.prompts import SYSTEM, FunctionChoice, build_analysis_prompt
from app.core.config import settings
from app.core.logging import get_logger
from app.models.action_item import ActionItem
from app.models.analysis import AIAnalysis
from app.models.circular import Circular, CircularFunction, Function
from app.models.enums import (
    ActionItemStatus,
    AnalysisStatus,
    AssertionSource,
    CircularStatus,
)
from app.modules.analysis.schemas import (
    ActionItemOut,
    AnalysisDraft,
    AnalysisOut,
    ImpactedFunctionOut,
    dedup_key,
)

log = get_logger("analysis.service")


class NotAnalysable(Exception):
    """The circular is not in a state where analysis makes sense."""


def assert_has_text(circular: Circular) -> None:
    """The minimum for analysis to be possible at all."""
    if circular.status == CircularStatus.FAILED:
        raise NotAnalysable("This circular failed to parse, so there is no text to analyse.")
    if not (circular.raw_text or "").strip():
        raise NotAnalysable("This circular has no extracted text yet.")


def assert_analysable(circular: Circular) -> None:
    """Guard for the *entry point* only. It additionally rejects work already in
    flight, which is what stops a double-click starting two runs.

    The worker and `run_analysis` must NOT use this: by the time they run, the
    circular is deliberately in ANALYZING, and they would reject their own job.
    """
    assert_has_text(circular)
    if circular.status in (CircularStatus.PARSING, CircularStatus.ANALYZING):
        raise NotAnalysable("This circular is already being processed.")


# ---------------------------------------------------------------------------
# The run
# ---------------------------------------------------------------------------
async def run_analysis(db: AsyncSession, circular: Circular) -> AIAnalysis | None:
    """Analyse a parsed circular and store the result as a DRAFT.

    Returns None when the model could not be reached — the circular goes back to
    PARSED with a readable `analysis_error`, so the human can still review it by hand.
    The AI is never allowed to be a hard dependency.
    """
    assert_has_text(circular)

    circular.status = CircularStatus.ANALYZING
    circular.analysis_error = None
    await db.commit()

    functions = list((await db.execute(select(Function).order_by(Function.code))).scalars())
    by_code = {f.code: f for f in functions}

    prompt = build_analysis_prompt(
        circular_text=circular.raw_text or "",
        functions=[FunctionChoice(f.code, f.name, f.description or "") for f in functions],
        ref_no=circular.ref_no,
        issued_date=str(circular.issued_date) if circular.issued_date else None,
    )

    try:
        result: LlmResult = await complete_json(system=SYSTEM, user=prompt)
        draft = AnalysisDraft.model_validate(result.data)
    except (LlmUnavailable, LlmBadOutput) as exc:
        circular.status = CircularStatus.PARSED
        circular.analysis_error = str(exc)
        await db.commit()
        log.warning("analysis_failed", circular_id=str(circular.id), error=str(exc)[:300])
        return None
    except Exception as exc:  # noqa: BLE001 — never strand a circular in ANALYZING
        circular.status = CircularStatus.PARSED
        circular.analysis_error = f"Unexpected error during analysis: {exc}"
        await db.commit()
        log.exception("analysis_crashed", circular_id=str(circular.id))
        return None

    analysis = await _store(db, circular, draft, result, by_code)
    log.info(
        "analysis_stored",
        circular_id=str(circular.id),
        version=analysis.version,
        model=result.model,
        risk=analysis.risk_rating.value if analysis.risk_rating else None,
        functions=len(draft.impacted_functions),
        actions=len(draft.action_items),
    )
    return analysis


async def _store(
    db: AsyncSession,
    circular: Circular,
    draft: AnalysisDraft,
    result: LlmResult,
    by_code: dict[str, Function],
) -> AIAnalysis:
    # Older versions are superseded, never deleted — the audit trail is the point.
    previous = (
        await db.execute(select(AIAnalysis).where(AIAnalysis.circular_id == circular.id))
    ).scalars().all()
    for row in previous:
        if row.status != AnalysisStatus.PUBLISHED:
            row.status = AnalysisStatus.SUPERSEDED

    next_version = 1 + max((row.version for row in previous), default=0)

    analysis = AIAnalysis(
        circular_id=circular.id,
        version=next_version,
        status=AnalysisStatus.DRAFT,  # a human publishes; the model never does
        summary=draft.summary,
        risk_rating=draft.risk_rating,
        risk_reasoning=draft.risk_reasoning,
        confidence=draft.confidence,
        model_name=result.model,
    )
    db.add(analysis)

    await _replace_impacted_functions(db, circular, draft, by_code)
    await _upsert_action_items(db, circular, draft, by_code)

    # The model's title beats a filename, but must not clobber a human's wording.
    # A filename stem has no spaces; a real title always does.
    if draft.title and not (circular.title or "").strip().count(" "):
        circular.title = draft.title[:1024]
    if draft.effective_date and not circular.issued_date:
        circular.issued_date = draft.effective_date

    circular.status = CircularStatus.ANALYZED
    circular.analysis_error = None
    await db.commit()
    return analysis


async def _replace_impacted_functions(
    db: AsyncSession, circular: Circular, draft: AnalysisDraft, by_code: dict[str, Function]
) -> None:
    """Re-running replaces the AI's opinion but leaves a human's assertions alone."""
    await db.execute(
        delete(CircularFunction).where(
            CircularFunction.circular_id == circular.id,
            CircularFunction.source == AssertionSource.AI,
        )
    )
    seen: set[str] = set()
    for item in draft.impacted_functions:
        function = by_code.get(item.code)
        if function is None:
            # The model invented a code. Drop it — it cannot name an owner we do not have.
            log.warning("unknown_function_code", code=item.code, circular_id=str(circular.id))
            continue
        if item.code in seen:
            continue
        seen.add(item.code)
        db.add(
            CircularFunction(
                circular_id=circular.id,
                function_id=function.id,
                confidence=item.confidence,
                reasoning=item.reasoning,
                source=AssertionSource.AI,
            )
        )


async def _upsert_action_items(
    db: AsyncSession, circular: Circular, draft: AnalysisDraft, by_code: dict[str, Function]
) -> None:
    """Replace the AI's untouched action items, and never touch anyone else's.

    Re-running must not accumulate near-duplicates. `dedup_key` alone cannot prevent
    that: the model rewords the same obligation on every run ("Ensure agents hold IIBF
    certification" vs "Obtain IIBF certification for all recovery agents"), so keying
    on the text produces a fresh row each time. Measured: a second run turned 8 items
    into 16.

    So the AI's opinion is replaced wholesale, exactly as impacted functions are. An
    item is preserved the moment a human has engaged with it — moved it off OPEN,
    assigned an owner, or attached evidence. `dedup_key` still does its real job:
    making a *retried* job (same model output) idempotent.
    """
    await db.execute(
        delete(ActionItem).where(
            ActionItem.circular_id == circular.id,
            ActionItem.source == AssertionSource.AI,
            ActionItem.status == ActionItemStatus.OPEN,
            ActionItem.owner_id.is_(None),
            ActionItem.evidence_url.is_(None),
        )
    )
    await db.flush()

    surviving = {
        row.dedup_key
        for row in (
            await db.execute(select(ActionItem).where(ActionItem.circular_id == circular.id))
        ).scalars()
    }

    for item in draft.action_items:
        description = item.description.strip()
        if not description:
            continue
        key = dedup_key(circular.id, description)
        if key in surviving:
            continue  # a human already owns this exact item; leave it alone
        surviving.add(key)
        owner = by_code.get(item.owner_function or "")
        db.add(
            ActionItem(
                circular_id=circular.id,
                description=description,
                owner_function_id=owner.id if owner else None,
                due_date=item.due_date,
                status=ActionItemStatus.OPEN,
                priority=item.priority,
                source=AssertionSource.AI,
                dedup_key=key,
            )
        )


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------
async def latest_analysis(db: AsyncSession, circular_id: uuid.UUID) -> AIAnalysis | None:
    return (
        await db.execute(
            select(AIAnalysis)
            .where(AIAnalysis.circular_id == circular_id)
            .order_by(AIAnalysis.version.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def analysis_count(db: AsyncSession, circular_id: uuid.UUID) -> int:
    return int(
        (
            await db.execute(
                select(func.count())
                .select_from(AIAnalysis)
                .where(AIAnalysis.circular_id == circular_id)
            )
        ).scalar_one()
    )


async def build_output(db: AsyncSession, analysis: AIAnalysis) -> AnalysisOut:
    functions = (
        await db.execute(
            select(CircularFunction, Function)
            .join(Function, CircularFunction.function_id == Function.id)
            .where(CircularFunction.circular_id == analysis.circular_id)
            .order_by(CircularFunction.confidence.desc().nullslast())
        )
    ).all()

    items = (
        await db.execute(
            select(ActionItem, Function)
            .outerjoin(Function, ActionItem.owner_function_id == Function.id)
            .where(ActionItem.circular_id == analysis.circular_id)
            .order_by(ActionItem.created_at)
        )
    ).all()

    return AnalysisOut(
        id=analysis.id,
        circular_id=analysis.circular_id,
        version=analysis.version,
        status=analysis.status,
        summary=analysis.summary,
        risk_rating=analysis.risk_rating,
        risk_reasoning=analysis.risk_reasoning,
        confidence=analysis.confidence,
        model_name=analysis.model_name,
        created_at=analysis.created_at,
        needs_review=(analysis.confidence or 0) < settings.min_confidence_for_autoaccept,
        impacted_functions=[
            ImpactedFunctionOut(
                code=function.code,
                name=function.name,
                confidence=link.confidence,
                reasoning=link.reasoning,
                source=link.source,
            )
            for link, function in functions
        ],
        action_items=[
            ActionItemOut(
                id=item.id,
                description=item.description,
                priority=item.priority,
                status=item.status.value,
                due_date=item.due_date,
                owner_function_code=owner.code if owner else None,
                owner_function_name=owner.name if owner else None,
                source=item.source,
            )
            for item, owner in items
        ],
    )
