"""Background jobs.

Everything here is slow, CPU- or network-bound, and retryable — the reason the
architecture reserves a separate worker process. Each task opens its own DB session:
the worker has no request scope to borrow one from.
"""
from __future__ import annotations

import uuid

from app.core.logging import get_logger
from app.db.session import SessionLocal
from app.models.enums import CircularStatus
from app.modules.analysis import service as analysis
from app.modules.circulars import service as circulars
from app.modules.rcm import service as rcm

log = get_logger("worker.tasks")


async def ocr_circular(ctx: dict, circular_id: str) -> str:
    """OCR the scanned pages of a circular and finalise it.

    Idempotent: it re-reads the stored PDF and recomputes every page, so an ARQ
    retry after a crash produces the same result rather than compounding a
    half-finished one.
    """
    async with SessionLocal() as db:
        circular = await circulars.get(db, uuid.UUID(circular_id))
        if circular is None:
            log.warning("ocr_skipped_missing_circular", circular_id=circular_id)
            return "missing"
        if circular.status == CircularStatus.PARSED:
            log.info("ocr_skipped_already_parsed", circular_id=circular_id)
            return "already_parsed"

        result = await circulars.run_ocr(db, circular)
        return result.status.value


async def analyze_circular(ctx: dict, circular_id: str) -> str:
    """Run the AI analysis for a circular and store it as a DRAFT.

    Returns an outcome string rather than raising when the model is unreachable. That
    is an expected condition, `run_analysis` has already recorded it on the circular
    for the human to see, and raising would only make ARQ retry a model known to be
    down — burning free-tier quota to no purpose.
    """
    async with SessionLocal() as db:
        circular = await circulars.get(db, uuid.UUID(circular_id))
        if circular is None:
            log.warning("analysis_skipped_missing_circular", circular_id=circular_id)
            return "missing"

        try:
            # Deliberately not `assert_analysable`: this circular is in ANALYZING
            # because we are the job analysing it.
            analysis.assert_has_text(circular)
        except analysis.NotAnalysable as exc:
            log.warning("analysis_skipped", circular_id=circular_id, reason=str(exc))
            return "skipped"

        result = await analysis.run_analysis(db, circular)
        return f"v{result.version}" if result else "failed"


async def build_rcm(ctx: dict, circular_id: str) -> str:
    """Build the Risk & Control Matrix for a circular.

    Like analysis, returns an outcome rather than raising when the model is
    unreachable — retrying a model that is known to be down only burns free-tier quota.
    """
    async with SessionLocal() as db:
        circular = await circulars.get(db, uuid.UUID(circular_id))
        if circular is None:
            log.warning("rcm_skipped_missing_circular", circular_id=circular_id)
            return "missing"

        try:
            result = await rcm.generate(db, circular)
        except rcm.NotReady as exc:
            log.warning("rcm_skipped", circular_id=circular_id, reason=str(exc))
            return "skipped"
        return f"rows={len(result.rows)}" if result else "failed"
