"""Server-enforced identity, role, and workspace isolation tests.

Every protected request must carry a server-issued bearer session. Roles and
workspaces are resolved from the stored user record, so client-declared
headers, manipulated IDs, invalid tokens, revoked tokens, and expired tokens
must never grant access.
"""
from __future__ import annotations

import hashlib
import io
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.auth import AuthSession
from helpers import demo_login

CREATOR: dict[str, str] = {}
REVIEWER: dict[str, str] = {}
ADMIN: dict[str, str] = {}


def auth(token: str, **extra: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", **extra}


def login(client: TestClient, role: str, workspace_id: str | None = None) -> str:
    response = client.post(
        "/api/v1/auth/demo/session",
        json={"role": role, "workspace_id": workspace_id or settings.DEFAULT_WORKSPACE_ID},
    )
    assert response.status_code == 201, response.text
    return response.json()["token"]


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="module", autouse=True)
def demo_identities(client: TestClient):
    CREATOR.update(demo_login(client, "creator"))
    REVIEWER.update(demo_login(client, "reviewer"))
    ADMIN.update(demo_login(client, "admin"))


@pytest.fixture(scope="module")
def custom_workspace(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/workspaces/",
        headers=CREATOR,
        json={
            "name": f"Security Brand {uuid.uuid4().hex[:6]}",
            "owner_name": "Security Owner",
            "description": "Isolation checks.",
            "industry": "Security",
            "audience": "Security teams",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_protected_routes_require_a_server_issued_session(client: TestClient):
    for path in ("/api/v1/session", "/api/v1/audits/documents", "/api/v1/reviews/queue"):
        response = client.get(path)
        assert response.status_code == 401, path
        assert response.headers.get("www-authenticate", "").startswith("Bearer"), path

    invalid = client.get("/api/v1/session", headers=auth("ink_not-a-real-token"))
    assert invalid.status_code == 401

    malformed = client.get("/api/v1/session", headers={"Authorization": "Basic abc"})
    assert malformed.status_code == 401


def test_client_declared_role_and_workspace_headers_are_ignored(client: TestClient):
    spoofed = client.get(
        "/api/v1/session",
        headers=auth(
            CREATOR["Authorization"].split(" ", 1)[1],
            **{"X-Inkloom-Role": "admin", "X-Inkloom-Workspace": str(uuid.uuid4())},
        ),
    )
    assert spoofed.status_code == 200
    payload = spoofed.json()
    assert payload["role"] == "creator"
    assert payload["workspace"]["id"] == settings.DEFAULT_WORKSPACE_ID
    assert payload["active_user"]["role"] == "creator"

    denied = client.post(
        "/api/v1/brand-rules/",
        headers=auth(
            CREATOR["Authorization"].split(" ", 1)[1],
            **{"X-Inkloom-Role": "admin"},
        ),
        json={
            "name": "Spoofed rule",
            "rule_type": "prohibited_phrase",
            "pattern_or_phrase": "spoofed admin header",
            "severity": "high",
        },
    )
    assert denied.status_code == 403, denied.text


def test_creator_cannot_review_or_decide(client: TestClient):
    queue = client.get("/api/v1/reviews/queue", headers=CREATOR)
    assert queue.status_code == 403

    decision = client.post(
        f"/api/v1/reviews/documents/{uuid.uuid4()}/decision",
        headers=CREATOR,
        json={"decision": "approved", "version_id": str(uuid.uuid4())},
    )
    assert decision.status_code == 403


def test_reviewer_cannot_manage_workspace_or_brand_settings(client: TestClient):
    workspace = client.get("/api/v1/workspaces/", headers=REVIEWER).json()
    workspace_id = next(
        item["id"] for item in workspace if item["id"] == settings.DEFAULT_WORKSPACE_ID
    )
    rename = client.patch(
        f"/api/v1/workspaces/{workspace_id}", headers=REVIEWER, json={"name": "Hijacked"}
    )
    assert rename.status_code == 403

    rule = client.post(
        "/api/v1/brand-rules/",
        headers=REVIEWER,
        json={
            "name": "Reviewer rule",
            "rule_type": "prohibited_phrase",
            "pattern_or_phrase": "reviewer cannot add this",
            "severity": "low",
        },
    )
    assert rule.status_code == 403

    queue = client.get("/api/v1/reviews/queue", headers=REVIEWER)
    assert queue.status_code == 200


def test_workspace_data_and_files_are_isolated(client: TestClient, custom_workspace: dict):
    workspace_id = custom_workspace["id"]
    workspace_creator = demo_login(client, "creator", workspace_id)

    upload = client.post(
        "/api/v1/uploads/",
        headers=workspace_creator,
        files={"file": ("isolation.txt", io.BytesIO(b"Isolated workspace copy."), "text/plain")},
    )
    assert upload.status_code == 201, upload.text
    upload_id = upload.json()["id"]

    document = client.post(
        "/api/v1/audits/submit-and-audit",
        headers=workspace_creator,
        json={
            "title": "Workspace-only content",
            "content_type": "social_media",
            "content_text": "This content belongs to the custom workspace only.",
        },
    )
    assert document.status_code == 201, document.text
    document_id = document.json()["id"]

    own_read = client.get(f"/api/v1/audits/documents/{document_id}", headers=workspace_creator)
    assert own_read.status_code == 200
    own_file = client.get(f"/api/v1/uploads/{upload_id}/file", headers=workspace_creator)
    assert own_file.status_code == 200

    foreign_read = client.get(f"/api/v1/audits/documents/{document_id}", headers=CREATOR)
    assert foreign_read.status_code == 404
    foreign_file = client.get(f"/api/v1/uploads/{upload_id}/file", headers=CREATOR)
    assert foreign_file.status_code == 404
    foreign_meta = client.get(f"/api/v1/uploads/{upload_id}", headers=CREATOR)
    assert foreign_meta.status_code == 404

    injected = client.post(
        "/api/v1/audits/submit-and-audit",
        headers=CREATOR,
        json={
            "title": "Cross-workspace injection",
            "content_type": "social_media",
            "content_text": "This must not be created in the custom workspace.",
            "workspace_id": workspace_id,
        },
    )
    assert injected.status_code == 403

    foreign_list = client.get("/api/v1/audits/documents", headers=CREATOR).json()
    assert all(item["id"] != document_id for item in foreign_list)


def test_logout_revokes_only_the_current_session(client: TestClient):
    first = login(client, "creator")
    second = login(client, "creator")

    revoked = client.post("/api/v1/auth/logout", headers=auth(first))
    assert revoked.status_code == 200

    first_read = client.get("/api/v1/session", headers=auth(first))
    assert first_read.status_code == 401
    second_read = client.get("/api/v1/session", headers=auth(second))
    assert second_read.status_code == 200


def test_expired_sessions_are_rejected(client: TestClient):
    token = login(client, "creator")
    with SessionLocal() as db:
        record = (
            db.query(AuthSession)
            .filter(AuthSession.token_hash == hashlib.sha256(token.encode()).hexdigest())
            .first()
        )
        assert record is not None
        record.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()

    response = client.get("/api/v1/session", headers=auth(token))
    assert response.status_code == 401
    assert "expired" in response.json()["detail"].lower()


def test_demo_account_directory_is_public_but_contains_no_secrets(client: TestClient):
    response = client.get("/api/v1/auth/demo/accounts")
    assert response.status_code == 200
    payload = response.json()
    assert payload["demo_mode"] is True
    assert payload["session_ttl_hours"] > 0
    assert payload["accounts"]
    for group in payload["accounts"]:
        assert group["workspace"]["id"]
        assert group["users"]
        for account in group["users"]:
            assert account["role"] in {"creator", "reviewer", "admin"}
            assert not any("token" in key or "secret" in key for key in account)
            assert "email" in account


def test_unknown_workspace_login_is_rejected(client: TestClient):
    response = client.post(
        "/api/v1/auth/demo/session",
        json={"role": "creator", "workspace_id": str(uuid.uuid4())},
    )
    assert response.status_code == 404
