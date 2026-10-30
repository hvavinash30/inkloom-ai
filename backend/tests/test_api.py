"""End-to-end API tests against a temporary workspace database.

The suite covers role enforcement, the evidence fields that the UI relies on,
version-bound review decisions, PDF/video locations, campaign analysis, and the
honest integration boundaries (images without OCR, assistant mode).
"""
from __future__ import annotations

import base64
import uuid

import pytest

from helpers import demo_login
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services import ai_provider, assistant_service
from app.services.ai_provider import AIResponse


CREATOR: dict[str, str] = {}
REVIEWER: dict[str, str] = {}
ADMIN: dict[str, str] = {}



@pytest.fixture(scope="module", autouse=True)
def demo_identities(client):
    CREATOR.update(demo_login(client, "creator"))
    REVIEWER.update(demo_login(client, "reviewer"))
    ADMIN.update(demo_login(client, "admin"))

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def unique_title(label: str) -> str:
    return f"{label} {uuid.uuid4().hex[:8]}"


def documents_by_title(client: TestClient, title: str, headers=CREATOR) -> list[dict]:
    response = client.get("/api/v1/audits/documents", headers=headers, params={"limit": 250})
    assert response.status_code == 200, response.text
    return [doc for doc in response.json() if doc["title"] == title]


def findings_for(client: TestClient, document: dict) -> list[dict]:
    assert document["latest_audit"], "Expected a stored audit run"
    return document["latest_audit"]["findings"]


