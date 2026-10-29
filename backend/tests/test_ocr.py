"""OCR ingestion tests with generated, genuine fixtures.

Fixtures are created at test time with PyMuPDF so the checks exercise the real
pipeline: rendered image/PDF pages go through RapidOCR, extracted text feeds the
deterministic audit engine, and findings must point at the extracted words.
"""
from __future__ import annotations

import uuid

import pymupdf
import pytest

from helpers import demo_login
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services import ocr_service


CREATOR: dict[str, str] = {}



@pytest.fixture(scope="module", autouse=True)
def demo_identities(client):
    CREATOR.update(demo_login(client, "creator"))

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def text_png(lines: list[str], *, width: int = 1000, height: int = 300) -> bytes:
    """Render black text on a white page and rasterize it, mimicking a scan."""
    document = pymupdf.open()
    try:
        page = document.new_page(width=width, height=height)
        y = 100
        for line in lines:
            page.insert_text((60, y), line, fontsize=28, fontname="helv")
            y += 70
        return page.get_pixmap(dpi=150).tobytes("png")
    finally:
        document.close()


def scanned_pdf(lines: list[str]) -> bytes:
    png = text_png(lines)
    document = pymupdf.open()
    try:
        page = document.new_page(width=1000, height=300)
        page.insert_image(pymupdf.Rect(0, 0, 1000, 300), stream=png)
        return document.tobytes()
    finally:
        document.close()


def native_pdf(page_texts: list[str], scanned_pages: dict[int, list[str]] | None = None) -> bytes:
    """Build a PDF whose listed pages carry real embedded text; others are scans."""
    scanned_pages = scanned_pages or {}
    document = pymupdf.open()
    try:
        for index, text in enumerate(page_texts, start=1):
            page = document.new_page(width=1000, height=300)
            if index in scanned_pages:
                page.insert_image(
                    pymupdf.Rect(0, 0, 1000, 300), stream=text_png(scanned_pages[index])
                )
            else:
                page.insert_text((60, 100), text, fontsize=18, fontname="helv")
        return document.tobytes()
    finally:
        document.close()


def upload(client: TestClient, data: bytes, name: str, mime: str = "application/pdf"):
    return client.post(
        "/api/v1/uploads/",
        headers=CREATOR,
        files={"file": (name, data, mime)},
        data={"kind": "pdf" if name.endswith(".pdf") else "image"},
    )


def submit(client: TestClient, title: str, upload_id: str, asset_type: str):
    return client.post(
        "/api/v1/audits/submit-and-audit",
        headers=CREATOR,
        json={
            "title": title,
            "content_type": "ad_copy",
            "asset_type": asset_type,
            "upload_id": upload_id,
            "content_text": "",
        },
    )


def unique_title(label: str) -> str:
    return f"{label} {uuid.uuid4().hex[:8]}"


requires_ocr = pytest.mark.skipif(
    not settings.ocr_configured, reason="Local OCR engine is not installed in this environment"
)


@requires_ocr
def test_image_ocr_feeds_audit_and_keeps_evidence_links(client):
    png = text_png(["AcmeCloud is the cheapest platform.", "Contact our sales team today."])
    created_upload = upload(client, png, "launch-card.png", "image/png")
    assert created_upload.status_code == 201, created_upload.text
    record = created_upload.json()
    assert record["extraction_status"] == "processed"
    assert "AcmeCloud" in record["page_texts"][0]
    assert record["ocr"]["line_count"] >= 2
    assert record["ocr"]["mean_confidence"] > 0.8

    stored = client.get(f"/api/v1/uploads/{record['id']}", headers=CREATOR)
    assert stored.status_code == 200
    lines = stored.json()["ocr"]["lines"]
    assert any("AcmeCloud" in line["text"] for line in lines)
    for line in lines:
        left, top, right, bottom = line["bbox"]
        assert 0.0 <= left < right <= 1.0
        assert 0.0 <= top < bottom <= 1.0
        assert 0.0 < line["confidence"] <= 1.0

    title = unique_title("OCR image audit")
    response = submit(client, title, record["id"], "image")
    assert response.status_code == 201, response.text
    document = response.json()
    assert document["latest_audit"]["verification_status"] in {
        "verified",
        "partially_verified",
        "unable_to_verify",
    }
    findings = document["latest_audit"]["findings"]
    naming = next(
        finding
        for finding in findings
        if finding["affected_text"] == "AcmeCloud"
        and finding["title"].startswith("Product naming")
    )
    assert naming["category"] == "policy_violation"
    assert naming["page_number"] == 1
    assert naming["location_label"] == "Image text"
    extracted = document["current_version"]["content_text"]
    start, end = naming["start_index"], naming["end_index"]
    assert extracted[start:end] == "AcmeCloud", "Evidence span must match the extracted text"
    assert any(finding["affected_text"] == "cheapest" for finding in findings)
    assert document["latest_audit"]["model_used"].startswith("image-ocr")


@requires_ocr
def test_scanned_pdf_is_ocr_processed_with_page_numbers(client):
    created_upload = upload(
        client, scanned_pdf(["AcmeCloud is the cheapest platform."]), "scanned-brief.pdf"
    )
    assert created_upload.status_code == 201, created_upload.text
    record = created_upload.json()
    assert record["extraction_status"] == "processed"
    assert "OCR: 1" in record["extraction_message"]
    assert record["ocr"]["pages"][0]["page_number"] == 1

    response = submit(client, unique_title("Scanned PDF"), record["id"], "pdf")
    assert response.status_code == 201, response.text
    document = response.json()
    naming = next(
        finding
        for finding in document["latest_audit"]["findings"]
        if finding["affected_text"] == "AcmeCloud"
    )
    assert naming["page_number"] == 1
    assert naming["location_label"] == "Page 1"


