"""Automatic video auditing: pipeline, audit integration, access, and recovery.

Video fixtures are generated locally with the bundled FFmpeg binary. The speech
provider is replaced with deterministic fakes so no paid API call is made, and
OCR is mocked where the expected text must be exact. One real-OCR test runs the
actual local engine against a generated title card.
"""
from __future__ import annotations

import subprocess
import threading
import time
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from helpers import demo_login
from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.assets import VideoExtraction
from app.services import ocr_service, speech_service, video_service
from app.services.speech_service import SpeechResult

CREATOR: dict[str, str] = {}
ADMIN: dict[str, str] = {}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="module", autouse=True)
def identities(client: TestClient):
    CREATOR.update(demo_login(client, "creator"))
    ADMIN.update(demo_login(client, "admin"))


# ---------------------------------------------------------------------------
# Fixtures and fakes
# ---------------------------------------------------------------------------
def make_video(
    tmp_path: Path,
    *,
    name: str = "clip.mp4",
    seconds: int = 3,
    audio: bool = True,
    image: Path | None = None,
) -> bytes:
    binary = video_service._ffmpeg_binary()
    if not binary:
        pytest.skip("FFmpeg is not available on this test host")
    path = tmp_path / name
    command = [binary, "-y", "-hide_banner", "-loglevel", "error"]
    if image is not None:
        command += ["-loop", "1", "-i", str(image)]
    else:
        command += ["-f", "lavfi", "-i", f"color=c=navy:s=320x240:d={seconds}:r=10"]
    if audio:
        command += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}"]
    command += ["-shortest", "-t", str(seconds), "-c:v", "mpeg4", "-q:v", "5", "-pix_fmt", "yuv420p"]
    if audio:
        command += ["-c:a", "aac"]
    command += [str(path)]
    result = subprocess.run(command, capture_output=True)
    assert result.returncode == 0, result.stderr.decode("utf-8", "replace")[:400]
    return path.read_bytes()


def enable_speech(monkeypatch):
    monkeypatch.setattr(settings, "TRANSCRIPTION_PROVIDER", "openai_whisper")
    monkeypatch.setattr(settings, "TRANSCRIPTION_API_KEY", "test-key-not-real")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")


def use_speech(monkeypatch, segments=None, *, status="completed", text=None, message="Transcribed."):
    segments = list(segments or [])

    def _transcribe(path: Path) -> SpeechResult:
        assert path.exists(), "The worker must pass a real extracted audio file"
        return SpeechResult(
            status=status,
            message=message,
            text=text if text is not None else " ".join(item["text"] for item in segments),
            segments=segments,
            provider="openai_whisper",
            model="whisper-1",
            language="en",
        )

    monkeypatch.setattr(speech_service, "transcribe_audio", _transcribe)


def use_ocr(monkeypatch, text: str):
    def _ocr(image, *, page_number: int = 1):
        if not text:
            return ocr_service.OcrOutcome(status="no_text", message="OCR ran but found no text.")
        line = ocr_service.OcrLine(
            text=text, confidence=0.93, bbox=[0.1, 0.1, 0.9, 0.2], page_number=page_number
        )
        return ocr_service.OcrOutcome(
            status="processed",
            message="OCR read 1 line.",
            text=text,
            lines=[line],
            mean_confidence=0.93,
        )

    monkeypatch.setattr(ocr_service, "ocr_image", _ocr)


def upload_video(client, data: bytes, *, name="clip.mp4", content_type="video/mp4", headers=None):
    return client.post(
        "/api/v1/uploads/",
        headers=headers or CREATOR,
        files={"file": (name, data, content_type)},
        data={"kind": "video"},
    )


def video_state(client, upload_id: str, headers=None) -> dict:
    response = client.get(f"/api/v1/uploads/{upload_id}", headers=headers or CREATOR)
    assert response.status_code == 200, response.text
    return response.json()["video"]


def wait_video(client, upload_id: str, *, timeout: float = 60.0, headers=None) -> dict:
    video_service.wait_for_job(upload_id, timeout=timeout)
    return video_state(client, upload_id, headers)