def test_health_reports_honest_integration_state(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert data["database"] == "connected"
    assert data["integrations"]["audit_engine"] == "deterministic-rules-v2"
    assert isinstance(data["integrations"]["ocr_configured"], bool)
    assert data["integrations"]["ocr_reason"]
    if data["integrations"]["ocr_configured"]:
        assert "RapidOCR" in data["integrations"]["ocr_reason"]
    assert data["integrations"]["transcription_configured"] is False
    assert data["limits"]["max_pdf_pages"] > 0
    assert data["limits"]["max_ocr_pages"] > 0


def test_session_capabilities_are_role_specific(client):
    creator = client.get("/api/v1/session", headers=CREATOR).json()
    reviewer = client.get("/api/v1/session", headers=REVIEWER).json()
    admin = client.get("/api/v1/session", headers=ADMIN).json()

    assert creator["active_user"]["role"] == "creator"
    assert "content.create" in creator["capabilities"]
    assert "insights.read" not in creator["capabilities"]
    assert "review.decide" not in creator["capabilities"]

    assert "review.queue" in reviewer["capabilities"]
    assert "findings.dismiss" in reviewer["capabilities"]
    assert "brand.manage" not in reviewer["capabilities"]
    assert "content.submit.all" not in reviewer["capabilities"]

    assert {"brand.manage", "org.manage", "insights.read", "evaluation.run"} <= set(
        admin["capabilities"]
    )
    assert admin["workspace"]["is_demo"] is True


def test_server_enforces_role_boundaries(client):
    assert client.get("/api/v1/insights/", headers=CREATOR).status_code == 403
    assert client.get("/api/v1/insights/", headers=REVIEWER).status_code == 403
    assert client.get("/api/v1/insights/", headers=ADMIN).status_code == 200

    assert client.get("/api/v1/reviews/queue", headers=CREATOR).status_code == 403
    assert client.get("/api/v1/reviews/queue", headers=REVIEWER).status_code == 200

    assert client.get("/api/v1/evaluation/", headers=REVIEWER).status_code == 403
    assert client.get("/api/v1/evaluation/", headers=ADMIN).status_code == 200

    assert client.get("/api/v1/brand-rules/", headers=CREATOR).status_code == 200
    forbidden_rule = client.post(
        "/api/v1/brand-rules/",
        headers=CREATOR,
        json={
            "name": "Should not exist",
            "rule_type": "prohibited_phrase",
            "pattern_or_phrase": "forbidden-test-term",
        },
    )
    assert forbidden_rule.status_code == 403


def test_seeded_pdf_has_real_pages_and_page_linked_findings(client):
    response = client.get(
        "/api/v1/audits/documents",
        headers=CREATOR,
        params={"asset_type": "pdf", "limit": 250},
    )
    assert response.status_code == 200
    pdfs = response.json()
    brochure = next(doc for doc in pdfs if doc["title"] == "Q4 Enterprise Brochure (PDF)")
    detail = client.get(f"/api/v1/audits/documents/{brochure['id']}", headers=CREATOR)
    assert detail.status_code == 200
    document = detail.json()

    assert document["file_id"]
    assert document["current_version"]["page_texts"]
    findings = findings_for(client, document)
    assert findings, "The demo PDF should contain seeded violations"
    page_numbers = {finding["page_number"] for finding in findings if finding["page_number"]}
    assert page_numbers, "PDF findings must preserve page numbers"
    assert any("AcmeCloud" in finding["affected_text"] for finding in findings)

    file_response = client.get(f"/api/v1/uploads/{document['file_id']}/file", headers=CREATOR)
    assert file_response.status_code == 200
    assert file_response.headers["content-type"].startswith("application/pdf")
    assert file_response.content.startswith(b"%PDF-")

    provenance = client.get(
        f"/api/v1/audits/documents/{document['id']}/provenance", headers=CREATOR
    )
    assert provenance.status_code == 200
    passport = provenance.json()
    assert passport["is_tampered_or_changed"] is False
    assert passport["audit_history_timeline"]


def test_video_without_a_file_uses_stored_transcript_timestamps(client):
    response = client.get(
        "/api/v1/audits/documents",
        headers=CREATOR,
        params={"asset_type": "video", "limit": 250},
    )
    videos = response.json()
    webinar = next(doc for doc in videos if doc["title"] == "Launch Webinar (transcript only)")
    detail = client.get(f"/api/v1/audits/documents/{webinar['id']}", headers=CREATOR).json()

    assert detail["file_id"] is None
    assert detail["current_version"]["transcript_segments"], "Transcript must be stored"
    findings = findings_for(client, detail)
    timestamped = [finding for finding in findings if finding["timestamp_seconds"] is not None]
    assert timestamped, "Transcript-based findings must carry stored timestamps"
    assert all(finding["location_label"] for finding in timestamped)

    notes = detail["latest_audit"]["extraction_notes"] or ""
    assert "No video file is stored" in notes
    assert "playback and timestamp seeking are unavailable" in notes
    assert "The video player" not in notes


def test_mixed_transcript_checks_untimed_text_without_inventing_timestamps(client):
    title = unique_title("Mixed transcript")
    transcript = (
        "[00:42] Our platform delivers 100% uptime.\n"
        "In addition, AcmeCloud is the #1 fastest cloud!!!\n"
    )
    created = client.post(
        "/api/v1/audits/submit-and-audit",
        headers=CREATOR,
        json={
            "title": title,
            "content_type": "video_script",
            "asset_type": "video",
            "content_text": transcript,
            "transcript_segments": [
                {
                    "timestamp_seconds": 42,
                    "text": "Our platform delivers 100% uptime.",
                }
            ],
        },
    )
    assert created.status_code == 201, created.text
    document = created.json()
    findings = findings_for(client, document)

    timestamped = next(
        finding
        for finding in findings
        if finding["timestamp_seconds"] == 42 and "100% uptime" in finding["affected_text"]
    )
    assert timestamped["location_label"] == "Timestamp 00:42"

    untimed = [
        finding
        for finding in findings
        if finding["timestamp_seconds"] is None and finding["affected_text"] == "AcmeCloud"
    ]
    assert untimed, "Untimestamped transcript text must still be checked"
    assert all(finding["location_label"] == "Transcript (no timestamp)" for finding in untimed)
    assert not any(
        finding["timestamp_seconds"] == 0 and "AcmeCloud" in finding["affected_text"]
        for finding in findings
    ), "Untimestamped text must not be assigned an invented timestamp"

    notes = document["latest_audit"]["extraction_notes"] or ""
    assert "Untimestamped transcript text was checked without timestamps." in notes
    assert "No video file is stored" in notes


def test_image_upload_records_ocr_boundary(client):
    corrupt_png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII="
    )
    rejected = client.post(
        "/api/v1/uploads/",
        headers=CREATOR,
        files={"file": ("boundary-test.png", corrupt_png, "image/png")},
        data={"kind": "image"},
    )
    assert rejected.status_code == 415, rejected.text
    assert "malformed or unreadable" in rejected.json()["detail"].lower()

    from io import BytesIO

    from PIL import Image

    buffer = BytesIO()
    Image.new("RGB", (320, 120), "white").save(buffer, format="PNG")
    blank = client.post(
        "/api/v1/uploads/",
        headers=CREATOR,
        files={"file": ("blank-page.png", buffer.getvalue(), "image/png")},
        data={"kind": "image"},
    )
    assert blank.status_code == 201, blank.text
    upload_data = blank.json()
    assert upload_data["kind"] == "image"
    assert upload_data["extraction_status"] == "no_text"
    assert "found no readable text" in upload_data["extraction_message"]
    assert upload_data["ocr"]["line_count"] == 0

    title = unique_title("Image boundary")
    created = client.post(
        "/api/v1/audits/submit-and-audit",
        headers=CREATOR,
        json={
            "title": title,
            "content_type": "ad_copy",
            "asset_type": "image",
            "upload_id": upload_data["id"],
            "content_text": "",
        },
    )
    assert created.status_code == 201, created.text
    document = created.json()
    assert document["file_id"] == upload_data["id"]
    assert document["latest_audit"]["verification_status"] in {"unable_to_verify", "partially_verified"}
    findings = findings_for(client, document)
    assert any(finding["category"] == "processing_issue" for finding in findings)


