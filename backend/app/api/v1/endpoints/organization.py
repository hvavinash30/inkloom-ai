from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import ROLE_CAPABILITIES, ROLE_LABELS, Actor, require_caps
from app.db.session import get_db
from app.models.approved_fact import ApprovedFact
from app.models.assets import BrandAsset, EvaluationCase, ResearchRecord, UploadedFile
from app.models.audit import AuditFinding, AuditRun
from app.models.brand_rule import BrandRule
from app.models.campaign import Campaign
from app.models.content import ContentDocument
from app.models.review import ApprovalDecision, ReviewComment
from app.models.workspace import UserProfile, Workspace

router = APIRouter()

ROLE_DESCRIPTIONS = {
    "creator": "Creates and checks content, responds to review notes, and submits versions for approval.",
    "reviewer": "Reviews submitted versions, records decisions, dismisses findings with a reason, and resolves campaign conflicts.",
    "admin": "Manages brand rules, approved facts, assets, team access, campaigns, research, and governance reporting.",
}


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)


def _workspace(db: Session, actor: Actor) -> Workspace:
    workspace = db.query(Workspace).filter(Workspace.id == actor.workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return workspace


@router.get("/overview")
def organization_overview(
    actor: Actor = Depends(require_caps("org.manage")),
    db: Session = Depends(get_db),
):
    workspace = _workspace(db, actor)
    members = (
        db.query(UserProfile)
        .filter(UserProfile.workspace_id == actor.workspace_id)
        .all()
    )
    role_counts = {role: 0 for role in ROLE_CAPABILITIES}
    for member in members:
        role_counts[member.role] = role_counts.get(member.role, 0) + 1
    documents = (
        db.query(ContentDocument)
        .filter(ContentDocument.workspace_id == actor.workspace_id)
        .count()
    )
    rules = (
        db.query(BrandRule)
        .filter(BrandRule.workspace_id == actor.workspace_id, BrandRule.status == "active")
        .count()
    )
    facts = (
        db.query(ApprovedFact)
        .filter(
            ApprovedFact.workspace_id == actor.workspace_id,
            ApprovedFact.is_active.is_(True),
            ApprovedFact.status != "expired",
        )
        .count()
    )
    return {
        "workspace": {
            "id": workspace.id,
            "name": workspace.name,
            "slug": workspace.slug,
            "description": workspace.description,
            "is_demo": workspace.is_demo,
            "created_at": workspace.created_at,
        },
        "stats": {
            "members": len(members),
            "creators": role_counts.get("creator", 0),
            "reviewers": role_counts.get("reviewer", 0),
            "admins": role_counts.get("admin", 0),
            "documents": documents,
            "active_rules": rules,
            "active_facts": facts,
            "campaigns": db.query(Campaign)
            .filter(Campaign.workspace_id == actor.workspace_id)
            .count(),
            "brand_assets": db.query(BrandAsset)
            .filter(
                BrandAsset.workspace_id == actor.workspace_id,
                BrandAsset.status == "active",
            )
            .count(),
        },
        "role_matrix": [
            {
                "role": role,
                "label": ROLE_LABELS[role],
                "description": ROLE_DESCRIPTIONS[role],
                "capabilities": sorted(capabilities),
            }
            for role, capabilities in ROLE_CAPABILITIES.items()
        ],
        "demo_notice": (
            "This demo uses a role switcher rather than production authentication. "
            "The API re-checks the selected role on every request, but a real deployment must "
            "replace header-based demo identities with an authentication provider and membership records."
        ),
    }


@router.get("/team")
def list_team(
    actor: Actor = Depends(require_caps("org.manage")),
    db: Session = Depends(get_db),
):
    members = (
        db.query(UserProfile)
        .filter(UserProfile.workspace_id == actor.workspace_id)
        .order_by(UserProfile.role, UserProfile.full_name)
        .all()
    )
    payload = []
    for member in members:
        payload.append(
            {
                "id": member.id,
                "full_name": member.full_name,
                "email": member.email,
                "title": member.title,
                "role": member.role,
                "role_label": ROLE_LABELS.get(member.role, member.role),
                "is_demo": member.is_demo,
                "created_at": member.created_at,
                "stats": {
                    "documents": db.query(ContentDocument)
                    .filter(ContentDocument.created_by == member.id)
                    .count(),
                    "comments": db.query(ReviewComment)
                    .filter(ReviewComment.user_id == member.id)
                    .count(),
                    "decisions": db.query(ApprovalDecision)
                    .filter(ApprovalDecision.reviewer_id == member.id)
                    .count(),
                },
            }
        )
    return {
        "members": payload,
        "role_matrix": [
            {
                "role": role,
                "label": ROLE_LABELS[role],
                "description": ROLE_DESCRIPTIONS[role],
                "capabilities": sorted(capabilities),
            }
            for role, capabilities in ROLE_CAPABILITIES.items()
        ],
        "notice": (
            "Member roles and permissions are stored by the server. This demo does not support "
            "inviting or deactivating users; those actions need a production identity provider."
        ),
    }


@router.patch("/workspace")
def update_workspace(
    payload: WorkspaceUpdate,
    actor: Actor = Depends(require_caps("org.manage")),
    db: Session = Depends(get_db),
):
    workspace = _workspace(db, actor)
    if payload.name is not None:
        workspace.name = payload.name.strip()
    if payload.description is not None:
        workspace.description = payload.description.strip()
    workspace.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(workspace)
    return {
        "id": workspace.id,
        "name": workspace.name,
        "description": workspace.description,
        "is_demo": workspace.is_demo,
        "updated_at": workspace.updated_at,
    }


@router.get("/integrations")
def integration_status(
    actor: Actor = Depends(require_caps("org.manage")),
    db: Session = Depends(get_db),
):
    counts = {
        "documents": db.query(ContentDocument)
        .filter(ContentDocument.workspace_id == actor.workspace_id)
        .count(),
        "audit_runs": db.query(AuditRun)
        .join(ContentDocument, ContentDocument.id == AuditRun.document_id)
        .filter(ContentDocument.workspace_id == actor.workspace_id)
        .count(),
        "findings": db.query(AuditFinding)
        .join(AuditRun, AuditRun.id == AuditFinding.audit_run_id)
        .join(ContentDocument, ContentDocument.id == AuditRun.document_id)
        .filter(ContentDocument.workspace_id == actor.workspace_id)
        .count(),
        "uploads": db.query(UploadedFile)
        .filter(UploadedFile.workspace_id == actor.workspace_id)
        .count(),
        "research_records": db.query(ResearchRecord)
        .filter(ResearchRecord.workspace_id == actor.workspace_id)
        .count(),
        "evaluation_cases": db.query(EvaluationCase)
        .filter(EvaluationCase.workspace_id == actor.workspace_id)
        .count(),
    }
    storage_files = 0
    try:
        storage_files = len(list(Path(settings.UPLOAD_DIR).glob("*")))
    except OSError:
        storage_files = 0
    return {
        "integrations": [
            {
                "key": "llm",
                "name": "AI-assisted analysis",
                "configured": settings.llm_configured,
                "used_for_audits": False,
                "env_vars": ["LLM_PROVIDER", "OPENAI_API_KEY", "GEMINI_API_KEY", "LLM_MODEL"],
                "status": (
                    f"Provider “{settings.LLM_PROVIDER}” is configured, but this build's audit path "
                    "does not call a language model. All findings come from deterministic rules and "
                    "approved facts."
                    if settings.llm_configured
                    else "Not configured. Audits run on deterministic rules and approved facts; no AI "
                    "analysis is simulated."
                ),
            },
            {
                "key": "ocr",
                "name": "OCR for scanned PDFs and images",
                "configured": settings.ocr_configured,
                "used_for_audits": False,
                "env_vars": ["OCR_PROVIDER"],
                "status": (
                    "No OCR service is bundled. Text-based PDFs are extracted; image-only PDFs and "
                    "images are stored but require human review."
                ),
            },
            {
                "key": "transcription",
                "name": "Speech-to-text for video",
                "configured": settings.transcription_configured,
                "used_for_audits": False,
                "env_vars": ["TRANSCRIPTION_PROVIDER", "OPENAI_API_KEY", "FFMPEG_PATH"],
                "status": (
                    "No transcription service is enabled. Videos can be stored and played, but checks "
                    "require a supplied transcript with timestamps."
                ),
            },
            {
                "key": "storage",
                "name": "File storage",
                "configured": True,
                "used_for_audits": True,
                "env_vars": ["UPLOAD_DIR"],
                "status": (
                    f"Local application storage is active at the server-owned upload directory. "
                    f"{storage_files} stored file(s). Use an object store and malware scanning in production."
                ),
            },
            {
                "key": "supabase",
                "name": "Supabase (optional database/storage)",
                "configured": bool(settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY),
                "used_for_audits": False,
                "env_vars": ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
                "status": (
                    "Configured on the server. Credentials are never sent to the browser; this build "
                    "still uses its SQLAlchemy database and local file handling."
                    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY
                    else "Not configured. The application uses its SQLite database and local uploads."
                ),
            },
        ],
        "limits": {
            "max_upload_mb": settings.MAX_UPLOAD_BYTES // (1024 * 1024),
            "max_video_upload_mb": settings.MAX_VIDEO_UPLOAD_BYTES // (1024 * 1024),
            "max_pdf_pages": settings.MAX_PDF_PAGES,
            "allowed_files": "PDF, PNG/JPEG/WebP, MP4/WebM/MOV, TXT/VTT/SRT",
        },
        "counts": counts,
        "security_note": (
            "API keys and service-role credentials stay on the server. The frontend only receives "
            "boolean availability states and public limits."
        ),
    }
