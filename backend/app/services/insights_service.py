"""Governance insights computed from stored audits, findings, and decisions."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.approved_fact import ApprovedFact
from app.models.audit import AuditFinding, AuditRun
from app.models.brand_rule import BrandRule
from app.models.campaign import Campaign, CampaignConflict
from app.models.content import ContentDocument
from app.models.review import ApprovalDecision, FindingOverride
from app.services import content_service
from app.services.audit_engine import CATEGORY_LABELS

SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}
PLACEHOLDER_SOURCES = {"", "-", "—", "n/a", "na", "none", "unknown", "tbd"}
VAGUE_RULE_TERMS = (
    "etc",
    "appropriate",
    "reasonable",
    "professional",
    "as needed",
    "avoid",
    "should",
    "minimal",
    "clear",
    "effective",
    "friendly",
    "sensible",
    "tone",
)
GUIDANCE_RULE_TYPES = {"prohibited_phrase", "required_terminology", "product_naming"}


def _as_utc(value):
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _iso(value) -> Optional[str]:
    aware = _as_utc(value)
    return aware.isoformat() if aware else None


def _missing_source(reference: Optional[str]) -> bool:
    return (reference or "").strip().lower() in PLACEHOLDER_SOURCES


def _contains_term(text: str, term: str) -> bool:
    return re.search(rf"\b{re.escape(term)}\b", text) is not None


def _filter_documents(
    documents: list[ContentDocument],
    db: Session,
    *,
    content_type: Optional[str],
    asset_type: Optional[str],
    status: Optional[str],
    date_from: Optional[datetime],
    date_to: Optional[datetime],
) -> list[tuple[ContentDocument, object, object]]:
    selected = []
    for document in documents:
        if content_type and document.content_type != content_type:
            continue
        if asset_type and document.asset_type != asset_type:
            continue
        if status and document.status != status:
            continue
        version = content_service.latest_version(db, document.id)
        run = content_service.latest_audit_for_version(db, version.id) if version else None
        if date_from or date_to:
            if not run:
                continue
            created = run.created_at
            if created and created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if date_from and created and created < date_from:
                continue
            if date_to and created and created > date_to:
                continue
        selected.append((document, version, run))
    return selected


def build_insights(
    db: Session,
    workspace_id: str,
    *,
    content_type: Optional[str] = None,
    asset_type: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> dict:
    all_documents = (
        db.query(ContentDocument)
        .filter(ContentDocument.workspace_id == workspace_id)
        .all()
    )
    selected = _filter_documents(
        all_documents,
        db,
        content_type=content_type,
        asset_type=asset_type,
        status=status,
        date_from=date_from,
        date_to=date_to,
    )
    selected_ids = [document.id for document, _, _ in selected]
    runs = (
        db.query(AuditRun)
        .filter(AuditRun.document_id.in_(selected_ids))
        .all()
        if selected_ids
        else []
    )
    audited = [(document, version, run) for document, version, run in selected if run]
    scores = [run.overall_score for _, _, run in audited]
    average = round(sum(scores) / len(scores), 1) if scores else 0.0

    findings: list[AuditFinding] = []
    for _, _, run in audited:
        findings.extend(
            db.query(AuditFinding)
            .filter(AuditFinding.audit_run_id == run.id)
            .all()
        )

    category_counts = {label: 0 for label in CATEGORY_LABELS.values()}
    severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for finding in findings:
        label = CATEGORY_LABELS.get(finding.category, finding.category)
        category_counts[label] = category_counts.get(label, 0) + 1
        severity_counts[finding.severity] = severity_counts.get(finding.severity, 0) + 1

    run_by_id = {run.id: run for run in runs}
    document_by_id = {document.id: document for document in all_documents}
    all_run_findings = (
        db.query(AuditFinding).filter(AuditFinding.audit_run_id.in_([run.id for run in runs])).all()
        if runs
        else []
    )
    rule_ids = {finding.rule_id for finding in all_run_findings if finding.rule_id}
    rules_by_id = (
        {
            rule.id: rule
            for rule in db.query(BrandRule)
            .filter(BrandRule.id.in_(rule_ids), BrandRule.workspace_id == workspace_id)
            .all()
        }
        if rule_ids
        else {}
    )

    recurrence: dict[str, dict] = {}
    for finding in all_run_findings:
        key = finding.rule_id or f"{finding.category}:{finding.title.strip().lower()}"
        run = run_by_id.get(finding.audit_run_id)
        entry = recurrence.setdefault(
            key,
            {
                "category": finding.category,
                "rule_id": finding.rule_id,
                "rule_name": (
                    rules_by_id[finding.rule_id].name
                    if finding.rule_id and finding.rule_id in rules_by_id
                    else finding.title
                ),
                "severity": finding.severity,
                "finding_count": 0,
                "document_ids": {},
                "run_ids": set(),
                "sample_affected_text": finding.affected_text,
                "first_run_at": None,
                "last_run_at": None,
            },
        )
        entry["finding_count"] += 1
        if run:
            entry["document_ids"][run.document_id] = True
            entry["run_ids"].add(run.id)
            created = _as_utc(run.created_at)
            if created:
                if not entry["first_run_at"] or created < entry["first_run_at"]:
                    entry["first_run_at"] = created
                if not entry["last_run_at"] or created > entry["last_run_at"]:
                    entry["last_run_at"] = created
        if SEVERITY_RANK.get(finding.severity, 4) < SEVERITY_RANK.get(entry["severity"], 4):
            entry["severity"] = finding.severity

    recurring_violations = sorted(
        recurrence.values(),
        key=lambda item: (-len(item["document_ids"]), -item["finding_count"]),
    )[:8]
    recurring_violations_out = [
        {
            "key": item["rule_id"] or item["rule_name"],
            "category": item["category"],
            "category_label": CATEGORY_LABELS.get(item["category"], item["category"]),
            "rule_id": item["rule_id"],
            "rule_name": item["rule_name"],
            "severity": item["severity"],
            "finding_count": item["finding_count"],
            "unique_documents": len(item["document_ids"]),
            "audit_run_count": len(item["run_ids"]),
            "sample_affected_text": item["sample_affected_text"],
            "documents": [
                {
                    "id": document_id,
                    "title": (
                        document_by_id[document_id].title
                        if document_id in document_by_id
                        else "Content item"
                    ),
                }
                for document_id in list(item["document_ids"])[:5]
            ],
            "first_seen": _iso(item["first_run_at"]),
            "last_seen": _iso(item["last_run_at"]),
        }
        for item in recurring_violations
    ]

    rule_counts: dict[str, dict] = {}
    for finding in findings:
        if not finding.rule_id:
            continue
        rule = db.query(BrandRule).filter(BrandRule.id == finding.rule_id).first()
        if not rule:
            continue
        entry = rule_counts.setdefault(
            rule.id,
            {
                "rule_id": rule.id,
                "rule_name": rule.name,
                "severity": rule.severity,
                "rule_type": rule.rule_type,
                "violations": 0,
            },
        )
        entry["violations"] += 1
    top_rules = sorted(rule_counts.values(), key=lambda item: -item["violations"])[:5]

    groups: dict[tuple, dict] = {}
    for finding in findings:
        key = (finding.category, finding.affected_text.strip().lower())
        entry = groups.setdefault(
            key,
            {
                "category": finding.category,
                "count": 0,
                "severity": finding.severity,
                "sample_affected_text": finding.affected_text,
                "recommendation": (
                    f"Use “{finding.suggested_correction}”."
                    if finding.suggested_correction
                    else "Review the rule with the brand owner."
                ),
            },
        )
        entry["count"] += 1
        if {"critical": 0, "high": 1, "medium": 2, "low": 3}.get(finding.severity, 4) < {
            "critical": 0, "high": 1, "medium": 2, "low": 3
        }.get(entry["severity"], 4):
            entry["severity"] = finding.severity
    recurring = sorted(groups.values(), key=lambda item: -item["count"])[:6]

    if average >= 85:
        health = "Healthy"
    elif average >= 70:
        health = "Watch"
    elif average >= 50:
        health = "At risk"
    elif scores:
        health = "Critical"
    else:
        health = "No completed checks"

    turnaround_values = []
    for document, _, run in audited:
        decision = (
            db.query(ApprovalDecision)
            .filter(ApprovalDecision.document_id == document.id)
            .order_by(ApprovalDecision.created_at.desc())
            .first()
        )
        if not decision or not document.submitted_at:
            continue
        submitted = document.submitted_at
        created = decision.created_at
        if submitted.tzinfo is None:
            submitted = submitted.replace(tzinfo=timezone.utc)
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        hours = (created - submitted).total_seconds() / 3600
        if hours >= 0:
            turnaround_values.append(hours)
    turnaround = round(sum(turnaround_values) / len(turnaround_values), 1) if turnaround_values else None

    unresolved_conflicts = (
        db.query(CampaignConflict)
        .join(Campaign, Campaign.id == CampaignConflict.campaign_id)
        .filter(Campaign.workspace_id == workspace_id, CampaignConflict.status == "unresolved")
        .count()
    )
    campaigns_with_conflicts = (
        db.query(CampaignConflict.campaign_id)
        .join(Campaign, Campaign.id == CampaignConflict.campaign_id)
        .filter(Campaign.workspace_id == workspace_id, CampaignConflict.status == "unresolved")
        .distinct()
        .count()
    )
    now = datetime.now(timezone.utc)
    facts = (
        db.query(ApprovedFact)
        .filter(ApprovedFact.workspace_id == workspace_id, ApprovedFact.is_active.is_(True))
        .all()
    )
    fact_items = []
    for fact in facts:
        reasons = []
        if fact.status in {"expired", "needs_review"}:
            reasons.append(f"Status recorded as {fact.status.replace('_', ' ')}")
        next_review = _as_utc(fact.next_review_at)
        if next_review and next_review < now:
            reasons.append(f"Review date passed on {next_review.date().isoformat()}")
        if _missing_source(fact.source_reference):
            reasons.append("No usable source reference recorded")
        if not reasons:
            continue
        fact_items.append(
            {
                "id": fact.id,
                "claim_statement": fact.claim_statement,
                "category": fact.category,
                "status": fact.status,
                "source_reference": fact.source_reference,
                "next_review_at": _iso(fact.next_review_at),
                "owner_name": fact.owner_name,
                "reasons": reasons,
                "reasons_count": len(reasons),
            }
        )
    fact_items.sort(key=lambda item: (-item["reasons_count"], item["claim_statement"].lower()))
    facts_needing_verification = {
        "count": len(fact_items),
        "total_active_facts": len(facts),
        "items": fact_items[:10],
        "criteria": [
            "Active fact whose status is expired or needs_review",
            "Active fact whose next review date is in the past",
            "Active fact with a blank or placeholder source reference",
        ],
        "method_note": (
            "Each active fact is checked against three recorded criteria. A fact that "
            "matches several criteria is counted once and lists every matched reason."
        ),
    }
    outdated_facts = len(fact_items)

    active_rules = (
        db.query(BrandRule)
        .filter(BrandRule.workspace_id == workspace_id, BrandRule.is_active.is_(True))
        .all()
    )
    guideline_items = []
    for rule in active_rules:
        signals = []
        phrase = (rule.pattern_or_phrase or "").strip()
        searchable = " ".join(
            part for part in (rule.name, phrase, rule.description or "") if part
        ).lower()
        for term in VAGUE_RULE_TERMS:
            if _contains_term(searchable, term):
                signals.append(f"Broad wording “{term}” appears in the rule")
        if not (rule.description or "").strip():
            signals.append("No description recorded for reviewers")
        if rule.rule_type in GUIDANCE_RULE_TYPES and not (rule.replacement_or_guidance or "").strip():
            signals.append("No replacement or reviewer guidance recorded")
        if (
            rule.rule_type in {"prohibited_phrase", "tone_guideline"}
            and " " not in phrase
            and 0 < len(phrase) <= 8
        ):
            signals.append("Pattern is a single short word; it may match unrelated text")
        if not signals:
            continue
        guideline_items.append(
            {
                "id": rule.id,
                "name": rule.name,
                "rule_type": rule.rule_type,
                "severity": rule.severity,
                "pattern_or_phrase": rule.pattern_or_phrase,
                "signals": signals,
                "signals_count": len(signals),
                "last_reviewed_at": _iso(rule.last_reviewed_at),
            }
        )
    guideline_items.sort(key=lambda item: (-item["signals_count"], item["name"].lower()))
    unclear_guidelines = {
        "count": len(guideline_items),
        "evaluated_rules": len(active_rules),
        "items": guideline_items[:10],
        "method_note": (
            "Deterministic checks over active rule text, recorded guidance, and pattern "
            "shape. These are prompts for a human rule review, not an AI judgment that a "
            "rule is wrong."
        ),
    }

    selected_id_set = set(selected_ids)
    overrides = (
        db.query(FindingOverride)
        .filter(FindingOverride.workspace_id == workspace_id)
        .order_by(FindingOverride.created_at.desc())
        .all()
    )
    overrides_in_scope = [
        override for override in overrides if override.document_id in selected_id_set
    ]
    rule_finding_totals: dict[str, int] = {}
    for finding in all_run_findings:
        if finding.rule_id:
            rule_finding_totals[finding.rule_id] = (
                rule_finding_totals.get(finding.rule_id, 0) + 1
            )
    override_groups: dict[str, dict] = {}
    for override in overrides_in_scope:
        key = override.rule_id or f"name:{override.rule_name or 'Unlinked finding'}"
        entry = override_groups.setdefault(
            key,
            {
                "rule_id": override.rule_id,
                "rule_name": override.rule_name or "Unlinked finding",
                "severity": override.severity,
                "override_count": 0,
                "document_ids": {},
                "reasons": {},
                "latest_at": None,
            },
        )
        entry["override_count"] += 1
        entry["document_ids"][override.document_id] = True
        reason_entry = entry["reasons"].setdefault(
            override.reason.strip(),
            {"reason": override.reason.strip(), "count": 0, "reviewer_name": override.reviewer_name},
        )
        reason_entry["count"] += 1
        created = _as_utc(override.created_at)
        if created and (not entry["latest_at"] or created > entry["latest_at"]):
            entry["latest_at"] = created
        if SEVERITY_RANK.get(override.severity, 4) < SEVERITY_RANK.get(entry["severity"], 4):
            entry["severity"] = override.severity

    overridden_rules_out = []
    for entry in override_groups.values():
        total_findings = (
            rule_finding_totals.get(entry["rule_id"], 0) if entry["rule_id"] else 0
        )
        rate = (
            round(entry["override_count"] / total_findings * 100, 1)
            if total_findings
            else None
        )
        may_need_review = entry["override_count"] >= 2 or (
            rate is not None and rate >= 50
        )
        overridden_rules_out.append(
            {
                "rule_id": entry["rule_id"],
                "rule_name": entry["rule_name"],
                "severity": entry["severity"],
                "override_count": entry["override_count"],
                "unique_documents": len(entry["document_ids"]),
                "rule_findings_in_scope": total_findings,
                "override_rate_percent": rate,
                "may_need_review": may_need_review,
                "review_note": (
                    "Overridden repeatedly or at a high rate. Check whether the rule text, "
                    "severity, or approval workflow still matches the brand intent."
                    if may_need_review
                    else "Recorded for visibility; too few overrides to suggest a rule review."
                ),
                "reasons": sorted(
                    entry["reasons"].values(), key=lambda item: -item["count"]
                )[:5],
                "last_overridden_at": _iso(entry["latest_at"]),
            }
        )
    overridden_rules_out.sort(
        key=lambda item: (-item["override_count"], -(item["override_rate_percent"] or 0))
    )
    overridden_rules_out = overridden_rules_out[:6]

    audit_times = [
        _as_utc(run.created_at) for run in runs if run.created_at is not None
    ]
    override_times = [
        _as_utc(override.created_at)
        for override in overrides_in_scope
        if override.created_at is not None
    ]
    reporting_window = {
        "audit_runs_from": _iso(min(audit_times)) if audit_times else None,
        "audit_runs_to": _iso(max(audit_times)) if audit_times else None,
        "overrides_from": _iso(min(override_times)) if override_times else None,
        "overrides_to": _iso(max(override_times)) if override_times else None,
    }
    metric_methods = {
        "recurring_violations": {
            "method": (
                "Counts every stored finding across all audit runs of the evaluated "
                "documents, grouped by rule (or by category and title when a finding has "
                "no rule). Separate counts are reported for findings, unique documents, "
                "and audit runs."
            ),
            "sample_size": len(all_run_findings),
            "time_range": {
                "from": reporting_window["audit_runs_from"],
                "to": reporting_window["audit_runs_to"],
            },
        },
        "overridden_rules": {
            "method": (
                "Counts reasoned dismissals in this workspace for the evaluated documents. "
                "The override rate divides dismissals by all stored findings linked to the "
                "same rule in those audit runs. A rule is flagged when it has at least two "
                "overrides or a rate of 50% or more."
            ),
            "sample_size": len(overrides_in_scope),
            "time_range": {
                "from": reporting_window["overrides_from"],
                "to": reporting_window["overrides_to"],
            },
        },
        "facts_needing_verification": {
            "method": facts_needing_verification["method_note"],
            "sample_size": len(facts),
            "time_range": {"from": None, "to": None},
        },
        "unclear_guidelines": {
            "method": unclear_guidelines["method_note"],
            "sample_size": len(active_rules),
            "time_range": {"from": None, "to": None},
        },
    }

    open_high = sum(
        1 for finding in findings if finding.status == "open" and finding.severity in {"high", "critical"}
    )
    stale_approvals = sum(
        1
        for document, version, _ in selected
        if document.approved_version_id
        and version
        and document.approved_version_id != version.id
    )
    pending_reviews = sum(
        1 for document, _, _ in selected if document.status in {"in_review", "changes_requested"}
    )
    outstanding_actions = open_high + unresolved_conflicts + pending_reviews + stale_approvals

    buckets = [
        {"label": "0–39", "min": 0, "max": 39, "count": 0},
        {"label": "40–59", "min": 40, "max": 59, "count": 0},
        {"label": "60–79", "min": 60, "max": 79, "count": 0},
        {"label": "80–99", "min": 80, "max": 99, "count": 0},
        {"label": "100", "min": 100, "max": 100, "count": 0},
    ]
    for score in scores:
        for bucket in buckets:
            if bucket["min"] <= score <= bucket["max"]:
                bucket["count"] += 1
                break

    content_types = sorted({doc.content_type for doc in all_documents})
    asset_types = sorted({doc.asset_type for doc in all_documents})
    statuses = sorted({doc.status for doc in all_documents})

    applied = {
        "content_type": content_type,
        "asset_type": asset_type,
        "status": status,
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
    }
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "is_demo": settings.DEMO_MODE,
        "total_audits_evaluated": len(audited),
        "documents_evaluated": len(audited),
        "audits_all_time": len(runs),
        "average_score": average,
        "violations_by_category": category_counts,
        "violations_by_severity": severity_counts,
        "top_violated_rules": top_rules,
        "recurring_patterns": recurring,
        "governance_health_status": health,
        "review_turnaround_hours": turnaround,
        "turnaround_sample_size": len(turnaround_values),
        "unresolved_campaign_conflicts": unresolved_conflicts,
        "campaigns_with_unresolved_conflicts": campaigns_with_conflicts,
        "outdated_facts_count": outdated_facts,
        "recurring_violations": recurring_violations_out,
        "overridden_rules": overridden_rules_out,
        "facts_needing_verification": facts_needing_verification,
        "unclear_guidelines": unclear_guidelines,
        "risk_signal_counts": {
            "recurring_violation_groups": len(recurring_violations_out),
            "overridden_rule_groups": len(overridden_rules_out),
            "facts_needing_verification": facts_needing_verification["count"],
            "unclear_guideline_signals": unclear_guidelines["count"],
        },
        "metric_methods": metric_methods,
        "reporting_window": reporting_window,
        "outstanding_actions_count": outstanding_actions,
        "score_distribution": buckets,
        "filter_options": {
            "content_types": content_types,
            "asset_types": asset_types,
            "statuses": statuses,
        },
        "applied_filters": applied,
        "scope_note": (
            f"Current-state metrics use the latest stored audit for each document "
            f"({len(audited)} document(s)). {len(runs)} audit run(s) exist across those documents. "
            "Recurring-violation and override metrics use every stored run in scope, and each "
            "card reports its own sample size. No trend or benchmark is inferred when the data "
            "is insufficient."
        ),
    }