def test_revision_review_and_stale_approval_workflow(client):
    title = unique_title("Workflow launch post")
    created = client.post(
        "/api/v1/audits/submit-and-audit",
        headers=CREATOR,
        json={
            "title": title,
            "content_type": "social_media",
            "content_text": (
                "AcmeCloud is the #1 fastest platform with 100% uptime at INR 11,499!!!"
            ),
        },
    )
    assert created.status_code == 201, created.text
    document = created.json()
    document_id = document["id"]
    version_one = document["current_version"]["id"]
    findings = findings_for(client, document)
    assert len(findings) >= 3
    assert document["latest_audit"]["overall_score"] < 100
    assert {finding["category"] for finding in findings} & {
        "policy_violation",
        "unsupported_claim",
        "confirmed_contradiction",
    }

    submit = client.post(
        f"/api/v1/reviews/documents/{document_id}/submit",
        headers=CREATOR,
        json={"notes": "Please review the launch post."},
    )
    assert submit.status_code == 200, submit.text
    assert submit.json()["status"] == "in_review"

    queue = client.get("/api/v1/reviews/queue", headers=REVIEWER).json()
    queued = next(item for item in queue if item["id"] == document_id)
    assert queued["latest_audit"]["findings"], (
        "The queue must include findings so reviewer counts and the high-risk "
        "filter are computed from stored evidence."
    )
    assert any(
        finding["status"] == "open" and finding["severity"] in {"high", "critical"}
        for finding in queued["latest_audit"]["findings"]
    )

    missing_feedback = client.post(
        f"/api/v1/reviews/documents/{document_id}/decision",
        headers=REVIEWER,
        json={"decision": "changes_requested", "version_id": version_one, "feedback": ""},
    )
    assert missing_feedback.status_code == 422

    changes = client.post(
        f"/api/v1/reviews/documents/{document_id}/decision",
        headers=REVIEWER,
        json={
            "decision": "changes_requested",
            "version_id": version_one,
            "feedback": "Use the approved price and remove the absolute uptime claim.",
        },
    )
    assert changes.status_code == 200, changes.text
    assert changes.json()["version_number"] == 1

    revised = client.post(
        f"/api/v1/audits/documents/{document_id}/versions",
        headers=CREATOR,
        json={
            "content_text": (
                "Acme Cloud offers a 99.9% monthly uptime SLA for INR 12,999 per month. "
                "Results vary by workload."
            ),
            "change_summary": "Aligned price, SLA, and product naming with approved facts.",
        },
    )
    assert revised.status_code == 201, revised.text
    revised_doc = revised.json()
    version_two = revised_doc["current_version"]["id"]
    assert revised_doc["current_version_number"] == 2
    assert revised_doc["approval_stale"] is False

    resubmit = client.post(
        f"/api/v1/reviews/documents/{document_id}/submit",
        headers=CREATOR,
        json={"notes": "Version 2 addresses the requested changes."},
    )
    assert resubmit.status_code == 200, resubmit.text

    approve = client.post(
        f"/api/v1/reviews/documents/{document_id}/decision",
        headers=REVIEWER,
        json={
            "decision": "approved",
            "version_id": version_two,
            "feedback": "Version 2 matches the approved facts and disclaimer.",
        },
    )
    assert approve.status_code == 200, approve.text

    approved_doc = client.get(
        f"/api/v1/audits/documents/{document_id}", headers=CREATOR
    ).json()
    assert approved_doc["status"] == "approved"
    assert approved_doc["approved_version_id"] == version_two
    assert approved_doc["approval_stale"] is False

    third = client.post(
        f"/api/v1/audits/documents/{document_id}/versions",
        headers=CREATOR,
        json={
            "content_text": "Acme Cloud plans an updated enterprise launch. Results vary by workload.",
            "change_summary": "Start a newer revision after the approval.",
        },
    )
    assert third.status_code == 201, third.text
    assert third.json()["approval_stale"] is True

    decisions = client.get(
        f"/api/v1/reviews/documents/{document_id}/decisions", headers=CREATOR
    )
    assert decisions.status_code == 200
    assert [item["decision"] for item in decisions.json()][:2] == [
        "approved",
        "changes_requested",
    ]

    reviewer_submit = client.post(
        f"/api/v1/reviews/documents/{document_id}/submit",
        headers=REVIEWER,
        json={"notes": "A reviewer should not submit the creator's content."},
    )
    assert reviewer_submit.status_code == 403


