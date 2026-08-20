"""Enqueue side of the job queue (used by the API to hand work to the worker).

Scaffold: exposes a shared Redis pool. Add typed `enqueue_*` helpers here when you
build features that need async processing, e.g.:

    async def enqueue_my_job(arg):
        pool = await get_pool()
        await pool.enqueue_job("my_task", arg)
"""
from __future__ import annotations

from arq import create_pool
from arq.connections import RedisSettings

from app.core.config import settings

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
