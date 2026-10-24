from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Optional, Sequence

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import Actor
from app.models.approved_fact import ApprovedFact
from app.models.assets import UploadedFile
from app.models.audit import AuditFinding, AuditRun
from app.models.brand_rule import BrandRule
from app.models.content import ContentDocument, ContentVersion
from app.models.review import ApprovalDecision, AuditHistoryEvent, ReviewComment
from app.services.audit_engine import (
    AuditResult,
    parse_timestamped_transcript,
    processing_issue_result,
    run_page_audit,
    run_text_audit,
    run_transcript_audit,
    split_transcript_text,
)


def content_hash(text: str, page_texts: Optional[list[str]] = None) -> str:
    payload = text
    if page_texts:
        payload = "\n\f\n".join(page_texts)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def latest_version(db: Session, document_id: str) -> Optional[ContentVersion]:
    return (
        db.query(ContentVersion)
        .filter(ContentVersion.document_id == document_id)
        .order_by(ContentVersion.version_number.desc())
        .first()
    )


def latest_audit_for_version(db: Session, version_id: str) -> Optional[AuditRun]:
    return (
        db.query(AuditRun)
        .filter(AuditRun.version_id == version_id)
        .order_by(AuditRun.created_at.desc())
        .first()
    )


def attach_audit_findings(db: Session, run: AuditRun, *, include_findings: bool) -> dict:
    payload = {
        "id": run.id,
        "document_id": run.document_id,
        "version_id": run.version_id,
        "overall_score": run.overall_score,
        "risk_level": run.risk_level,
        "verification_status": run.verification_status,
        "total_findings": run.total_findings,
        "resolved_findings": run.resolved_findings,
        "model_used": run.model_used,
        "execution_time_ms": run.execution_time_ms,
        "risk_factors": run.risk_factors or [],
        "score_method": run.score_method,
        "extraction_notes": run.extraction_notes,
        "created_at": run.created_at,
        "findings": [],
    }
    if include_findings:
        findings = (
            db.query(AuditFinding)
            .filter(AuditFinding.audit_run_id == run.id)
            .order_by(AuditFinding.page_number, AuditFinding.timestamp_seconds, AuditFinding.created_at)
            .all()
        )
        payload["findings"] = [
            {
                "id": f.id,
                "audit_run_id": f.audit_run_id,
                "version_id": f.version_id,
                "rule_id": f.rule_id,
                "fact_id": f.fact_id,
                "title": f.title,
                "category": f.category,
                "severity": f.severity,
                "affected_text": f.affected_text,
                "start_index": f.start_index,
                "end_index": f.end_index,
                "explanation": f.explanation,
                "supporting_evidence": f.supporting_evidence,
                "source_reference": f.source_reference,
                "source_url": f.source_url,
                "suggested_correction": f.suggested_correction,
                "confidence_score": f.confidence_score,
                "page_number": f.page_number,
                "timestamp_seconds": f.timestamp_seconds,
                "location_label": f.location_label,
                "frame_url": f.frame_url,
                "evidence_status": f.evidence_status,
                "status": f.status,
                "dismissal_reason": f.dismissal_reason,
                "reviewed_by": f.reviewed_by,
                "reviewed_at": f.reviewed_at,
                "created_at": f.created_at,
                "updated_at": f.updated_at,
            }
            for f in findings
        ]
    return payload