def test_campaign_conflicts_readiness_and_resolution_are_recorded(client):
    campaigns = client.get("/api/v1/campaigns/", headers=ADMIN).json()
    campaign = next(item for item in campaigns if item["name"] == "Q4 Enterprise Launch")
    assert campaign["assets_count"] >= 3
    assert campaign["conflicts"], "Seed should include cross-asset conflicts"
    assert campaign["readiness"]["result"] in {"blocked", "needs_attention"}
    assert any(
        check["status"] == "manual" for check in campaign["readiness"]["checks"]
    ), "Legal sign-off must remain a manual check"

    graph = client.get(f"/api/v1/campaigns/{campaign['id']}/graph", headers=ADMIN)
    assert graph.status_code == 200
    graph_data = graph.json()
    assert any(node["type"] == "asset" for node in graph_data["nodes"])
    assert any(node["type"] == "conflict" for node in graph_data["nodes"])

    unresolved = next(
        conflict for conflict in campaign["conflicts"] if conflict["status"] == "unresolved"
    )
    assert unresolved["approved_value"], "Conflict should cite the approved reference when available"

    resolution = client.post(
        f"/api/v1/campaigns/conflicts/{unresolved['id']}/resolve",
        headers=REVIEWER,
        json={
            "resolved_value": unresolved["approved_value"],
            "resolution_notes": "Use the approved value and update the affected asset manually.",
        },
    )
    assert resolution.status_code == 200, resolution.text
    assert resolution.json()["status"] == "resolved"
    assert resolution.json()["resolved_by"] == "Alex Rivera"


def test_brand_memory_and_impact_analysis_use_real_records(client):
    conflicts = client.get("/api/v1/brand-memory/conflicts", headers=ADMIN)
    assert conflicts.status_code == 200
    assert conflicts.json(), "Seed should include a brand-memory conflict"

    facts = client.get("/api/v1/approved-facts/", headers=ADMIN).json()
    uptime_fact = next(fact for fact in facts if "uptime" in fact["claim_statement"].lower())
    impact = client.get(
        f"/api/v1/brand-memory/facts/{uptime_fact['id']}/impact", headers=ADMIN
    )
    assert impact.status_code == 200
    data = impact.json()
    assert data["entity_id"] == uptime_fact["id"]
    assert "items" in data

    simulated = client.post(
        "/api/v1/brand-memory/simulate-rule",
        headers=ADMIN,
        json={"proposed_pattern": "industry-leading", "proposed_severity": "high"},
    )
    assert simulated.status_code == 200, simulated.text
    assert simulated.json()["current_value"] == "industry-leading"
    assert "items" in simulated.json()


