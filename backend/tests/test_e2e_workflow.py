"""End-to-end creator-to-reviewer workflow against a temporary database.

Covers the sequence the product promises:
submit -> findings -> evidence -> correction -> version -> re-audit ->
review -> refresh persistence -> stale approval.

Everything here runs against the real FastAPI app and the real SQLite database
created by conftest; nothing is mocked. The language-model pathway is absent by
design (LLM_PROVIDER=mock) so the correction step is expected to return a
deterministic, rule-based suggestion.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app


CREATOR = {"X-Inkloom-Role": "creator"}
REVIEWER = {"X-Inkloom-Role": "reviewer"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def _submit_flagged_content(client: TestClient) -> dict:
    title = f"E2E brochure {uuid.uuid4().hex[:8]}"
    body = (
        "Acme Cloud is the cheapest platform for enterprise teams and it offers "
        "100% uptime for every customer on the planet."
    )
    response = client.post(
        "/api/v1/audits/submit-and-audit",
        headers=CREATOR,
        json={
            "title": title,
            "content_type": "product_copy",
            "asset_type": "text",
            "content_text": body,
            "save_as_draft": False,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_full_creator_to_reviewer_workflow(client: TestClient) -> None:
    # 1. Submit -> audited with stored findings.
    document = _submit_flagged_content(client)
    document_id = document["id"]
    assert document["status"] == "audited"
    audit = document["latest_audit"]
    assert audit is not None and audit["total_findings"] >= 1
    findings = audit["findings"]
    assert findings, "Expected at least one deterministic finding"

    # 2. Findings carry exact, traceable evidence.
    content_text = document["current_version"]["content_text"]
    for finding in findings:
        if finding["start_index"] >= 0 and finding["end_index"] > finding["start_index"]:
            excerpt = content_text[finding["start_index"]:finding["end_index"]]
            assert excerpt == finding["affected_text"], (
                "Recorded indices must reproduce the affected text verbatim"
            )
            assert finding["evidence_status"]

    # 3. Correction suggestion is advisory and never mutates the finding.
    target = next(f for f in findings if f["suggested_correction"] or f["rule_id"])
    suggestion = client.post(
        f"/api/v1/audits/findings/{target['id']}/suggest-correction",
        headers=CREATOR,
        json={"reviewer_notes": "Prefer approved wording"},
    )
    assert suggestion.status_code == 200, suggestion.text
    payload = suggestion.json()
    assert payload["mode"] in {"ai", "rule_based"}
    assert payload["finding_id"] == target["id"]
    assert isinstance(payload["limitations"], list) and payload["limitations"]
    # Unconfigured AI must never be simulated and citations only point at stored records.
    if payload["mode"] == "rule_based":
        assert payload["provider_error"]["kind"] == "not_configured"
        for citation in payload["citations"]:
            assert citation["kind"] in {"brand_rule", "approved_fact"}
            assert citation["id"]

    unchanged = client.get(
        f"/api/v1/audits/documents/{document_id}", headers=CREATOR
    ).json()
    same = next(f for f in unchanged["latest_audit"]["findings"] if f["id"] == target["id"])
    assert same["status"] == "open", "Preparing a suggestion must not resolve the finding"

    # 4. Apply a correction by saving a new version -> automatically re-audited.
    revised = "Acme Cloud is a cost-effective platform for enterprise teams and it delivers 99.9% monthly uptime."
    version_response = client.post(
        f"/api/v1/audits/documents/{document_id}/versions",
        headers=CREATOR,
        json={"content_text": revised, "change_summary": "Applied suggested correction"},
    )
    assert version_response.status_code == 201, version_response.text
    after_version = version_response.json()
    assert after_version["current_version_number"] == 2
    assert after_version["status"] == "audited"
    assert after_version["latest_audit"] is not None
    assert after_version["versions_count"] == 2

    # 5. Re-run the check explicitly and confirm it stays on the latest version.
    rerun = client.post(
        f"/api/v1/audits/documents/{document_id}/rerun", headers=CREATOR
    )
    assert rerun.status_code == 200, rerun.text
    assert rerun.json()["latest_audit"]["version_id"] == after_version["current_version"]["id"]

    # 6. Creator submits the current version for review.
    submitted = client.post(
        f"/api/v1/reviews/documents/{document_id}/submit",
        headers=CREATOR,
        json={"notes": "Corrections applied, ready for brand review"},
    )
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["status"] == "in_review"

    # 7. Refresh persistence: a fresh GET returns the stored state.
    refreshed = client.get(
        f"/api/v1/audits/documents/{document_id}", headers=CREATOR
    ).json()
    assert refreshed["status"] == "in_review"
    assert refreshed["current_version_number"] == 2
    assert refreshed["latest_audit"]["total_findings"] == after_version["latest_audit"]["total_findings"]

    # 8. Reviewer approves the submitted version.
    version_id = refreshed["current_version"]["id"]
    decision = client.post(
        f"/api/v1/reviews/documents/{document_id}/decision",
        headers=REVIEWER,
        json={"decision": "approved", "version_id": version_id, "feedback": "Approved."},
    )
    assert decision.status_code == 200, decision.text
    approved = client.get(
        f"/api/v1/audits/documents/{document_id}", headers=CREATOR
    ).json()
    assert approved["status"] == "approved"
    assert approved["approved_version_id"] == version_id
    assert approved["approval_stale"] is False

    # 9. Editing after approval makes the approval stale (derived, not a column).
    stale_response = client.post(
        f"/api/v1/audits/documents/{document_id}/versions",
        headers=CREATOR,
        json={"content_text": revised + " Updated positioning.", "change_summary": "Post-approval edit"},
    )
    assert stale_response.status_code == 201, stale_response.text
    stale = stale_response.json()
    assert stale["current_version_number"] == 3
    assert stale["status"] == "audited"
    assert stale["approved_version_id"] == version_id
    assert stale["approval_stale"] is True, "Editing after approval must mark the approval stale"