"""Automatic video processing: metadata, audio, speech, frames, on-screen text.

The pipeline runs in a bounded background thread and persists every stage to
``video_extractions`` so the UI can poll real state after a refresh. Speech and
visual stages are independent: a failed or unconfigured stage never erases the
other stage's results, and the combined status says which stage is missing.

Nothing here simulates a provider. FFmpeg is a real local binary (configured,
system, or bundled by imageio-ffmpeg), OCR is the local RapidOCR engine, and
speech comes from the configured provider via :mod:`speech_service`.
"""
from __future__ import annotations

import logging
import re
import shutil
import subprocess
import threading
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import HTTPException
from PIL import Image
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.assets import UploadedFile, VideoExtraction
from app.services import ocr_service, speech_service

logger = logging.getLogger("inkloom.video")

ACTIVE_STATUSES = {"queued", "processing"}
FINAL_STATUSES = {"completed", "partial", "no_content", "failed", "canceled"}

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="inkloom-video")
_inflight: dict[str, Future] = {}
_lock = threading.Lock()

_ffmpeg_cache: Optional[dict] = None


# ---------------------------------------------------------------------------
# FFmpeg resolution and probing
# ---------------------------------------------------------------------------
def _run(command: list[str], *, timeout: float) -> subprocess.CompletedProcess:
    kwargs: dict = {
        "capture_output": True,
        "timeout": max(1.0, timeout),
        "check": False,
    }
    if hasattr(subprocess, "CREATE_NO_WINDOW"):
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
    return subprocess.run(command, **kwargs)


def ffmpeg_status(*, refresh: bool = False) -> dict:
    """Describe the actual FFmpeg binary that will be used. No secrets involved."""
    global _ffmpeg_cache
    if _ffmpeg_cache is not None and not refresh:
        return _ffmpeg_cache

    source = ""
    path: Optional[str] = None
    configured = (settings.FFMPEG_PATH or "").strip()
    if configured:
        source = "configured"
        path = configured if Path(configured).exists() else None
    if path is None and not configured:
        found = shutil.which("ffmpeg")
        if found:
            source = "system"
            path = found
    if path is None and not configured:
        try:
            import imageio_ffmpeg

            path = imageio_ffmpeg.get_ffmpeg_exe()
            source = "bundled"
        except Exception:
            path = None
    if path is None:
        _ffmpeg_cache = {
            "available": False,
            "source": source or "none",
            "version": None,
            "message": (
                f"FFMPEG_PATH points at a binary that does not exist ({configured})."
                if configured
                else (
                    "FFmpeg is not available on this server. Install FFmpeg, install the "
                    "'imageio-ffmpeg' package, or set FFMPEG_PATH. Audio and frame extraction "
                    "cannot run without it."
                )
            ),
        }
        return _ffmpeg_cache

    version = None
    try:
        result = _run([path, "-version"], timeout=10)
        first_line = (result.stdout or b"").decode("utf-8", "replace").splitlines()[:1]
        if first_line:
            match = re.search(r"ffmpeg version (\S+)", first_line[0])
            version = match.group(1) if match else first_line[0][:80]
        available = result.returncode == 0
    except Exception:
        available = False
    _ffmpeg_cache = {
        "available": available,
        "source": source or "none",
        "version": version,
        "message": (
            f"FFmpeg {version or ''} is available ({source}).".strip()
            if available
            else "The configured FFmpeg binary could not be executed on this server."
        ),
    }
    return _ffmpeg_cache


def _ffmpeg_binary() -> Optional[str]:
    status = ffmpeg_status()
    if not status["available"]:
        return None
    configured = (settings.FFMPEG_PATH or "").strip()
    if configured:
        return configured
    return shutil.which("ffmpeg") or _bundled_binary()


def _bundled_binary() -> Optional[str]:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


DURATION_RE = re.compile(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)")
VIDEO_STREAM_RE = re.compile(r"Stream #\d+:\d+.*?: Video:")
AUDIO_STREAM_RE = re.compile(r"Stream #\d+:\d+.*?: Audio:")


@dataclass
class MediaInfo:
    ok: bool
    message: str
    duration_seconds: Optional[float] = None
    has_video: bool = False
    has_audio: bool = False


