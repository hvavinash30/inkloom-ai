"""Storage and persistence tests.

These verify the guarantees the product claims: records survive a new database
session (and an engine reopen), missing upload files are reported instead of
served as broken content, and none of the health/storage reporting leaks
credentials. Everything runs against the temporary SQLite database created by
``conftest.py``.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import settings
from app.db.session import SessionLocal, engine, verify_connection
from app.main import app
from app.models.content import ContentDocument


CREATOR = {"X-Inkloom-Role": "creator"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def unique_title(label: str) -> str:
    return f"{label} {uuid.uuid4().hex[:8]}"


def test_records_survive_a_new_session_and_engine_reopen(client: TestClient):
    title = unique_title("Persistence check")
    created = client.post(
        "/api/v1/audits/submit-and-audit",
        headers=CREATOR,
        json={
            "title": title,
            "content_type": "social_media",
            "content_text": "Acme Cloud offers a 99.9% monthly uptime SLA. Results vary by workload.",
        },
    )
    assert created.status_code == 201, created.text
    document_id = created.json()["id"]

    # Drop every pooled connection so the next query opens a fresh one, mirroring
    # a service restart against the same database file.
    engine.dispose()
    ok, error = verify_connection()
    assert ok, f"Database should still be reachable after reopen: {error}"

    session = SessionLocal()
    try:
        row = session.query(ContentDocument).filter(ContentDocument.id == document_id).first()
        assert row is not None, "The document must persist across a session/engine reopen."
        assert row.title == title
    finally:
        session.close()


def test_health_reports_storage_durability_without_credentials(client: TestClient):
    data = client.get("/api/v1/health").json()
    storage = data["storage"]
    assert storage["database"]["scheme"].startswith("sqlite")
    assert storage["database"]["driver_available"] is True
    assert storage["uploads"]["mode"] == "server-filesystem"
    assert isinstance(storage["database"]["durable"], bool)
    assert "note" in storage["database"] and storage["database"]["note"]

    # The report must never expose a connection string, password, or API key.
    blob = str(data).lower()
    assert settings.DATABASE_URL.lower() not in blob
    for marker in ("password", "service_role", "api_key", "postgresql://"):
        assert marker not in blob, f"Health payload leaked sensitive marker: {marker}"


def test_sqlite_backend_reports_the_local_file_and_is_marked_ephemeral(client: TestClient):
    data = client.get("/api/v1/health").json()
    assert settings.database_durable is False, (
        "A bare local SQLite file must not be reported as durable."
    )
    assert data["storage"]["database"]["durable"] is False
    assert "ephemeral" in data["storage"]["uploads"]["note"].lower() or (
        data["storage"]["uploads"]["durable"] is False
    )


def test_upload_file_endpoint_handles_a_missing_stored_file(client: TestClient):
    upload = client.post(
        "/api/v1/uploads/",
        headers=CREATOR,
        files={"file": ("note.txt", b"Acme Cloud note for persistence testing.", "text/plain")},
    )
    assert upload.status_code == 201, upload.text
    upload_id = upload.json()["id"]
    assert upload.json()["has_viewable_file"] is True

    # Simulate an ephemeral reset: the record remains but the bytes are gone.
    stored = settings.upload_path / _stored_name(client, upload_id)
    if stored.exists():
        stored.unlink()

    detail = client.get(f"/api/v1/uploads/{upload_id}", headers=CREATOR)
    assert detail.status_code == 200, detail.text
    assert detail.json()["has_viewable_file"] is False, (
        "A record must report that its file is missing instead of claiming success."
    )

    download = client.get(f"/api/v1/uploads/{upload_id}/file", headers=CREATOR)
    assert download.status_code == 404
    assert "no longer available" in download.json()["detail"].lower()


def _stored_name(client: TestClient, upload_id: str) -> str:
    session = SessionLocal()
    try:
        from app.models.assets import UploadedFile

        record = session.query(UploadedFile).filter(UploadedFile.id == upload_id).first()
        assert record is not None
        return record.stored_name
    finally:
        session.close()


def test_database_label_is_redacted():
    label = settings.database_label
    assert "sqlite:" in label
    assert "://" not in label


def test_schema_and_seed_are_idempotent(client: TestClient):
    """Re-running create_all and the seed must not duplicate demo rows."""
    from app.db.session import Base
    from app.services import seed_service

    session = SessionLocal()
    try:
        before = session.execute(text("SELECT COUNT(*) FROM brand_rules")).scalar()
        Base.metadata.create_all(bind=engine)
        seed_service.seed_demo_workspace(session)
        session.commit()
        after = session.execute(text("SELECT COUNT(*) FROM brand_rules")).scalar()
        assert after == before, "Seeding again must not duplicate existing rules."
    finally:
        session.close()