def wait_for(client, upload_id: str, predicate, *, timeout: float = 30.0) -> dict:
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        last = video_state(client, upload_id)
        if predicate(last):
            return last
        time.sleep(0.05)
    raise AssertionError(f"Condition not reached; last state was {last}")


def submit_video_audit(client, upload_id: str, *, transcript=None, segments=None, headers=None):
    payload = {
        "title": f"Video audit {uuid.uuid4().hex[:8]}",
        "content_type": "video_script",
        "asset_type": "video",
        "upload_id": upload_id,
    }
    if transcript is not None:
        payload["content_text"] = transcript
    if segments is not None:
        payload["transcript_segments"] = segments
    return client.post("/api/v1/audits/submit-and-audit", headers=headers or CREATOR, json=payload)


def all_findings(document: dict) -> list[dict]:
    assert document["latest_audit"], "Expected a stored audit run"
    return document["latest_audit"]["findings"]


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------
def test_pipeline_persists_speech_and_on_screen_results(client, monkeypatch, tmp_path):
    enable_speech(monkeypatch)
    use_speech(
        monkeypatch,
        [{"timestamp_seconds": 0.0, "text": "We deliver 100% uptime for every customer.", "timestamp_label": "00:00"}],
    )
    use_ocr(monkeypatch, "AcmeCloud is the cheapest platform.")
    monkeypatch.setattr(settings, "VIDEO_FRAME_INTERVAL_SECONDS", 1.0)

    upload = upload_video(client, make_video(tmp_path))
    assert upload.status_code == 201, upload.text
    upload_id = upload.json()["id"]

    video = wait_video(client, upload_id)
    assert video["status"] == "completed", video
    assert video["stages"]["probe"]["status"] == "completed"
    assert video["stages"]["speech"]["status"] == "completed"
    assert video["stages"]["visual"]["status"] == "completed"
    assert video["audio_present"] is True
    assert video["duration_seconds"] and video["duration_seconds"] > 0
    assert video["transcript"]["status"] == "completed"
    assert video["transcript"]["segment_count"] == 1
    assert video["transcript"]["provider"] == "openai_whisper"
    assert video["frames"], "Frames should be sampled from a 3s video at a 1s interval"
    assert video["frames"][0]["text"] == "AcmeCloud is the cheapest platform."
    assert video["frames"][0]["url"]

    frame = client.get(
        f"/api/v1/uploads/{upload_id}/frames/{video['frames'][0]['file_name']}", headers=CREATOR
    )
    assert frame.status_code == 200
    assert frame.headers["content-type"].startswith("image/jpeg")


def test_audit_without_manual_transcript_returns_sourced_findings(client, monkeypatch, tmp_path):
    enable_speech(monkeypatch)
    use_speech(
        monkeypatch,
        [{"timestamp_seconds": 0.0, "text": "We deliver 100% uptime for every customer.", "timestamp_label": "00:00"}],
    )
    use_ocr(monkeypatch, "AcmeCloud is the cheapest platform.")

    upload = upload_video(client, make_video(tmp_path))
    upload_id = upload.json()["id"]
    video = wait_video(client, upload_id)
    assert video["status"] == "completed"

    created = submit_video_audit(client, upload_id)
    assert created.status_code == 201, created.text
    document = created.json()
    findings = all_findings(document)

    spoken = [f for f in findings if f["source_type"] == "spoken"]
    on_screen = [f for f in findings if f["source_type"] == "on_screen"]
    assert spoken, "Spoken findings must come from the automatic transcript"
    assert on_screen, "On-screen findings must come from frame OCR"
    assert any("100% uptime" in f["affected_text"] for f in spoken)
    assert all(f["timestamp_seconds"] is not None for f in spoken + on_screen)
    assert all(f["source_type"] for f in spoken + on_screen)

    visual = next(f for f in on_screen if "AcmeCloud" in f["affected_text"])
    assert visual["frame_url"], "On-screen findings must reference the frame they came from"
    assert visual["timestamp_seconds"] == 0.0
    assert visual["location_label"].startswith("On-screen")

    assert document["current_version"]["asset_metadata"]["transcript_source"] == "automatic"
    notes = document["latest_audit"]["extraction_notes"]
    assert "automatic transcript" in notes
    assert "local OCR" in notes
    assert document["latest_audit"]["verification_status"] in {"verified", "partially_verified"}
    assert "logo" in notes.lower() and "not judged automatically" in notes


