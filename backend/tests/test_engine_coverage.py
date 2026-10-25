"""Coverage for the expanded deterministic checks, findings grouping, and the
stored-data-only review summary.

These tests assert that new checks are genuinely computed from the content or
from configured records, that grouping never double-counts, and that the review
summary mirrors the stored rows rather than inventing figures.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.approved_fact import ApprovedFact
from app.models.brand_rule import BrandRule
from app.services.audit_engine import (
    assign_finding_group,
    detect_all_caps_runs,
    detect_fact_contradictions,
    detect_inconsistent_product_naming,
    group_findings,
    run_text_audit,
)


CREATOR = {"X-Inkloom-Role": "creator"}
REVIEWER = {"X-Inkloom-Role": "reviewer"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def unique_title(label: str) -> str:
    return f"{label} {uuid.uuid4().hex[:8]}"


def naming_fact() -> ApprovedFact:
    return ApprovedFact(
        id="fact-naming-1",
        workspace_id="ws-1",
        category="Product Naming",
        claim_statement="Product name format",
        approved_value="Acme Cloud (two words, title case)",
        source_reference="Brand naming standard §1 (fictional source)",
        is_active=True,
        status="verified",
    )


def test_all_caps_run_is_flagged_but_approved_acronyms_are_not():
    findings = detect_all_caps_runs("ACME CLOUD DELIVERS RESULTS. Our SOC 2 and GDPR reports are ready.", [])
    flagged = {f["affected_text"] for f in findings}
    assert {"ACME", "CLOUD", "DELIVERS", "RESULTS"} <= flagged
    assert "GDPR" not in flagged, "Allowlisted acronyms must not be flagged as all-caps runs."
    assert all(f["category"] == "accessibility_issue" for f in findings)
    assert all(f["evidence_status"] == "potential_violation" for f in findings)


def test_all_caps_check_skips_already_covered_spans():
    existing = [
        {
            "start_index": 0,
            "end_index": 4,
            "category": "policy_violation",
        }
    ]
    findings = detect_all_caps_runs("ACME CLOUD rocks", existing)
    assert all(f["affected_text"] != "ACME" for f in findings)


def test_inconsistent_product_name_uses_the_approved_naming_fact():
    findings = detect_inconsistent_product_naming("AcmeCloud is the platform we ship.", [naming_fact()], [])
    assert len(findings) == 1
    finding = findings[0]
    assert finding["category"] == "style_suggestion"
    assert finding["suggested_correction"] == "Acme Cloud"
    assert finding["fact_id"] == "fact-naming-1"
    assert finding["affected_text"] == "AcmeCloud"


def test_canonical_product_name_is_not_flagged():
    findings = detect_inconsistent_product_naming("Acme Cloud is the platform we ship.", [naming_fact()], [])
    assert findings == []


def test_product_naming_check_only_runs_when_a_naming_fact_exists():
    non_naming = ApprovedFact(
        id="fact-pricing-1",
        workspace_id="ws-1",
        category="Pricing",
        claim_statement="List price",
        approved_value="INR 12,999 per month",
        source_reference="Price sheet",
        is_active=True,
        status="verified",
    )
    assert detect_inconsistent_product_naming("AcmeCloud rocks", [non_naming], []) == []


def test_naming_detector_does_not_duplicate_a_matching_rule_finding():
    rule = BrandRule(
        id="rule-naming",
        workspace_id="ws-1",
        name="Official product capitalization",
        rule_type="product_naming",
        pattern_or_phrase="AcmeCloud",
        replacement_or_guidance="Acme Cloud",
        severity="medium",
        is_active=True,
        status="active",
    )
    result = run_text_audit("AcmeCloud is the platform.", [rule], [naming_fact()])
    naming_findings = [f for f in result.findings if "AcmeCloud" in f["affected_text"]]
    assert len(naming_findings) == 1, "The rule match and the naming detector must dedupe to one finding."


def test_grouping_assigns_one_group_per_finding():
    result = run_text_audit(
        "AcmeCloud is the #1 fastest platform with 100% uptime and ACME SHOUTING!!!",
        [],
        [naming_fact()],
    )
    # Grouping is called on stored findings in the API, so give each a stable id here.
    for index, finding in enumerate(result.findings):
        finding["id"] = f"finding-{index}"
    groups = group_findings(result.findings)
    total = sum(group["count"] for group in groups)
    assert total == len(result.findings), "Groups must partition findings without double-counting."
    ids = [fid for group in groups for fid in group["finding_ids"]]
    assert len(ids) == len(set(ids)), "A finding must appear in exactly one group."


def test_group_ids_are_meaningful():
    assert assign_finding_group({"status": "dismissed", "severity": "high", "category": "policy_violation"}) == "resolved"
    assert assign_finding_group({"status": "open", "severity": "critical", "category": "style_suggestion"}) == "priority"
    assert assign_finding_group({"status": "open", "severity": "low", "category": "unsupported_claim"}) == "unsupported_claims"
    assert assign_finding_group({"status": "open", "severity": "low", "category": "policy_violation", "evidence_status": "missing_required_text"}) == "missing_required"
    assert assign_finding_group({"status": "open", "severity": "low", "category": "style_suggestion"}) == "tone_style"
    assert assign_finding_group({"status": "open", "severity": "low", "category": "needs_human_review"}) == "review"
    assert assign_finding_group({"status": "open", "severity": "low", "category": "processing_issue"}) == "limits"


def test_review_summary_mirrors_stored_records(client: TestClient):
    created = client.post(
        "/api/v1/audits/submit-and-audit",
        headers=CREATOR,
        json={
            "title": unique_title("Summary source"),
            "content_type": "social_media",
            "content_text": "AcmeCloud is the #1 fastest platform with 100% uptime at INR 11,499!!!",
        },
    )
    assert created.status_code == 201, created.text
    document = created.json()
    document_id = document["id"]
    stored_findings = document["latest_audit"]["findings"]

    summary = client.get(f"/api/v1/audits/documents/{document_id}/review-summary", headers=CREATOR)
    assert summary.status_code == 200, summary.text
    data = summary.json()

    assert data["audit"]["total_findings"] == len(stored_findings)
    assert data["audit"]["open_findings"] == len([f for f in stored_findings if f["status"] == "open"])
    assert data["audit"]["overall_score"] == document["latest_audit"]["overall_score"], (
        "The summary must not recompute or invent a score."
    )
    assert sum(group["count"] for group in data["groups"]) == len(stored_findings)
    assert data["version"]["current_version_number"] == 1
    assert data["version"]["approval_stale"] is False
    assert any(action["id"] == "submit" for action in data["outstanding_actions"])


def test_review_summary_tracks_decisions_and_stale_approval(client: TestClient):
    created = client.post(
        "/api/v1/audits/submit-and-audit",
        headers=CREATOR,
        json={
            "title": unique_title("Summary workflow"),
            "content_type": "social_media",
            "content_text": "Acme Cloud offers a 99.9% monthly uptime SLA. Results vary by workload.",
        },
    )
    document_id = created.json()["id"]
    version_one = created.json()["current_version"]["id"]
    client.post(f"/api/v1/reviews/documents/{document_id}/submit", headers=CREATOR, json={"notes": "Review"})
    approve = client.post(
        f"/api/v1/reviews/documents/{document_id}/decision",
        headers=REVIEWER,
        json={"decision": "approved", "version_id": version_one, "feedback": "Matches approved facts."},
    )
    assert approve.status_code == 200, approve.text

    approved_summary = client.get(
        f"/api/v1/audits/documents/{document_id}/review-summary", headers=CREATOR
    ).json()
    assert approved_summary["status"] == "approved"
    assert approved_summary["approval"]["decisions_count"] == 1
    assert approved_summary["approval"]["latest_decision"] == "approved"
    assert approved_summary["version"]["approval_stale"] is False

    revised = client.post(
        f"/api/v1/audits/documents/{document_id}/versions",
        headers=CREATOR,
        json={
            "content_text": "Acme Cloud plans an updated launch. Results vary by workload.",
            "change_summary": "Newer revision after approval.",
        },
    )
    assert revised.status_code == 201, revised.text

    stale_summary = client.get(
        f"/api/v1/audits/documents/{document_id}/review-summary", headers=CREATOR
    ).json()
    assert stale_summary["version"]["approval_stale"] is True
    assert any(action["id"] == "stale" for action in stale_summary["outstanding_actions"])
    assert stale_summary["approval"]["latest_decision"] == "approved"

def price_fact() -> ApprovedFact:
    return ApprovedFact(
        id="fact-price-1",
        workspace_id="ws-1",
        category="Pricing",
        claim_statement="Enterprise list price",
        approved_value="USD 49 per user per month",
        source_reference="Commercial schedule v3 (fictional source)",
        is_active=True,
        status="verified",
    )


def test_price_contradiction_supports_iso_currency_codes():
    text = "Our enterprise list price is USD 99 per user per month."
    findings = detect_fact_contradictions(text, [price_fact()])
    assert len(findings) == 1
    finding = findings[0]
    assert finding["category"] == "confirmed_contradiction"
    assert finding["affected_text"] == "USD 99 per user per month"
    assert text[finding["start_index"] : finding["end_index"]] == finding["affected_text"]
    assert finding["evidence_status"] == "contradicted"
    assert "USD 49" in finding["supporting_evidence"]
    assert finding["suggested_correction"] == "USD 49 per user per month"
    applied = text[: finding["start_index"]] + finding["suggested_correction"] + text[finding["end_index"]:]
    assert applied == "Our enterprise list price is USD 49 per user per month."


def test_price_correction_replaces_the_whole_currency_unit_phrase():
    fact = ApprovedFact(
        id="fact-price-inr",
        workspace_id="ws-1",
        category="Pricing",
        claim_statement="Enterprise list price",
        approved_value="INR 12,999 per month per organization",
        source_reference="Commercial schedule v3 (fictional source)",
        is_active=True,
        status="verified",
    )
    text = "Enterprise plans start at INR 11,499 per month with onboarding included."
    findings = detect_fact_contradictions(text, [fact])
    assert len(findings) == 1
    finding = findings[0]
    assert finding["affected_text"] == "INR 11,499 per month"
    applied = text[: finding["start_index"]] + finding["suggested_correction"] + text[finding["end_index"]:]
    assert applied == "Enterprise plans start at INR 12,999 per month per organization with onboarding included."


def test_matching_iso_price_with_decimal_formatting_is_not_flagged():
    assert detect_fact_contradictions("Enterprise list price: USD 49.00.", [price_fact()]) == []


def test_price_check_does_not_invent_a_currency_amount():
    assert detect_fact_contradictions("Our enterprise list price is competitive.", [price_fact()]) == []