def probe_video(path: Path, *, timeout: float = 30.0) -> MediaInfo:
    binary = _ffmpeg_binary()
    if not binary:
        return MediaInfo(ok=False, message=ffmpeg_status()["message"])
    try:
        result = _run([binary, "-hide_banner", "-i", str(path)], timeout=timeout)
    except subprocess.TimeoutExpired:
        return MediaInfo(ok=False, message="Reading the video metadata timed out.")
    except Exception as exc:  # noqa: BLE001 - reported by type only
        return MediaInfo(ok=False, message=f"The video metadata could not be read ({type(exc).__name__}).")

    output = (result.stderr or b"").decode("utf-8", "replace")
    duration_match = DURATION_RE.search(output)
    has_video = bool(VIDEO_STREAM_RE.search(output))
    has_audio = bool(AUDIO_STREAM_RE.search(output))
    if not duration_match or not has_video:
        return MediaInfo(
            ok=False,
            message=(
                "The file could not be read as a video. It may be corrupt or use a container "
                "or codec this server cannot decode."
            ),
        )
    hours, minutes, seconds = duration_match.groups()
    duration = int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    return MediaInfo(
        ok=True,
        message="Video metadata read.",
        duration_seconds=round(duration, 2),
        has_video=has_video,
        has_audio=has_audio,
    )


def sniff_video_container(path: Path) -> Optional[str]:
    """Check the stored bytes look like an ISO-BMFF or EBML video container."""
    try:
        with path.open("rb") as handle:
            head = handle.read(64)
    except OSError:
        return None
    if len(head) < 12:
        return None
    if b"ftyp" in head[:36]:
        brand = head[8:12]
        return "mov" if brand == b"qt  " else "mp4"
    if head[:4] == b"\x1aE\xdf\xa3":
        return "webm"
    return None


# ---------------------------------------------------------------------------
# Audio extraction and frame sampling
# ---------------------------------------------------------------------------
def extract_audio(source: Path, destination: Path, *, timeout: float) -> tuple[bool, str]:
    binary = _ffmpeg_binary()
    if not binary:
        return False, ffmpeg_status()["message"]
    attempts = [
        (".mp3", ["-ac", "1", "-ar", "16000", "-b:a", "48k", "-f", "mp3"]),
        (".wav", ["-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-f", "wav"]),
    ]
    last_message = ""
    for suffix, codec_args in attempts:
        target = destination.with_suffix(suffix)
        command = [
            binary, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
            "-i", str(source), "-vn", *codec_args, str(target),
        ]
        try:
            result = _run(command, timeout=timeout)
        except subprocess.TimeoutExpired:
            return False, "Audio extraction timed out."
        if result.returncode == 0 and target.exists() and target.stat().st_size > 0:
            if target != destination:
                target.replace(destination)
            return True, "Audio extracted."
        last_message = (result.stderr or b"").decode("utf-8", "replace").strip()[:300]
        target.unlink(missing_ok=True)
    return False, f"Audio could not be extracted from this video. {last_message}".strip()


def plan_frame_times(duration_seconds: float) -> list[float]:
    """Choose representative timestamps without exceeding the configured cap."""
    if duration_seconds <= 0:
        return [0.0]
    interval = max(1.0, float(settings.VIDEO_FRAME_INTERVAL_SECONDS))
    max_frames = max(1, int(settings.VIDEO_MAX_FRAMES))
    step = max(interval, duration_seconds / max_frames)
    times: list[float] = []
    index = 0
    while len(times) < max_frames:
        timestamp = round(index * step, 2)
        if timestamp >= duration_seconds:
            break
        times.append(timestamp)
        index += 1
    if not times:
        times = [0.0]
    return times


def _format_timestamp(seconds: float) -> str:
    total = int(max(0, round(seconds)))
    return f"{total // 60:02d}:{total % 60:02d}"


def _frame_file_name(index: int, timestamp: float) -> str:
    return f"frame_{index:03d}_{_format_timestamp(timestamp).replace(':', '-')}.jpg"


def _extract_frame(source: Path, destination: Path, timestamp: float, *, timeout: float) -> bool:
    binary = _ffmpeg_binary()
    if not binary:
        return False
    destination.parent.mkdir(parents=True, exist_ok=True)
    command = [
        binary, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        "-ss", f"{timestamp:.3f}", "-i", str(source),
        "-frames:v", "1", "-q:v", "3", "-f", "image2", str(destination),
    ]
    try:
        result = _run(command, timeout=timeout)
    except subprocess.TimeoutExpired:
        return False
    return result.returncode == 0 and destination.exists() and destination.stat().st_size > 0


def _prepare_frame_image(path: Path) -> Image.Image:
    with Image.open(path) as probe:
        probe.load()
        image = probe.convert("RGB")
    max_width = max(240, int(settings.VIDEO_FRAME_MAX_WIDTH))
    if image.width > max_width:
        height = max(1, round(image.height * max_width / image.width))
        image = image.resize((max_width, height), Image.LANCZOS)
    image.save(path, format="JPEG", quality=85, optimize=True)
    return image