def test_manual_transcript_takes_precedence_over_automatic(client, monkeypatch, tmp_path):
    enable_speech(monkeypatch)
    use_speech(
        monkeypatch,
        [{"timestamp_seconds": 1.0, "text": "We deliver 100% uptime for every customer.", "timestamp_label": "00:01"}],
    )
    use_ocr(monkeypatch, "Welcome to the product launch.")

    upload = upload_video(client, make_video(tmp_path))
    upload_id = upload.json()["id"]
    assert wait_video(client, upload_id)["status"] == "completed"

    created = submit_video_audit(client, upload_id, transcript="AcmeCloud is our platform.")
    assert created.status_code == 201, created.text
    document = created.json()
    findings = all_findings(document)
    assert any(
        "AcmeCloud" in f["affected_text"] and f["source_type"] == "spoken" for f in findings
    )
    assert not any("100% uptime" in f["affected_text"] for f in findings), (
        "The manual transcript must take precedence over the stored automatic transcript"
    )
    assert document["current_version"]["asset_metadata"]["transcript_source"] == "manual"


# ---------------------------------------------------------------------------
# Honest partial states
# ---------------------------------------------------------------------------
def test_speech_unconfigured_preserves_visual_results(client, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "TRANSCRIPTION_PROVIDER", "none")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    use_ocr(monkeypatch, "AcmeCloud is the cheapest platform.")

    upload = upload_video(client, make_video(tmp_path))
    upload_id = upload.json()["id"]
    video = wait_video(client, upload_id)

    assert video["status"] == "partial", video
    assert video["transcript"]["status"] == "unavailable"
    assert "not configured" in video["transcript"]["message"]
    assert video["stages"]["visual"]["status"] == "completed"
    assert video["stages"]["visual"]["frames_read"] >= 1

    created = submit_video_audit(client, upload_id)
    assert created.status_code == 201, created.text
    document = created.json()
    findings = all_findings(document)
    assert any(f["category"] == "processing_issue" and "Spoken" in f["title"] for f in findings)
    assert any(f["source_type"] == "on_screen" for f in findings)
    assert document["latest_audit"]["verification_status"] == "partially_verified"
    notes = document["latest_audit"]["extraction_notes"]
    assert "Spoken content was not analyzed" in notes


def test_speech_provider_failure_keeps_visual_results(client, monkeypatch, tmp_path):
    enable_speech(monkeypatch)
    use_speech(
        monkeypatch,
        status="failed",
        message="The speech-to-text provider rejected the server-side API key.",
    )
    use_ocr(monkeypatch, "AcmeCloud is the cheapest platform.")

    upload = upload_video(client, make_video(tmp_path))
    upload_id = upload.json()["id"]
    video = wait_video(client, upload_id)

    assert video["status"] == "partial", video
    assert video["stages"]["speech"]["status"] == "failed"
    assert video["stages"]["visual"]["status"] == "completed"
    assert video["transcript"]["text"] is None, "A failed provider must not produce a transcript"
    assert "rejected" in video["transcript"]["message"]

    created = submit_video_audit(client, upload_id)
    document = created.json()
    assert any(f["source_type"] == "on_screen" for f in all_findings(document))
    assert document["latest_audit"]["verification_status"] == "partially_verified"