def serialize_document(
    db: Session,
    document: ContentDocument,
    *,
    include_findings: bool = False,
    include_current_version: bool = True,
) -> dict:
    version = latest_version(db, document.id)
    run = latest_audit_for_version(db, version.id) if version else None
    decision = (
        db.query(ApprovalDecision)
        .filter(ApprovalDecision.document_id == document.id)
        .order_by(ApprovalDecision.created_at.desc())
        .first()
    )
    latest_decision = None
    if decision:
        decision_version = (
            db.query(ContentVersion)
            .filter(ContentVersion.id == decision.version_id)
            .first()
        )
        latest_decision = {
            "decision": decision.decision,
            "reviewer_name": decision.reviewer_name,
            "version_id": decision.version_id,
            "version_number": decision_version.version_number if decision_version else 0,
            "created_at": decision.created_at,
            "feedback": decision.feedback,
        }

    versions_count = (
        db.query(ContentVersion).filter(ContentVersion.document_id == document.id).count()
    )
    comments_count = (
        db.query(ReviewComment).filter(ReviewComment.document_id == document.id).count()
    )
    payload = {
        "id": document.id,
        "workspace_id": document.workspace_id,
        "campaign_id": document.campaign_id,
        "file_id": document.file_id,
        "title": document.title,
        "content_type": document.content_type,
        "asset_type": document.asset_type,
        "source_url": document.source_url,
        "file_hash": document.file_hash,
        "status": document.status,
        "current_version_number": document.current_version_number,
        "approved_version_id": document.approved_version_id,
        "submitted_at": document.submitted_at,
        "submitted_by_name": document.submitted_by_name,
        "created_by": document.created_by,
        "created_by_name": document.created_by_name,
        "is_demo": document.is_demo,
        "created_at": document.created_at,
        "updated_at": document.updated_at,
        "versions_count": versions_count,
        "comments_count": comments_count,
        "current_version": None,
        "latest_audit": attach_audit_findings(db, run, include_findings=include_findings) if run else None,
        "approval_stale": bool(
            document.approved_version_id
            and version
            and document.approved_version_id != version.id
        ),
        "latest_decision": latest_decision,
    }
    if include_current_version and version:
        payload["current_version"] = serialize_version(version)
    return payload


def serialize_version(version: ContentVersion) -> dict:
    return {
        "id": version.id,
        "document_id": version.document_id,
        "version_number": version.version_number,
        "content_text": version.content_text,
        "change_summary": version.change_summary,
        "page_texts": version.page_texts or [],
        "transcript_segments": version.transcript_segments or [],
        "asset_metadata": version.asset_metadata or {},
        "content_hash": version.content_hash,
        "created_by_name": version.created_by_name,
        "created_at": version.created_at,
    }


def serialize_comment(comment: ReviewComment) -> dict:
    return {
        "id": comment.id,
        "document_id": comment.document_id,
        "version_id": comment.version_id,
        "author_name": comment.author_name,
        "author_role": comment.author_role,
        "visibility": comment.visibility,
        "comment_text": comment.comment_text,
        "created_at": comment.created_at,
    }


def serialize_decision(db: Session, decision: ApprovalDecision) -> dict:
    version = (
        db.query(ContentVersion).filter(ContentVersion.id == decision.version_id).first()
    )
    return {
        "id": decision.id,
        "document_id": decision.document_id,
        "version_id": decision.version_id,
        "version_number": version.version_number if version else None,
        "reviewer_name": decision.reviewer_name,
        "reviewer_role": decision.reviewer_role,
        "decision": decision.decision,
        "feedback": decision.feedback,
        "decision_metadata": decision.decision_metadata or {},
        "created_at": decision.created_at,
    }


