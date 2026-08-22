"""ARQ worker entrypoint:  arq app.worker.settings.WorkerSettings

Run as a SEPARATE process from the API — this is the async worker the architecture
reserves for slow/retryable work so it never blocks the API.
"""
from __future__ import annotations

from app.core.logging import configure_logging, get_logger
from app.worker.queue import redis_settings
from app.worker.tasks import analyze_circular, ocr_circular

log = get_logger("worker")


async def startup(ctx: dict) -> None:
    configure_logging()
    # Report which OCR engine this process resolved, so a misconfigured worker is
    # obvious at boot instead of at the first scanned upload.
    from app.modules.circulars.ocr import available_engines

    log.info("worker_startup", ocr_engines=available_engines() or ["none"])


class WorkerSettings:
    functions = [ocr_circular, analyze_circular]
    on_startup = startup
    redis_settings = redis_settings()
    # Design-for-failure defaults.
    max_tries = 3
    # OCR runs at seconds per page; the ocr_max_pages cap keeps this bound realistic.
    job_timeout = 900
    keep_result = 3600
    max_jobs = 2  # OCR is CPU-heavy — do not oversubscribe the machine