# ---------------------------------------------------------------------------
# Persistence helpers
# ---------------------------------------------------------------------------
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _frames_dir(upload_id: str) -> Path:
    return settings.upload_path / "frames" / upload_id


def _clear_frames(upload_id: str) -> None:
    shutil.rmtree(_frames_dir(upload_id), ignore_errors=True)


def extraction_row(db: Session, upload_id: str) -> Optional[VideoExtraction]:
    return (
        db.query(VideoExtraction)
        .filter(VideoExtraction.upload_id == upload_id)
        .first()
    )


def _cancel_requested(upload_id: str) -> bool:
    with SessionLocal() as probe:
        flag = (
            probe.query(VideoExtraction.cancel_requested)
            .filter(VideoExtraction.upload_id == upload_id)
            .scalar()
        )
    return bool(flag)


def _set_stage(extraction: VideoExtraction, name: str, status: str, message: str, **extra) -> None:
    stages = dict(extraction.stages or {})
    stage = {"status": status, "message": message}
    stage.update(extra)
    stages[name] = stage
    extraction.stages = stages


def _sync_upload_summary(upload: UploadedFile, extraction: VideoExtraction) -> None:
    mapping = {
        "queued": "processing",
        "processing": "processing",
        "completed": "processed",
        "partial": "partial",
        "no_content": "no_text",
        "failed": "error",
        "canceled": "canceled",
    }
    upload.extraction_status = mapping.get(extraction.status, upload.extraction_status)
    upload.extraction_message = extraction.message or upload.extraction_message


# ---------------------------------------------------------------------------
# Job control
# ---------------------------------------------------------------------------
def start_processing(db: Session, upload: UploadedFile) -> Optional[VideoExtraction]:
    """Create the extraction row for a freshly stored video and queue it."""
    if upload.kind != "video":
        return None
    extraction = extraction_row(db, upload.id)
    if extraction is not None:
        if extraction.status in ACTIVE_STATUSES:
            return extraction
        return extraction
    extraction = VideoExtraction(
        upload_id=upload.id,
        workspace_id=upload.workspace_id,
        status="queued",
        stages={},
        transcript_status="pending",
        frames=[],
        attempt=1,
    )
    db.add(extraction)
    upload.extraction_status = "processing"
    upload.extraction_message = (
        "Video stored. Automatic speech and on-screen text analysis is queued."
    )
    db.commit()
    db.refresh(extraction)
    _submit(upload.id)
    return extraction


def retry_processing(
    db: Session, upload: UploadedFile, *, rerun_speech: bool = False
) -> VideoExtraction:
    if upload.kind != "video":
        raise HTTPException(status_code=400, detail="Only video uploads can be reprocessed.")
    extraction = extraction_row(db, upload.id)
    if extraction and extraction.status in ACTIVE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail="This video is already being processed. Wait for it to finish or cancel it first.",
        )
    if extraction is None:
        extraction = VideoExtraction(
            upload_id=upload.id,
            workspace_id=upload.workspace_id,
            status="queued",
            stages={},
            transcript_status="pending",
            frames=[],
            attempt=1,
        )
        db.add(extraction)
    else:
        keep_transcript = (
            not rerun_speech
            and extraction.transcript_status == "completed"
            and bool(extraction.transcript_text or extraction.transcript_segments)
        )
        previous_stages = dict(extraction.stages or {})
        extraction.attempt = (extraction.attempt or 1) + 1
        extraction.status = "queued"
        extraction.message = f"Reprocessing queued (attempt {extraction.attempt})."
        if keep_transcript:
            extraction.stages = (
                {"speech": previous_stages["speech"]} if "speech" in previous_stages else {}
            )
        else:
            extraction.stages = {}
            extraction.transcript_status = "pending"
            extraction.transcript_message = None
            extraction.transcript_text = None
            extraction.transcript_segments = []
            extraction.transcription_provider = None
            extraction.transcription_model = None
            extraction.language = None
        extraction.frame_count = 0
        extraction.frames_read = 0
        extraction.frames = []
        extraction.onscreen_text = None
        extraction.cancel_requested = False
        extraction.started_at = None
        extraction.finished_at = None
        extraction.duration_seconds = None
        extraction.audio_present = None
    upload.extraction_status = "processing"
    upload.extraction_message = "Video reprocessing queued."
    _clear_frames(upload.id)
    db.commit()
    db.refresh(extraction)
    _submit(upload.id)
    return extraction