def test_research_requires_sources_before_completion(client):
    missing_source = client.post(
        "/api/v1/research/",
        headers=ADMIN,
        json={
            "section": "literature",
            "title": unique_title("Unsupported completed record"),
            "status": "completed",
            "summary": "This must not be accepted without a source.",
            "details": {},
            "sources": [],
        },
    )
    assert missing_source.status_code == 422

    record = client.post(
        "/api/v1/research/",
        headers=ADMIN,
        json={
            "section": "literature",
            "title": unique_title("Standards reference"),
            "status": "completed",
            "summary": "Desk review of a public standard.",
            "details": {"method": "Read the linked page."},
            "sources": [
                {"title": "W3C WCAG 2.2", "url": "https://www.w3.org/TR/WCAG22/"}
            ],
        },
    )
    assert record.status_code == 201, record.text
    assert record.json()["sources"][0]["url"] == "https://www.w3.org/TR/WCAG22/"

    listed = client.get("/api/v1/research/", headers=ADMIN).json()
    assert listed["records"]
    assert listed["note"]


def test_evaluation_results_come_from_real_runs(client):
    before = client.get("/api/v1/evaluation/", headers=ADMIN).json()
    assert before["cases"], "Seed should define evaluation cases"
    assert before["runs"] is not None

    run = client.post("/api/v1/evaluation/run-all", headers=ADMIN)
    assert run.status_code == 200, run.text
    summary = run.json()
    assert summary["executed_cases"] == len(summary["cases"])
    assert 0 <= summary["pass_rate_percent"] <= 100
    assert summary["runs"]
    run_statuses = {item["status"] for item in summary["runs"]}
    assert run_statuses <= {"passed", "failed", "error"}
    assert summary["note"]


def test_organization_integrations_expose_names_not_secrets(client):
    overview = client.get("/api/v1/organization/overview", headers=ADMIN)
    assert overview.status_code == 200
    assert overview.json()["workspace"]["is_demo"] is True

    integrations = client.get("/api/v1/organization/integrations", headers=ADMIN)
    assert integrations.status_code == 200
    payload = integrations.json()
    assert payload["integrations"]
    for integration in payload["integrations"]:
        assert set(integration).isdisjoint({"api_key", "secret", "token", "service_role_key"})
        for value in integration.values():
            if isinstance(value, str):
                assert "sk-" not in value

    assert client.get("/api/v1/organization/team", headers=CREATOR).status_code == 403


