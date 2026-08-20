"""Aggregate every module router under /api/v1.

This is the seam where feature modules plug in. It is intentionally empty in the
scaffold — add a module's router here when you build it, e.g.:

    from app.modules.<feature>.router import router as feature_router
    api_router.include_router(feature_router)
"""
from __future__ import annotations

from fastapi import APIRouter

api_router = APIRouter(prefix="/api/v1")

# Feature routers get included here as you build each module.