def request_cancel(db: Session, upload: UploadedFile) -> VideoExtraction:
    extraction = extraction_row(db, upload.id)
    if extraction is None or extraction.status not in ACTIVE_STATUSES:
        raise HTTPException(status_code=409, detail="This video is not currently being processed.")
    if extraction.status == "queued" and upload.id not in _inflight:
        extraction.status = "canceled"
        extraction.message = "Processing was canceled before it started."
        extraction.finished_at = _now()
        _set_stage(extraction, "pipeline", "canceled", extraction.message)
        _sync_upload_summary(upload, extraction)
    else:
        extraction.cancel_requested = True
        extraction.message = "Cancellation requested. The current step will stop shortly."
    db.commit()
    db.refresh(extraction)
    return extraction


def _submit(upload_id: str) -> None:
    with _lock:
        future = _inflight.get(upload_id)
        if future is not None and not future.done():
            return
        _inflight[upload_id] = _executor.submit(_run_job, upload_id)


def _finish_canceled(db: Session, upload: UploadedFile, extraction: VideoExtraction) -> None:
    extraction.status = "canceled"
    extraction.message = extraction.message or "Processing was canceled."
    extraction.finished_at = _now()
    _set_stage(extraction, "pipeline", "canceled", extraction.message)
    _sync_upload_summary(upload, extraction)
    db.commit()


def _run_job(upload_id: str) -> None:
    db = SessionLocal()
    try:
        upload = db.query(UploadedFile).filter(UploadedFile.id == upload_id).first()
        extraction = extraction_row(db, upload_id)
        if upload is None or extraction is None:
            return
        if extraction.status == "canceled" or extraction.cancel_requested:
            _finish_canceled(db, upload, extraction)
            return
        extraction.status = "processing"
        extraction.started_at = _now()
        extraction.finished_at = None
        extraction.message = "Processing started."
        upload.extraction_status = "processing"
        upload.extraction_message = "Video analysis is running."
        db.commit()
        _process_upload(db, upload, extraction)
    except Exception as exc:  # noqa: BLE001 - recorded, never silently dropped
        logger.exception("video processing failed upload=%s error=%s", upload_id, type(exc).__name__)
        try:
            db.rollback()
            extraction = extraction_row(db, upload_id)
            upload = db.query(UploadedFile).filter(UploadedFile.id == upload_id).first()
            if extraction and upload:
                extraction.status = "failed"
                extraction.message = (
                    "Video processing stopped unexpectedly. Existing stage results are kept; "
                    "retry to run it again."
                )
                extraction.finished_at = _now()
                _set_stage(extraction, "pipeline", "failed", extraction.message)
                _sync_upload_summary(upload, extraction)
                db.commit()
        except Exception:
            logger.exception("could not record video failure upload=%s", upload_id)
    finally:
        db.close()
        with _lock:
            _inflight.pop(upload_id, None)


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------
def _fail_both(
    db: Session,
    upload: UploadedFile,
    extraction: VideoExtraction,
    *,
    message: str,
    stage_name: str = "pipeline",
) -> None:
    extraction.status = "failed"
    extraction.message = message
    extraction.finished_at = _now()
    _set_stage(extraction, stage_name, "failed", message)
    if stage_name != "speech":
        extraction.transcript_status = "failed"
        extraction.transcript_message = message
    if stage_name != "visual":
        _set_stage(extraction, "visual", "skipped", "Skipped because the video could not be read.")
    _sync_upload_summary(upload, extraction)
    db.commit()


