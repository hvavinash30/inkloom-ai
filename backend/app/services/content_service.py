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
from app.services import review_workflow_service, video_service
from app.services.audit_engine import (
    AuditResult,
    parse_timestamped_transcript,
    processing_issue_result,
    run_page_audit,
    run_text_audit,
    run_video_audit,
    split_transcript_text,
)
from app.services.workspace_service import workspace_is_demo


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


def approval_is_stale(document, version) -> bool:
    """True when a recorded approval applies to a version older than the latest one."""
    return bool(
        document.approved_version_id
        and version
        and document.approved_version_id != version.id
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
                "source_type": f.source_type,
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

    assignment = review_workflow_service.active_assignment(
        db, document.id, version.id if version else None
    )
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
        "approval_stale": approval_is_stale(document, version),
        "latest_decision": latest_decision,
        "assignment": (
            review_workflow_service.serialize_assignment(assignment) if assignment else None
        ),
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
        text = (version.content_text or "").strip()
        if not text and upload and (upload.extracted_text or "").strip():
            text = upload.extracted_text.strip()

        if text:
            notes = (
                "Checks ran on text extracted from the image with OCR. "
                "Contrast, logo usage, and other visual qualities were not judged automatically."
            )
            if upload and upload.extraction_message:
                notes = upload.extraction_message
                if "human reviewer" not in notes:
                    notes = f"{notes} Visual qualities still require a human reviewer."
            result = run_page_audit(
                [text],
                rules,
                facts,
                extraction_notes=notes,
                model_label="image-ocr-v1",
                location_label="Image text",
            )
            return result, notes

        message = (
            upload.extraction_message
            if upload
            else "No text was extracted from this image."
        )
        return processing_issue_result(
            message
            + " Automated text checks could not run. Contrast, logo usage, and other visual "
            "qualities also require a human reviewer.",
            severity="medium",
        ), message

    if document.asset_type == "video":
        source_upload = upload or document.file
        extraction = None
        if source_upload is not None and getattr(source_upload, "kind", None) == "video":
            extraction = source_upload.video_extraction
        metadata = version.asset_metadata or {}
        manual_segments = list(version.transcript_segments or [])
        manual_text = (version.content_text or "").strip()
        transcript_source = str(metadata.get("transcript_source") or "")
        if transcript_source not in {"automatic", "manual", "none"}:
            transcript_source = "manual" if (manual_segments or manual_text) else "none"
        if (
            transcript_source == "none"
            and extraction is not None
            and extraction.transcript_status == "completed"
        ):
            transcript_source = "automatic"

        if (
            extraction is not None
            and extraction.status in {"queued", "processing"}
            and transcript_source != "manual"
        ):
            message = (
                "Automatic video analysis is still running. Wait for speech and on-screen "
                "text processing to finish, then run the audit again. No partial audit was stored."
            )
            return processing_issue_result(message, severity="medium"), message

        if transcript_source == "automatic" and extraction is not None:
            spoken_segments = list(extraction.transcript_segments or manual_segments)
            spoken_text = (extraction.transcript_text or "").strip() or manual_text
            provider_label = " ".join(
                part for part in [extraction.transcription_provider, extraction.transcription_model] if part
            )
            speech_analyzed = extraction.transcript_status in {"completed", "no_speech", "no_audio"}
            speech_message = extraction.transcript_message or (
                "Automatic transcription did not produce spoken text."
            )
            if extraction.transcript_status == "completed":
                speech_message = (
                    f"Spoken checks used the automatic transcript"
                    f"{f' from {provider_label}' if provider_label else ''}. "
                    "Timestamps are the provider's own segment times."
                )
        elif transcript_source == "manual":
            spoken_segments = manual_segments or parse_timestamped_transcript(manual_text)
            spoken_text = manual_text
            speech_analyzed = bool(spoken_segments or spoken_text)
            speech_message = "Spoken checks used the manual transcript supplied with this version."
        else:
            spoken_segments, spoken_text = [], ""
            speech_analyzed = False
            speech_message = (
                (extraction.transcript_message if extraction else None)
                or "No transcript is stored for this video and speech-to-text did not produce one."
            )

        visual_stage = ((extraction.stages or {}).get("visual") if extraction else None) or {}
        visual_analyzed = visual_stage.get("status") == "completed"
        visual_message = (
            visual_stage.get("message")
            or (extraction.message if extraction else None)
            or "No automatic frame analysis is stored for this video."
        )
        frames = (
            video_service.frames_for_audit(db, source_upload)
            if visual_analyzed and source_upload is not None
            else []
        )

        if not speech_analyzed and not visual_analyzed:
            message = (
                "No spoken or on-screen text could be analyzed for this video. "
                f"{speech_message} {visual_message}"
            ).strip()
            return processing_issue_result(message, severity="medium"), message

        notes_parts: list[str] = []
        if transcript_source == "automatic":
            notes_parts.append(speech_message)
        elif transcript_source == "manual":
            notes_parts.append(
                "Spoken checks used the manual transcript supplied with this version."
            )
            parsed_cues, untimestamped_text = split_transcript_text(manual_text)
            if parsed_cues and untimestamped_text:
                notes_parts.append("Untimestamped transcript text was checked without timestamps.")
        else:
            notes_parts.append(f"Spoken content was not analyzed. {speech_message}")
        has_video_file = bool(source_upload and source_upload.kind == "video")
        if not has_video_file:
            notes_parts.append(
                "No video file is stored, so playback and timestamp seeking are unavailable."
            )
        if visual_analyzed:
            notes_parts.append(
                f"On-screen checks used local OCR on {len(frames)} sampled frame(s) with visible text; "
                "frame time references come from the sampling step."
            )
        else:
            notes_parts.append(f"On-screen text was not analyzed. {visual_message}")
        notes_parts.append(
            "Logo, colour, layout, and other visual qualities are not judged automatically."
        )
        notes = " ".join(part for part in notes_parts if part).strip()
        result = run_video_audit(
            spoken_segments=spoken_segments,
            spoken_text=spoken_text,
            frames=frames,
            rules=rules,
            facts=facts,
            transcript_source=transcript_source,
            speech_analyzed=speech_analyzed,
            speech_message=speech_message,
            visual_analyzed=visual_analyzed,
            visual_message=visual_message,
            extraction_notes=notes,
        )
        return result, notes

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
                frame_url=item.get("frame_url"),
                source_type=item.get("source_type"),
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
    if not pages and upload and upload.kind == "image" and (upload.extracted_text or "").strip():
        pages = [upload.extracted_text]
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
    transcript_source: Optional[str] = None
    extraction = None
    if effective_asset_type == "video":
        if content_text.strip() or segments:
            transcript_source = "manual"
        else:
            extraction = (
                upload.video_extraction if upload and upload.kind == "video" else None
            )
            if extraction is not None and extraction.transcript_status == "completed":
                transcript_source = "automatic"
                segments = list(extraction.transcript_segments or [])
                content_text = (extraction.transcript_text or "").strip()
                if not content_text and segments:
                    content_text = "\n".join(
                        f"[{int(s['timestamp_seconds']) // 60:02d}:{int(s['timestamp_seconds']) % 60:02d}] {s['text']}"
                        for s in segments
                    )
            else:
                transcript_source = "none"
    if effective_asset_type == "text" and len(content_text.strip()) < 5:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Enter at least a few words of content to check.")

    is_demo = workspace_is_demo(db, actor.workspace_id)
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
            "demo": is_demo,
            "upload_name": upload.original_name if upload else None,
            "extraction_status": upload.extraction_status if upload else None,
        },
        status="draft" if save_as_draft else "audited",
        current_version_number=1,
        created_by=actor.id,
        created_by_name=actor.name,
        is_demo=is_demo,
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
            **({"transcript_source": transcript_source} if effective_asset_type == "video" else {}),
            **(
                {
                    "transcript_provider": extraction.transcription_provider,
                    "transcript_model": extraction.transcription_model,
                    "transcript_language": extraction.language,
                }
                if effective_asset_type == "video" and transcript_source == "automatic"
                else {}
            ),
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

    metadata = dict(previous.asset_metadata or {}) if previous else {}
    if document.asset_type == "video":
        extraction = document.file.video_extraction if document.file else None
        automatic_text = (extraction.transcript_text or "").strip() if extraction else ""
        metadata["transcript_source"] = (
            "automatic" if automatic_text and content_text.strip() == automatic_text else "manual"
        )
        if metadata["transcript_source"] == "automatic" and extraction is not None:
            metadata["transcript_provider"] = extraction.transcription_provider
            metadata["transcript_model"] = extraction.transcription_model
            metadata["transcript_language"] = extraction.language
        else:
            for key in ("transcript_provider", "transcript_model", "transcript_language"):
                metadata.pop(key, None)

    version = ContentVersion(
        document_id=document.id,
        version_number=version_number,
        content_text=content_text,
        change_summary=change_summary or f"Version {version_number}",
        page_texts=pages or [],
        transcript_segments=segments or [],
        asset_metadata=metadata,
        content_hash=content_hash(content_text, pages),
        created_by=actor.id,
        created_by_name=actor.name,
    )
    db.add(version)
    document.current_version_number = version_number
    document.status = "audited"
    document.submitted_at = None
    document.submitted_by_name = None
    review_workflow_service.supersede_active_assignments(db, document.id)
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


