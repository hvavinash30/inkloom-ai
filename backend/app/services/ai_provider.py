"""Genuine AI provider pathway.

This module is the only place that talks to a language-model provider. It calls
OpenAI or Gemini over HTTPS when a provider and key are configured server-side,
validates the response, and reports exactly what happened.

Rules this module follows:

* No simulation. When no provider is configured it returns ``not_configured``;
  callers then fall back to deterministic, clearly-labelled output. It never
  fabricates a model response.
* Credentials stay server-side. Keys are read from settings, never logged,
  never returned in a response, and never sent to the browser.
* Bounded. Every call has a timeout, an output-token cap, and an input-char cap
  so cost and latency stay predictable.
* Configurable rate limit. Callers use :func:`allow_request` to throttle the
  expensive AI operations per actor.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Any, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger("inkloom.ai")

# Error kinds surfaced to callers. Callers turn these into honest UI states.
NOT_CONFIGURED = "not_configured"
TIMEOUT = "timeout"
RATE_LIMITED = "rate_limited"
AUTH_ERROR = "auth_error"
PROVIDER_ERROR = "provider_error"
INVALID_RESPONSE = "invalid_response"

OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions"
GEMINI_ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)


@dataclass
class AIResponse:
    ok: bool
    text: str = ""
    provider: str = "none"
    model: str = ""
    error_kind: str = ""
    error_message: str = ""

    @property
    def configured(self) -> bool:
        return self.provider != "none"


def active_provider() -> str:
    """The provider that will actually be called, or 'none'."""
    return settings.ai_provider_name


def is_configured() -> bool:
    return active_provider() != "none"


def _truncate(text: str) -> str:
    limit = max(200, settings.LLM_MAX_INPUT_CHARS)
    if len(text) <= limit:
        return text
    return text[:limit] + "\n\n[Input truncated to fit the configured AI input limit.]"


def _error(kind: str, message: str) -> AIResponse:
    return AIResponse(ok=False, provider=active_provider(), error_kind=kind, error_message=message)


def _post(url: str, *, headers: dict, payload: dict, provider: str) -> AIResponse:
    try:
        with httpx.Client(timeout=settings.LLM_TIMEOUT_SECONDS) as client:
            response = client.post(url, headers=headers, json=payload)
    except httpx.TimeoutException:
        return _error(TIMEOUT, f"The {provider} request timed out after {settings.LLM_TIMEOUT_SECONDS:.0f}s.")
    except httpx.RequestError as exc:  # DNS, TLS, connection reset, etc.
        logger.warning("ai request failed provider=%s error=%s", provider, type(exc).__name__)
        return _error(PROVIDER_ERROR, f"The {provider} service could not be reached.")

    if response.status_code == 429:
        return _error(RATE_LIMITED, f"The {provider} service is rate-limiting requests right now.")
    if response.status_code in (401, 403):
        return _error(AUTH_ERROR, f"The {provider} API key was rejected. Update the server-side key.")
    if response.status_code >= 500:
        return _error(PROVIDER_ERROR, f"The {provider} service returned an error ({response.status_code}).")
    if response.status_code >= 400:
        return _error(PROVIDER_ERROR, f"The {provider} request was rejected ({response.status_code}).")

    try:
        body = response.json()
    except ValueError:
        return _error(INVALID_RESPONSE, f"The {provider} service returned a non-JSON response.")

    text = _extract_text(provider, body)
    if not text:
        return _error(INVALID_RESPONSE, f"The {provider} response did not contain any text.")
    return AIResponse(ok=True, text=text, provider=provider, model=settings.LLM_MODEL)


def _extract_text(provider: str, body: dict) -> str:
    if provider == "openai":
        choices = body.get("choices") or []
        if choices:
            message = choices[0].get("message") or {}
            return (message.get("content") or "").strip()
        return ""
    if provider == "gemini":
        candidates = body.get("candidates") or []
        if candidates:
            parts = (candidates[0].get("content") or {}).get("parts") or []
            return "".join(part.get("text", "") for part in parts).strip()
        return ""
    return ""


def complete(system_prompt: str, user_prompt: str) -> AIResponse:
    """Call the configured provider and return its raw text response."""
    provider = active_provider()
    if provider == "none":
        return _error(
            NOT_CONFIGURED,
            "No AI provider is configured. Set LLM_PROVIDER and the matching API key "
            "in the server environment to enable AI-assisted suggestions.",
        )

    system_prompt = _truncate(system_prompt)
    user_prompt = _truncate(user_prompt)

    if provider == "openai":
        payload = {
            "model": settings.LLM_MODEL,
            "temperature": settings.LLM_TEMPERATURE,
            "max_tokens": settings.LLM_MAX_OUTPUT_TOKENS,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        return _post(
            OPENAI_ENDPOINT,
            headers={
                "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            payload=payload,
            provider=provider,
        )

    if provider == "gemini":
        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": {
                "temperature": settings.LLM_TEMPERATURE,
                "maxOutputTokens": settings.LLM_MAX_OUTPUT_TOKENS,
                "responseMimeType": "application/json",
            },
        }
        return _post(
            GEMINI_ENDPOINT.format(model=settings.LLM_MODEL),
            headers={
                "x-goog-api-key": settings.GEMINI_API_KEY,
                "Content-Type": "application/json",
            },
            payload=payload,
            provider=provider,
        )

    return _error(NOT_CONFIGURED, f"LLM_PROVIDER={provider!r} is not a supported provider.")


def parse_json_object(text: str) -> Optional[dict]:
    """Extract the first JSON object from a model response, tolerating code fences."""
    if not text:
        return None
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```", 2)[1] if cleaned.count("```") >= 2 else cleaned.strip("`")
        cleaned = cleaned.lstrip("json").strip() if cleaned.lower().startswith("json") else cleaned
    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else None
    except ValueError:
        pass
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(cleaned[start : end + 1])
            return parsed if isinstance(parsed, dict) else None
        except ValueError:
            return None
    return None


def _as_str_list(value: Any, limit: int = 6) -> list[str]:
    if not isinstance(value, list):
        return []
    result = []
    for item in value:
        text = str(item).strip()
        if text:
            result.append(text[:300])
        if len(result) >= limit:
            break
    return result


def complete_json(
    system_prompt: str, user_prompt: str, required_keys: tuple[str, ...]
) -> tuple[AIResponse, Optional[dict]]:
    """Call the provider and validate that the response is a JSON object with the keys we need."""
    response = complete(system_prompt, user_prompt)
    if not response.ok:
        return response, None
    parsed = parse_json_object(response.text)
    if parsed is None:
        return (
            AIResponse(
                ok=False,
                provider=response.provider,
                model=response.model,
                error_kind=INVALID_RESPONSE,
                error_message="The AI response was not valid JSON and was discarded.",
            ),
            None,
        )
    missing = [key for key in required_keys if key not in parsed]
    if missing:
        return (
            AIResponse(
                ok=False,
                provider=response.provider,
                model=response.model,
                error_kind=INVALID_RESPONSE,
                error_message=f"The AI response was missing required field(s): {', '.join(missing)}.",
            ),
            None,
        )
    return response, parsed


# ---------------------------------------------------------------------------
# Per-actor request limiter. In-memory and process-local: it bounds cost on one
# instance and is documented as such. It is not a distributed quota.
# ---------------------------------------------------------------------------
_lock = threading.Lock()
_windows: dict[str, deque[float]] = defaultdict(deque)


def allow_request(key: str) -> bool:
    """Record a request for ``key`` and report whether it is within the per-minute limit."""
    limit = max(1, settings.AI_RATE_LIMIT_PER_MINUTE)
    now = time.monotonic()
    with _lock:
        window = _windows[key]
        while window and now - window[0] > 60.0:
            window.popleft()
        if len(window) >= limit:
            return False
        window.append(now)
        return True


def reset_rate_limits() -> None:
    """Clear limiter state. Used by tests."""
    with _lock:
        _windows.clear()


def provider_status() -> dict:
    """A credential-free description of the AI provider, safe for API responses."""
    provider = active_provider()
    return {
        "configured": is_configured(),
        "provider": provider,
        "model": settings.LLM_MODEL if is_configured() else None,
        "reason": settings.ai_status_reason,
    }