from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import Actor, ensure_document_access, require_caps
from app.db.session import get_db
from app.models.audit import AuditFinding
from app.models.content import ContentDocument, ContentVersion
from app.models.review import ApprovalDecision, ReviewAssignment, ReviewComment
from app.models.workspace import UserProfile
from app.schemas.audit import ContentDocumentOut
from app.schemas.review import (
    ApprovalDecisionCreate,
    ApprovalDecisionOut,
    ReviewAssignmentCreate,
    ReviewAssignmentOut,
    ReviewCommentCreate,
    ReviewCommentOut,
    SubmitForReviewRequest,
)
from app.services import content_service, review_workflow_service

router = APIRouter()


def _get_document(db: Session, actor: Actor, document_id: str) -> ContentDocument:
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
    return document


@router.get("/queue", response_model=List[ContentDocumentOut])
def get_review_queue(
    actor: Actor = Depends(require_caps("review.queue")),
    db: Session = Depends(get_db),
):
    documents = (
        db.query(ContentDocument)
        .filter(
            ContentDocument.workspace_id == actor.workspace_id,
            ContentDocument.status.in_(["in_review", "changes_requested"]),
        )
        .order_by(ContentDocument.submitted_at.asc(), ContentDocument.updated_at.desc())
        .all()
    )
    return [
        content_service.serialize_document(
            db, document, include_findings=True, include_current_version=False
        )
        for document in documents
    ]


