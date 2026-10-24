"""AI pathway and correction-suggestion tests.

The suite runs without any AI provider configured, which is the default and the
honest production state in this deployment. It verifies that:

* the provider module reports ``not_configured`` instead of simulating output;
* the correction endpoint returns a clearly-labelled deterministic suggestion
  grounded in stored rules/facts and never mutates the finding or content;
* a simulated AI response cannot smuggle in citations to records that do not
  exist (no invented sources).
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import ai_provider


CREATOR = {"X-Inkloom-Role": "creator"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _clear_limits():
    ai_provider.reset_rate_limits()
    yield
    ai_provider.reset_rate_limits()


def unique_title(label: str) -> str:
    return f"{label} {uuid.uuid4().hex[:8]}"


def audited_document(client: TestClient) -> dict:
    created = client.post(
        "/api/v1/audits/submit-and-audit",
        headers=CREATOR,
        json={
            "title": unique_title("Correction source"),
            "content_type": "social_media",
            "content_text": (
                "AcmeCloud is the #1 fastest platform with 100% uptime at INR 11,499!!!"
            ),
        },
    )
    assert created.status_code == 201, created.text
    return created.json()


def test_provider_reports_not_configured_without_simulating():
    response = ai_provider.complete("system", "user")
    assert response.ok is False
    assert response.error_kind == ai_provider.NOT_CONFIGURED
    assert response.text == ""
    assert ai_provider.provider_status()["configured"] is False


def test_parse_json_object_tolerates_code_fences():
    fenced = '```json\n{"suggested_text": "ok", "rationale": "because"}\n```'
    parsed = ai_provider.parse_json_object(fenced)
    assert parsed == {"suggested_text": "ok", "rationale": "because"}
    assert ai_provider.parse_json_object("not json at all") is None


def test_rate_limiter_enforces_the_configured_bound():
    from app.core.config import settings

    key = "test-actor"
    allowed = sum(1 for _ in range(settings.AI_RATE_LIMIT_PER_MINUTE + 3) if ai_provider.allow_request(key))
    assert allowed == settings.AI_RATE_LIMIT_PER_MINUTE


def test_correction_suggestion_is_deterministic_when_unconfigured(client: TestClient):
    document = audited_document(client)
    findings = document["latest_audit"]["findings"]
    target = next(f for f in findings if f["severity"] in {"high", "critical"})

    response = client.post(
        f"/api/v1/audits/findings/{target['id']}/suggest-correction",
        headers=CREATOR,
        json={},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["mode"] == "rule_based"
    assert data["provider"] is None
    assert data["provider_error"]["kind"] == ai_provider.NOT_CONFIGURED
    assert any("not a language model" in note.lower() for note in data["limitations"])
    assert "not verified proof" in " ".join(data["limitations"]).lower()

    # The finding and the content must be untouched by preparing a suggestion.
    latest = client.get(f"/api/v1/audits/documents/{document['id']}", headers=CREATOR).json()
    assert latest["current_version_number"] == 1
    still_open = next(f for f in latest["latest_audit"]["findings"] if f["id"] == target["id"])
    assert still_open["status"] == "open"


def test_correction_suggestion_cites_stored_records_only(client: TestClient):
    document = audited_document(client)
    target = next(
        f for f in document["latest_audit"]["findings"] if f.get("rule_id") or f.get("fact_id")
    )
    data = client.post(
        f"/api/v1/audits/findings/{target['id']}/suggest-correction",
        headers=CREATOR,
        json={"reviewer_notes": "Prefer the approved wording."},
    ).json()
    assert data["citations"], "A grounded suggestion should cite the matched rule or fact."
    for citation in data["citations"]:
        assert citation["kind"] in {"brand_rule", "approved_fact"}
        assert citation["id"]
        assert citation["source_reference"]


def test_simulated_ai_response_cannot_invent_citations(client: TestClient, monkeypatch):
    document = audited_document(client)
    target = next(f for f in document["latest_audit"]["findings"] if f["severity"] in {"high", "critical"})

    def fake_configured() -> bool:
        return True

    def fake_complete_json(system_prompt, user_prompt, required_keys):
        return (
            ai_provider.AIResponse(ok=True, text="{}", provider="openai", model="gpt-4o-mini"),
            {
                "suggested_text": "Acme Cloud offers a 99.9% monthly uptime SLA per approved records.",
                "rationale": "Aligns with the approved availability commitment.",
                "cited_rule_ids": ["nonexistent-rule-id", "another-fake-id"],
                "cited_fact_ids": ["nonexistent-fact-id"],
                "cautions": [],
            },
        )

    monkeypatch.setattr(ai_provider, "is_configured", fake_configured)
    monkeypatch.setattr(ai_provider, "complete_json", fake_complete_json)

    data = client.post(
        f"/api/v1/audits/findings/{target['id']}/suggest-correction",
        headers=CREATOR,
        json={},
    ).json()

    assert data["mode"] == "ai"
    assert data["provider"] == "openai"
    # None of the fabricated ids may survive into citations.
    assert data["citations"] == []
    assert any("not stored in this workspace" in note for note in data["cautions"])
    assert any("did not cite a stored rule" in note for note in data["cautions"])


def test_suggestion_404_for_unknown_finding(client: TestClient):
    response = client.post(
        "/api/v1/audits/findings/does-not-exist/suggest-correction", headers=CREATOR, json={}
    )
    assert response.status_code == 404