"""Governance insights computed from stored records only.

Every test provisions a separate non-demo workspace so exact counts are known
and the shared demo seed is only used to prove cross-workspace isolation.
Assertions cross-check API output against rows in the temporary test database.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.approved_fact import ApprovedFact
from app.models.audit import AuditFinding, AuditRun
from app.models.brand_rule import BrandRule
from app.models.content import ContentDocument
from app.models.review import FindingOverride
from helpers import demo_login


RISKY_TEXT = (
    "Our platform delivers reliable service for enterprise teams. "
    "This offer includes guaranteed results for every customer."
)
REVISED_TEXT = (
    "Our platform delivers dependable service for enterprise teams. "
    "This offer includes guaranteed results for every customer."
)
DISMISSAL_REASON = "Legal approved this campaign wording for the current quarter."


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def create_brand(client: TestClient, label: str) -> dict:
    payload = {
        "name": f"{label} {uuid.uuid4().hex[:6]}",
        "owner_name": "Priya Sharma",
        "description": "Workspace used to verify governance insight math.",
        "industry": "Developer tools",
        "audience": "Platform engineering leads",
        "voice": "Direct, technical, and calm.",
        "approved_claims": [
            {"claim": "Enterprise list price", "value": "INR 4,999 per month", "category": "Pricing"}
        ],
        "restricted_claims": ["guaranteed results"],
        "terminology": [{"preferred": "Nimbus Cloud", "avoid": "NimbusCloud"}],
    }
    response = client.post(
        "/api/v1/workspaces/", headers=demo_login(client, "creator"), json=payload
    )
    assert response.status_code == 201, response.text
    return response.json()


def submit(client: TestClient, headers: dict, text: str) -> dict:
    response = client.post(
        "/api/v1/audits/submit-and-audit",
        headers=headers,
        json={
            "title": f"Insight fixture {uuid.uuid4().hex[:8]}",
            "content_type": "product_copy",
            "asset_type": "text",
            "content_text": text,
            "save_as_draft": False,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def add_version(client: TestClient, headers: dict, document_id: str, text: str) -> dict:
    response = client.post(
        f"/api/v1/audits/documents/{document_id}/versions",
        headers=headers,
        json={"content_text": text, "change_summary": "Insight fixture revision"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def get_insights(client: TestClient, headers: dict, **params) -> dict:
    response = client.get("/api/v1/insights/", headers=headers, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def dismiss_rule_findings(client: TestClient, headers: dict, document: dict, reason: str) -> int:
    detail = client.get(
        f"/api/v1/audits/documents/{document['id']}", headers=headers
    ).json()
    findings = [finding for finding in detail["latest_audit"]["findings"] if finding["rule_id"]]
    assert findings, "Expected a rule-linked finding for the dismissal fixture"
    for finding in findings:
        response = client.patch(
            f"/api/v1/audits/findings/{finding['id']}",
            headers=headers,
            json={"action": "dismiss", "dismissal_reason": reason},
        )
        assert response.status_code == 200, response.text
    return len(findings)


def test_recurring_violations_count_findings_documents_and_runs_separately(client: TestClient):
    brand = create_brand(client, "Insight recurrence")
    admin = demo_login(client, "admin", brand["id"])
    creator = demo_login(client, "creator", brand["id"])

    document = submit(client, creator, RISKY_TEXT)
    add_version(client, creator, document["id"], REVISED_TEXT)

    payload = get_insights(client, admin)
    assert payload["documents_evaluated"] == 1
    assert payload["audits_all_time"] == 2

    group = next(
        item
        for item in payload["recurring_violations"]
        if item["rule_name"] == "Restricted claim — guaranteed results"
    )
    assert group["finding_count"] == 2
    assert group["unique_documents"] == 1
    assert group["audit_run_count"] == 2
    assert group["severity"] == "high"
    assert group["category"] == "policy_violation"
    assert group["documents"] == [{"id": document["id"], "title": document["title"]}]
    assert "guaranteed results" in group["sample_affected_text"]
    assert group["first_seen"] and group["last_seen"]
    assert payload["risk_signal_counts"]["recurring_violation_groups"] == len(
        payload["recurring_violations"]
    )

    with SessionLocal() as db:
        document_ids = [
            row.id
            for row in db.query(ContentDocument)
            .filter(ContentDocument.workspace_id == brand["id"])
            .all()
        ]
        run_ids = [
            row.id
            for row in db.query(AuditRun)
            .filter(AuditRun.document_id.in_(document_ids))
            .all()
        ]
        stored_findings = (
            db.query(AuditFinding).filter(AuditFinding.audit_run_id.in_(run_ids)).count()
        )
    method = payload["metric_methods"]["recurring_violations"]
    assert method["sample_size"] == stored_findings == 2
    assert payload["reporting_window"]["audit_runs_from"] is not None
    assert payload["reporting_window"]["audit_runs_to"] is not None

    assert {"content_types", "asset_types", "statuses"} <= set(payload["filter_options"])
    assert "product_copy" in payload["filter_options"]["content_types"]
    assert get_insights(client, admin, status="approved")["documents_evaluated"] == 0
    assert get_insights(client, admin, content_type="product_copy")["documents_evaluated"] == 1


def test_overridden_rules_report_reasons_rates_and_review_flag(client: TestClient):
    brand = create_brand(client, "Insight overrides")
    admin = demo_login(client, "admin", brand["id"])
    creator = demo_login(client, "creator", brand["id"])

    document = submit(client, creator, RISKY_TEXT)
    dismissed = dismiss_rule_findings(client, admin, document, DISMISSAL_REASON)
    revised = add_version(client, creator, document["id"], REVISED_TEXT)
    dismissed += dismiss_rule_findings(client, admin, revised, DISMISSAL_REASON)

    payload = get_insights(client, admin)
    assert len(payload["overridden_rules"]) == 1
    entry = payload["overridden_rules"][0]
    assert entry["rule_name"] == "Restricted claim — guaranteed results"
    assert entry["override_count"] == dismissed == 2
    assert entry["unique_documents"] == 1
    assert entry["rule_findings_in_scope"] == dismissed
    assert entry["override_rate_percent"] == 100.0
    assert entry["may_need_review"] is True
    assert "rule text" in entry["review_note"]
    assert entry["reasons"][0]["reason"] == DISMISSAL_REASON
    assert entry["reasons"][0]["count"] == 2
    assert entry["last_overridden_at"] is not None
    assert payload["risk_signal_counts"]["overridden_rule_groups"] == 1
    assert payload["metric_methods"]["overridden_rules"]["sample_size"] == 2

    with SessionLocal() as db:
        stored = (
            db.query(FindingOverride)
            .filter(FindingOverride.workspace_id == brand["id"])
            .count()
        )
    assert stored == dismissed

    demo_admin = demo_login(client, "admin", settings.DEFAULT_WORKSPACE_ID)
    demo_payload = get_insights(client, demo_admin)
    assert all(
        reason["reason"] != DISMISSAL_REASON
        for rule in demo_payload["overridden_rules"]
        for reason in rule["reasons"]
    )


def test_facts_needing_verification_use_recorded_criteria(client: TestClient):
    brand = create_brand(client, "Insight facts")
    admin = demo_login(client, "admin", brand["id"])

    baseline = get_insights(client, admin)
    assert baseline["facts_needing_verification"]["count"] == 0
    assert baseline["facts_needing_verification"]["total_active_facts"] == 4

    now = datetime.now(timezone.utc)
    token = uuid.uuid4().hex[:8]
    with SessionLocal() as db:
        db.add_all(
            [
                ApprovedFact(
                    id=f"fact-expired-{token}",
                    workspace_id=brand["id"],
                    category="Pricing",
                    claim_statement=f"Expired price claim {token}",
                    approved_value="INR 1,999 per month",
                    source_reference="Pricing sheet v1",
                    is_active=True,
                    status="expired",
                    is_demo=False,
                ),
                ApprovedFact(
                    id=f"fact-overdue-{token}",
                    workspace_id=brand["id"],
                    category="Support",
                    claim_statement=f"Overdue review claim {token}",
                    approved_value="24/7 support",
                    source_reference="",
                    is_active=True,
                    status="verified",
                    next_review_at=now - timedelta(days=3),
                    is_demo=False,
                ),
                ApprovedFact(
                    id=f"fact-healthy-{token}",
                    workspace_id=brand["id"],
                    category="Support",
                    claim_statement=f"Healthy claim {token}",
                    approved_value="Business-hours support",
                    source_reference="Support policy v4",
                    is_active=True,
                    status="verified",
                    next_review_at=now + timedelta(days=90),
                    is_demo=False,
                ),
            ]
        )
        db.commit()

    payload = get_insights(client, admin)
    facts = payload["facts_needing_verification"]
    assert facts["count"] == 2
    assert facts["total_active_facts"] == 7
    assert payload["outdated_facts_count"] == 2
    assert payload["risk_signal_counts"]["facts_needing_verification"] == 2
    assert facts["criteria"]
    assert "three recorded criteria" in facts["method_note"]

    items = {item["id"]: item for item in facts["items"]}
    assert f"fact-expired-{token}" in items
    assert f"fact-overdue-{token}" in items
    assert f"fact-healthy-{token}" not in items
    assert any("expired" in reason for reason in items[f"fact-expired-{token}"]["reasons"])
    overdue_reasons = items[f"fact-overdue-{token}"]["reasons"]
    assert any("Review date passed" in reason for reason in overdue_reasons)
    assert any("No usable source" in reason for reason in overdue_reasons)
    assert items[f"fact-overdue-{token}"]["reasons_count"] == 2

    demo_admin = demo_login(client, "admin", settings.DEFAULT_WORKSPACE_ID)
    demo_payload = get_insights(client, demo_admin)
    assert all(
        item["id"] != f"fact-expired-{token}"
        for item in demo_payload["facts_needing_verification"]["items"]
    )


def test_unclear_guideline_signals_come_from_rule_text(client: TestClient):
    brand = create_brand(client, "Insight guidelines")
    admin = demo_login(client, "admin", brand["id"])

    baseline = get_insights(client, admin)
    assert baseline["unclear_guidelines"]["count"] == 0
    assert baseline["unclear_guidelines"]["evaluated_rules"] == 2

    response = client.post(
        "/api/v1/brand-rules/",
        headers=admin,
        json={
            "name": "Appropriate professional tone",
            "rule_type": "tone_guideline",
            "pattern_or_phrase": "!!",
            "severity": "low",
            "is_active": True,
            "status": "active",
        },
    )
    assert response.status_code == 201, response.text
    rule_id = response.json()["id"]

    payload = get_insights(client, admin)
    guidelines = payload["unclear_guidelines"]
    assert guidelines["count"] == 1
    assert guidelines["evaluated_rules"] == 3
    assert payload["risk_signal_counts"]["unclear_guideline_signals"] == 1
    item = next(entry for entry in guidelines["items"] if entry["id"] == rule_id)
    joined = " ".join(item["signals"]).lower()
    assert "appropriate" in joined
    assert "no description recorded" in joined
    assert "single short word" in joined
    assert item["signals_count"] == len(item["signals"]) >= 3

    with SessionLocal() as db:
        active_rules = (
            db.query(BrandRule)
            .filter(BrandRule.workspace_id == brand["id"], BrandRule.is_active.is_(True))
            .count()
        )
    assert guidelines["evaluated_rules"] == active_rules

    demo_admin = demo_login(client, "admin", settings.DEFAULT_WORKSPACE_ID)
    demo_payload = get_insights(client, demo_admin)
    assert all(
        item["id"] != rule_id for item in demo_payload["unclear_guidelines"]["items"]
    )


def test_empty_workspace_reports_empty_signals_without_inventing_data(client: TestClient):
    brand = create_brand(client, "Insight empty")
    admin = demo_login(client, "admin", brand["id"])

    payload = get_insights(client, admin)
    assert payload["total_audits_evaluated"] == 0
    assert payload["documents_evaluated"] == 0
    assert payload["average_score"] == 0.0
    assert payload["governance_health_status"] == "No completed checks"
    assert payload["recurring_violations"] == []
    assert payload["recurring_patterns"] == []
    assert payload["overridden_rules"] == []
    assert payload["facts_needing_verification"]["count"] == 0
    assert payload["unclear_guidelines"]["count"] == 0
    assert payload["risk_signal_counts"] == {
        "recurring_violation_groups": 0,
        "overridden_rule_groups": 0,
        "facts_needing_verification": 0,
        "unclear_guideline_signals": 0,
    }
    assert payload["reporting_window"] == {
        "audit_runs_from": None,
        "audit_runs_to": None,
        "overrides_from": None,
        "overrides_to": None,
    }
    assert payload["metric_methods"]["recurring_violations"]["sample_size"] == 0
    assert payload["metric_methods"]["overridden_rules"]["sample_size"] == 0
    assert payload["metric_methods"]["facts_needing_verification"]["sample_size"] == 4
    assert payload["metric_methods"]["unclear_guidelines"]["sample_size"] == 2
    assert all(bucket["count"] == 0 for bucket in payload["score_distribution"])