@router.post("/documents/{document_id}/submit", response_model=ContentDocumentOut)
def submit_for_review(
    document_id: str,
    payload: SubmitForReviewRequest,
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    document = _get_document(db, actor, document_id)
    if not actor.can("content.submit.all") and document.created_by != actor.id:
        raise HTTPException(status_code=403, detail="You can only submit your own content for review.")
    if document.approved_version_id and document.status == "approved":
        raise HTTPException(status_code=400, detail="This content is already approved.")
    version = content_service.latest_version(db, document.id)
    if not version:
        raise HTTPException(status_code=400, detail="Add content before submitting for review.")
    run = content_service.latest_audit_for_version(db, version.id)
    if not run:
        raise HTTPException(
            status_code=400,
            detail="Run a compliance check on the current version before submitting for review.",
        )

    document.status = "in_review"
    document.submitted_at = datetime.now(timezone.utc)
    document.submitted_by_name = actor.name
    document.updated_at = datetime.now(timezone.utc)
    content_service.add_history(
        db,
        document,
        user_id=actor.id,
        user_name=actor.name,
        event_type="submitted_for_review",
        description=f"Submitted version {version.version_number} for review: {payload.notes}",
        version_id=version.id,
        metadata={"notes": payload.notes, "version_number": version.version_number},
    )
    db.commit()
    return content_service.serialize_document(
        db, document, include_findings=True, include_current_version=True
    )


@router.get("/documents/{document_id}/assignment", response_model=Optional[ReviewAssignmentOut])
def get_assignment(
    document_id: str,
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    document = _get_document(db, actor, document_id)
    version = content_service.latest_version(db, document.id)
    assignment = review_workflow_service.active_assignment(
        db, document.id, version.id if version else None
    )
    return (
        review_workflow_service.serialize_assignment(assignment) if assignment else None
    )


@router.post(
    "/documents/{document_id}/assignment",
    response_model=ReviewAssignmentOut,
    status_code=201,
)
def assign_reviewer(
    document_id: str,
    payload: ReviewAssignmentCreate,
    actor: Actor = Depends(require_caps("review.queue")),
    db: Session = Depends(get_db),
):
    document = _get_document(db, actor, document_id)
    if document.status not in {"in_review", "changes_requested"}:
        raise HTTPException(
            status_code=409,
            detail="Assign a reviewer after the latest version is submitted for review.",
        )
    version = content_service.latest_version(db, document.id)
    if not version:
        raise HTTPException(status_code=400, detail="This content has no saved version to assign.")

    if payload.assignee_id and payload.assignee_id != actor.id:
        if not actor.can("org.manage"):
            raise HTTPException(
                status_code=403,
                detail="Only organization administrators can assign this review to another person.",
            )
        assignee = (
            db.query(UserProfile)
            .filter(
                UserProfile.id == payload.assignee_id,
                UserProfile.workspace_id == actor.workspace_id,
            )
            .first()
        )
        if not assignee:
            raise HTTPException(status_code=404, detail="Reviewer not found in this workspace.")
        if assignee.role not in {"reviewer", "admin"}:
            raise HTTPException(
                status_code=422,
                detail="Only reviewer or organization administrator accounts can be assigned.",
            )
    else:
        assignee = actor.user

    instructions = (payload.instructions or "").strip() or None
    current = review_workflow_service.active_assignment(db, document.id, version.id)
    if current and current.assignee_id != actor.id and not actor.can("org.manage"):
        raise HTTPException(
            status_code=403,
            detail=(
                f"This review is assigned to {current.assignee_name}. Only an organization "
                "administrator can reassign it."
            ),
        )
    if (
        current
        and current.assignee_id == assignee.id
        and (current.instructions or None) == instructions
    ):
        return review_workflow_service.serialize_assignment(current)

    review_workflow_service.supersede_active_assignments(db, document.id)
    assignment = ReviewAssignment(
        document_id=document.id,
        version_id=version.id,
        assignee_id=assignee.id,
        assignee_name=assignee.full_name,
        assignee_role=assignee.role,
        assigned_by_id=actor.id,
        assigned_by_name=actor.name,
        status="active",
        instructions=instructions,
    )
    db.add(assignment)
    content_service.add_history(
        db,
        document,
        user_id=actor.id,
        user_name=actor.name,
        event_type="reviewer_assigned",
        description=(
            f"Review assigned to {assignee.full_name} for version {version.version_number}."
            + (f" Instructions: {instructions}" if instructions else "")
        ),
        version_id=version.id,
        metadata={
            "assignment_assignee": assignee.full_name,
            "assignment_assignee_role": assignee.role,
            "version_number": version.version_number,
        },
    )
    db.commit()
    db.refresh(assignment)
    return review_workflow_service.serialize_assignment(assignment)


@router.post("/documents/{document_id}/decision", response_model=ApprovalDecisionOut)
def record_decision(
    document_id: str,
    payload: ApprovalDecisionCreate,
    actor: Actor = Depends(require_caps("review.decide")),
    db: Session = Depends(get_db),
):
    document = _get_document(db, actor, document_id)
    version = (
        db.query(ContentVersion)
        .filter(
            ContentVersion.id == payload.version_id,
            ContentVersion.document_id == document.id,
        )
        .first()
    )
    if not version:
        raise HTTPException(status_code=400, detail="That version does not belong to this content item.")
    if payload.decision in {"rejected", "changes_requested"} and (
        not payload.feedback or len(payload.feedback.strip()) < 3
    ):
        raise HTTPException(
            status_code=422,
            detail="Feedback is required when rejecting content or requesting changes.",
        )
    feedback = payload.feedback.strip() if payload.feedback else None
    override_reason = (payload.override_reason or "").strip() or None

    # A repeated submission (double click, retried request) returns the record
    # that already exists instead of writing a second decision and history row.
    existing = (
        db.query(ApprovalDecision)
        .filter(
            ApprovalDecision.document_id == document.id,
            ApprovalDecision.version_id == version.id,
            ApprovalDecision.reviewer_id == actor.id,
            ApprovalDecision.decision == payload.decision,
        )
        .order_by(ApprovalDecision.created_at.desc())
        .first()
    )
    if (
        existing
        and (existing.feedback or "").strip() == (feedback or "")
        and (existing.decision_metadata or {}).get("override_reason") == override_reason
    ):
        return content_service.serialize_decision(db, existing)

    latest = content_service.latest_version(db, document.id)
    if not latest or latest.id != version.id:
        raise HTTPException(
            status_code=409,
            detail=(
                "This decision targets a superseded version. Reload the content and review "
                "the latest version before deciding."
            ),
        )
    if document.status not in {"in_review", "changes_requested"}:
        raise HTTPException(
            status_code=409,
            detail=(
                "This content is not awaiting review. Submit the latest version for review "
                "before recording a decision."
            ),
        )

    assignment = review_workflow_service.active_assignment(db, document.id, version.id)
    decided_outside_assignment = bool(
        assignment and assignment.assignee_id != actor.id
    )
    if decided_outside_assignment and not actor.can("org.manage"):
        raise HTTPException(
            status_code=403,
            detail=(
                f"This review is assigned to {assignment.assignee_name}. Only the assignee "
                "or an organization administrator can record a decision."
            ),
        )

    run = content_service.latest_audit_for_version(db, version.id)
    open_priority = 0
    if run:
        open_priority = (
            db.query(func.count(AuditFinding.id))
            .filter(
                AuditFinding.audit_run_id == run.id,
                AuditFinding.status == "open",
                AuditFinding.severity.in_(["high", "critical"]),
            )
            .scalar()
        ) or 0
    if payload.decision == "approved" and open_priority:
        if not override_reason:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"{open_priority} high or critical finding(s) are still open. Approving "
                    "with unresolved high-risk findings requires a written override reason."
                ),
            )
    if override_reason and len(override_reason) < 10:
        raise HTTPException(
            status_code=422,
            detail="Override reasons must be at least 10 characters so the exception is auditable.",
        )

    metadata = {
        "version_number": version.version_number,
        "is_latest_version": True,
        "superseded": False,
        "score_at_decision": run.overall_score if run else None,
        "findings_at_decision": run.total_findings if run else None,
        "open_priority_findings_at_decision": open_priority,
        "override_reason": override_reason,
        "assignment_id": assignment.id if assignment else None,
        "assignment_assignee": assignment.assignee_name if assignment else None,
        "decided_outside_assignment": decided_outside_assignment,
    }

    if payload.decision == "approved":
        document.status = "approved"
        document.approved_version_id = version.id
    elif payload.decision == "rejected":
        document.status = "rejected"
        if document.approved_version_id == version.id:
            document.approved_version_id = None
    else:
        document.status = "changes_requested"
        if document.approved_version_id == version.id:
            document.approved_version_id = None
    document.submitted_at = document.submitted_at or datetime.now(timezone.utc)

    decision = ApprovalDecision(
        document_id=document.id,
        version_id=version.id,
        reviewer_id=actor.id,
        reviewer_name=actor.name,
        reviewer_role=actor.role,
        decision=payload.decision,
        feedback=feedback,
        decision_metadata=metadata,
    )
    db.add(decision)
    content_service.add_history(
        db,
        document,
        user_id=actor.id,
        user_name=actor.name,
        event_type=f"decision_{payload.decision}",
        description=(
            f"Decision “{payload.decision.replace('_', ' ')}” recorded on version "
            f"{version.version_number}."
            + (
                f" Override reason: {override_reason}"
                if override_reason
                else ""
            )
            + (
                f" Decision recorded outside the assignment to {assignment.assignee_name}."
                if decided_outside_assignment
                else ""
            )
            + (f" Note: {feedback}" if feedback else "")
        ),
        version_id=version.id,
        metadata={**metadata, "decision": payload.decision},
    )
    review_workflow_service.complete_assignment(db, assignment)
    document.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(decision)
    return content_service.serialize_decision(db, decision)


