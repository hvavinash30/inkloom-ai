import difflib
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.security import Actor, ensure_document_access, require_caps
from app.db.session import get_db
from app.models.content import ContentDocument, ContentVersion
from app.models.review import AuditHistoryEvent
from app.schemas.audit import ContentDocumentOut, ContentVersionOut
from app.services import content_service

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


@router.get("/", response_model=List[ContentDocumentOut])
def get_audit_history(
    status: Optional[str] = Query(default=None),
    asset_type: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None, max_length=200),
    campaign_id: Optional[str] = Query(default=None),
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
    if campaign_id:
        query = query.filter(ContentDocument.campaign_id == campaign_id)
    if search:
        query = query.filter(ContentDocument.title.ilike(f"%{search.strip()}%"))
    documents = query.order_by(ContentDocument.updated_at.desc()).all()
    return [
        content_service.serialize_document(
            db, document, include_findings=False, include_current_version=False
        )
        for document in documents
    ]


@router.get("/documents/{document_id}/events")
def get_document_history_events(
    document_id: str,
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    document = _get_document(db, actor, document_id)
    events = (
        db.query(AuditHistoryEvent)
        .filter(AuditHistoryEvent.document_id == document.id)
        .order_by(AuditHistoryEvent.created_at.asc())
        .all()
    )
    return [
        {
            "id": event.id,
            "document_id": event.document_id,
            "version_id": event.version_id,
            "user_name": event.user_name,
            "event_type": event.event_type,
            "description": event.description,
            "metadata": event.event_metadata or {},
            "created_at": event.created_at,
        }
        for event in events
    ]


@router.get("/documents/{document_id}/versions", response_model=List[ContentVersionOut])
def get_document_versions(
    document_id: str,
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    document = _get_document(db, actor, document_id)
    versions = (
        db.query(ContentVersion)
        .filter(ContentVersion.document_id == document.id)
        .order_by(ContentVersion.version_number.asc())
        .all()
    )
    payload = []
    for version in versions:
        item = content_service.serialize_version(version)
        run = content_service.latest_audit_for_version(db, version.id)
        item["audit_summary"] = (
            {
                "id": run.id,
                "overall_score": run.overall_score,
                "risk_level": run.risk_level,
                "total_findings": run.total_findings,
                "resolved_findings": run.resolved_findings,
                "verification_status": run.verification_status,
                "created_at": run.created_at,
            }
            if run
            else None
        )
        payload.append(item)
    return payload


@router.get("/documents/{document_id}/compare")
def compare_versions(
    document_id: str,
    from_version: int = Query(..., ge=1),
    to_version: int = Query(..., ge=1),
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    document = _get_document(db, actor, document_id)
    versions = {
        version.version_number: version
        for version in db.query(ContentVersion)
        .filter(ContentVersion.document_id == document.id)
        .all()
    }
    source = versions.get(from_version)
    target = versions.get(to_version)
    if not source or not target:
        raise HTTPException(status_code=404, detail="One or both versions were not found.")

    def text_for(version: ContentVersion) -> str:
        if version.page_texts:
            return "\n".join(
                f"--- Page {index} ---\n{page}"
                for index, page in enumerate(version.page_texts, start=1)
            )
        if version.transcript_segments:
            return "\n".join(
                f"[{int(segment.get('timestamp_seconds', 0)) // 60:02d}:"
                f"{int(segment.get('timestamp_seconds', 0)) % 60:02d}] {segment.get('text', '')}"
                for segment in version.transcript_segments
            )
        return version.content_text or ""

    source_text = text_for(source)
    target_text = text_for(target)
    diff_lines = list(
        difflib.unified_diff(
            source_text.splitlines(),
            target_text.splitlines(),
            fromfile=f"Version {from_version}",
            tofile=f"Version {to_version}",
            lineterm="",
        )
    )
    added = sum(1 for line in diff_lines if line.startswith("+") and not line.startswith("+++"))
    removed = sum(1 for line in diff_lines if line.startswith("-") and not line.startswith("---"))
    source_run = content_service.latest_audit_for_version(db, source.id)
    target_run = content_service.latest_audit_for_version(db, target.id)
    return {
        "document_id": document.id,
        "from_version": content_service.serialize_version(source),
        "to_version": content_service.serialize_version(target),
        "from_audit": (
            {
                "overall_score": source_run.overall_score,
                "risk_level": source_run.risk_level,
                "total_findings": source_run.total_findings,
            }
            if source_run
            else None
        ),
        "to_audit": (
            {
                "overall_score": target_run.overall_score,
                "risk_level": target_run.risk_level,
                "total_findings": target_run.total_findings,
            }
            if target_run
            else None
        ),
        "changed": source_text != target_text,
        "added_lines": added,
        "removed_lines": removed,
        "diff": diff_lines[:300],
        "diff_truncated": len(diff_lines) > 300,
        "note": (
            "The comparison is a line-based text diff of the stored versions. PDF line order reflects "
            "extracted text, not visual layout."
        ),
    }
