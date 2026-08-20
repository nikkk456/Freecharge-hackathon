"""ARQ worker entrypoint:  arq app.worker.settings.WorkerSettings

Run as a SEPARATE process from the API — this is the async worker the architecture
reserves for slow/retryable work (e.g. LLM calls) so it never blocks the API.

Scaffold: no tasks are registered yet. Add your worker task functions to `functions`
as you build features.
"""
from __future__ import annotations

from app.core.logging import configure_logging
from app.worker.queue import redis_settings


async def startup(ctx: dict) -> None:
    configure_logging()


class WorkerSettings:
    functions: list = []          # register task callables here as you build them
    on_startup = startup
    redis_settings = redis_settings()
    # Design-for-failure defaults, ready for when you add tasks.
    max_tries = 4
    job_timeout = 300
    keep_result = 3600
    max_jobs = 4
