"""Review summary built strictly from stored records.

Every number here is a count over rows that exist in the database for one
document: versions, the latest audit run and its findings, their statuses, and
the recorded decisions. Nothing is estimated, and no score or saving is
invented. The summary states where each figure comes from so a reviewer can
trace it.
"""
from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.security import Actor
from app.models.audit import AuditFinding, AuditRun
from app.models.content import ContentDocument, ContentVersion
from app.models.review import ApprovalDecision, ReviewComment
from app.services import content_service
from app.services.audit_engine import group_findings


def _findings_for_run(db: Session, run: Optional[AuditRun]) -> list[AuditFinding]:
    if not run:
        return []
    return (
        db.query(AuditFinding)
        .filter(AuditFinding.audit_run_id == run.id)
        .order_by(AuditFinding.severity, AuditFinding.start_index)
        .all()
    )


def build_review_summary(db: Session, actor: Actor, document: ContentDocument) -> dict:
    version = content_service.latest_version(db, document.id)
    run = content_service.latest_audit_for_version(db, version.id) if version else None
    findings = _findings_for_run(db, run)
    approval_stale = content_service.approval_is_stale(document, version)

    open_findings = [f for f in findings if f.status == "open"]
    resolved_findings = [f for f in findings if f.status != "open"]

    unresolved_high = [
        f for f in open_findings if f.severity in {"high", "critical"}
    ]
    awaiting_verification = [
        f
        for f in open_findings
        if f.category == "needs_human_review" or f.evidence_status == "uncertain"
    ]
    evidence_limitations = [
        f
        for f in open_findings
        if f.category == "processing_issue" or f.evidence_status == "processing_limitation"
    ]
    suggested_corrections = [f for f in open_findings if (f.suggested_correction or "").strip()]
    corrections_awaiting_review = [f for f in findings if f.status == "edited"]

    decisions = (
        db.query(ApprovalDecision)
        .filter(ApprovalDecision.document_id == document.id)
        .order_by(ApprovalDecision.created_at.desc())
        .all()
    )
    latest_decision = decisions[0] if decisions else None
    comments_count = (
        db.query(ReviewComment).filter(ReviewComment.document_id == document.id).count()
    )

    outstanding: list[dict] = []
    if document.status in {"draft", "audited"}:
        outstanding.append(
            {
                "id": "submit",
                "label": "Submit for review",
                "description": "This content is not in the review queue yet.",
            }
        )
    if document.status in {"in_review", "changes_requested"}:
        outstanding.append(
            {
                "id": "decide",
                "label": "Reviewer decision required",
                "description": "A reviewer must approve, reject, or request changes on the current version.",
            }
        )
    if approval_stale:
        outstanding.append(
            {
                "id": "stale",
                "label": "Approval is stale",
                "description": "The recorded approval applies to an older version. Re-review the current version.",
            }
        )
    if unresolved_high:
        outstanding.append(
            {
                "id": "high_priority",
                "label": f"{len(unresolved_high)} high-priority open finding(s)",
                "description": "Resolve or dismiss these before approving.",
            }
        )
    if corrections_awaiting_review:
        outstanding.append(
            {
                "id": "corrections",
                "label": f"{len(corrections_awaiting_review)} proposed correction(s) awaiting review",
                "description": "Wording changes were prepared and need a reviewer decision.",
            }
        )
    if document.status == "approved" and not approval_stale:
        outstanding.append(
            {
                "id": "approved",
                "label": "Approved and current",
                "description": "No outstanding action is recorded for this version.",
            }
        )

    return {
        "document_id": document.id,
        "title": document.title,
        "asset_type": document.asset_type,
        "content_type": document.content_type,
        "status": document.status,
        "version": {
            "current_version_number": document.current_version_number,
            "version_id": version.id if version else None,
            "approved_version_id": document.approved_version_id,
            "approval_stale": approval_stale,
            "is_latest_audited": bool(run and version and run.version_id == version.id),
        },
        "audit": {
            "has_run": bool(run),
            "overall_score": run.overall_score if run else None,
            "risk_level": run.risk_level if run else None,
            "verification_status": run.verification_status if run else "unable_to_verify",
            "score_method": run.score_method if run else None,
            "total_findings": len(findings),
            "open_findings": len(open_findings),
            "resolved_findings": len(resolved_findings),
            "unresolved_high_priority": len(unresolved_high),
            "awaiting_verification": len(awaiting_verification),
            "evidence_limitations": len(evidence_limitations),
            "suggested_corrections_available": len(suggested_corrections),
            "corrections_awaiting_review": len(corrections_awaiting_review),
        },
        "groups": group_findings(findings),
        "approval": {
            "decisions_count": len(decisions),
            "latest_decision": latest_decision.decision if latest_decision else None,
            "latest_decision_reviewer": latest_decision.reviewer_name if latest_decision else None,
            "latest_decision_version_number": (
                (latest_decision.decision_metadata or {}).get("version_number")
                if latest_decision
                else None
            ),
            "latest_decision_at": latest_decision.created_at if latest_decision else None,
            "latest_feedback": latest_decision.feedback if latest_decision else None,
        },
        "comments_count": comments_count,
        "outstanding_actions": outstanding,
        "data_sources": [
            "Versions, audit runs, and findings are read from the stored records for this document.",
            "Approval status comes from the version-bound review decisions.",
            "Counts are exact; no figure is estimated. The readiness score is a workflow aid, not a legal rating.",
        ],
    }