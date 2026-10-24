"""Evidence-first audit engine.

Every finding is produced by a deterministic check against actual workspace
records (brand rules or approved facts) or is explicitly labelled as an
uncertain/human-review item. The engine never invents citations, and it never
claims a fact is false merely because approved evidence is missing.

Optional LLM review is deliberately not used to create factual findings in
this build: the configured LLM path is limited to the assistant, where answers
are grounded in the same records and the mode is shown to the user.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable, List, Optional, Sequence

from app.models.approved_fact import ApprovedFact
from app.models.brand_rule import BrandRule


CATEGORY_LABELS = {
    "confirmed_contradiction": "Confirmed contradiction",
    "unsupported_claim": "Unsupported claim",
    "policy_violation": "Brand policy violation",
    "style_suggestion": "Style suggestion",
    "accessibility_issue": "Accessibility issue",
    "needs_human_review": "Needs human review",
    "processing_issue": "Processing issue",
}

CATEGORY_PRIORITY = {
    "confirmed_contradiction": 7,
    "policy_violation": 6,
    "unsupported_claim": 5,
    "accessibility_issue": 4,
    "style_suggestion": 3,
    "needs_human_review": 2,
    "processing_issue": 1,
}

DEDUCTIONS = {
    "confirmed_contradiction": {"critical": 30, "high": 22, "medium": 12, "low": 5},
    "policy_violation": {"critical": 25, "high": 15, "medium": 8, "low": 3},
    "unsupported_claim": {"critical": 22, "high": 14, "medium": 8, "low": 3},
    "accessibility_issue": {"critical": 20, "high": 12, "medium": 6, "low": 2},
    "needs_human_review": {"critical": 15, "high": 9, "medium": 5, "low": 2},
    "processing_issue": {"critical": 25, "high": 15, "medium": 8, "low": 3},
    "style_suggestion": {"critical": 8, "high": 5, "medium": 3, "low": 1},
}

AMBIGUOUS_PHRASES = [
    r"industry[- ]leading",
    r"best[- ]in[- ]class",
    r"world[- ]class",
    r"revolutionary",
    r"game[- ]changing",
    r"unmatched",
    r"unrivalled|unrivaled",
    r"market[- ]leading",
    r"trusted by (?:the )?world'?s most innovative",
    r"guarantees? (?:complete|total|absolute|effortless)",
]

REQUIRED_MISSING_TEXT = "Required statement missing"

CURRENCY_AMOUNT_RE = re.compile(
    r"(?<![A-Za-z])(?:₹|\$|€|£|Rs\.?|INR)\s?\d[\d,]*", re.IGNORECASE
)


@dataclass
class AuditResult:
    findings: List[dict]
    score: int
    risk_level: str
    verification_status: str
    model_used: str
    execution_time_ms: int
    risk_factors: List[dict] = field(default_factory=list)
    score_method: str = ""
    extraction_notes: Optional[str] = None


def _rule_is_live(rule: BrandRule) -> bool:
    return bool(rule.is_active) and (rule.status or "active") == "active"


def _pattern_regex(pattern: str) -> re.Pattern:
    pattern = pattern.strip()
    if not pattern:
        return re.compile(r"(?!x)x")
    escaped = re.escape(pattern)
    if all(ch.isalnum() or ch.isspace() or ch in "-_&." for ch in pattern):
        return re.compile(rf"(?i)(?<!\w){escaped}(?!\w)")
    return re.compile(rf"(?i){escaped}")


def _make_finding(
    *,
    title: str,
    category: str,
    severity: str,
    affected_text: str,
    explanation: str,
    start: int = 0,
    end: Optional[int] = None,
    evidence: Optional[str] = None,
    source_reference: Optional[str] = None,
    source_url: Optional[str] = None,
    suggestion: Optional[str] = None,
    confidence: float = 1.0,
    rule_id: Optional[str] = None,
    fact_id: Optional[str] = None,
    page_number: Optional[int] = None,
    timestamp_seconds: Optional[float] = None,
    location_label: Optional[str] = None,
    evidence_status: str = "potential_violation",
) -> dict:
    return {
        "title": title,
        "category": category,
        "severity": severity,
        "affected_text": affected_text,
        "start_index": max(0, start),
        "end_index": max(0, end if end is not None else start + len(affected_text)),
        "explanation": explanation,
        "supporting_evidence": evidence,
        "source_reference": source_reference,
        "source_url": source_url,
        "suggested_correction": suggestion,
        "confidence_score": confidence,
        "rule_id": rule_id,
        "fact_id": fact_id,
        "page_number": page_number,
        "timestamp_seconds": timestamp_seconds,
        "location_label": location_label,
        "evidence_status": evidence_status,
        "status": "open",
    }


def _rule_category(rule: BrandRule) -> str:
    if rule.rule_type == "tone_guideline":
        return "style_suggestion"
    if rule.rule_type == "claim_restriction":
        return "unsupported_claim"
    return "policy_violation"


def scan_rules(text: str, rules: Sequence[BrandRule], *, page_number: Optional[int] = None,
               timestamp_seconds: Optional[float] = None,
               location_label: Optional[str] = None) -> List[dict]:
    findings: List[dict] = []
    if not text:
        return findings

    for rule in rules:
        if not _rule_is_live(rule):
            continue
        pattern = (rule.pattern_or_phrase or "").strip()
        if not pattern:
            continue

        if rule.rule_type == "required_terminology":
            trigger = (rule.trigger_phrase or "").strip()
            trigger_match = None
            if trigger:
                trigger_match = _pattern_regex(trigger).search(text)
                if not trigger_match:
                    continue
            try:
                if _pattern_regex(pattern).search(text):
                    continue
            except re.error:
                continue
            affected = trigger_match.group(0) if trigger_match else REQUIRED_MISSING_TEXT
            start = trigger_match.start() if trigger_match else 0
            findings.append(
                _make_finding(
                    title=f"Required statement missing: {rule.name}",
                    category="policy_violation",
                    severity=rule.severity,
                    affected_text=affected,
                    start=start,
                    end=(trigger_match.end() if trigger_match else start + len(affected)),
                    explanation=(
                        f"{rule.description or rule.name} The approved statement “{pattern}” "
                        f"does not appear where the policy requires it."
                    ),
                    evidence=f"Required wording recorded in brand policy “{rule.name}”.",
                    source_reference=f"Brand policy: {rule.name} (v{rule.version})",
                    suggestion=pattern,
                    rule_id=rule.id,
                    page_number=page_number,
                    timestamp_seconds=timestamp_seconds,
                    location_label=location_label,
                    evidence_status="missing_required_text",
                )
            )
            continue

        try:
            matches = list(_pattern_regex(pattern).finditer(text))
        except re.error:
            continue

        for match in matches:
            matched = match.group(0)
            if not matched:
                continue
            category = _rule_category(rule)
            if rule.rule_type == "tone_guideline":
                title = f"Tone guideline: “{matched}”"
            elif rule.rule_type == "product_naming":
                title = f"Product naming: “{matched}”"
            elif rule.rule_type == "claim_restriction":
                title = f"Unsupported claim: “{matched}”"
            else:
                title = f"Policy violation: “{matched}”"
            findings.append(
                _make_finding(
                    title=title,
                    category=category,
                    severity=rule.severity,
                    affected_text=matched,
                    start=match.start(),
                    end=match.end(),
                    explanation=(
                        f"{rule.description or rule.name} "
                        + (
                            f"Approved replacement: “{rule.replacement_or_guidance}”."
                            if rule.replacement_or_guidance
                            else ""
                        )
                    ),
                    evidence=f"Matched an active brand policy: “{rule.name}”.",
                    source_reference=f"Brand policy: {rule.name} (v{rule.version})",
                    suggestion=rule.replacement_or_guidance,
                    rule_id=rule.id,
                    page_number=page_number,
                    timestamp_seconds=timestamp_seconds,
                    location_label=location_label,
                    evidence_status="rule_violation",
                )
            )
    return findings


def _fact_text(fact: ApprovedFact) -> str:
    return f"{fact.category} {fact.claim_statement} {fact.approved_value}".lower()


def _percent_values(text: str) -> List[str]:
    return re.findall(r"\d+(?:\.\d+)?%", text.replace(" ", ""))


def _numeric_key(value: str) -> str:
    return value.replace("%", "").strip()


def detect_fact_contradictions(
    text: str,
    facts: Sequence[ApprovedFact],
    *,
    page_number: Optional[int] = None,
    timestamp_seconds: Optional[float] = None,
    location_label: Optional[str] = None,
) -> List[dict]:
    findings: List[dict] = []
    if not text or not facts:
        return findings
    lowered = text.lower()
    active_facts = [f for f in facts if f.is_active and (f.status or "verified") != "expired"]

    uptime_facts = [
        f for f in active_facts
        if any(k in _fact_text(f) for k in ("uptime", "sla", "availability"))
    ]
    if uptime_facts:
        approved_numbers = {
            _numeric_key(v)
            for f in uptime_facts
            for v in _percent_values(f.approved_value)
        }
        claim_pattern = re.compile(
            r"(?i)\b(100(?:\.0+)?%|99\.(?:9{2,}|99+)%|99\.9%)\s*(?:uptime|availability|sla|service level)?",
        )
        for match in claim_pattern.finditer(text):
            claimed = _numeric_key(match.group(1))
            if approved_numbers and claimed not in approved_numbers:
                fact = uptime_facts[0]
                findings.append(
                    _make_finding(
                        title=f"Availability claim conflicts with approved SLA: {match.group(1)}",
                        category="confirmed_contradiction",
                        severity="critical",
                        affected_text=match.group(0).strip(),
                        start=match.start(),
                        end=match.end(),
                        explanation=(
                            f"The content promises “{match.group(0).strip()}”, but the approved record states "
                            f"“{fact.approved_value}”. Publishing a stronger availability promise than the "
                            "documented commitment can create contractual and advertising risk."
                        ),
                        evidence=fact.approved_value,
                        source_reference=fact.source_reference,
                        source_url=fact.source_url,
                        suggestion=(
                            f"Use the approved commitment: {fact.approved_value}"
                        ),
                        fact_id=fact.id,
                        page_number=page_number,
                        timestamp_seconds=timestamp_seconds,
                        location_label=location_label,
                        evidence_status="contradicted",
                    )
                )

    price_facts = [
        f for f in active_facts
        if any(k in _fact_text(f) for k in ("pricing", "price", "commercial schedule"))
        and CURRENCY_AMOUNT_RE.search(f.approved_value)
    ]
    if price_facts and re.search(r"(?i)(price|pricing|per month|/month|per seat|starting at|INR|Rs\.?)", lowered):
        approved_amounts = {
            re.sub(r"[^\d]", "", amount)
            for f in price_facts
            for amount in CURRENCY_AMOUNT_RE.findall(f.approved_value)
        }
        for match in CURRENCY_AMOUNT_RE.finditer(text):
            claimed_amount = re.sub(r"[^\d]", "", match.group(0))
            if approved_amounts and claimed_amount not in approved_amounts:
                fact = price_facts[0]
                findings.append(
                    _make_finding(
                        title=f"Price does not match the approved commercial record: {match.group(0)}",
                        category="confirmed_contradiction",
                        severity="high",
                        affected_text=match.group(0),
                        start=match.start(),
                        end=match.end(),
                        explanation=(
                            f"The content states {match.group(0)}, while the approved commercial record states "
                            f"“{fact.approved_value}”. If this is a different tier or a temporary promotion, "
                            "record that approved fact before publishing."
                        ),
                        evidence=fact.approved_value,
                        source_reference=fact.source_reference,
                        source_url=fact.source_url,
                        suggestion=f"Use the approved price: {fact.approved_value}",
                        fact_id=fact.id,
                        page_number=page_number,
                        timestamp_seconds=timestamp_seconds,
                        location_label=location_label,
                        evidence_status="contradicted",
                    )
                )

    perf_facts = [
        f for f in active_facts
        if any(k in _fact_text(f) for k in ("faster", "benchmark", "performance"))
    ]
    if perf_facts:
        approved_multipliers = {
            m for f in perf_facts for m in re.findall(r"\d+(?:\.\d+)?x", f.approved_value.lower())
        }
        for match in re.finditer(r"(?i)\b(\d+(?:\.\d+)?)\s*x\s+(faster|quicker|improvement)", text):
            claim = f"{match.group(1)}x"
            if approved_multipliers and claim.lower() not in approved_multipliers:
                fact = perf_facts[0]
                findings.append(
                    _make_finding(
                        title=f"Performance multiplier conflicts with approved benchmark: {claim}",
                        category="confirmed_contradiction",
                        severity="high",
                        affected_text=match.group(0),
                        start=match.start(),
                        end=match.end(),
                        explanation=(
                            f"The text claims {match.group(0)}, but the approved benchmark record states "
                            f"“{fact.approved_value}”. Use the recorded benchmark or attach a new approved source."
                        ),
                        evidence=fact.approved_value,
                        source_reference=fact.source_reference,
                        source_url=fact.source_url,
                        suggestion=fact.approved_value,
                        fact_id=fact.id,
                        page_number=page_number,
                        timestamp_seconds=timestamp_seconds,
                        location_label=location_label,
                        evidence_status="contradicted",
                    )
                )

    savings_facts = [
        f for f in active_facts
        if any(k in _fact_text(f) for k in ("saving", "reduction", "tco", "cost"))
    ]
    if savings_facts:
        approved_savings = {
            _numeric_key(v)
            for f in savings_facts
            for v in _percent_values(f.approved_value)
        }
        savings_pattern = re.compile(
            r"(?i)(\d+(?:\.\d+)?)%\s*(?:reduction|savings|saving|less|lower|cheaper|improvement)"
        )
        for match in savings_pattern.finditer(text):
            value = _numeric_key(match.group(1))
            if approved_savings and value not in approved_savings:
                fact = savings_facts[0]
                findings.append(
                    _make_finding(
                        title=f"Cost-saving claim conflicts with the approved study: {match.group(1)}%",
                        category="confirmed_contradiction",
                        severity="high",
                        affected_text=match.group(0),
                        start=match.start(),
                        end=match.end(),
                        explanation=(
                            f"The content claims “{match.group(0)}”, while the approved value is "
                            f"“{fact.approved_value}”."
                        ),
                        evidence=fact.approved_value,
                        source_reference=fact.source_reference,
                        source_url=fact.source_url,
                        suggestion=fact.approved_value,
                        fact_id=fact.id,
                        page_number=page_number,
                        timestamp_seconds=timestamp_seconds,
                        location_label=location_label,
                        evidence_status="contradicted",
                    )
                )

    compliance_facts = [
        f for f in active_facts
        if any(k in _fact_text(f) for k in ("compliance", "certif", "soc 2", "iso 27001", "hipaa"))
    ]
    if compliance_facts:
        approved_cert_text = " ".join(_fact_text(f) for f in compliance_facts)
        cert_pattern = re.compile(r"(?i)\b(SOC\s?2(?:\s+Type\s+II)?|ISO\s?27001|HIPAA|PCI[- ]DSS|GDPR)\b")
        seen_certs = set()
        for match in cert_pattern.finditer(text):
            cert = re.sub(r"\s+", " ", match.group(0)).strip()
            key = cert.lower()
            if key in seen_certs:
                continue
            seen_certs.add(key)
            normalized = cert.lower().replace("iso ", "iso").replace("soc ", "soc")
            approved_normalized = approved_cert_text.replace("iso ", "iso").replace("soc ", "soc")
            if normalized not in approved_normalized:
                fact = compliance_facts[0]
                findings.append(
                    _make_finding(
                        title=f"Compliance claim not found in approved records: {cert}",
                        category="needs_human_review",
                        severity="medium",
                        affected_text=match.group(0),
                        start=match.start(),
                        end=match.end(),
                        explanation=(
                            f"The approved compliance record lists “{fact.approved_value}”. "
                            f"“{cert}” does not appear there. This is not proof that the claim is false, "
                            "but it cannot be verified from approved evidence and should be checked with the "
                            "compliance owner before publishing."
                        ),
                        evidence=fact.approved_value,
                        source_reference=fact.source_reference,
                        source_url=fact.source_url,
                        suggestion=f"Remove the claim or add a verified source for {cert}.",
                        fact_id=fact.id,
                        confidence=0.6,
                        page_number=page_number,
                        timestamp_seconds=timestamp_seconds,
                        location_label=location_label,
                        evidence_status="uncertain",
                    )
                )

    return findings


def detect_ambiguous_claims(
    text: str,
    facts: Sequence[ApprovedFact],
    existing: Sequence[dict],
    *,
    page_number: Optional[int] = None,
    timestamp_seconds: Optional[float] = None,
    location_label: Optional[str] = None,
) -> List[dict]:
    """Flag evaluative language that automated evidence cannot verify.

    These are not accusations of falsehood. They explicitly ask for human review.
    """
    findings: List[dict] = []
    if not text:
        return findings

    occupied = [(f.get("start_index", 0), f.get("end_index", 0)) for f in existing]
    approved_text = " ".join(_fact_text(f) for f in facts if f.is_active)

    def overlaps(start: int, end: int) -> bool:
        return any(start < e and end > s for s, e in occupied)

    for phrase in AMBIGUOUS_PHRASES:
        try:
            matches = list(re.finditer(phrase, text, re.IGNORECASE))
        except re.error:
            continue
        for match in matches:
            if overlaps(match.start(), match.end()):
                continue
            phrase_key = re.sub(r"[^a-z ]", "", phrase.lower()).replace("guarantees? ", "guarantee")
            if phrase_key and phrase_key in approved_text:
                continue
            findings.append(
                _make_finding(
                    title=f"Claim needs human review: “{match.group(0)}”",
                    category="needs_human_review",
                    severity="low",
                    affected_text=match.group(0),
                    start=match.start(),
                    end=match.end(),
                    explanation=(
                        "This is an evaluative claim. The workspace holds no approved source that "
                        "confirms it, and an automated check cannot decide whether it is accurate. "
                        "A human reviewer should verify the claim or ask for supporting evidence."
                    ),
                    evidence="No matching approved fact was retrieved. Absence of evidence is not proof of falsity.",
                    source_reference="No approved source matched",
                    suggestion="Replace with a specific, sourced claim or send to review.",
                    confidence=0.5,
                    page_number=page_number,
                    timestamp_seconds=timestamp_seconds,
                    location_label=location_label,
                    evidence_status="uncertain",
                )
            )
    return findings


def detect_unverified_quantitative_claims(
    text: str,
    facts: Sequence[ApprovedFact],
    existing: Sequence[dict],
    *,
    page_number: Optional[int] = None,
    timestamp_seconds: Optional[float] = None,
    location_label: Optional[str] = None,
) -> List[dict]:
    """Percentages with outcome language that no approved fact supports."""
    findings: List[dict] = []
    if not text:
        return findings

    approved_numbers = {
        _numeric_key(v)
        for f in facts
        if f.is_active and (f.status or "verified") != "expired"
        for v in _percent_values(f.approved_value)
    }
    occupied = [(f.get("start_index", 0), f.get("end_index", 0)) for f in existing]
    pattern = re.compile(
        r"(?i)(\d+(?:\.\d+)?)%\s*(?:more|fewer|faster|higher|lower|better|improvement|increase|decrease|reduction|savings)"
    )
    for match in pattern.finditer(text):
        if any(match.start() < e and match.end() > s for s, e in occupied):
            continue
        value = _numeric_key(match.group(1))
        if value in approved_numbers:
            continue
        findings.append(
            _make_finding(
                title=f"Unverified performance figure: {match.group(1)}%",
                category="needs_human_review",
                severity="medium",
                affected_text=match.group(0),
                start=match.start(),
                end=match.end(),
                explanation=(
                    "This quantitative performance claim is not covered by an approved fact in the workspace. "
                    "It has not been marked false; the system simply lacks evidence to verify it."
                ),
                evidence="No approved fact with this figure was retrieved.",
                source_reference="No approved source matched",
                suggestion="Add a verified source for this figure or remove it.",
                confidence=0.55,
                page_number=page_number,
                timestamp_seconds=timestamp_seconds,
                location_label=location_label,
                evidence_status="uncertain",
            )
        )
    return findings


def _dedupe(findings: Sequence[dict]) -> List[dict]:
    best: dict[tuple, dict] = {}
    for finding in findings:
        key = (
            finding.get("page_number"),
            finding.get("timestamp_seconds"),
            finding.get("start_index"),
            finding.get("end_index"),
            finding.get("category") == "needs_human_review",
        )
        current = best.get(key)
        if not current or CATEGORY_PRIORITY.get(finding["category"], 0) > CATEGORY_PRIORITY.get(
            current["category"], 0
        ):
            best[key] = finding
    ordered = sorted(
        best.values(),
        key=lambda f: (
            f.get("page_number") or 0,
            f.get("timestamp_seconds") or 0,
            f.get("start_index", 0),
            -CATEGORY_PRIORITY.get(f["category"], 0),
        ),
    )
    return ordered


def _format_timestamp(seconds: float) -> str:
    total = int(max(0, round(seconds)))
    return f"{total // 60:02d}:{total % 60:02d}"


def parse_timestamped_transcript(text: str) -> List[dict]:
    """Parse [mm:ss] or mm:ss lines without inventing timestamps."""
    segments: List[dict] = []
    pattern = re.compile(r"^\s*\[?(\d{1,2}):(\d{2})\]?\s*[-–—:]?\s*(.+)$", re.MULTILINE)
    for match in pattern.finditer(text or ""):
        seconds = int(match.group(1)) * 60 + int(match.group(2))
        segments.append(
            {
                "timestamp_seconds": float(seconds),
                "text": match.group(3).strip(),
                "timestamp_label": _format_timestamp(seconds),
            }
        )
    return segments


def _score(findings: Sequence[dict]) -> tuple[int, str, List[dict], str]:
    factors: dict[tuple, dict] = {}
    total_deduction = 0
    for f in findings:
        category = f["category"]
        severity = f.get("severity", "medium")
        deduction = DEDUCTIONS.get(category, {}).get(severity, 5)
        total_deduction += deduction
        key = (category, severity)
        factor = factors.setdefault(
            key,
            {
                "category": category,
                "label": CATEGORY_LABELS.get(category, category),
                "severity": severity,
                "count": 0,
                "deduction_per_item": deduction,
                "deduction": 0,
            },
        )
        factor["count"] += 1
        factor["deduction"] += deduction

    score = max(0, 100 - total_deduction)
    factor_list = sorted(
        factors.values(),
        key=lambda x: (-x["deduction"], x["label"]),
    )
    severities = {f.get("severity") for f in findings}
    risky_categories = {
        "confirmed_contradiction",
        "policy_violation",
        "unsupported_claim",
        "processing_issue",
    }
    has_risky = any(f["category"] in risky_categories for f in findings)
    if "critical" in severities and has_risky:
        risk = "critical"
    elif score < 40:
        risk = "critical"
    elif "high" in severities and has_risky:
        risk = "high"
    elif score < 70:
        risk = "high"
    elif score < 90:
        risk = "medium"
    elif score < 100:
        risk = "low"
    else:
        risk = "clean"

    method = (
        "Start at 100 and subtract a fixed amount for each open finding. "
        "Contradictions and mandatory-policy issues deduct most; style suggestions deduct least. "
        "This readiness score is a workflow aid, not a scientific or legal risk rating."
    )
    return score, risk, factor_list, method


def _verification(findings: Sequence[dict]) -> str:
    categories = {f["category"] for f in findings}
    if "processing_issue" in categories:
        return "unable_to_verify" if len(categories) == 1 else "partially_verified"
    if "needs_human_review" in categories:
        return "partially_verified"
    return "verified"


def run_text_audit(
    text: str,
    rules: Sequence[BrandRule],
    facts: Sequence[ApprovedFact],
    *,
    extraction_notes: Optional[str] = None,
) -> AuditResult:
    start = time.time()
    findings = scan_rules(text, rules)
    findings.extend(detect_fact_contradictions(text, facts))
    findings.extend(detect_ambiguous_claims(text, facts, findings))
    findings.extend(detect_unverified_quantitative_claims(text, facts, findings))
    findings = _dedupe(findings)
    score, risk, factors, method = _score(findings)
    return AuditResult(
        findings=findings,
        score=score,
        risk_level=risk,
        verification_status=_verification(findings),
        model_used="deterministic-rules-v2",
        execution_time_ms=int((time.time() - start) * 1000),
        risk_factors=factors,
        score_method=method,
        extraction_notes=extraction_notes,
    )


def run_page_audit(
    pages: Sequence[str],
    rules: Sequence[BrandRule],
    facts: Sequence[ApprovedFact],
    *,
    extraction_notes: Optional[str] = None,
) -> AuditResult:
    start = time.time()
    findings: List[dict] = []
    for index, page in enumerate(pages, start=1):
        label = f"Page {index}"
        page_findings = scan_rules(page, rules, page_number=index, location_label=label)
        page_findings.extend(
            detect_fact_contradictions(page, facts, page_number=index, location_label=label)
        )
        page_findings.extend(
            detect_ambiguous_claims(
                page, facts, page_findings, page_number=index, location_label=label
            )
        )
        page_findings.extend(
            detect_unverified_quantitative_claims(
                page, facts, page_findings, page_number=index, location_label=label
            )
        )
        findings.extend(_dedupe(page_findings))
    score, risk, factors, method = _score(findings)
    return AuditResult(
        findings=findings,
        score=score,
        risk_level=risk,
        verification_status=_verification(findings),
        model_used=f"pdf-intelligence-v2 ({len(pages)} pages)",
        execution_time_ms=int((time.time() - start) * 1000),
        risk_factors=factors,
        score_method=method,
        extraction_notes=extraction_notes,
    )


def run_transcript_audit(
    segments: Sequence[dict],
    fallback_text: str,
    rules: Sequence[BrandRule],
    facts: Sequence[ApprovedFact],
    *,
    extraction_notes: Optional[str] = None,
) -> AuditResult:
    start = time.time()
    findings: List[dict] = []
    if segments:
        for segment in segments:
            text = segment.get("text", "")
            seconds = float(segment.get("timestamp_seconds", 0))
            label = f"Timestamp {_format_timestamp(seconds)}"
            seg_findings = scan_rules(
                text, rules, timestamp_seconds=seconds, location_label=label
            )
            seg_findings.extend(
                detect_fact_contradictions(
                    text, facts, timestamp_seconds=seconds, location_label=label
                )
            )
            seg_findings.extend(
                detect_ambiguous_claims(
                    text, facts, seg_findings, timestamp_seconds=seconds, location_label=label
                )
            )
            seg_findings.extend(
                detect_unverified_quantitative_claims(
                    text, facts, seg_findings, timestamp_seconds=seconds, location_label=label
                )
            )
            findings.extend(_dedupe(seg_findings))
    else:
        findings = run_text_audit(fallback_text, rules, facts).findings
        for finding in findings:
            finding["location_label"] = "Transcript (no timestamps provided)"
    score, risk, factors, method = _score(findings)
    return AuditResult(
        findings=findings,
        score=score,
        risk_level=risk,
        verification_status=_verification(findings),
        model_used="video-transcript-audit-v2",
        execution_time_ms=int((time.time() - start) * 1000),
        risk_factors=factors,
        score_method=method,
        extraction_notes=extraction_notes,
    )


def processing_issue_result(message: str, *, severity: str = "medium") -> AuditResult:
    finding = _make_finding(
        title="Content could not be fully inspected",
        category="processing_issue",
        severity=severity,
        affected_text="Automatic inspection unavailable",
        explanation=message,
        evidence="No extracted text was available for automated rule checks.",
        source_reference="Processing status",
        suggestion=(
            "Configure the required extraction service, upload a text transcript, "
            "or ask a human reviewer to inspect the asset."
        ),
        confidence=1.0,
        evidence_status="processing_limitation",
    )
    score, risk, factors, method = _score([finding])
    return AuditResult(
        findings=[finding],
        score=score,
        risk_level=risk,
        verification_status="unable_to_verify",
        model_used="ingestion-boundary",
        execution_time_ms=1,
        risk_factors=factors,
        score_method=method,
        extraction_notes=message,
    )


def aggregate_findings_for_version(findings: Iterable) -> dict:
    counts = {category: 0 for category in CATEGORY_LABELS}
    severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for finding in findings:
        counts[finding.category] = counts.get(finding.category, 0) + 1
        severity_counts[finding.severity] = severity_counts.get(finding.severity, 0) + 1
    return {"categories": counts, "severities": severity_counts}