def test_ocr_unavailable_keeps_spoken_findings(client, monkeypatch, tmp_path):
    enable_speech(monkeypatch)
    use_speech(
        monkeypatch,
        [{"timestamp_seconds": 0.0, "text": "We deliver 100% uptime for every customer.", "timestamp_label": "00:00"}],
    )
    monkeypatch.setattr(ocr_service, "ocr_available", lambda: False)

    upload = upload_video(client, make_video(tmp_path))
    upload_id = upload.json()["id"]
    video = wait_video(client, upload_id)

    assert video["status"] == "partial", video
    assert video["stages"]["speech"]["status"] == "completed"
    assert video["stages"]["visual"]["status"] == "unavailable"
    assert video["frames"] == []

    created = submit_video_audit(client, upload_id)
    document = created.json()
    findings = all_findings(document)
    assert any(f["source_type"] == "spoken" for f in findings)
    assert any(f["category"] == "processing_issue" and "On-screen" in f["title"] for f in findings)
    assert document["latest_audit"]["verification_status"] == "partially_verified"


def test_video_without_audio_reports_no_audio(client, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "TRANSCRIPTION_PROVIDER", "none")
    use_ocr(monkeypatch, "Welcome to the launch.")

    upload = upload_video(client, make_video(tmp_path, audio=False))
    upload_id = upload.json()["id"]
    video = wait_video(client, upload_id)

    assert video["audio_present"] is False
    assert video["stages"]["speech"]["status"] == "no_audio"
    assert video["transcript"]["status"] == "no_audio"
    assert video["stages"]["visual"]["status"] == "completed"
    assert video["status"] == "completed"


def test_no_speech_and_no_visible_text_is_not_a_clean_result(client, monkeypatch, tmp_path):
    enable_speech(monkeypatch)
    use_speech(monkeypatch, status="no_speech", message="The provider detected no speech.")
    use_ocr(monkeypatch, "")

    upload = upload_video(client, make_video(tmp_path))
    upload_id = upload.json()["id"]
    video = wait_video(client, upload_id)
    assert video["status"] == "no_content", video
    assert video["transcript"]["status"] == "no_speech"

    created = submit_video_audit(client, upload_id)
    assert created.status_code == 201, created.text
    document = created.json()
    audit = document["latest_audit"]
    assert audit["verification_status"] == "unable_to_verify"
    assert audit["overall_score"] < 100
    assert any(f["category"] == "processing_issue" for f in all_findings(document))


# ---------------------------------------------------------------------------
# Validation, limits, and job control
# ---------------------------------------------------------------------------
def test_upload_rejects_unsupported_and_malformed_video(client):
    unsupported = upload_video(
        client, b"RIFF0000AVI ", name="clip.avi", content_type="video/x-msvideo"
    )
    assert unsupported.status_code == 415
    assert "Unsupported file type" in unsupported.json()["detail"]

    malformed = upload_video(client, b"this is not a video", name="clip.mp4")
    assert malformed.status_code == 415
    assert "does not look like a valid" in malformed.json()["detail"]


def test_corrupt_container_fails_processing_honestly(client):
    corrupt = b"\x00\x00\x00\x20ftypisom" + b"\x00" * 2048
    upload = upload_video(client, corrupt, name="broken.mp4")
    assert upload.status_code == 201, upload.text
    upload_id = upload.json()["id"]

    video = wait_video(client, upload_id)
    assert video["status"] == "failed", video
    assert video["stages"]["probe"]["status"] == "failed"
    assert "could not be read as a video" in video["message"]
    assert video["transcript"]["text"] is None

    created = submit_video_audit(client, upload_id)
    assert created.status_code == 201, created.text
    document = created.json()
    audit = document["latest_audit"]
    assert audit["verification_status"] == "unable_to_verify"
    assert all(f["category"] == "processing_issue" for f in all_findings(document))


def test_oversized_video_is_rejected(client, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "MAX_VIDEO_UPLOAD_BYTES", 1024)
    response = upload_video(client, make_video(tmp_path))
    assert response.status_code == 413
    assert "too large" in response.json()["detail"].lower()


