"""Brand-memory analysis: conflicting records, suggested rules, impact previews.

Everything here is derived from records stored in the workspace. Conflicts are
never invented: each item names the records that disagree. Suggested rules are
only generated from recurring findings that actually occurred in audits.
"""
from __future__ import annotations

import re
from collections import defaultdict
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models.approved_fact import ApprovedFact
from app.models.audit import AuditFinding
from app.models.brand_rule import BrandRule
from app.models.content import ContentDocument
from app.services import content_service
from app.services.audit_engine import _pattern_regex, scan_rules
from app.services.workspace_service import workspace_is_demo


CURRENCY_RE = re.compile(r"(?<![A-Za-z])(?:₹|\$|€|£|Rs\.?|INR)\s?\d[\d,]*", re.IGNORECASE)
PERCENT_RE = re.compile(r"\d+(?:\.\d+)?%")


def _fact_name(fact: ApprovedFact) -> str:
    return f"{fact.category}: {fact.claim_statement}"


def _document_assets_matching(
    db: Session, workspace_id: str, needles: Iterable[str]
) -> list[dict]:
    needles = [needle for needle in needles if needle]
    documents = (
        db.query(ContentDocument)
        .filter(ContentDocument.workspace_id == workspace_id)
        .all()
    )
    results = []
    for document in documents:
        version = content_service.latest_version(db, document.id)
        if not version:
            continue
        haystack = "\n".join(
            [version.content_text or ""]
            + list(version.page_texts or [])
            + [segment.get("text", "") for segment in (version.transcript_segments or [])]
        ).lower()
        matched = [needle for needle in needles if needle.lower() in haystack]
        if matched:
            results.append(
                {
                    "document_id": document.id,
                    "title": document.title,
                    "reason": "Current version contains: " + ", ".join(sorted(set(matched))[:3]),
                }
            )
    return results


def _comparable_fact_value(fact: ApprovedFact) -> str:
    normalized = fact.approved_value.strip().lower()
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized


