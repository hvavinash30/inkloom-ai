from app.models.approved_fact import ApprovedFact
from app.models.brand_rule import BrandRule
from app.services.audit_engine import (
    detect_fact_contradictions,
    parse_timestamped_transcript,
    scan_rules,
    split_transcript_text,
)


def test_transcript_split_keeps_untimed_lines_separate():
    transcript = (
        "[00:18] Welcome to the launch.\n"
        "Our platform is #1.\n"
        "\n"
        "[00:42] Acme Cloud delivers 99.9% uptime.\n"
        "No timestamps were invented for this line."
    )
    segments, untimestamped = split_transcript_text(transcript)

    assert [segment["timestamp_seconds"] for segment in segments] == [18.0, 42.0]
    assert segments[0]["text"] == "Welcome to the launch."
    assert segments[1]["text"] == "Acme Cloud delivers 99.9% uptime."
    assert "Our platform is #1." in untimestamped
    assert "No timestamps were invented for this line." in untimestamped
    assert "Welcome" not in untimestamped


def test_transcript_split_reads_srt_cues_without_synthesizing_times():
    transcript = (
        "1\n"
        "00:00:01,000 --> 00:00:04,000\n"
        "Welcome to Acme Cloud.\n"
        "This cue has two lines.\n"
        "\n"
        "Untimed context follows here.\n"
    )
    segments, untimestamped = split_transcript_text(transcript)

    assert len(segments) == 1
    assert segments[0]["timestamp_seconds"] == 1.0
    assert segments[0]["text"] == "Welcome to Acme Cloud. This cue has two lines."
    assert untimestamped == "Untimed context follows here."


def test_transcript_parser_does_not_invent_timestamps():
    assert parse_timestamped_transcript("Plain transcript without cues.") == []
    assert split_transcript_text("Plain transcript without cues.")[1] == (
        "Plain transcript without cues."
    )


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