@requires_ocr
def test_mixed_pdf_keeps_native_and_ocr_pages_apart(client):
    payload = native_pdf(
        ["AcmeCloud is the cheapest platform.", "This page is a scan."],
        scanned_pages={2: ["AcmeCloud is the cheapest platform."]},
    )
    created_upload = upload(client, payload, "mixed-brief.pdf")
    assert created_upload.status_code == 201, created_upload.text
    record = created_upload.json()
    assert record["extraction_status"] == "processed"
    assert "native: 1" in record["extraction_message"]
    assert "OCR: 1" in record["extraction_message"]
    assert record["page_count"] == 2
    assert len(record["page_texts"]) == 2
    assert record["ocr"]["pages"][0]["page_number"] == 2
    assert record["ocr"]["pages"][0]["line_count"] > 0

    response = submit(client, unique_title("Mixed PDF"), record["id"], "pdf")
    assert response.status_code == 201, response.text
    document = response.json()
    findings = document["latest_audit"]["findings"]
    naming = [f for f in findings if f["affected_text"] == "AcmeCloud"]
    assert {finding["page_number"] for finding in naming} == {1, 2}
    assert {finding["location_label"] for finding in naming} == {"Page 1", "Page 2"}
    for finding in naming:
        page_text = document["current_version"]["page_texts"][finding["page_number"] - 1]
        assert page_text[finding["start_index"]: finding["end_index"]] == "AcmeCloud"


def test_text_pdf_uses_embedded_text_without_ocr_lines(client):
    payload = native_pdf(["AcmeCloud is the cheapest platform."])
    response = upload(client, payload, "native-brief.pdf")
    assert response.status_code == 201, response.text
    record = response.json()
    assert record["extraction_status"] == "processed"
    assert "OCR: 0" in record["extraction_message"]
    assert record["ocr"]["line_count"] == 0


@requires_ocr
def test_ocr_engine_failure_is_reported_without_fake_text(client, monkeypatch):
    def failing_engine(image):  # noqa: ARG001 - signature must match _run_engine
        return [], "Simulated engine failure"

    monkeypatch.setattr(ocr_service, "_run_engine", failing_engine)
    png = text_png(["AcmeCloud is the cheapest platform."])
    response = upload(client, png, "broken-engine.png", "image/png")
    assert response.status_code == 201, response.text
    record = response.json()
    assert record["extraction_status"] == "error"
    assert "Simulated engine failure" in record["extraction_message"]
    assert record["page_texts"] == []

    audit = submit(client, unique_title("OCR failure"), record["id"], "image")
    assert audit.status_code == 201, audit.text
    document = audit.json()
    assert document["latest_audit"]["verification_status"] in {"unable_to_verify", "partially_verified"}
    assert any(
        finding["category"] == "processing_issue"
        for finding in document["latest_audit"]["findings"]
    )
    assert "Simulated engine failure" in (document["latest_audit"]["extraction_notes"] or "")


def test_ocr_unavailable_is_declared_honestly(client, monkeypatch):
    monkeypatch.setattr(settings, "OCR_PROVIDER", "none")
    png = text_png(["AcmeCloud is the cheapest platform."])
    response = upload(client, png, "no-ocr.png", "image/png")
    assert response.status_code == 201, response.text
    record = response.json()
    assert record["extraction_status"] == "needs_ocr"
    assert "not available" in record["extraction_message"] or "disabled" in record["extraction_message"]
    assert record["page_texts"] == []
    assert record["ocr"]["available"] is False


@requires_ocr
def test_image_validation_rejects_malformed_unsupported_and_oversized(client, monkeypatch):
    malformed = upload(client, b"not an image at all", "broken.png", "image/png")
    assert malformed.status_code == 415
    assert "malformed or unreadable" in malformed.json()["detail"].lower()

    gif = b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
    unsupported = upload(client, gif, "animation.png", "image/png")
    assert unsupported.status_code == 415
    assert "PNG, JPEG, or WebP" in unsupported.json()["detail"]

    monkeypatch.setattr(settings, "OCR_MAX_IMAGE_PIXELS", 10_000)
    oversized = upload(client, text_png(["AcmeCloud"]), "too-big.png", "image/png")
    assert oversized.status_code == 413
    assert "limit" in oversized.json()["detail"].lower()


def test_pdf_validation_rejects_non_pdf_bytes(client):
    response = upload(client, b"this is not a pdf", "fake.pdf")
    assert response.status_code == 415
    assert response.json()["detail"] == "The file does not look like a valid PDF."


@requires_ocr
def test_scanned_pdf_page_with_no_text_is_reported_as_unreadable(client):
    document = pymupdf.open()
    try:
        page = document.new_page(width=600, height=200)
        page.draw_rect(pymupdf.Rect(50, 50, 550, 150), color=None, fill=(0.9, 0.9, 0.9))
        blank_pdf = document.tobytes()
    finally:
        document.close()

    response = upload(client, blank_pdf, "blank-scan.pdf")
    assert response.status_code == 201, response.text
    record = response.json()
    assert record["extraction_status"] == "needs_ocr"
    assert "found no readable text" in record["extraction_message"]
    assert record["page_texts"] == [""]
