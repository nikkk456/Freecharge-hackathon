"""Provider-agnostic LLM access, via LiteLLM.

Everything vendor-specific stops here. `LLM_MODEL=gemini/gemini-3.7-flash` today;
point it at `anthropic/…`, `azure/…` or `ollama/…` and nothing else in the codebase
changes — which is the whole argument for a bank that cannot send regulatory data to
a public API.

Failure is expected, not exceptional: free-tier Gemini returns 503 "high demand"
spikes and 429s under quota. So every call walks a chain — retry the primary model
with exponential backoff, then fall back to the next model — and reports what
actually happened instead of raising a bare exception at a human.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import re
from dataclasses import dataclass
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("ai.client")

# LiteLLM reads provider keys from the environment. Config is our single source of
# truth, so mirror them across once at import.
_KEY_ENV = {
    "GEMINI_API_KEY": settings.gemini_api_key,
    "OPENAI_API_KEY": settings.openai_api_key,
    "ANTHROPIC_API_KEY": settings.anthropic_api_key,
    "AZURE_API_KEY": settings.azure_api_key,
    "AZURE_API_BASE": settings.azure_api_base,
    "AZURE_API_VERSION": settings.azure_api_version,
}
for _name, _value in _KEY_ENV.items():
    if _value:
        os.environ.setdefault(_name, _value)


class LlmUnavailable(Exception):
    """Every model in the chain failed. The message is shown to the human, who can
    still do the work by hand — the AI must never be a hard dependency."""


class LlmBadOutput(Exception):
    """The model answered, but not with usable JSON."""


@dataclass(frozen=True)
class LlmResult:
    data: dict[str, Any]
    model: str
    prompt_tokens: int
    completion_tokens: int
    attempts: int


def is_configured() -> bool:
    """Is there a key for the configured provider? Checked before queuing work so the
    UI can say 'no API key' instead of failing a job 30 seconds later."""
    provider = settings.llm_model.split("/", 1)[0].lower()
    return bool(
        {
            "gemini": settings.gemini_api_key,
            "openai": settings.openai_api_key,
            "anthropic": settings.anthropic_api_key,
            "azure": settings.azure_api_key,
        }.get(provider, True)  # unknown/local providers (ollama) need no key
    )


_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)


def _parse_json(content: str) -> dict[str, Any]:
    """Models occasionally wrap JSON in a markdown fence or add a sentence around it.
    Strip the fence, then fall back to the outermost {...} span."""
    text = _FENCE.sub("", content.strip())
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise LlmBadOutput(f"No JSON object in model output: {content[:200]}") from None
        try:
            parsed = json.loads(text[start : end + 1])
        except json.JSONDecodeError as exc:
            raise LlmBadOutput(f"Model output is not valid JSON: {exc}") from exc

    if not isinstance(parsed, dict):
        raise LlmBadOutput(f"Expected a JSON object, got {type(parsed).__name__}.")
    return parsed


# Errors where trying again — or trying another model — is worth it.
_RETRYABLE = ("ratelimit", "serviceunavailable", "timeout", "internalserver", "apiconnection")


def _is_retryable(exc: Exception) -> bool:
    name = type(exc).__name__.lower()
    return any(marker in name for marker in _RETRYABLE)


async def complete_json(
    *, system: str, user: str, max_tokens: int | None = None
) -> LlmResult:
    """Ask for a JSON object, walking the model chain until one answers.

    Raises LlmUnavailable if every model fails, LlmBadOutput if one answers with
    something that is not JSON.
    """
    if not is_configured():
        raise LlmUnavailable(
            "No API key for the configured model. Set GEMINI_API_KEY in .env "
            f"(current LLM_MODEL is {settings.llm_model})."
        )

    import litellm  # imported lazily: it is slow to import and only the worker needs it

    litellm.suppress_debug_info = True
    litellm.drop_params = True  # silently drop params a given provider does not accept
    # LiteLLM logs a paragraph per call at INFO. Our own structured logs record what
    # matters (model, attempts, outcome); this is just noise in the worker console.
    logging.getLogger("LiteLLM").setLevel(logging.WARNING)

    attempts = 0
    failures: list[str] = []

    for model in settings.llm_model_chain:
        for attempt in range(1, settings.llm_max_attempts + 1):
            attempts += 1
            try:
                response = await litellm.acompletion(
                    model=model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    response_format={"type": "json_object"},
                    temperature=settings.llm_temperature,
                    max_tokens=max_tokens or settings.llm_max_tokens,
                    timeout=settings.llm_timeout_seconds,
                )
            except Exception as exc:  # noqa: BLE001 — LiteLLM raises a wide family
                failures.append(f"{model}: {type(exc).__name__}")
                if _is_retryable(exc) and attempt < settings.llm_max_attempts:
                    # Jittered backoff so parallel jobs do not retry in lockstep.
                    delay = (2**attempt) + random.uniform(0, 1)
                    log.warning(
                        "llm_retry", model=model, attempt=attempt, wait=round(delay, 1),
                        error=type(exc).__name__,
                    )
                    await asyncio.sleep(delay)
                    continue
                log.warning("llm_model_failed", model=model, error=str(exc)[:200])
                break  # move to the next model in the chain

            content = response.choices[0].message.content or ""
            usage = getattr(response, "usage", None)
            log.info("llm_ok", model=model, attempts=attempts)
            return LlmResult(
                data=_parse_json(content),
                model=model,
                prompt_tokens=getattr(usage, "prompt_tokens", 0) or 0,
                completion_tokens=getattr(usage, "completion_tokens", 0) or 0,
                attempts=attempts,
            )

    raise LlmUnavailable(
        "Every configured model failed. The circular can still be reviewed by hand. "
        f"Tried: {'; '.join(failures)}"
    )