def serialize_upload(
    record: UploadedFile,
    *,
    has_viewable_file: bool = True,
    ocr_lines: Optional[list] = None,
    video: Optional[dict] = None,
) -> dict:
    lines = ocr_lines or []
    ocr = None
    if record.kind in {"image", "pdf"}:
        by_page: dict[int, list] = {}
        for line in lines:
            by_page.setdefault(line.page_number, []).append(line)
        confidences = [line.confidence for line in lines]
        ocr = {
            "available": settings.ocr_configured,
            "line_count": len(lines),
            "mean_confidence": round(sum(confidences) / len(confidences), 3) if confidences else None,
            "pages": [
                {
                    "page_number": page_number,
                    "line_count": len(page_lines),
                    "mean_confidence": round(
                        sum(line.confidence for line in page_lines) / len(page_lines), 3
                    ),
                }
                for page_number, page_lines in sorted(by_page.items())
            ],
            "empty_pages": [
                index
                for index, text in enumerate(record.page_texts or [], start=1)
                if not (text or "").strip()
            ],
            "lines": [
                {
                    "page_number": line.page_number,
                    "text": line.text,
                    "confidence": line.confidence,
                    "bbox": line.bbox or [],
                }
                for line in lines[:200]
            ],
        }
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
        "ocr": ocr,
        "video": video,
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