@router.get("/documents/{document_id}/decisions", response_model=List[ApprovalDecisionOut])
def list_decisions(
    document_id: str,
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    document = _get_document(db, actor, document_id)
    decisions = (
        db.query(ApprovalDecision)
        .filter(ApprovalDecision.document_id == document.id)
        .order_by(ApprovalDecision.created_at.desc())
        .all()
    )
    return [content_service.serialize_decision(db, decision) for decision in decisions]


@router.post(
    "/documents/{document_id}/comments", response_model=ReviewCommentOut, status_code=201
)
def add_comment(
    document_id: str,
    payload: ReviewCommentCreate,
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    document = _get_document(db, actor, document_id)
    can_review = actor.can("review.queue")
    if not can_review and document.created_by != actor.id:
        raise HTTPException(status_code=403, detail="You can only comment on your own content.")
    if payload.visibility == "internal" and not can_review:
        raise HTTPException(status_code=403, detail="Internal review notes are limited to reviewers.")

    version = None
    if payload.version_id:
        version = (
            db.query(ContentVersion)
            .filter(
                ContentVersion.id == payload.version_id,
                ContentVersion.document_id == document.id,
            )
            .first()
        )
        if not version:
            raise HTTPException(status_code=400, detail="That version does not belong to this content item.")
    else:
        version = content_service.latest_version(db, document.id)

    comment = ReviewComment(
        document_id=document.id,
        version_id=version.id if version else None,
        user_id=actor.id,
        author_name=actor.name,
        author_role=actor.role,
        visibility="internal" if payload.visibility == "internal" and can_review else "shared",
        comment_text=payload.comment_text.strip(),
    )
    db.add(comment)
    content_service.add_history(
        db,
        document,
        user_id=actor.id,
        user_name=actor.name,
        event_type="comment_added",
        description=(
            "Internal reviewer note added."
            if comment.visibility == "internal"
            else f"Review comment added: “{payload.comment_text.strip()[:80]}”"
        ),
        version_id=version.id if version else None,
        metadata={"visibility": comment.visibility},
    )
    db.commit()
    db.refresh(comment)
    return content_service.serialize_comment(comment)


@router.get("/documents/{document_id}/comments", response_model=List[ReviewCommentOut])
def list_comments(
    document_id: str,
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    document = _get_document(db, actor, document_id)
    query = db.query(ReviewComment).filter(ReviewComment.document_id == document.id)
    if not actor.can("review.queue"):
        query = query.filter(ReviewComment.visibility == "shared")
    comments = query.order_by(ReviewComment.created_at.asc()).all()
    return [content_service.serialize_comment(comment) for comment in comments]
