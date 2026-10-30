from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    Actor,
    ensure_document_access,
    ensure_document_edit,
    require_caps,
)
from app.db.session import get_db
from app.models.assets import UploadedFile
from app.models.audit import AuditFinding, AuditRun
from app.models.campaign import Campaign
from app.models.brand_rule import BrandRule
from app.models.content import ContentDocument, ContentVersion
from app.models.review import ApprovalDecision, AuditHistoryEvent, FindingOverride
from app.schemas.audit import (
    AuditRunOut,
    ContentDocumentOut,
    ContentProvenancePassportOut,
    ContentSubmissionRequest,
    CorrectionSuggestionOut,
    CorrectionSuggestionRequest,
    CreateNewVersionRequest,
    FindingActionRequest,
    FindingOut,
    OverviewStatsOut,
    ReviewSummaryOut,
)
from app.services import content_service, correction_service, review_summary_service
from app.services.audit_engine import CATEGORY_LABELS

router = APIRouter()


def _get_document(
    db: Session, actor: Actor, document_id: str, *, require_edit: bool = False
) -> ContentDocument:
    document = (
        db.query(ContentDocument)
        .filter(
            ContentDocument.id == document_id,
            ContentDocument.workspace_id == actor.workspace_id,
        )
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Content item not found.")
    ensure_document_access(actor, document)
    if require_edit:
        ensure_document_edit(actor, document)
    return document


def _get_upload(db: Session, actor: Actor, upload_id: str) -> UploadedFile:
    record = (
        db.query(UploadedFile)
        .filter(
            UploadedFile.id == upload_id,
            UploadedFile.workspace_id == actor.workspace_id,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Upload not found.")
    if not actor.can("content.read.all") and record.uploaded_by_id != actor.id:
        raise HTTPException(status_code=403, detail="This upload belongs to another user.")
    return record


def _validate_campaign(db: Session, actor: Actor, campaign_id: Optional[str]) -> None:
    if not campaign_id:
        return
    campaign = (
        db.query(Campaign)
        .filter(Campaign.id == campaign_id, Campaign.workspace_id == actor.workspace_id)
        .first()
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found in this workspace.")


def _ensure_video_ready(upload: Optional[UploadedFile]) -> None:
    """Refuse to audit a video while automatic extraction is still running."""
    if upload is None or upload.kind != "video":
        return
    extraction = upload.video_extraction
    if extraction is not None and extraction.status in {"queued", "processing"}:
        raise HTTPException(
            status_code=409,
            detail=(
                "Automatic video analysis is still running. Wait for speech and on-screen "
                "text processing to finish, or cancel it, then run the audit again. "
                "A manual transcript can be added in the meantime."
            ),
        )


@router.post("/submit-and-audit", response_model=ContentDocumentOut, status_code=201)
def submit_and_audit(
    submission: ContentSubmissionRequest,
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    if submission.workspace_id and submission.workspace_id != actor.workspace_id:
        raise HTTPException(status_code=403, detail="You can only create content in your own workspace.")
    _validate_campaign(db, actor, submission.campaign_id)

    upload = _get_upload(db, actor, submission.upload_id) if submission.upload_id else None
    if not submission.save_as_draft:
        _ensure_video_ready(upload)
    pages = submission.page_texts or []
    if pages and len(pages) > settings.MAX_PDF_PAGES:
        raise HTTPException(
            status_code=400,
            detail=f"PDF page text exceeds the {settings.MAX_PDF_PAGES}-page limit.",
        )
    segments = [segment.model_dump() for segment in (submission.transcript_segments or [])]

    if submission.asset_type == "pdf" and not upload and not any(page.strip() for page in pages):
        raise HTTPException(status_code=400, detail="Upload a PDF or provide extracted page text.")
    if submission.asset_type == "image" and not upload:
        raise HTTPException(status_code=400, detail="Upload an image to create an image check.")
    if submission.asset_type == "video" and not upload and not segments and len(submission.content_text.strip()) < 5:
        raise HTTPException(
            status_code=400,
            detail="Upload a video or provide a transcript before running a video check.",
        )

    if not submission.save_as_draft and submission.asset_type == "text":
        words = submission.content_text.strip().split()
        if len(words) < 3:
            raise HTTPException(status_code=400, detail="Enter at least a few words of content to check.")

    document, version = content_service.create_document(
        db,
        actor,
        title=submission.title,
        content_type=submission.content_type,
        content_text=submission.content_text,
        asset_type=submission.asset_type,
        campaign_id=submission.campaign_id,
        source_url=submission.source_url,
        upload=upload,
        page_texts=pages or None,
        transcript_segments=segments or None,
        save_as_draft=submission.save_as_draft,
    )
    if not submission.save_as_draft:
        content_service.run_and_store_audit(db, document, version, actor, upload=upload)
    return content_service.serialize_document(
        db, document, include_findings=True, include_current_version=True
    )


@router.get("/documents", response_model=List[ContentDocumentOut])
def list_documents(
    status: Optional[str] = Query(default=None),
    asset_type: Optional[str] = Query(default=None),
    content_type: Optional[str] = Query(default=None),
    campaign_id: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None, max_length=200),
    limit: int = Query(default=100, ge=1, le=250),
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    query = db.query(ContentDocument).filter(
        ContentDocument.workspace_id == actor.workspace_id
    )
    if not actor.can("content.read.all"):
        query = query.filter(ContentDocument.created_by == actor.id)
    if status:
        query = query.filter(ContentDocument.status == status)
    if asset_type:
        query = query.filter(ContentDocument.asset_type == asset_type)
    if content_type:
        query = query.filter(ContentDocument.content_type == content_type)
    if campaign_id:
        query = query.filter(ContentDocument.campaign_id == campaign_id)
    if search:
        query = query.filter(ContentDocument.title.ilike(f"%{search.strip()}%"))
    documents = (
        query.order_by(ContentDocument.updated_at.desc()).limit(limit).all()
    )
    return [
        content_service.serialize_document(
            db, document, include_findings=False, include_current_version=False
        )
        for document in documents
    ]


@router.get("/documents/{document_id}", response_model=ContentDocumentOut)
def get_document(
    document_id: str,
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    document = _get_document(db, actor, document_id)
    return content_service.serialize_document(
        db, document, include_findings=True, include_current_version=True
    )


@router.get("/documents/{document_id}/provenance", response_model=ContentProvenancePassportOut)
def get_document_provenance(
    document_id: str,
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    document = _get_document(db, actor, document_id)
    version = content_service.latest_version(db, document.id)
    if not version:
        raise HTTPException(status_code=404, detail="This content has no saved version.")
    previous = (
        db.query(ContentVersion)
        .filter(
            ContentVersion.document_id == document.id,
            ContentVersion.version_number < version.version_number,
        )
        .order_by(ContentVersion.version_number.desc())
        .first()
    )
    recomputed = content_service.content_hash(
        version.content_text or "", version.page_texts or None
    )
    events = (
        db.query(AuditHistoryEvent)
        .filter(AuditHistoryEvent.document_id == document.id)
        .order_by(AuditHistoryEvent.created_at.asc())
        .all()
    )
    run = content_service.latest_audit_for_version(db, version.id)
    decision = (
        db.query(ApprovalDecision)
        .filter(
            ApprovalDecision.document_id == document.id,
            ApprovalDecision.version_id == version.id,
            ApprovalDecision.decision == "approved",
        )
        .order_by(ApprovalDecision.created_at.desc())
        .first()
    )
    return {
        "document_id": document.id,
        "title": document.title,
        "asset_type": document.asset_type,
        "current_version_number": version.version_number,
        "file_hash": recomputed,
        "previous_version_hash": previous.content_hash if previous else None,
        "is_tampered_or_changed": bool(version.content_hash and version.content_hash != recomputed),
        "approved_by": decision.reviewer_name if decision else None,
        "approved_at": decision.created_at if decision else None,
        "verification_status": run.verification_status if run else "unable_to_verify",
        "audit_history_timeline": [
            {
                "id": event.id,
                "event_type": event.event_type,
                "description": event.description,
                "actor": event.user_name,
                "version_id": event.version_id,
                "metadata": event.event_metadata or {},
                "created_at": event.created_at,
            }
            for event in events
        ],
    }


@router.post("/documents/{document_id}/versions", response_model=ContentDocumentOut, status_code=201)
def create_version(
    document_id: str,
    payload: CreateNewVersionRequest,
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    document = _get_document(db, actor, document_id, require_edit=True)
    _ensure_video_ready(document.file)
    segments = [segment.model_dump() for segment in (payload.transcript_segments or [])]
    content_service.create_new_version(
        db,
        document,
        actor,
        content_text=payload.content_text,
        change_summary=payload.change_summary,
        page_texts=payload.page_texts,
        transcript_segments=segments or None,
    )
    db.refresh(document)
    return content_service.serialize_document(
        db, document, include_findings=True, include_current_version=True
    )


@router.post("/documents/{document_id}/rerun", response_model=ContentDocumentOut)
def rerun_audit(
    document_id: str,
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    document = _get_document(db, actor, document_id, require_edit=True)
    _ensure_video_ready(document.file)
    version = content_service.latest_version(db, document.id)
    if not version:
        raise HTTPException(status_code=400, detail="There is no saved version to check.")
    previous_status = document.status
    content_service.run_and_store_audit(
        db, document, version, actor, upload=document.file
    )
    if previous_status in {"in_review", "approved", "changes_requested"}:
        document.status = previous_status
        db.commit()
    return content_service.serialize_document(
        db, document, include_findings=True, include_current_version=True
    )


@router.get("/documents/{document_id}/review-summary", response_model=ReviewSummaryOut)
def review_summary(
    document_id: str,
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    """Stored-data-only review summary: versions, findings, groups, decisions."""
    document = _get_document(db, actor, document_id)
    return review_summary_service.build_review_summary(db, actor, document)


@router.post("/findings/{finding_id}/suggest-correction", response_model=CorrectionSuggestionOut)
def suggest_correction(
    finding_id: str,
    payload: Optional[CorrectionSuggestionRequest] = None,
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    """Prepare a grounded correction suggestion. Advisory only; never mutates content."""
    return correction_service.suggest_correction(
        db, actor, finding_id, reviewer_notes=payload.reviewer_notes if payload else None
    )


@router.patch("/findings/{finding_id}", response_model=FindingOut)
def update_finding(
    finding_id: str,
    payload: FindingActionRequest,
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    finding = db.query(AuditFinding).filter(AuditFinding.id == finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found.")
    run = db.query(AuditRun).filter(AuditRun.id == finding.audit_run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Audit run not found.")
    document = _get_document(db, actor, run.document_id)

    if payload.action == "dismiss":
        if not actor.can("findings.dismiss"):
            raise HTTPException(
                status_code=403,
                detail="Only reviewers or organization administrators can dismiss findings.",
            )
        reason = (payload.dismissal_reason or "").strip()
        if len(reason) < 10:
            raise HTTPException(
                status_code=422,
                detail=(
                    "A dismissal reason of at least 10 characters is required so this "
                    "override can be audited and reviewed later."
                ),
            )
        if (
            finding.status == "dismissed"
            and (finding.dismissal_reason or "").strip() == reason
            and finding.reviewed_by == actor.name
        ):
            return finding

        rule = (
            db.query(BrandRule).filter(BrandRule.id == finding.rule_id).first()
            if finding.rule_id
            else None
        )
        finding.status = "dismissed"
        finding.dismissal_reason = reason
        db.add(
            FindingOverride(
                workspace_id=document.workspace_id,
                document_id=document.id,
                version_id=finding.version_id,
                finding_id=finding.id,
                rule_id=finding.rule_id,
                rule_name=rule.name if rule else finding.title,
                severity=finding.severity,
                action="dismissed",
                reason=reason,
                reviewer_id=actor.id,
                reviewer_name=actor.name,
                reviewer_role=actor.role,
            )
        )
    else:
        if not actor.can_edit_document(document):
            raise HTTPException(status_code=403, detail="You cannot update findings on this content.")
        if payload.action == "accept":
            finding.status = "accepted"
        elif payload.action == "edit":
            if not payload.custom_correction or not payload.custom_correction.strip():
                raise HTTPException(status_code=422, detail="Enter the replacement text for this correction.")
            finding.status = "edited"
            finding.suggested_correction = payload.custom_correction.strip()
    finding.reviewed_by = actor.name
    finding.reviewed_at = datetime.now(timezone.utc)

    resolved = (
        db.query(func.count(AuditFinding.id))
        .filter(
            AuditFinding.audit_run_id == run.id,
            AuditFinding.status != "open",
        )
        .scalar()
    ) or 0
    run.resolved_findings = resolved
    content_service.add_history(
        db,
        document,
        user_id=actor.id,
        user_name=actor.name,
        event_type="finding_action",
        description=(
            f"Finding “{finding.title}” marked as {finding.status}."
            + (f" Reason: {finding.dismissal_reason}" if payload.action == "dismiss" else "")
        ),
        version_id=finding.version_id,
        metadata={
            "finding_id": finding.id,
            "action": payload.action,
            "rule_id": finding.rule_id,
            "severity": finding.severity,
            **(
                {"override_reason": finding.dismissal_reason}
                if payload.action == "dismiss"
                else {}
            ),
        },
    )
    db.commit()
    db.refresh(finding)
    return finding


@router.get("/overview-stats", response_model=OverviewStatsOut)
def overview_stats(
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    query = db.query(ContentDocument).filter(
        ContentDocument.workspace_id == actor.workspace_id
    )
    if not actor.can("content.read.all"):
        query = query.filter(ContentDocument.created_by == actor.id)
    documents = query.all()
    document_ids = [document.id for document in documents]
    total_audits = (
        db.query(AuditRun).filter(AuditRun.document_id.in_(document_ids)).count()
        if document_ids
        else 0
    )
    latest_runs = []
    high_open = 0
    for document in documents:
        version = content_service.latest_version(db, document.id)
        run = content_service.latest_audit_for_version(db, version.id) if version else None
        if run:
            latest_runs.append(run)
            high_open += (
                db.query(AuditFinding)
                .filter(
                    AuditFinding.audit_run_id == run.id,
                    AuditFinding.status == "open",
                    AuditFinding.severity.in_(["high", "critical"]),
                )
                .count()
            )
    average = (
        round(sum(run.overall_score for run in latest_runs) / len(latest_runs), 1)
        if latest_runs
        else 0.0
    )
    recent_events = (
        db.query(AuditHistoryEvent)
        .filter(AuditHistoryEvent.document_id.in_(document_ids))
        .order_by(AuditHistoryEvent.created_at.desc())
        .limit(8)
        .all()
        if document_ids
        else []
    )
    recurring = {}
    for document in documents:
        version = content_service.latest_version(db, document.id)
        run = content_service.latest_audit_for_version(db, version.id) if version else None
        if not run:
            continue
        for finding in (
            db.query(AuditFinding).filter(AuditFinding.audit_run_id == run.id).all()
        ):
            key = (finding.title, finding.severity, finding.category)
            recurring[key] = recurring.get(key, 0) + 1
    top_issues = [
        {
            "title": key[0],
            "severity": key[1],
            "category": key[2],
            "category_label": CATEGORY_LABELS.get(key[2], key[2]),
            "occurrences": count,
        }
        for key, count in sorted(recurring.items(), key=lambda item: -item[1])[:5]
    ]
    return {
        "total_audits": total_audits,
        "pending_reviews": sum(
            1 for document in documents if document.status in {"in_review", "changes_requested"}
        ),
        "high_severity_findings": high_open,
        "approved_content": sum(1 for document in documents if document.status == "approved"),
        "compliance_rate_percent": average,
        "recent_activity": [
            {
                "id": event.id,
                "document_id": event.document_id,
                "version_id": event.version_id,
                "user_name": event.user_name,
                "event_type": event.event_type,
                "description": event.description,
                "created_at": event.created_at.isoformat(),
            }
            for event in recent_events
        ],
        "top_recurring_issues": top_issues,
    }