def memory_conflicts(db: Session, workspace_id: str) -> list[dict]:
    facts = (
        db.query(ApprovedFact)
        .filter(ApprovedFact.workspace_id == workspace_id, ApprovedFact.is_active.is_(True))
        .all()
    )
    rules = db.query(BrandRule).filter(BrandRule.workspace_id == workspace_id).all()
    conflicts: list[dict] = []

    facts_by_category: dict[str, list[ApprovedFact]] = defaultdict(list)
    for fact in facts:
        facts_by_category[fact.category.strip().lower()].append(fact)
    for category_facts in facts_by_category.values():
        for index, fact_a in enumerate(category_facts):
            for fact_b in category_facts[index + 1:]:
                if _comparable_fact_value(fact_a) == _comparable_fact_value(fact_b):
                    continue
                assets = _document_assets_matching(
                    db,
                    workspace_id,
                    set(CURRENCY_RE.findall(fact_a.approved_value) + CURRENCY_RE.findall(fact_b.approved_value))
                    | set(PERCENT_RE.findall(fact_a.approved_value) + PERCENT_RE.findall(fact_b.approved_value)),
                )
                conflicts.append(
                    {
                        "id": f"fact-fact:{fact_a.id}:{fact_b.id}",
                        "conflict_type": "fact_conflict",
                        "title": f"Approved facts disagree: {fact_a.category}",
                        "description": (
                            f"“{_fact_name(fact_a)}” records “{fact_a.approved_value}” "
                            f"(status: {fact_a.status}), while “{_fact_name(fact_b)}” records "
                            f"“{fact_b.approved_value}” (status: {fact_b.status}). Both are active "
                            "facts, so audit results depend on which record is treated as current."
                        ),
                        "severity": "high",
                        "entity_a_id": fact_a.id,
                        "entity_a_type": "approved_fact",
                        "entity_a_name": _fact_name(fact_a),
                        "entity_b_id": fact_b.id,
                        "entity_b_type": "approved_fact",
                        "entity_b_name": _fact_name(fact_b),
                        "affected_assets": assets,
                        "recommended_action": (
                            "Choose the current approved value, mark the other record expired, and add a "
                            "source showing the change date. Then re-run checks for affected content."
                        ),
                        "resolution_options": [
                            "Mark the superseded fact as expired",
                            "Update both facts to the same sourced value",
                            "Open affected content and schedule a re-check",
                        ],
                    }
                )

    active_rules = [
        rule for rule in rules if rule.is_active and (rule.status or "active") == "active"
    ]
    considered_rules = [
        rule for rule in rules if (rule.status or "active") in {"active", "draft"}
    ]
    for index, rule in enumerate(considered_rules):
        if rule.rule_type == "required_terminology":
            for other in considered_rules:
                if other.id == rule.id:
                    continue
                if other.rule_type in {"prohibited_phrase", "product_naming"}:
                    if rule.pattern_or_phrase.strip().lower() == other.pattern_or_phrase.strip().lower():
                        assets = _document_assets_matching(db, workspace_id, [rule.pattern_or_phrase])
                        conflicts.append(
                            {
                                "id": f"rule-rule:{rule.id}:{other.id}",
                                "conflict_type": "rule_conflict",
                                "title": f"Rules disagree on “{rule.pattern_or_phrase}”",
                                "description": (
                                    f"“{rule.name}” requires the wording “{rule.pattern_or_phrase}”, "
                                    f"but “{other.name}” prohibits it. The two rules cannot both be "
                                    "satisfied."
                                ),
                                "severity": "high",
                                "entity_a_id": rule.id,
                                "entity_a_type": "brand_rule",
                                "entity_a_name": rule.name,
                                "entity_b_id": other.id,
                                "entity_b_type": "brand_rule",
                                "entity_b_name": other.name,
                                "affected_assets": assets,
                                "recommended_action": (
                                    "Decide which wording is current. Archive or edit the losing rule, "
                                    "then re-run checks on affected content."
                                ),
                                "resolution_options": [
                                    "Archive the outdated rule",
                                    "Edit the required wording",
                                    "Open affected content and schedule a re-check",
                                ],
                            }
                        )
        guidance = (rule.replacement_or_guidance or "").strip()
        if guidance:
            for other in active_rules:
                if other.id == rule.id:
                    continue
                pattern = (other.pattern_or_phrase or "").strip()
                if pattern and len(pattern) > 3 and pattern.lower() in guidance.lower():
                    conflicts.append(
                        {
                            "id": f"rule-guidance:{rule.id}:{other.id}",
                            "conflict_type": "rule_conflict",
                            "title": f"Recommended replacement appears to violate “{other.name}”",
                            "description": (
                                f"The guidance in “{rule.name}” recommends “{guidance}”, which contains "
                                f"“{pattern}” — a phrase prohibited by “{other.name}”."
                            ),
                            "severity": "medium",
                            "entity_a_id": rule.id,
                            "entity_a_type": "brand_rule",
                            "entity_a_name": rule.name,
                            "entity_b_id": other.id,
                            "entity_b_type": "brand_rule",
                            "entity_b_name": other.name,
                            "affected_assets": [],
                            "recommended_action": "Update the replacement guidance so it satisfies the other rule.",
                            "resolution_options": ["Edit the replacement guidance", "Archive one of the rules"],
                        }
                    )

    uptime_facts = [
        fact for fact in facts
        if any(key in f"{fact.category} {fact.claim_statement}".lower() for key in ("uptime", "sla", "availability"))
    ]
    for rule in considered_rules:
        if not rule.replacement_or_guidance:
            continue
        percentages = PERCENT_RE.findall(rule.replacement_or_guidance)
        if not percentages or not uptime_facts:
            continue
        for fact in uptime_facts:
            approved_percentages = PERCENT_RE.findall(fact.approved_value)
            for percentage in percentages:
                if percentage not in approved_percentages:
                    conflicts.append(
                        {
                            "id": f"rule-fact:{rule.id}:{fact.id}:{percentage}",
                            "conflict_type": "rule_fact_conflict",
                            "title": f"Rule guidance conflicts with approved availability fact",
                            "description": (
                                f"“{rule.name}” recommends “{rule.replacement_or_guidance}” "
                                f"({percentage}), but the approved fact records "
                                f"“{fact.approved_value}”."
                            ),
                            "severity": "medium",
                            "entity_a_id": rule.id,
                            "entity_a_type": "brand_rule",
                            "entity_a_name": rule.name,
                            "entity_b_id": fact.id,
                            "entity_b_type": "approved_fact",
                            "entity_b_name": _fact_name(fact),
                            "affected_assets": [],
                            "recommended_action": "Align the rule's replacement wording with the sourced fact.",
                            "resolution_options": ["Edit the rule guidance", "Update the approved fact with a new source"],
                        }
                    )

    def severity_rank(item: dict) -> int:
        return {"critical": 0, "high": 1, "medium": 2, "low": 3}.get(item["severity"], 4)

    return sorted(conflicts, key=lambda item: (severity_rank(item), item["title"]))


