"""Aggregate every module router under /api/v1.

This is the seam where feature modules plug in. It is intentionally empty in the
scaffold — add a module's router here when you build it, e.g.:

    from app.modules.<feature>.router import router as feature_router
    api_router.include_router(feature_router)
"""
from __future__ import annotations

from fastapi import APIRouter

from app.modules.analysis.router import llm_router
from app.modules.analysis.router import router as analysis_router
from app.modules.circulars.router import router as circulars_router
from app.modules.library.router import router as library_router

api_router = APIRouter(prefix="/api/v1")

# Feature routers get included here as you build each module.
api_router.include_router(library_router)
api_router.include_router(circulars_router)
api_router.include_router(analysis_router)
api_router.include_router(llm_router)
