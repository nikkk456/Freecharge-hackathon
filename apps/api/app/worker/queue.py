"""Enqueue side of the job queue (used by the API to hand work to the worker).

Every helper here returns a boolean rather than raising: if Redis is down, the API
must still answer, and the caller decides how to degrade. Nothing about a queue
being unavailable should turn into a 500 for the person uploading a file.
"""
from __future__ import annotations

import uuid

from arq import create_pool
from arq.connections import RedisSettings

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("worker.queue")

_pool = None


def redis_settings() -> RedisSettings:
    return RedisSettings(
        host=settings.redis_host, port=settings.redis_port, database=settings.redis_db
    )


async def get_pool():
    global _pool
    if _pool is None:
        _pool = await create_pool(redis_settings())
    return _pool


async def enqueue_analysis(circular_id: uuid.UUID) -> bool:
    """Queue the AI analysis. False means Redis is unreachable — run it inline instead.

    Uses a fresh job id every time: re-analysing a circular is a legitimate action, and
    ARQ refuses a repeat job id while that job's result is still cached (an hour, per
    `keep_result`). Double-submission is already prevented upstream — the circular
    moves to ANALYZING, and `assert_analysable` rejects that state.
    """
    return await _enqueue("analyze_circular", circular_id, job_id=f"analyze:{uuid.uuid4()}")


async def enqueue_rcm(circular_id: uuid.UUID) -> bool:
    """Queue RCM generation. Fresh job id per run, like analysis: rebuilding a matrix
    is a legitimate action and must not be blocked by ARQ's cached-result window."""
    return await _enqueue("build_rcm", circular_id, job_id=f"rcm:{uuid.uuid4()}")


async def enqueue_ocr(circular_id: uuid.UUID) -> bool:
    """Queue the OCR job. False means Redis is unreachable — run it inline instead.

    Keyed on the circular, so uploading twice in quick succession cannot start two OCR
    runs over the same document. Re-running later goes through the inline retry
    endpoint, so the cached-result window is not a problem here.
    """
    return await _enqueue("ocr_circular", circular_id, job_id=f"ocr:{circular_id}")


async def _enqueue(task: str, circular_id: uuid.UUID, *, job_id: str) -> bool:
    try:
        pool = await get_pool()
        job = await pool.enqueue_job(task, str(circular_id), _job_id=job_id)
    except Exception as exc:  # noqa: BLE001 — the caller has a fallback path
        global _pool
        _pool = None  # drop the dead pool so the next call reconnects
        log.warning("enqueue_failed", job=task, error=str(exc))
        return False

    if job is None:
        # A job with this id is already queued or running. Nothing to do, and the
        # caller should not treat that as a failure.
        log.info("enqueue_deduplicated", job=task, job_id=job_id)
    return True
