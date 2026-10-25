"""Workspace creation, switching, and isolation tests.

These exercise the judge-facing flow: list the shared demo workspace, create a
separate brand workspace with its own rules and approved facts, audit content
against only those records, and confirm another workspace cannot read or edit
the result. The demo workspace is never modified by these tests.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app


def headers(workspace_id: str | None = None, role: str = "creator") -> dict:
    result = {"X-Inkloom-Role": role}
    if workspace_id:
        result["X-Inkloom-Workspace"] = workspace_id
    return result


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="module")
def demo_workspace(client: TestClient) -> dict:
    session = client.get("/api/v1/session", headers=headers()).json()
    return session["workspace"]


def create_brand(client: TestClient, label: str, **overrides) -> dict:
    payload = {
        "name": f"{label} {uuid.uuid4().hex[:6]}",
        "owner_name": "Priya Sharma",
        "description": "Test brand workspace for isolation checks.",
        "industry": "Developer tools",
        "audience": "Platform engineering leads",
        "voice": "Direct, technical, and calm.",
        "approved_claims": [
            {"claim": "Enterprise list price", "value": "INR 4,999 per month", "category": "Pricing"}
        ],
        "restricted_claims": ["guaranteed results"],
        "terminology": [{"preferred": "Nimbus Cloud", "avoid": "NimbusCloud"}],
    }
    payload.update(overrides)
    response = client.post("/api/v1/workspaces/", headers=headers(), json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_session_lists_demo_workspace_and_available_workspaces(
    client: TestClient, demo_workspace: dict
):
    session = client.get("/api/v1/session", headers=headers()).json()
    assert session["workspace"]["id"] == demo_workspace["id"]
    assert session["workspace"]["is_demo"] is True
    assert session["workspace"]["counts"]["documents"] > 0
    assert any(item["is_demo"] for item in session["workspaces"])
    assert len(session["users"]) >= 3


def test_create_workspace_builds_isolated_brand_records(client: TestClient, demo_workspace: dict):
    created = create_brand(client, "Nimbus Tools")
    workspace_id = created["id"]

    assert created["is_demo"] is False
    assert created["counts"]["documents"] == 0
    assert created["counts"]["rules"] == 2, created
    assert created["counts"]["facts"] == 4, created

    custom_session = client.get(
        "/api/v1/session", headers=headers(workspace_id, "admin")
    ).json()
    assert custom_session["workspace"]["id"] == workspace_id
    assert custom_session["workspace"]["is_demo"] is False
    assert custom_session["active_user"]["full_name"] == "Priya Sharma"
    assert {user["role"] for user in custom_session["users"]} == {"creator", "reviewer", "admin"}

    custom_rules = client.get(
        "/api/v1/brand-rules/", headers=headers(workspace_id, "admin")
    ).json()
    assert len(custom_rules) == 2
    assert all(rule["workspace_id"] == workspace_id for rule in custom_rules)
    assert all(rule["is_demo"] is False for rule in custom_rules)
    assert {rule["pattern_or_phrase"] for rule in custom_rules} == {
        "guaranteed results",
        "NimbusCloud",
    }

    custom_facts = client.get(
        "/api/v1/approved-facts/", headers=headers(workspace_id, "admin")
    ).json()
    assert all(fact["workspace_id"] == workspace_id for fact in custom_facts)
    assert all(fact["is_demo"] is False for fact in custom_facts)
    assert any("INR 4,999" in fact["approved_value"] for fact in custom_facts)

    demo_rules = client.get(
        "/api/v1/brand-rules/", headers=headers(demo_workspace["id"], "admin")
    ).json()
    assert all(rule["workspace_id"] == demo_workspace["id"] for rule in demo_rules)
    assert all(rule["pattern_or_phrase"] != "guaranteed results" for rule in demo_rules)
    assert all(rule["is_demo"] is True for rule in demo_rules)


def test_custom_workspace_audit_uses_only_its_own_rules_and_facts(client: TestClient):
    created = create_brand(client, "Audit Scope")
    workspace_id = created["id"]
    text = (
        "NimbusCloud delivers guaranteed results for INR 9,999 per month. "
        "Platform teams can migrate in a weekend."
    )
    response = client.post(
        "/api/v1/audits/submit-and-audit",
        headers=headers(workspace_id, "creator"),
        json={
            "title": "Scope check",
            "content_type": "social_media",
            "content_text": text,
            "asset_type": "text",
        },
    )
    assert response.status_code == 201, response.text
    document = response.json()
    assert document["workspace_id"] == workspace_id
    assert document["is_demo"] is False

    detail = client.get(
        f"/api/v1/audits/documents/{document['id']}",
        headers=headers(workspace_id, "creator"),
    ).json()
    findings = detail["latest_audit"]["findings"]
    phrases = {finding["affected_text"] for finding in findings}
    assert "guaranteed results" in phrases
    assert "NimbusCloud" in phrases
    assert any(finding["category"] == "confirmed_contradiction" for finding in findings)
    for finding in findings:
        if finding.get("affected_text") and finding.get("start_index") is not None:
            start = finding["start_index"]
            end = finding["end_index"]
            assert text[start:end] == finding["affected_text"]

    # The same document is invisible from the shared demo workspace.
    cross = client.get(
        f"/api/v1/audits/documents/{document['id']}", headers=headers()
    )
    assert cross.status_code == 404

    demo_list = client.get("/api/v1/audits/documents", headers=headers()).json()
    assert all(item["id"] != document["id"] for item in demo_list)


def test_workspace_edit_requires_the_active_workspace_and_admin_role(
    client: TestClient, demo_workspace: dict
):
    created = create_brand(client, "Editable Brand")
    workspace_id = created["id"]
    new_name = f"Renamed {uuid.uuid4().hex[:6]}"

    # Wrong active workspace.
    denied = client.patch(
        f"/api/v1/workspaces/{workspace_id}",
        headers=headers(demo_workspace["id"], "admin"),
        json={"name": new_name},
    )
    assert denied.status_code == 403

    # Right workspace, insufficient role.
    forbidden = client.patch(
        f"/api/v1/workspaces/{workspace_id}",
        headers=headers(workspace_id, "creator"),
        json={"name": new_name},
    )
    assert forbidden.status_code == 403

    updated = client.patch(
        f"/api/v1/workspaces/{workspace_id}",
        headers=headers(workspace_id, "admin"),
        json={"name": new_name, "description": "Updated description."},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == new_name

    demo = client.get(
        f"/api/v1/workspaces/{demo_workspace['id']}", headers=headers()
    ).json()
    assert demo["name"] == demo_workspace["name"]


def test_unknown_workspace_is_rejected_and_slugs_are_unique(client: TestClient):
    missing = client.get(
        "/api/v1/session", headers={"X-Inkloom-Workspace": str(uuid.uuid4())}
    )
    assert missing.status_code == 404

    shared_name = f"Duplicate Brand {uuid.uuid4().hex[:6]}"
    first = create_brand(client, shared_name)
    second = create_brand(client, shared_name)
    assert first["id"] != second["id"]
    assert first["slug"] != second["slug"]


def test_creator_cannot_read_another_authors_document_in_the_same_workspace(
    client: TestClient,
):
    created = create_brand(client, "Ownership Check")
    workspace_id = created["id"]
    admin_document = client.post(
        "/api/v1/audits/submit-and-audit",
        headers=headers(workspace_id, "admin"),
        json={
            "title": "Admin draft",
            "content_type": "product_copy",
            "content_text": "A draft created by the workspace admin.",
            "asset_type": "text",
        },
    )
    assert admin_document.status_code == 201, admin_document.text
    document_id = admin_document.json()["id"]

    creator_view = client.get(
        f"/api/v1/audits/documents/{document_id}",
        headers=headers(workspace_id, "creator"),
    )
    assert creator_view.status_code == 403

    reviewer_view = client.get(
        f"/api/v1/audits/documents/{document_id}",
        headers=headers(workspace_id, "reviewer"),
    )
    assert reviewer_view.status_code == 200
