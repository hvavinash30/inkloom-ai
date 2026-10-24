from app.models.approved_fact import ApprovedFact
from app.models.brand_rule import BrandRule
from app.services.audit_engine import detect_fact_contradictions, scan_rules


def test_deterministic_engine_detects_prohibited_phrase():
    rule = BrandRule(
        id="test-rule-1",
        workspace_id="ws-1",
        name="100% Uptime Guarantee Prohibition",
        rule_type="prohibited_phrase",
        pattern_or_phrase="100% uptime",
        replacement_or_guidance="99.9% uptime SLA guaranteed",
        severity="critical",
        is_active=True,
        status="active",
    )
    content = "Acme Cloud offers 100% uptime for all deployments."
    findings = scan_rules(content, [rule])

    assert len(findings) == 1
    assert findings[0]["severity"] == "critical"
    assert findings[0]["affected_text"] == "100% uptime"
    assert findings[0]["suggested_correction"] == "99.9% uptime SLA guaranteed"
    assert findings[0]["evidence_status"] == "rule_violation"
    assert findings[0]["source_reference"].startswith("Brand policy: 100% Uptime Guarantee Prohibition")


def test_deterministic_engine_detects_superlative_claim():
    rule = BrandRule(
        id="test-rule-2",
        workspace_id="ws-1",
        name="Unsupported #1 Market Claim",
        rule_type="claim_restriction",
        pattern_or_phrase="#1 fastest",
        replacement_or_guidance="proven high-performance cloud platform",
        severity="high",
        is_active=True,
        status="active",
    )
    content = "Acme Cloud is India's #1 fastest platform."
    findings = scan_rules(content, [rule])

    assert len(findings) == 1
    assert findings[0]["severity"] == "high"
    assert findings[0]["affected_text"] == "#1 fastest"
    assert findings[0]["category"] == "unsupported_claim"


def test_approved_fact_check_identifies_uptime_conflict():
    fact = ApprovedFact(
        id="fact-1",
        workspace_id="ws-1",
        category="Service Level & Availability",
        claim_statement="Service Level Agreement availability commitment",
        approved_value="99.9% uptime SLA guaranteed under enterprise contract",
        source_reference="Demo Enterprise Master Service Agreement §7.1 (fictional source)",
        is_active=True,
        status="verified",
    )
    content = "We guarantee 100% uptime on all server nodes."
    findings = detect_fact_contradictions(content, [fact])

    assert len(findings) == 1
    assert findings[0]["severity"] == "critical"
    assert findings[0]["category"] == "confirmed_contradiction"
    assert "99.9% uptime SLA guaranteed" in findings[0]["supporting_evidence"]
    assert findings[0]["evidence_status"] == "contradicted"