def rule_suggestions(db: Session, workspace_id: str) -> list[dict]:
    documents = (
        db.query(ContentDocument)
        .filter(ContentDocument.workspace_id == workspace_id)
        .all()
    )
    live_rules = (
        db.query(BrandRule)
        .filter(
            BrandRule.workspace_id == workspace_id,
            BrandRule.is_active.is_(True),
            BrandRule.status == "active",
        )
        .all()
    )
    live_patterns = [
        _pattern_regex(rule.pattern_or_phrase or "")
        for rule in live_rules
        if (rule.pattern_or_phrase or "").strip()
    ]
    groups: dict[tuple, dict] = {}
    for document in documents:
        version = content_service.latest_version(db, document.id)
        if not version:
            continue
        run = content_service.latest_audit_for_version(db, version.id)
        if not run:
            continue
        findings = (
            db.query(AuditFinding)
            .filter(
                AuditFinding.audit_run_id == run.id,
                AuditFinding.status == "open",
                AuditFinding.rule_id.is_(None),
                AuditFinding.category != "processing_issue",
                AuditFinding.category != "confirmed_contradiction",
            )
            .all()
        )
        for finding in findings:
            if any(pattern.search(finding.affected_text or "") for pattern in live_patterns):
                continue
            key = (finding.category, finding.affected_text.strip().lower())
            entry = groups.setdefault(
                key,
                {
                    "id": f"suggestion:{finding.category}:{re.sub(r'[^a-z0-9]+', '-', finding.affected_text.lower())[:40]}",
                    "title": finding.title,
                    "rationale": (
                        "This issue is not covered by an active brand rule. It has occurred in "
                        "audited content, so a rule would make the check repeatable."
                    ),
                    "affected_text": finding.affected_text,
                    "occurrences": 0,
                    "category": finding.category,
                    "severity": finding.severity,
                    "example_document_ids": [],
                    "proposed_pattern": finding.affected_text,
                    "proposed_guidance": finding.suggested_correction,
                    "proposed_rule_type": (
                        "tone_guideline"
                        if finding.category == "style_suggestion"
                        else "claim_restriction"
                        if finding.category in {"unsupported_claim", "needs_human_review"}
                        else "prohibited_phrase"
                    ),
                },
            )
            entry["occurrences"] += 1
            if document.id not in entry["example_document_ids"]:
                entry["example_document_ids"].append(document.id)
            if finding.suggested_correction and not entry.get("proposed_guidance"):
                entry["proposed_guidance"] = finding.suggested_correction
    suggestions = list(groups.values())
    suggestions.sort(key=lambda item: (-item["occurrences"], item["title"]))
    return suggestions