def test_assistant_declares_mode_and_grounding(client):
    response = client.post(
        "/api/v1/assistant/chat",
        headers=CREATOR,
        json={"message": "What is the approved uptime for the enterprise plan?"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["mode"] == "rule_based"
    assert payload["verification"] in {
        "verified_from_workspace_records",
        "general_guidance",
        "unable_to_verify",
    }
    assert payload["limitations"]
    assert payload["verification_note"]


def test_assistant_suggestions_are_grounded(client):
    attention = client.post(
        "/api/v1/assistant/chat",
        headers=CREATOR,
        json={"message": "What needs my attention today?"},
    )
    assert attention.status_code == 200, attention.text
    attention_payload = attention.json()
    assert attention_payload["verification"] == "verified_from_workspace_records"
    assert "attention" in attention_payload["reply"].lower()
    assert "could not verify" not in attention_payload["reply"].lower()

    score = client.post(
        "/api/v1/assistant/chat",
        headers=CREATOR,
        json={"message": "What does the audit score mean?"},
    )
    assert score.status_code == 200, score.text
    score_payload = score.json()
    assert score_payload["verification"] == "general_guidance"
    assert "not a legal risk rating" in score_payload["reply"]
    assert "could not verify" not in score_payload["reply"].lower()

    facts = client.post(
        "/api/v1/assistant/chat",
        headers=CREATOR,
        json={"message": "Which approved facts are outdated?"},
    )
    assert facts.status_code == 200, facts.text
    facts_payload = facts.json()
    assert facts_payload["verification"] == "verified_from_workspace_records"
    assert "approved fact" in facts_payload["reply"].lower()
    assert "could not verify" not in facts_payload["reply"].lower()

    queue = client.post(
        "/api/v1/assistant/chat",
        headers=CREATOR,
        json={"message": "What is waiting in the review queue?"},
    )
    assert queue.status_code == 200, queue.text
    assert "reviewers and admins" in queue.json()["reply"]


def test_dashboard_quality_snapshot_uses_stored_status_and_band(client):
    payload = client.get("/api/v1/dashboard/", headers=CREATOR).json()
    stats = payload["stats"]
    assert stats["average_risk_band"] in {"clean", "low", "medium", "high", "critical", None}
    assert payload["recent_scores"], "Demo workspace should have scored documents"
    for row in payload["recent_scores"]:
        assert row["status"] in {"draft", "audited", "in_review", "changes_requested", "approved", "rejected"}
        assert row["audited_at"], "Recent scores must expose when the audit ran"
        assert 0 <= row["score"] <= 100
    audited_times = [row["audited_at"] for row in payload["recent_scores"]]
    assert audited_times == sorted(audited_times, reverse=True)


def test_assistant_rules_apply_when_no_provider_is_configured(client):
    payload = client.post(
        "/api/v1/assistant/chat",
        headers=CREATOR,
        json={"message": "What needs my attention today?"},
    ).json()
    assert payload["mode"] == "rule_based"
    assert payload["ai_error"] is None
    assert payload["provider"] is None


def test_assistant_uses_configured_provider_for_grounded_wording(client, monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "test-key-not-a-real-credential")
    ai_provider.reset_rate_limits()
    captured: dict[str, str] = {}

    def fake_complete_json(system_prompt, user_prompt, required_keys):
        captured["system"] = system_prompt
        captured["user"] = user_prompt
        captured["keys"] = ",".join(required_keys)
        return (
            AIResponse(ok=True, text='{"reply": "Rewritten."}', provider="openai", model="test-model"),
            {"reply": "Two items are waiting for review and one high-risk finding is open."},
        )

    monkeypatch.setattr(assistant_service.ai_provider, "complete_json", fake_complete_json)

    response = client.post(
        "/api/v1/assistant/chat",
        headers=CREATOR,
        json={"message": "What needs my attention today?"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["mode"] == "grounded_llm"
    assert payload["reply"].startswith("Two items")
    assert payload["verification"] == "verified_from_workspace_records"
    assert payload["provider"] == "openai"
    assert payload["ai_error"] is None
    assert payload["diagnostic_info"]["ai"]["model"] == "test-model"
    assert "Hard rules" in captured["system"]
    assert "Grounded answer to rewrite" in captured["user"]
    assert captured["keys"] == "reply"
    assert "test-key" not in response.text


def test_assistant_provider_failure_falls_back_honestly(client, monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "test-key-not-a-real-credential")
    ai_provider.reset_rate_limits()

    def failing_complete_json(system_prompt, user_prompt, required_keys):
        return (
            AIResponse(
                ok=False,
                provider="openai",
                error_kind=ai_provider.TIMEOUT,
                error_message="The openai request timed out after 20s.",
            ),
            None,
        )

    monkeypatch.setattr(assistant_service.ai_provider, "complete_json", failing_complete_json)

    response = client.post(
        "/api/v1/assistant/chat",
        headers=CREATOR,
        json={"message": "What needs my attention today?"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["mode"] == "rule_based"
    assert "timed out" in payload["ai_error"]
    assert payload["verification"] == "verified_from_workspace_records"
    assert payload["reply"]
    assert any("could not refine" in item for item in payload["limitations"])
    assert payload["diagnostic_info"]["ai"]["error_kind"] == ai_provider.TIMEOUT


def test_assistant_finding_context_offers_corrections_then_allows_follow_up(client):
    created = client.post(
        "/api/v1/audits/submit-and-audit",
        headers=CREATOR,
        json={
            "title": unique_title("Assistant correction context"),
            "content_type": "social_media",
            "content_text": (
                "AcmeCloud is the #1 fastest platform with 100% uptime at INR 11,499!!!"
            ),
        },
    )
    assert created.status_code == 201, created.text
    document = created.json()
    finding = next(
        item for item in findings_for(client, document) if item["suggested_correction"]
    )

    correction = client.post(
        "/api/v1/assistant/chat",
        headers=CREATOR,
        json={
            "message": "What correction do you suggest for this finding?",
            "document_id": document["id"],
            "finding_id": finding["id"],
        },
    )
    assert correction.status_code == 200, correction.text
    payload = correction.json()
    assert payload["verification"] == "verified_from_workspace_records"
    assert finding["suggested_correction"] in payload["reply"]
    assert "not applied" in payload["reply"]
    assert "has not been changed" in payload["reply"]
    assert f"/content/{document['id']}" in {
        action["route"] for action in payload["suggested_actions"]
    }

    follow_up = client.post(
        "/api/v1/assistant/chat",
        headers=CREATOR,
        json={
            "message": "Give me a summary of this document.",
            "document_id": document["id"],
            "finding_id": finding["id"],
        },
    )
    assert follow_up.status_code == 200, follow_up.text
    follow_payload = follow_up.json()
    assert follow_payload["reply"] != payload["reply"]
    assert document["title"] in follow_payload["reply"]


def test_assistant_governance_insights_respect_admin_capability(client):
    admin = client.post(
        "/api/v1/assistant/chat",
        headers=ADMIN,
        json={"message": "Show me governance insights."},
    )
    assert admin.status_code == 200, admin.text
    admin_payload = admin.json()
    assert admin_payload["verification"] == "verified_from_workspace_records"
    assert "Governance health" in admin_payload["reply"]
    assert "/insights" in {action["route"] for action in admin_payload["suggested_actions"]}
    assert "organization admins" not in admin_payload["reply"]

    creator = client.post(
        "/api/v1/assistant/chat",
        headers=CREATOR,
        json={"message": "Show me governance insights."},
    )
    assert creator.status_code == 200, creator.text
    creator_payload = creator.json()
    assert "organization admins" in creator_payload["reply"]
    assert "Governance health" not in creator_payload["reply"]
    assert "/insights" not in {
        action["route"] for action in creator_payload["suggested_actions"]
    }


def test_assistant_explains_review_process_by_role(client):
    creator = client.post(
        "/api/v1/assistant/chat",
        headers=CREATOR,
        json={"message": "How does the approval workflow work?"},
    )
    assert creator.status_code == 200, creator.text
    creator_payload = creator.json()
    assert creator_payload["verification"] == "general_guidance"
    assert "version-bound" in creator_payload["reply"]
    assert "cannot submit, approve, publish, or delete" in creator_payload["reply"]
    assert "/content" in {
        action["route"] for action in creator_payload["suggested_actions"]
    }

    reviewer = client.post(
        "/api/v1/assistant/chat",
        headers=REVIEWER,
        json={"message": "How does the approval workflow work?"},
    )
    assert reviewer.status_code == 200, reviewer.text
    assert "/reviews" in {
        action["route"] for action in reviewer.json()["suggested_actions"]
    }


def test_assistant_navigation_actions_use_registered_routes(client):
    facts = client.post(
        "/api/v1/assistant/chat",
        headers=CREATOR,
        json={"message": "Which approved facts are outdated?"},
    ).json()
    assert "/brand?tab=facts" in {
        action["route"] for action in facts["suggested_actions"]
    }

    rules = client.post(
        "/api/v1/assistant/chat",
        headers=CREATOR,
        json={"message": "What do the brand rules say?"},
    ).json()
    assert "/brand?tab=rules" in {
        action["route"] for action in rules["suggested_actions"]
    }

    queue = client.post(
        "/api/v1/assistant/chat",
        headers=REVIEWER,
        json={"message": "What is waiting in the review queue?"},
    ).json()
    assert "/reviews" in {
        action["route"] for action in queue["suggested_actions"]
    }


def test_upload_limits_and_type_checks(client):
    bad_type = client.post(
        "/api/v1/uploads/",
        headers=CREATOR,
        files={"file": ("payload.exe", b"MZ-not-a-supported-file", "application/octet-stream")},
    )
    assert bad_type.status_code == 415

    empty = client.post(
        "/api/v1/uploads/",
        headers=CREATOR,
        files={"file": ("empty.pdf", b"", "application/pdf")},
    )
    assert empty.status_code == 400

    bad_pdf_signature = client.post(
        "/api/v1/uploads/",
        headers=CREATOR,
        files={"file": ("fake.pdf", b"not a real pdf", "application/pdf")},
    )
    assert bad_pdf_signature.status_code == 415