def test_audit_is_blocked_while_processing(client, monkeypatch, tmp_path):
    enable_speech(monkeypatch)
    release = threading.Event()
    started = threading.Event()

    def _blocking(path: Path) -> SpeechResult:
        started.set()
        release.wait(20)
        return SpeechResult(
            status="completed",
            message="Transcribed.",
            text="Welcome.",
            segments=[{"timestamp_seconds": 0.0, "text": "Welcome.", "timestamp_label": "00:00"}],
            provider="openai_whisper",
            model="whisper-1",
        )

    monkeypatch.setattr(speech_service, "transcribe_audio", _blocking)
    use_ocr(monkeypatch, "Welcome.")

    upload = upload_video(client, make_video(tmp_path))
    upload_id = upload.json()["id"]
    assert started.wait(30), "Speech stage never started"
    assert wait_for(client, upload_id, lambda v: v["status"] == "processing")["can_cancel"] is True

    blocked = submit_video_audit(client, upload_id)
    assert blocked.status_code == 409
    assert "still running" in blocked.json()["detail"]

    release.set()
    video = wait_video(client, upload_id)
    assert video["status"] == "completed"
    retried = submit_video_audit(client, upload_id)
    assert retried.status_code == 201, retried.text


def test_cancel_and_duplicate_guards(client, monkeypatch, tmp_path):
    enable_speech(monkeypatch)
    release = threading.Event()

    def _blocking(path: Path) -> SpeechResult:
        release.wait(20)
        return SpeechResult(status="completed", message="Transcribed.", text="Welcome.")

    monkeypatch.setattr(speech_service, "transcribe_audio", _blocking)
    use_ocr(monkeypatch, "Welcome.")

    upload = upload_video(client, make_video(tmp_path))
    upload_id = upload.json()["id"]
    wait_for(client, upload_id, lambda v: v["status"] == "processing")

    duplicate = client.post(f"/api/v1/uploads/{upload_id}/video/retry", headers=CREATOR)
    assert duplicate.status_code == 409

    canceled = client.post(f"/api/v1/uploads/{upload_id}/video/cancel", headers=CREATOR)
    assert canceled.status_code == 200, canceled.text
    assert canceled.json()["video"]["can_cancel"] is True

    release.set()
    video = wait_video(client, upload_id)
    assert video["status"] == "canceled", video
    assert video["can_retry"] is True


def test_retry_reuses_completed_transcript_and_reruns_failed_frames(client, monkeypatch, tmp_path):
    enable_speech(monkeypatch)
    calls = {"speech": 0}

    def _transcribe(path: Path) -> SpeechResult:
        calls["speech"] += 1
        return SpeechResult(
            status="completed",
            message="Transcribed.",
            text="We deliver 100% uptime for every customer.",
            segments=[
                {
                    "timestamp_seconds": 0.0,
                    "text": "We deliver 100% uptime for every customer.",
                    "timestamp_label": "00:00",
                }
            ],
            provider="openai_whisper",
            model="whisper-1",
        )

    monkeypatch.setattr(speech_service, "transcribe_audio", _transcribe)

    def _broken_ocr(image, *, page_number: int = 1):
        raise RuntimeError("simulated OCR failure")

    monkeypatch.setattr(ocr_service, "ocr_image", _broken_ocr)

    upload = upload_video(client, make_video(tmp_path))
    upload_id = upload.json()["id"]
    first = wait_video(client, upload_id)
    assert first["status"] == "partial", first
    assert first["stages"]["visual"]["status"] == "failed"
    assert first["transcript"]["status"] == "completed"
    assert calls["speech"] == 1

    use_ocr(monkeypatch, "Welcome to the launch.")
    retried = client.post(f"/api/v1/uploads/{upload_id}/video/retry", headers=CREATOR)
    assert retried.status_code == 200, retried.text
    second = wait_video(client, upload_id)
    assert second["status"] == "completed", second
    assert second["attempt"] == 2
    assert calls["speech"] == 1, "A completed transcript must not be sent to the provider again"
    assert second["frames_read"] >= 1


