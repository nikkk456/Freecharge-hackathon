"""OCR backends, behind one interface.

Two engines, picked at runtime because their trade-offs are genuinely different:

* **tesseract** — needs a system binary (not pip-installable), but reads the italic
  serif body text RBI uses noticeably better, and can do Devanagari once
  `hin.traineddata` is present. Preferred when available.
* **rapidocr** — pure pip (ONNX Runtime + bundled PaddleOCR models), so it works on
  a fresh machine with zero setup. Slightly weaker on italics.

Both run locally. A regulatory PDF is never shipped to a third-party OCR service —
that is the same data-localisation argument as control C-022, and it is worth being
true rather than merely claimed.
"""
from __future__ import annotations

import logging
import shutil
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.core.config import settings
from app.core.logging import get_logger

if TYPE_CHECKING:  # pragma: no cover - typing only
    from PIL.Image import Image

log = get_logger("circulars.ocr")

INSTALL_HINT = (
    "No OCR engine is available. Install either: "
    "(a) RapidOCR — `pip install rapidocr onnxruntime` (no system install), or "
    "(b) Tesseract — https://github.com/UB-Mannheim/tesseract/wiki, then set "
    "TESSERACT_CMD in .env if it is not on PATH."
)


class OcrUnavailable(Exception):
    """No usable OCR engine — raised with instructions, never silently swallowed."""


@dataclass(frozen=True)
class OcrEngine:
    name: str
    read: Callable[[Image], str]


# ---------------------------------------------------------------------------
# Tesseract
# ---------------------------------------------------------------------------
def _tesseract() -> OcrEngine | None:
    try:
        import pytesseract
    except ImportError:
        return None

    binary = settings.tesseract_cmd or shutil.which("tesseract")
    if not binary:
        return None
    pytesseract.pytesseract.tesseract_cmd = binary

    def read(image: Image) -> str:
        # psm 3 = fully automatic page segmentation, the right mode for a page of prose.
        return pytesseract.image_to_string(
            image, lang=settings.ocr_languages, config="--psm 3"
        )

    return OcrEngine(name="tesseract", read=read)


# ---------------------------------------------------------------------------
# RapidOCR
# ---------------------------------------------------------------------------
_rapid_singleton = None  # model load costs ~1s; do it once per process


def _rapidocr() -> OcrEngine | None:
    global _rapid_singleton
    try:
        import numpy as np
        from rapidocr import RapidOCR
    except ImportError:
        return None

    if _rapid_singleton is None:
        # RapidOCR logs a paragraph of INFO per call; it is noise in our structured logs.
        logging.getLogger("RapidOCR").setLevel(logging.WARNING)
        _rapid_singleton = RapidOCR()

    def read(image: Image) -> str:
        result = _rapid_singleton(np.array(image))
        # RapidOCR returns detected lines already sorted into reading order.
        return "\n".join(result.txts or [])

    return OcrEngine(name="rapidocr", read=read)


_BUILDERS = {"tesseract": _tesseract, "rapidocr": _rapidocr}
# Order matters: tesseract first because it is the more accurate of the two here.
_AUTO_ORDER = ("tesseract", "rapidocr")


def available_engines() -> list[str]:
    return [name for name in _AUTO_ORDER if _BUILDERS[name]() is not None]


def get_engine() -> OcrEngine:
    """Resolve the configured engine, or raise with actionable instructions."""
    if not settings.ocr_enabled:
        raise OcrUnavailable("OCR is disabled (set OCR_ENABLED=true in .env to turn it on).")

    choice = (settings.ocr_engine or "auto").lower()
    if choice != "auto":
        builder = _BUILDERS.get(choice)
        if builder is None:
            raise OcrUnavailable(
                f"OCR_ENGINE='{choice}' is not a known engine. Use auto, tesseract or rapidocr."
            )
        engine = builder()
        if engine is None:
            raise OcrUnavailable(
                f"OCR_ENGINE='{choice}' is configured but not installed. {INSTALL_HINT}"
            )
        return engine

    for name in _AUTO_ORDER:
        engine = _BUILDERS[name]()
        if engine is not None:
            log.info("ocr_engine_selected", engine=name)
            return engine

    raise OcrUnavailable(INSTALL_HINT)
