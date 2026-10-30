"""Server-side speech-to-text for extracted video audio.

The provider is configurable (TRANSCRIPTION_PROVIDER) and is called from the API
host only. No key ever reaches the browser and no provider response is invented:
when the provider is unconfigured, rejects the key, times out, or returns no
speech, the outcome says exactly that.

Provider timestamps are preserved as the provider returned them. When a
provider cannot supply timestamps, the transcript is stored without them and
the caller is told, so findings are never attached to invented times.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger("inkloom.speech")

PROVIDER_OPENAI_WHISPER = "openai_whisper"


@dataclass
class SpeechResult:
    status: str  # completed | no_speech | unavailable | failed
    message: str
    text: str = ""
    segments: list[dict] = field(default_factory=list)
    language: Optional[str] = None
    provider: str = ""
    model: str = ""


def speech_available() -> bool:
    return settings.transcription_configured


def _format_timestamp(seconds: float) -> str:
    total = int(max(0, round(seconds)))
    return f"{total // 60:02d}:{total % 60:02d}"


def _endpoint() -> str:
    return f"{settings.TRANSCRIPTION_API_BASE.rstrip('/')}/audio/transcriptions"


def _audio_mime(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".wav":
        return "audio/wav"
    if suffix == ".m4a":
        return "audio/mp4"
    return "audio/mpeg"


def _segments_from_body(body: dict) -> tuple[list[dict], str]:
    segments: list[dict] = []
    raw_segments = body.get("segments")
    if isinstance(raw_segments, list):
        for entry in raw_segments:
            if not isinstance(entry, dict):
                continue
            text = " ".join(str(entry.get("text") or "").split())
            if not text:
                continue
            try:
                start = max(0.0, float(entry.get("start") or 0.0))
            except (TypeError, ValueError):
                start = 0.0
            segments.append(
                {
                    "timestamp_seconds": round(start, 2),
                    "text": text,
                    "timestamp_label": _format_timestamp(start),
                }
            )
    text = str(body.get("text") or "").strip()
    if not text and segments:
        text = " ".join(segment["text"] for segment in segments)
    language = body.get("language")
    return segments, text


def _call_provider(path: Path, *, response_format: str) -> tuple[Optional[httpx.Response], Optional[SpeechResult]]:
    headers = {"Authorization": f"Bearer {settings.transcription_api_key}"}
    data = {"model": settings.TRANSCRIPTION_MODEL, "response_format": response_format}
    if settings.TRANSCRIPTION_LANGUAGE.strip():
        data["language"] = settings.TRANSCRIPTION_LANGUAGE.strip()
    try:
        with httpx.Client(timeout=settings.TRANSCRIPTION_TIMEOUT_SECONDS) as client:
            with path.open("rb") as handle:
                response = client.post(
                    _endpoint(),
                    headers=headers,
                    data=data,
                    files={"file": (path.name, handle, _audio_mime(path))},
                )
    except httpx.TimeoutException:
        return None, SpeechResult(
            status="failed",
            provider=PROVIDER_OPENAI_WHISPER,
            model=settings.TRANSCRIPTION_MODEL,
            message=(
                "The speech-to-text provider did not respond within "
                f"{int(settings.TRANSCRIPTION_TIMEOUT_SECONDS)}s. "
                "Try again, shorten the clip, or supply a transcript."
            ),
        )
    except httpx.RequestError as exc:
        logger.warning("speech request failed provider=%s error=%s", PROVIDER_OPENAI_WHISPER, type(exc).__name__)
        return None, SpeechResult(
            status="failed",
            provider=PROVIDER_OPENAI_WHISPER,
            model=settings.TRANSCRIPTION_MODEL,
            message="The speech-to-text provider could not be reached from this server.",
        )
    return response, None


def _error_result(response: httpx.Response) -> SpeechResult:
    base = SpeechResult(
        status="failed",
        provider=PROVIDER_OPENAI_WHISPER,
        model=settings.TRANSCRIPTION_MODEL,
        message="",
    )
    if response.status_code == 429:
        base.message = "The speech-to-text provider is rate-limiting requests. Try again shortly."
    elif response.status_code in (401, 403):
        base.message = (
            "The speech-to-text provider rejected the server-side API key. "
            "Update TRANSCRIPTION_API_KEY (or OPENAI_API_KEY) and restart the API."
        )
    elif response.status_code == 413:
        base.message = "The extracted audio was too large for the speech-to-text provider."
    elif response.status_code >= 500:
        base.message = f"The speech-to-text provider returned an error ({response.status_code})."
    elif response.status_code == 400:
        base.message = "The speech-to-text provider rejected the request (400). Check the model name and audio format."
    else:
        base.message = f"The speech-to-text request was rejected ({response.status_code})."
    logger.warning(
        "speech provider rejected request status=%s provider=%s",
        response.status_code,
        PROVIDER_OPENAI_WHISPER,
    )
    return base


def transcribe_audio(path: Path) -> SpeechResult:
    """Transcribe one extracted audio file. Never invents text or timestamps."""
    if not speech_available():
        return SpeechResult(
            status="unavailable",
            provider=PROVIDER_OPENAI_WHISPER,
            model=settings.TRANSCRIPTION_MODEL,
            message=settings.transcription_status_reason,
        )
    if settings.TRANSCRIPTION_PROVIDER != PROVIDER_OPENAI_WHISPER:
        return SpeechResult(
            status="unavailable",
            message=(
                f"TRANSCRIPTION_PROVIDER={settings.TRANSCRIPTION_PROVIDER!r} is not a supported "
                "provider. Use 'openai_whisper' with an OpenAI-compatible transcription endpoint."
            ),
        )
    try:
        size = path.stat().st_size
    except OSError:
        return SpeechResult(
            status="failed",
            message="The extracted audio file is missing on the server.",
        )
    if size <= 0:
        return SpeechResult(
            status="failed",
            message="Audio extraction produced an empty file, so nothing was sent for transcription.",
        )
    if size > settings.TRANSCRIPTION_MAX_AUDIO_BYTES:
        return SpeechResult(
            status="failed",
            message=(
                "The extracted audio is "
                f"{size / (1024 * 1024):.1f} MB, above the {settings.TRANSCRIPTION_MAX_AUDIO_BYTES // (1024 * 1024)} MB "
                "speech-to-text limit. Shorten the clip or supply a transcript."
            ),
        )

    response, failure = _call_provider(path, response_format="verbose_json")
    if failure is not None:
        return failure
    assert response is not None
    if response.status_code >= 400:
        # Some OpenAI-compatible endpoints do not implement verbose_json. Retry
        # once without timestamps and report that limitation instead of failing.
        if response.status_code == 400:
            retry, retry_failure = _call_provider(path, response_format="json")
            if retry_failure is not None:
                return retry_failure
            assert retry is not None
            if retry.status_code < 400:
                try:
                    body = retry.json()
                except ValueError:
                    return SpeechResult(
                        status="failed",
                        message="The speech-to-text provider returned a non-JSON response.",
                    )
                text = str(body.get("text") or "").strip()
                if not text:
                    return SpeechResult(
                        status="no_speech",
                        message="The provider ran on this audio but detected no speech.",
                    )
                return SpeechResult(
                    status="completed",
                    text=text,
                    segments=[],
                    language=body.get("language"),
                    provider=PROVIDER_OPENAI_WHISPER,
                    model=settings.TRANSCRIPTION_MODEL,
                    message=(
                        "Speech was transcribed, but the provider did not return word or segment "
                        "timestamps, so spoken findings have no video time reference."
                    ),
                )
            return _error_result(retry)
        return _error_result(response)

    try:
        body = response.json()
    except ValueError:
        return SpeechResult(
            status="failed",
            message="The speech-to-text provider returned a non-JSON response.",
        )
    segments, text = _segments_from_body(body)
    if not text:
        return SpeechResult(
            status="no_speech",
            provider=PROVIDER_OPENAI_WHISPER,
            model=settings.TRANSCRIPTION_MODEL,
            message="The provider ran on this audio but detected no speech.",
        )
    if segments:
        message = (
            f"Transcribed {len(segments)} timestamped segment(s) with "
            f"{settings.TRANSCRIPTION_MODEL}."
        )
    else:
        message = (
            "Speech was transcribed, but the provider did not return segment timestamps, "
            "so spoken findings have no video time reference."
        )
    return SpeechResult(
        status="completed",
        text=text,
        segments=segments,
        language=body.get("language"),
        provider=PROVIDER_OPENAI_WHISPER,
        model=settings.TRANSCRIPTION_MODEL,
        message=message,
    )