def test_interrupted_jobs_are_marked_failed_for_retry(client, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "TRANSCRIPTION_PROVIDER", "none")
    use_ocr(monkeypatch, "")
    upload = upload_video(client, make_video(tmp_path, audio=False))
    upload_id = upload.json()["id"]
    assert wait_video(client, upload_id)["status"] in {"completed", "no_content"}

    with SessionLocal() as db:
        extraction = db.query(VideoExtraction).filter(VideoExtraction.upload_id == upload_id).first()
        extraction.status = "processing"
        extraction.transcript_status = "running"
        db.commit()

    recovered = video_service.recover_interrupted_jobs()
    assert recovered >= 1
    video = video_state(client, upload_id)
    assert video["status"] == "failed"
    assert "restarted" in video["message"]
    assert video["can_retry"] is True


# ---------------------------------------------------------------------------
# Access control and health
# ---------------------------------------------------------------------------
def test_frames_and_uploads_are_workspace_scoped(client, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "TRANSCRIPTION_PROVIDER", "none")
    use_ocr(monkeypatch, "AcmeCloud is the cheapest platform.")
    upload = upload_video(client, make_video(tmp_path))
    upload_id = upload.json()["id"]
    video = wait_video(client, upload_id)
    assert video["frames"]

    created = client.post(
        "/api/v1/workspaces/",
        headers=ADMIN,
        json={"name": f"Isolation {uuid.uuid4().hex[:6]}", "owner_name": "Isolation Owner"},
    )
    assert created.status_code == 201, created.text
    other = demo_login(client, "creator", workspace_id=created.json()["id"])

    assert client.get(f"/api/v1/uploads/{upload_id}", headers=other).status_code == 404
    assert (
        client.get(
            f"/api/v1/uploads/{upload_id}/frames/{video['frames'][0]['file_name']}", headers=other
        ).status_code
        == 404
    )
    assert (
        client.post(f"/api/v1/uploads/{upload_id}/video/retry", headers=other).status_code == 404
    )
    assert client.get(f"/api/v1/uploads/{upload_id}").status_code == 401
    assert (
        client.get(
            f"/api/v1/uploads/{upload_id}/frames/{video['frames'][0]['file_name']}"
        ).status_code
        == 401
    )
    traversal = client.get(
        f"/api/v1/uploads/{upload_id}/frames/..%2F..%2Fdata%2Fuploads%2Fsecret.jpg",
        headers=CREATOR,
    )
    assert traversal.status_code in {400, 404}


def test_health_reports_video_pipeline_capabilities(client):
    data = client.get("/api/v1/health").json()
    assert "transcription" in data and "configured" in data["transcription"]
    assert data["transcription"]["reason"]
    assert "video" in data
    assert isinstance(data["video"]["ffmpeg"]["available"], bool)
    assert data["video"]["max_frames"] > 0
    assert data["video"]["max_duration_seconds"] > 0
    assert data["video"]["max_upload_mb"] == settings.MAX_VIDEO_UPLOAD_BYTES // (1024 * 1024)


def test_real_ocr_reads_generated_title_card(client, monkeypatch, tmp_path):
    if not ocr_service.ocr_available():
        pytest.skip("OCR engine is not installed on this test host")
    from PIL import Image, ImageDraw, ImageFont

    card = tmp_path / "card.png"
    image = Image.new("RGB", (640, 360), "navy")
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.load_default(size=84)
    except TypeError:
        font = ImageFont.load_default()
    draw.text((40, 130), "ACME CLOUD", fill="white", font=font)
    image.save(card)

    video_bytes = make_video(tmp_path, name="card.mp4", seconds=2, audio=False, image=card)
    monkeypatch.setattr(settings, "TRANSCRIPTION_PROVIDER", "none")
    upload = upload_video(client, video_bytes)
    upload_id = upload.json()["id"]
    video = wait_video(client, upload_id)

    assert video["stages"]["visual"]["status"] == "completed", video
    assert video["frames_read"] >= 1
    text = (video["onscreen_text"] or "").upper()
    assert "ACME" in text or "CLOUD" in text, f"Real OCR did not read the title card: {text!r}"
