"""Governance insights computed from stored audits, findings, and decisions."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.approved_fact import ApprovedFact
from app.models.audit import AuditFinding, AuditRun
from app.models.brand_rule import BrandRule
from app.models.campaign import Campaign, CampaignConflict
from app.models.content import ContentDocument
from app.models.review import ApprovalDecision
from app.services import content_service
from app.services.audit_engine import CATEGORY_LABELS


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
    outdated_facts = 0
    for fact in facts:
        if fact.status in {"expired", "needs_review"}:
            outdated_facts += 1
            continue
        if fact.next_review_at:
            next_review = fact.next_review_at
            if next_review.tzinfo is None:
                next_review = next_review.replace(tzinfo=timezone.utc)
            if next_review < now:
                outdated_facts += 1

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
            "No trend or benchmark is inferred when the data is insufficient."
        ),
    }
