"""FastAPI application entrypoint.

    uvicorn app.main:app --reload

Scaffold state: this wires up config, logging, CORS, object-storage bootstrap, and an
empty /api/v1 router. Feature modules plug into `app.api.router`. The synchronous API
and the async ARQ worker (app/worker) are the two runtimes the architecture defines.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.logging import configure_logging, get_logger

log = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    # Best-effort: make sure the object-storage bucket exists on boot.
    try:
        from app.core import storage

        storage.ensure_bucket()
    except Exception as exc:  # noqa: BLE001 — don't block API boot on storage
        log.warning("bucket_ensure_failed", error=str(exc))
    log.info("api_startup", env=settings.app_env)
    yield
    log.info("api_shutdown")


app = FastAPI(
    title="Compliance Advisory Copilot",
    version="0.1.0",
    description="Project scaffold — feature modules plug into /api/v1.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}