def _process_upload(db: Session, upload: UploadedFile, extraction: VideoExtraction) -> None:
    deadline = time.monotonic() + max(30.0, float(settings.VIDEO_PROCESSING_TIMEOUT_SECONDS))

    base = settings.upload_path.resolve()
    source = (base / upload.stored_name).resolve()
    if base not in source.parents or not source.exists():
        _fail_both(
            db,
            upload,
            extraction,
            message=(
                "The stored video file is no longer available on this server. "
                "Upload the video again; nothing was analyzed."
            ),
            stage_name="probe",
        )
        return

    if not ffmpeg_status()["available"]:
        _fail_both(
            db,
            upload,
            extraction,
            message=ffmpeg_status()["message"],
            stage_name="probe",
        )
        return

    probe = probe_video(source)
    if not probe.ok:
        _fail_both(db, upload, extraction, message=probe.message, stage_name="probe")
        return

    duration = probe.duration_seconds or 0.0
    extraction.duration_seconds = duration
    extraction.audio_present = probe.has_audio
    _set_stage(
        extraction,
        "probe",
        "completed",
        f"Video read: {_format_timestamp(duration)} long, "
        f"{'with' if probe.has_audio else 'without'} an audio track.",
        duration_seconds=duration,
        has_audio=probe.has_audio,
    )
    db.commit()

    if duration > float(settings.VIDEO_MAX_DURATION_SECONDS):
        limit_minutes = int(float(settings.VIDEO_MAX_DURATION_SECONDS) // 60)
        _set_stage(
            extraction,
            "speech",
            "skipped",
            f"Skipped: the video is longer than the {limit_minutes}-minute processing limit.",
        )
        _set_stage(
            extraction,
            "visual",
            "skipped",
            f"Skipped: the video is longer than the {limit_minutes}-minute processing limit.",
        )
        extraction.transcript_status = "failed"
        extraction.transcript_message = (
            f"The video is {_format_timestamp(duration)}, above the {limit_minutes}-minute "
            "automatic processing limit. Shorten the clip or supply a transcript."
        )
        extraction.status = "failed"
        extraction.message = extraction.transcript_message
        extraction.finished_at = _now()
        _sync_upload_summary(upload, extraction)
        db.commit()
        return

    if extraction.cancel_requested:
        _finish_canceled(db, upload, extraction)
        return

    speech_ok, speech_has_text = _run_speech_stage(
        db, upload, extraction, source, deadline=deadline
    )
    if extraction.cancel_requested:
        _finish_canceled(db, upload, extraction)
        return

    visual_ok, visual_has_text = _run_visual_stage(
        db, upload, extraction, source, duration=duration, deadline=deadline
    )
    if extraction.cancel_requested:
        _finish_canceled(db, upload, extraction)
        return

    _finalize(db, upload, extraction, speech_ok=speech_ok, speech_has_text=speech_has_text,
              visual_ok=visual_ok, visual_has_text=visual_has_text)


def _run_speech_stage(
    db: Session,
    upload: UploadedFile,
    extraction: VideoExtraction,
    source: Path,
    *,
    deadline: float,
) -> tuple[bool, bool]:
    """Returns (stage_completed_or_no_audio, produced_text)."""
    if (
        extraction.transcript_status == "completed"
        and (extraction.transcript_text or extraction.transcript_segments)
    ):
        message = "The existing transcript was kept; speech was not sent to the provider again."
        _set_stage(
            extraction,
            "speech",
            "completed",
            message,
            segment_count=len(extraction.transcript_segments or []),
            provider=extraction.transcription_provider,
            model=extraction.transcription_model,
        )
        db.commit()
        return True, True
    if not extraction.audio_present:
        message = "The video has no audio track, so there is no speech to transcribe."
        extraction.transcript_status = "no_audio"
        extraction.transcript_message = message
        _set_stage(extraction, "speech", "no_audio", message)
        db.commit()
        return True, False
    if not settings.transcription_configured:
        reason = settings.transcription_status_reason
        extraction.transcript_status = "unavailable"
        extraction.transcript_message = reason
        _set_stage(extraction, "speech", "unavailable", reason)
        db.commit()
        return False, False

    extraction.transcript_status = "running"
    extraction.transcript_message = "Extracting audio and transcribing speech."
    _set_stage(extraction, "speech", "running", "Extracting audio for transcription.")
    db.commit()

    tmp_dir = settings.upload_path / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    audio_path = tmp_dir / f"{upload.id}-{uuid.uuid4().hex}.mp3"
    remaining = max(5.0, deadline - time.monotonic())
    try:
        ok, message = extract_audio(
            source, audio_path, timeout=min(remaining, 180.0)
        )
        if not ok:
            extraction.transcript_status = "failed"
            extraction.transcript_message = message
            _set_stage(extraction, "speech", "failed", message)
            db.commit()
            return False, False
        if extraction.cancel_requested:
            return False, False
        _set_stage(extraction, "speech", "running", "Audio extracted; transcribing speech.")
        db.commit()

        speech = speech_service.transcribe_audio(audio_path)
        if speech.status == "completed":
            extraction.transcript_status = "completed"
            extraction.transcript_text = speech.text
            extraction.transcript_segments = speech.segments
            extraction.transcription_provider = speech.provider or None
            extraction.transcription_model = speech.model or None
            extraction.language = speech.language
            extraction.transcript_message = speech.message
            _set_stage(
                extraction,
                "speech",
                "completed",
                speech.message,
                segment_count=len(speech.segments),
                provider=speech.provider or None,
                model=speech.model or None,
            )
            db.commit()
            return True, True
        if speech.status == "no_speech":
            extraction.transcript_status = "no_speech"
            extraction.transcript_message = speech.message
            _set_stage(extraction, "speech", "no_speech", speech.message)
            db.commit()
            return True, False
        status = "unavailable" if speech.status == "unavailable" else "failed"
        extraction.transcript_status = status
        extraction.transcript_message = speech.message
        _set_stage(extraction, "speech", status, speech.message)
        db.commit()
        return False, False
    finally:
        audio_path.unlink(missing_ok=True)


def _run_visual_stage(
    db: Session,
    upload: UploadedFile,
    extraction: VideoExtraction,
    source: Path,
    *,
    duration: float,
    deadline: float,
) -> tuple[bool, bool]:
    """Returns (stage_completed, produced_text)."""
    if not ocr_service.ocr_available():
        reason = settings.ocr_status_reason
        _set_stage(extraction, "visual", "unavailable", reason)
        db.commit()
        return False, False

    times = plan_frame_times(duration)
    extraction.frame_count = len(times)
    extraction.frames_read = 0
    extraction.frames = []
    extraction.onscreen_text = None
    _set_stage(
        extraction,
        "visual",
        "running",
        f"Reading on-screen text from {len(times)} sampled frame(s).",
        frame_count=len(times),
        frames_read=0,
    )
    db.commit()

    frame_dir = _frames_dir(upload.id)
    _clear_frames(upload.id)
    frame_dir.mkdir(parents=True, exist_ok=True)

    frames: list[dict] = []
    onscreen_occurrences: list[dict] = []
    last_text = ""
    failures = 0

    for index, timestamp in enumerate(times):
        if extraction.cancel_requested:
            return False, bool(onscreen_occurrences)
        if time.monotonic() > deadline:
            _set_stage(
                extraction,
                "visual",
                "failed",
                (
                    "Frame analysis stopped at the processing time limit after "
                    f"{len(frames)} of {len(times)} frame(s)."
                ),
                frame_count=len(times),
                frames_read=len(frames),
            )
            extraction.frames = frames
            extraction.frames_read = sum(1 for frame in frames if frame.get("text"))
            db.commit()
            return False, bool(onscreen_occurrences)

        file_name = _frame_file_name(index, timestamp)
        frame_path = frame_dir / file_name
        remaining = max(5.0, deadline - time.monotonic())
        extracted = _extract_frame(source, frame_path, timestamp, timeout=min(remaining, 60.0))
        if not extracted:
            failures += 1
            frames.append(
                {
                    "timestamp_seconds": timestamp,
                    "timestamp_label": _format_timestamp(timestamp),
                    "file_name": None,
                    "text": "",
                    "line_count": 0,
                    "mean_confidence": None,
                    "error": "This frame could not be extracted.",
                }
            )
            continue

        try:
            image = _prepare_frame_image(frame_path)
        except Exception:
            failures += 1
            frame_path.unlink(missing_ok=True)
            frames.append(
                {
                    "timestamp_seconds": timestamp,
                    "timestamp_label": _format_timestamp(timestamp),
                    "file_name": None,
                    "text": "",
                    "line_count": 0,
                    "mean_confidence": None,
                    "error": "This frame could not be decoded.",
                }
            )
            continue

        try:
            outcome = ocr_service.ocr_image(image)
        except Exception as exc:  # noqa: BLE001 - reported per frame
            outcome = ocr_service.OcrOutcome(
                status="error",
                message=f"OCR failed for this frame: {type(exc).__name__}.",
            )
        text = (outcome.text or "").strip()
        if outcome.status == "processed" and len(text) >= max(1, int(settings.VIDEO_MIN_FRAME_TEXT_CHARS)):
            frame_entry = {
                "timestamp_seconds": timestamp,
                "timestamp_label": _format_timestamp(timestamp),
                "file_name": file_name,
                "text": text,
                "line_count": len(outcome.lines),
                "mean_confidence": outcome.mean_confidence,
                "error": None,
            }
            normalized = " ".join(text.split()).lower()
            if normalized and normalized != last_text:
                onscreen_occurrences.append(
                    {
                        "timestamp_seconds": timestamp,
                        "timestamp_label": _format_timestamp(timestamp),
                        "text": text,
                        "file_name": file_name,
                    }
                )
            if normalized:
                last_text = normalized
        else:
            frame_entry = {
                "timestamp_seconds": timestamp,
                "timestamp_label": _format_timestamp(timestamp),
                "file_name": file_name,
                "text": "",
                "line_count": len(outcome.lines),
                "mean_confidence": outcome.mean_confidence,
                "error": None if outcome.status in {"processed", "no_text"} else outcome.message[:200],
            }
            if outcome.status not in {"processed", "no_text"}:
                failures += 1
        frames.append(frame_entry)
        extraction.frames = list(frames)
        extraction.frames_read = sum(1 for frame in frames if frame.get("text"))
        db.commit()

    extraction.frames = frames
    extraction.frames_read = sum(1 for frame in frames if frame.get("text"))
    extraction.onscreen_text = "\n".join(item["text"] for item in onscreen_occurrences) or None

    if failures and failures == len(times):
        message = "None of the sampled frames could be read automatically."
        _set_stage(
            extraction,
            "visual",
            "failed",
            message,
            frame_count=len(times),
            frames_read=0,
        )
        db.commit()
        return False, False

    if extraction.frames_read:
        message = (
            f"Read on-screen text on {extraction.frames_read} of {len(times)} sampled frame(s)."
        )
        if failures:
            message += f" {failures} frame(s) could not be read and were skipped."
        _set_stage(
            extraction,
            "visual",
            "completed",
            message,
            frame_count=len(times),
            frames_read=extraction.frames_read,
        )
        db.commit()
        return True, bool(onscreen_occurrences)

    message = (
        f"OCR read {len(times)} sampled frame(s) and found no visible text. "
        "No on-screen findings were produced."
    )
    _set_stage(
        extraction,
        "visual",
        "completed",
        message,
        frame_count=len(times),
        frames_read=0,
    )
    db.commit()
    return True, False


def _finalize(
    db: Session,
    upload: UploadedFile,
    extraction: VideoExtraction,
    *,
    speech_ok: bool,
    speech_has_text: bool,
    visual_ok: bool,
    visual_has_text: bool,
) -> None:
    stages = extraction.stages or {}
    speech_message = (stages.get("speech") or {}).get("message", "")
    visual_message = (stages.get("visual") or {}).get("message", "")

    if speech_has_text and visual_has_text:
        status = "completed"
        summary = (
            "Speech and on-screen text were both analyzed. "
            f"{len(extraction.transcript_segments or [])} spoken segment(s) and "
            f"{extraction.frames_read} frame(s) with visible text."
        )
    elif speech_has_text:
        if visual_ok:
            status = "completed"
            summary = "Speech was transcribed; sampled frames contained no readable on-screen text."
        else:
            status = "partial"
            summary = (
                "Speech was transcribed, but on-screen text analysis did not complete. "
                f"{visual_message}"
            )
    elif visual_has_text:
        if speech_ok:
            status = "completed"
            summary = (
                "On-screen text was analyzed; no speech was found "
                "(no audio track or no detected speech)."
            )
        else:
            status = "partial"
            summary = (
                "On-screen text was analyzed, but speech was not transcribed. "
                f"{speech_message}"
            )
    elif speech_ok and visual_ok:
        status = "no_content"
        summary = (
            "Processing completed but found no spoken or on-screen text to check. "
            "No automated findings can be produced for this video."
        )
    else:
        status = "failed"
        summary = (
            "No spoken or on-screen text could be extracted. "
            f"{speech_message} {visual_message}"
        ).strip()

    extraction.status = status
    extraction.message = summary.strip()
    extraction.finished_at = _now()
    _sync_upload_summary(upload, extraction)
    db.commit()


# ---------------------------------------------------------------------------
# Startup recovery and serialization
# ---------------------------------------------------------------------------
def recover_interrupted_jobs() -> int:
    """Mark jobs that were mid-flight when the process stopped as failed/retryable."""
    recovered = 0
    db = SessionLocal()
    try:
        rows = (
            db.query(VideoExtraction)
            .filter(VideoExtraction.status.in_(list(ACTIVE_STATUSES)))
            .all()
        )
        for extraction in rows:
            upload = db.query(UploadedFile).filter(UploadedFile.id == extraction.upload_id).first()
            extraction.status = "failed"
            extraction.cancel_requested = False
            extraction.finished_at = _now()
            extraction.message = (
                "The server restarted before automatic analysis finished. "
                "Existing stage results are kept; retry to run the remaining stages."
            )
            if extraction.transcript_status in {"running", "pending"}:
                extraction.transcript_status = "failed"
                extraction.transcript_message = extraction.message
            stages = dict(extraction.stages or {})
            for name in ("pipeline", "speech", "visual"):
                stage = dict(stages.get(name) or {})
                if stage.get("status") in ACTIVE_STATUSES or not stage:
                    stages[name] = {"status": "failed", "message": extraction.message}
            extraction.stages = stages
            if upload:
                upload.extraction_status = "error"
                upload.extraction_message = extraction.message
            recovered += 1
        db.commit()
    finally:
        db.close()
    if recovered:
        logger.warning("Recovered %d interrupted video job(s); they are marked for retry.", recovered)
    return recovered


def wait_for_job(upload_id: str, *, timeout: float = 120.0) -> bool:
    """Wait for an in-flight job. Used by tests; returns True when idle."""
    with _lock:
        future = _inflight.get(upload_id)
    if future is None:
        return True
    try:
        future.result(timeout=timeout)
        return True
    except Exception:
        return False


def frames_for_audit(db: Session, upload: UploadedFile) -> list[dict]:
    """Frames whose OCR text can be audited, with authenticated frame URLs."""
    extraction = extraction_row(db, upload.id)
    if extraction is None:
        return []
    stage = (extraction.stages or {}).get("visual") or {}
    if stage.get("status") != "completed":
        return []
    frame_dir = _frames_dir(upload.id)
    result: list[dict] = []
    for frame in extraction.frames or []:
        text = (frame.get("text") or "").strip()
        if not text:
            continue
        name = frame.get("file_name")
        available = bool(name) and (frame_dir / str(name)).exists()
        result.append(
            {
                "timestamp_seconds": frame.get("timestamp_seconds"),
                "timestamp_label": frame.get("timestamp_label"),
                "text": text,
                "url": f"/uploads/{upload.id}/frames/{name}" if available else None,
            }
        )
    return result


def serialize_state(db: Session, upload: UploadedFile) -> Optional[dict]:
    if upload.kind != "video":
        return None
    extraction = extraction_row(db, upload.id)
    frame_dir = _frames_dir(upload.id)
    config = {
        "transcription_configured": settings.transcription_configured,
        "transcription_provider": settings.TRANSCRIPTION_PROVIDER,
        "transcription_model": settings.TRANSCRIPTION_MODEL,
        "transcription_reason": settings.transcription_status_reason,
        "ocr_available": ocr_service.ocr_available(),
        "ocr_reason": settings.ocr_status_reason,
        "ffmpeg": ffmpeg_status(),
        "frame_interval_seconds": settings.VIDEO_FRAME_INTERVAL_SECONDS,
        "max_frames": settings.VIDEO_MAX_FRAMES,
        "max_duration_seconds": settings.VIDEO_MAX_DURATION_SECONDS,
    }
    if extraction is None:
        return {
            "status": "not_started",
            "message": (
                "Automatic analysis has not run for this upload. "
                "Reprocess it to run speech and on-screen text checks."
            ),
            "attempt": 0,
            "stages": {},
            "transcript": {
                "status": "pending",
                "message": None,
                "segment_count": 0,
                "text": None,
                "provider": None,
                "model": None,
                "language": None,
            },
            "frames": [],
            "frame_count": 0,
            "frames_read": 0,
            "onscreen_text": None,
            "can_retry": True,
            "can_cancel": False,
            "started_at": None,
            "finished_at": None,
            "updated_at": None,
            "config": config,
        }

    frames = []
    for frame in extraction.frames or []:
        file_name = frame.get("file_name")
        available = bool(file_name) and (frame_dir / str(file_name)).exists()
        frames.append(
            {
                **frame,
                "available": available,
                "url": f"/uploads/{upload.id}/frames/{file_name}" if available else None,
            }
        )
    return {
        "status": extraction.status,
        "message": extraction.message,
        "attempt": extraction.attempt,
        "duration_seconds": extraction.duration_seconds,
        "audio_present": extraction.audio_present,
        "stages": extraction.stages or {},
        "transcript": {
            "status": extraction.transcript_status,
            "message": extraction.transcript_message,
            "segment_count": len(extraction.transcript_segments or []),
            "text": extraction.transcript_text,
            "provider": extraction.transcription_provider,
            "model": extraction.transcription_model,
            "language": extraction.language,
        },
        "frames": frames,
        "frame_count": extraction.frame_count,
        "frames_read": extraction.frames_read,
        "onscreen_text": extraction.onscreen_text,
        "can_retry": extraction.status not in ACTIVE_STATUSES,
        "can_cancel": extraction.status in ACTIVE_STATUSES,
        "started_at": extraction.started_at,
        "finished_at": extraction.finished_at,
        "updated_at": extraction.updated_at,
        "config": config,
    }