def create_rule_from_suggestion(
    db: Session, actor, payload, workspace_id: str
) -> BrandRule:
    rule = BrandRule(
        workspace_id=workspace_id,
        name=payload.title[:255],
        rule_type=payload.proposed_rule_type,
        description=payload.rationale,
        pattern_or_phrase=payload.proposed_pattern,
        replacement_or_guidance=payload.proposed_guidance,
        severity=payload.severity,
        is_active=False,
        status="draft",
        owner_name=actor.name,
        is_demo=workspace_is_demo(db, actor.workspace_id),
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def _scan_document_texts(db: Session, workspace_id: str) -> list[tuple[ContentDocument, str, int, list[str]]]:
    documents = (
        db.query(ContentDocument)
        .filter(ContentDocument.workspace_id == workspace_id)
        .all()
    )
    scanned = []
    for document in documents:
        version = content_service.latest_version(db, document.id)
        if not version:
            continue
        parts = [version.content_text or ""] + list(version.page_texts or [])
        parts += [segment.get("text", "") for segment in (version.transcript_segments or [])]
        scanned.append((document, "\n".join(parts), version.version_number, parts))
    return scanned


def _impact_items(
    documents: Iterable[tuple[ContentDocument, str, int, list[str]]],
    patterns: list[re.Pattern],
    reason: str,
) -> tuple[list[dict], int]:
    items = []
    scanned = 0
    for document, text, version_number, _ in documents:
        scanned += 1
        matches = []
        for pattern in patterns:
            matches.extend(list(pattern.finditer(text)))
        if not matches:
            continue
        matches.sort(key=lambda match: match.start())
        first = matches[0]
        snippet = text[max(0, first.start() - 70): first.end() + 90].replace("\n", " ").strip()
        items.append(
            {
                "document_id": document.id,
                "title": document.title,
                "asset_type": document.asset_type,
                "status": document.status,
                "version_number": version_number,
                "match_count": len(matches),
                "snippet": f"…{snippet}…",
                "reason": reason,
            }
        )
    return items, scanned


def fact_impact(db: Session, workspace_id: str, fact: ApprovedFact) -> dict:
    patterns: list[re.Pattern] = []
    for amount in CURRENCY_RE.findall(fact.approved_value):
        patterns.append(re.compile(re.escape(amount), re.IGNORECASE))
    for percentage in PERCENT_RE.findall(fact.approved_value):
        patterns.append(re.compile(re.escape(percentage)))
    if not patterns:
        keywords = [
            word for word in re.findall(r"[A-Za-z]{4,}", fact.approved_value)
            if word.lower() not in {"with", "from", "that", "this", "under", "terms", "cloud"}
        ][:3]
        for keyword in keywords:
            patterns.append(re.compile(re.escape(keyword), re.IGNORECASE))
    if not patterns:
        patterns = [re.compile(re.escape(fact.approved_value), re.IGNORECASE)]

    documents = _scan_document_texts(db, workspace_id)
    items, scanned = _impact_items(
        documents,
        patterns,
        "Current version contains a value or phrase related to this approved fact. "
        "If the fact changes, this content should be reviewed and re-checked.",
    )
    return {
        "entity_type": "approved_fact",
        "entity_id": fact.id,
        "entity_name": _fact_name(fact),
        "entity_summary": fact.approved_value,
        "previous_value": fact.approved_value,
        "current_value": None,
        "items": items,
        "scanned_documents": scanned,
        "note": (
            "Matches are based on the values and keywords in the approved fact. They identify content "
            "that may need review; they do not modify it."
        ),
    }


def rule_impact(db: Session, workspace_id: str, rule: BrandRule) -> dict:
    pattern = _pattern_regex(rule.pattern_or_phrase or "")
    documents = _scan_document_texts(db, workspace_id)
    items, scanned = _impact_items(
        documents,
        [pattern],
        "Current version matches this rule's pattern. Changing or archiving the rule changes how this "
        "content is checked.",
    )
    return {
        "entity_type": "brand_rule",
        "entity_id": rule.id,
        "entity_name": rule.name,
        "entity_summary": f"{rule.rule_type}: {rule.pattern_or_phrase}",
        "previous_value": rule.pattern_or_phrase,
        "current_value": None,
        "items": items,
        "scanned_documents": scanned,
        "note": (
            "Impact is based on matches in the latest saved version of each document. It does not "
            "account for exemptions that have not been recorded in the workspace."
        ),
    }


def simulate_rule(db: Session, workspace_id: str, pattern: str, severity: str) -> dict:
    synthetic = BrandRule(
        workspace_id=workspace_id,
        name="Proposed rule (not saved)",
        rule_type="prohibited_phrase",
        description="Simulated rule created for impact preview only.",
        pattern_or_phrase=pattern,
        severity=severity,
        is_active=True,
        status="active",
        version=1,
    )
    documents = _scan_document_texts(db, workspace_id)
    items = []
    total_matches = 0
    for document, text, version_number, _ in documents:
        findings = scan_rules(text, [synthetic])
        if not findings:
            continue
        total_matches += len(findings)
        first = findings[0]
        start = max(0, first.get("start_index", 0) - 70)
        snippet = text[start: first.get("end_index", 0) + 90].replace("\n", " ").strip()
        items.append(
            {
                "document_id": document.id,
                "title": document.title,
                "asset_type": document.asset_type,
                "status": document.status,
                "version_number": version_number,
                "match_count": len(findings),
                "snippet": f"…{snippet}…",
                "reason": "Would be flagged if saved as an active prohibited-phrase rule.",
            }
        )
    return {
        "entity_type": "proposed_rule",
        "entity_id": "simulation",
        "entity_name": f"Proposed rule: {pattern}",
        "entity_summary": f"Severity {severity} · {total_matches} match(es) across current content",
        "previous_value": None,
        "current_value": pattern,
        "items": items,
        "scanned_documents": len(documents),
        "note": (
            "This is a simulation against current saved content. Nothing was saved. Matches are "
            "case-insensitive literal patterns, not AI judgements."
        ),
    }