def add_history(
    db: Session,
    document: ContentDocument,
    *,
    user_name: str,
    event_type: str,
    description: str,
    version_id: Optional[str] = None,
    user_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> AuditHistoryEvent:
    event = AuditHistoryEvent(
        document_id=document.id,
        version_id=version_id,
        user_id=user_id,
        user_name=user_name,
        event_type=event_type,
        description=description,
        event_metadata=metadata or {},
    )
    db.add(event)
    return event


def _resolve_audit_payload(
    db: Session,
    document: ContentDocument,
    version: ContentVersion,
    upload: Optional[UploadedFile],
) -> tuple[AuditResult, str]:
    rules = (
        db.query(BrandRule)
        .filter(BrandRule.workspace_id == document.workspace_id, BrandRule.is_active.is_(True))
        .all()
    )
    facts = (
        db.query(ApprovedFact)
        .filter(ApprovedFact.workspace_id == document.workspace_id, ApprovedFact.is_active.is_(True))
        .all()
    )

    if document.asset_type == "pdf":
        pages = version.page_texts or []
        if pages and any(p.strip() for p in pages):
            notes = upload.extraction_message if upload else "Page text supplied with this version."
            return run_page_audit(pages, rules, facts, extraction_notes=notes), notes
        message = (
            upload.extraction_message
            if upload and upload.extraction_status in {"needs_ocr", "error", "no_text"}
            else "No extractable PDF page text is stored for this version."
        )
        return processing_issue_result(
            message
            + " Page-linked findings require extracted text or an OCR service.",
            severity="medium",
        ), message

    if document.asset_type == "image":
        message = (
            upload.extraction_message
            if upload
            else "No visual analysis service is configured for this image."
        )
        return processing_issue_result(
            message
            + " Contrast, logo usage, and text-in-image checks are marked as manual review tasks; "
            "they were not performed automatically.",
            severity="medium",
        ), message

    if document.asset_type == "video":
        segments = version.transcript_segments or []
        if not segments:
            segments = parse_timestamped_transcript(version.content_text)
        if segments:
            source_upload = upload or document.file
            has_video_file = bool(source_upload and source_upload.kind == "video")
            if has_video_file:
                notes = (
                    "Checks used the supplied transcript. Timestamped findings link to the "
                    "stored video player."
                )
            else:
                notes = (
                    "Checks used the supplied timestamped transcript. No video file is stored, "
                    "so playback and timestamp seeking are unavailable."
                )
            parsed_cues, untimestamped_text = split_transcript_text(version.content_text)
            if parsed_cues and untimestamped_text:
                notes += " Untimestamped transcript text was checked without timestamps."
            return run_transcript_audit(
                segments,
                version.content_text,
                rules,
                facts,
                extraction_notes=notes,
            ), notes
        if version.content_text.strip() and version.content_text.strip() != "No transcript supplied.":
            notes = (
                "Checks used the supplied transcript without timestamps. Timestamp seeking is "
                "unavailable until a timestamped transcript is added."
            )
            return run_transcript_audit(
                [], version.content_text, rules, facts, extraction_notes=notes
            ), notes
        message = (
            upload.extraction_message
            if upload and upload.extraction_status == "needs_transcription"
            else "No transcript was supplied for this video."
        )
        return processing_issue_result(
            message
            + " Automatic speech recognition and frame OCR are not configured, so no spoken "
            "or visual findings can be produced for this upload.",
            severity="medium",
        ), message

    if document.asset_type == "audio":
        message = "Audio analysis is not configured in this deployment."
        return processing_issue_result(message, severity="medium"), message

    notes = ""
    result = run_text_audit(version.content_text, rules, facts, extraction_notes=notes)
    return result, notes


def run_and_store_audit(
    db: Session,
    document: ContentDocument,
    version: ContentVersion,
    actor: Actor,
    *,
    upload: Optional[UploadedFile] = None,
) -> AuditRun:
    result, notes = _resolve_audit_payload(db, document, version, upload)

    run = AuditRun(
        document_id=document.id,
        version_id=version.id,
        overall_score=result.score,
        risk_level=result.risk_level,
        verification_status=result.verification_status,
        total_findings=len(result.findings),
        resolved_findings=0,
        model_used=result.model_used,
        execution_time_ms=result.execution_time_ms,
        risk_factors=result.risk_factors,
        score_method=result.score_method,
        extraction_notes=notes or result.extraction_notes,
    )
    db.add(run)
    db.flush()

    for item in result.findings:
        db.add(
            AuditFinding(
                audit_run_id=run.id,
                version_id=version.id,
                rule_id=item.get("rule_id"),
                fact_id=item.get("fact_id"),
                title=item["title"],
                category=item["category"],
                severity=item["severity"],
                affected_text=item["affected_text"],
                start_index=item.get("start_index", 0),
                end_index=item.get("end_index", 0),
                explanation=item["explanation"],
                supporting_evidence=item.get("supporting_evidence"),
                source_reference=item.get("source_reference"),
                source_url=item.get("source_url"),
                suggested_correction=item.get("suggested_correction"),
                confidence_score=item.get("confidence_score", 1.0),
                page_number=item.get("page_number"),
                timestamp_seconds=item.get("timestamp_seconds"),
                location_label=item.get("location_label"),
                evidence_status=item.get("evidence_status", "potential_violation"),
                status="open",
            )
        )

    document.status = "audited"
    document.updated_at = datetime.now(timezone.utc)
    add_history(
        db,
        document,
        user_id=actor.id,
        user_name=actor.name,
        event_type="audit_executed",
        description=(
            f"Audit completed for version {version.version_number}: "
            f"{len(result.findings)} finding(s), readiness score {result.score}/100."
        ),
        version_id=version.id,
        metadata={
            "score": result.score,
            "risk_level": result.risk_level,
            "verification_status": result.verification_status,
            "model_used": result.model_used,
        },
    )
    db.commit()
    db.refresh(run)
    return run


def create_document(
    db: Session,
    actor: Actor,
    *,
    title: str,
    content_type: str,
    content_text: str,
    asset_type: str,
    campaign_id: Optional[str],
    source_url: Optional[str],
    upload: Optional[UploadedFile],
    page_texts: Optional[list[str]] = None,
    transcript_segments: Optional[list[dict]] = None,
    save_as_draft: bool = False,
) -> tuple[ContentDocument, ContentVersion]:
    effective_asset_type = asset_type
    if upload:
        if upload.kind == "pdf":
            effective_asset_type = "pdf"
        elif upload.kind == "image":
            effective_asset_type = "image"
        elif upload.kind == "video":
            effective_asset_type = "video"
        elif upload.kind == "transcript":
            effective_asset_type = "video" if asset_type == "video" else "text"

    pages = page_texts or []
    if not pages and upload and upload.kind == "pdf":
        pages = list(upload.page_texts or [])
    segments = transcript_segments or []
    if not segments and upload and upload.kind == "transcript":
        segments = parse_timestamped_transcript(upload.extracted_text or "")
    if not content_text and upload:
        content_text = upload.extracted_text or ""
    if not content_text and pages:
        content_text = "\n\f\n".join(pages)
    if not content_text and segments:
        content_text = "\n".join(
            f"[{int(s['timestamp_seconds']) // 60:02d}:{int(s['timestamp_seconds']) % 60:02d}] {s['text']}"
            for s in segments
        )
    if effective_asset_type == "text" and len(content_text.strip()) < 5:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Enter at least a few words of content to check.")

    doc = ContentDocument(
        workspace_id=actor.workspace_id,
        campaign_id=campaign_id,
        file_id=upload.id if upload else None,
        title=title.strip(),
        content_type=content_type,
        asset_type=effective_asset_type,
        source_url=source_url,
        file_hash=content_hash(content_text, pages) if content_text else upload.sha256 if upload else None,
        provenance_metadata={
            "engine": "deterministic-rules-v2",
            "demo": settings.DEMO_MODE,
            "upload_name": upload.original_name if upload else None,
            "extraction_status": upload.extraction_status if upload else None,
        },
        status="draft" if save_as_draft else "audited",
        current_version_number=1,
        created_by=actor.id,
        created_by_name=actor.name,
        is_demo=settings.DEMO_MODE,
    )
    if upload and not upload.uploaded_by_name:
        upload.uploaded_by_name = actor.name
    db.add(doc)
    db.flush()

    version = ContentVersion(
        document_id=doc.id,
        version_number=1,
        content_text=content_text,
        change_summary="Initial submission",
        page_texts=pages,
        transcript_segments=segments,
        asset_metadata={
            "upload_name": upload.original_name if upload else None,
            "extraction_status": upload.extraction_status if upload else "text",
            "page_count": upload.page_count if upload else len(pages) or None,
        },
        content_hash=content_hash(content_text, pages) if content_text else upload.sha256 if upload else None,
        created_by=actor.id,
        created_by_name=actor.name,
    )
    db.add(version)
    db.flush()

    add_history(
        db,
        doc,
        user_id=actor.id,
        user_name=actor.name,
        event_type="content_created",
        description=(
            f"Created “{doc.title}” as a {effective_asset_type} draft."
            if save_as_draft
            else f"Created and checked “{doc.title}” ({effective_asset_type})."
        ),
        version_id=version.id,
        metadata={"asset_type": effective_asset_type, "campaign_id": campaign_id},
    )
    db.commit()
    db.refresh(doc)
    db.refresh(version)
    return doc, version


def create_new_version(
    db: Session,
    document: ContentDocument,
    actor: Actor,
    *,
    content_text: str,
    change_summary: Optional[str],
    page_texts: Optional[list[str]] = None,
    transcript_segments: Optional[list[dict]] = None,
) -> tuple[ContentVersion, AuditRun]:
    previous = latest_version(db, document.id)
    version_number = document.current_version_number + 1
    pages = page_texts
    if pages is None and previous:
        pages = list(previous.page_texts or [])
    segments = transcript_segments
    if segments is None and previous:
        segments = list(previous.transcript_segments or [])
    if document.asset_type == "video" and not segments:
        segments = parse_timestamped_transcript(content_text)
    if not content_text and pages:
        content_text = "\n\f\n".join(pages)
    if not content_text.strip():
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Enter the revised content before saving a new version.")

    version = ContentVersion(
        document_id=document.id,
        version_number=version_number,
        content_text=content_text,
        change_summary=change_summary or f"Version {version_number}",
        page_texts=pages or [],
        transcript_segments=segments or [],
        asset_metadata=previous.asset_metadata if previous else {},
        content_hash=content_hash(content_text, pages),
        created_by=actor.id,
        created_by_name=actor.name,
    )
    db.add(version)
    document.current_version_number = version_number
    document.status = "audited"
    document.submitted_at = None
    document.submitted_by_name = None
    db.flush()

    add_history(
        db,
        document,
        user_id=actor.id,
        user_name=actor.name,
        event_type="version_created",
        description=f"Created version {version_number}: {change_summary or 'Revised content'}.",
        version_id=version.id,
        metadata={"version_number": version_number},
    )
    db.commit()
    db.refresh(version)

    run = run_and_store_audit(db, document, version, actor, upload=document.file)
    return version, run


def serialize_upload(record: UploadedFile, *, has_viewable_file: bool = True) -> dict:
    return {
        "id": record.id,
        "original_name": record.original_name,
        "mime_type": record.mime_type,
        "size_bytes": record.size_bytes,
        "kind": record.kind,
        "extraction_status": record.extraction_status,
        "extraction_message": record.extraction_message,
        "page_count": record.page_count,
        "has_viewable_file": has_viewable_file,
        "page_texts": record.page_texts or [],
        "created_at": record.created_at,
    }


def rules_and_facts(db: Session, workspace_id: str) -> tuple[Sequence[BrandRule], Sequence[ApprovedFact]]:
    rules = (
        db.query(BrandRule)
        .filter(BrandRule.workspace_id == workspace_id, BrandRule.is_active.is_(True))
        .all()
    )
    facts = (
        db.query(ApprovedFact)
        .filter(ApprovedFact.workspace_id == workspace_id, ApprovedFact.is_active.is_(True))
        .all()
    )
    return rules, facts
