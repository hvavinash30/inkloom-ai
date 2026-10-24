"""Role-aware dashboard data, computed from stored records."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import Actor, ROLE_CAPABILITIES
from app.models.approved_fact import ApprovedFact
from app.models.audit import AuditFinding, AuditRun
from app.models.campaign import Campaign, CampaignConflict
from app.models.content import ContentDocument
from app.models.review import AuditHistoryEvent
from app.models.workspace import UserProfile, Workspace
from app.services import content_service


def _document_summary(db: Session, document: ContentDocument) -> dict:
    version = content_service.latest_version(db, document.id)
    run = content_service.latest_audit_for_version(db, version.id) if version else None
    return {
        "id": document.id,
        "title": document.title,
        "asset_type": document.asset_type,
        "content_type": document.content_type,
        "status": document.status,
        "current_version_number": document.current_version_number,
        "created_by_name": document.created_by_name,
        "updated_at": document.updated_at,
        "submitted_at": document.submitted_at,
        "latest_score": run.overall_score if run else None,
        "risk_level": run.risk_level if run else None,
        "verification_status": run.verification_status if run else None,
        "total_findings": run.total_findings if run else None,
        "approval_stale": bool(
            document.approved_version_id
            and version
            and document.approved_version_id != version.id
        ),
    }


def build_dashboard(db: Session, actor: Actor) -> dict:
    query = db.query(ContentDocument).filter(ContentDocument.workspace_id == actor.workspace_id)
    if not actor.can("content.read.all"):
        query = query.filter(ContentDocument.created_by == actor.id)
    documents = query.order_by(ContentDocument.updated_at.desc()).all()
    document_ids = [document.id for document in documents]

    latest = []
    for document in documents:
        summary = _document_summary(db, document)
        if summary["latest_score"] is not None:
            latest.append((document, summary))
    scores = [summary["latest_score"] for _, summary in latest]
    average = round(sum(scores) / len(scores), 1) if scores else 0.0

    open_high = 0
    for document, _ in latest:
        version = content_service.latest_version(db, document.id)
        run = content_service.latest_audit_for_version(db, version.id) if version else None
        if run:
            open_high += (
                db.query(AuditFinding)
                .filter(
                    AuditFinding.audit_run_id == run.id,
                    AuditFinding.status == "open",
                    AuditFinding.severity.in_(["high", "critical"]),
                )
                .count()
            )

    campaigns_query = db.query(Campaign).filter(Campaign.workspace_id == actor.workspace_id)
    campaigns = campaigns_query.all()
    unresolved_conflicts = (
        db.query(CampaignConflict)
        .join(Campaign, Campaign.id == CampaignConflict.campaign_id)
        .filter(
            Campaign.workspace_id == actor.workspace_id,
            CampaignConflict.status == "unresolved",
        )
        .count()
    )
    stale_approvals = sum(1 for _, summary in latest if summary["approval_stale"])
    pending_reviews = sum(
        1 for document in documents if document.status in {"in_review", "changes_requested"}
    )
    drafts = sum(1 for document in documents if document.status == "draft")
    approved = sum(1 for document in documents if document.status == "approved")

    priority_items = []
    if actor.can("review.queue"):
        for document in documents:
            if document.status in {"in_review", "changes_requested"}:
                priority_items.append(
                    {
                        "kind": "review",
                        "title": document.title,
                        "description": (
                            f"Version {document.current_version_number} is waiting for a reviewer decision."
                            if document.status == "in_review"
                            else "Changes were requested; the creator has not resubmitted yet."
                        ),
                        "route": f"/content/{document.id}",
                        "severity": "high" if document.status == "in_review" else "medium",
                    }
                )
    else:
        for document in documents:
            if document.status == "changes_requested":
                priority_items.append(
                    {
                        "kind": "changes",
                        "title": document.title,
                        "description": "A reviewer requested changes. Open the content to see the notes.",
                        "route": f"/content/{document.id}",
                        "severity": "high",
                    }
                )
    for document, summary in sorted(latest, key=lambda item: item[1]["latest_score"] or 0)[:4]:
        if (summary["latest_score"] or 0) < 80 and document.status not in {"approved"}:
            priority_items.append(
                {
                    "kind": "findings",
                    "title": document.title,
                    "description": (
                        f"Latest check scored {summary['latest_score']}/100 with "
                        f"{summary['total_findings']} finding(s)."
                    ),
                    "route": f"/content/{document.id}",
                    "severity": "high" if (summary["latest_score"] or 0) < 60 else "medium",
                }
            )
    if unresolved_conflicts:
        priority_items.append(
            {
                "kind": "campaigns",
                "title": f"{unresolved_conflicts} unresolved campaign conflict{'s' if unresolved_conflicts != 1 else ''}",
                "description": "Assets make inconsistent claims. Resolve values before launch.",
                "route": "/campaigns",
                "severity": "high",
            }
        )
    priority_items = priority_items[:6]

    events = (
        db.query(AuditHistoryEvent)
        .filter(AuditHistoryEvent.document_id.in_(document_ids))
        .order_by(AuditHistoryEvent.created_at.desc())
        .limit(8)
        .all()
        if document_ids
        else []
    )
    recent_scores = []
    for document, summary in latest[:8]:
        recent_scores.append(
            {
                "document_id": document.id,
                "title": document.title,
                "score": summary["latest_score"],
                "risk_level": summary["risk_level"],
                "updated_at": document.updated_at,
            }
        )

    outdated_facts = 0
    if actor.can("brand.manage"):
        now = datetime.now(timezone.utc)
        facts = (
            db.query(ApprovedFact)
            .filter(ApprovedFact.workspace_id == actor.workspace_id, ApprovedFact.is_active.is_(True))
            .all()
        )
        for fact in facts:
            if fact.status in {"expired", "needs_review"}:
                outdated_facts += 1
            elif fact.next_review_at:
                review_at = fact.next_review_at
                if review_at.tzinfo is None:
                    review_at = review_at.replace(tzinfo=timezone.utc)
                if review_at < now:
                    outdated_facts += 1

    workspace = (
        db.query(Workspace)
        .filter(Workspace.id == actor.workspace_id)
        .first()
    )
    return {
        "workspace": {
            "id": actor.workspace_id,
            "name": workspace.name if workspace else settings.DEFAULT_WORKSPACE_NAME,
            "is_demo": workspace.is_demo if workspace else settings.DEMO_MODE,
        },
        "role": actor.role,
        "user": {
            "id": actor.user.id,
            "name": actor.user.full_name,
            "title": actor.user.title,
        },
        "stats": {
            "documents": len(documents),
            "scored_documents": len(latest),
            "average_score": average,
            "pending_reviews": pending_reviews,
            "open_high_findings": open_high,
            "approved_content": approved,
            "drafts": drafts,
            "unresolved_conflicts": unresolved_conflicts,
            "stale_approvals": stale_approvals,
            "outdated_facts": outdated_facts,
        },
        "priority_items": priority_items,
        "recent_documents": [_document_summary(db, document) for document in documents[:6]],
        "review_queue": [
            _document_summary(db, document)
            for document in documents
            if document.status in {"in_review", "changes_requested"}
        ][:8]
        if actor.can("review.queue")
        else [],
        "recent_activity": [
            {
                "id": event.id,
                "document_id": event.document_id,
                "event_type": event.event_type,
                "actor": event.user_name,
                "description": event.description,
                "created_at": event.created_at,
            }
            for event in events
        ],
        "recent_scores": recent_scores,
        "campaigns": [
            {
                "id": campaign.id,
                "name": campaign.name,
                "status": campaign.status,
                "assets_count": db.query(ContentDocument)
                .filter(ContentDocument.campaign_id == campaign.id)
                .count(),
            }
            for campaign in campaigns[:4]
        ],
        "integrations": {
            "llm_configured": settings.llm_configured,
            "ocr_configured": settings.ocr_configured,
            "transcription_configured": settings.transcription_configured,
            "note": (
                "Audits use deterministic rules and approved facts. Optional AI, OCR, and "
                "transcription integrations are only reported as available when configured on the server."
            ),
        },
        "demo_mode": settings.DEMO_MODE,
        "capabilities": sorted(actor.capabilities),
    }
