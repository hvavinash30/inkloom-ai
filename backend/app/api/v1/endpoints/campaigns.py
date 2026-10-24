import re
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import Actor, ensure_document_access, require_caps
from app.db.session import get_db
from app.models.campaign import Campaign, CampaignConflict
from app.models.content import ContentDocument
from app.schemas.campaign import (
    AttachAssetRequest,
    CampaignConflictOut,
    CampaignCreate,
    CampaignGraphDataOut,
    CampaignOut,
    CampaignReadinessOut,
    CampaignUpdate,
    ConflictResolveRequest,
)
from app.services import campaign_service, content_service

router = APIRouter()


def _get_campaign(db: Session, actor: Actor, campaign_id: str) -> Campaign:
    campaign = (
        db.query(Campaign)
        .filter(
            Campaign.id == campaign_id,
            Campaign.workspace_id == actor.workspace_id,
        )
        .first()
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    return campaign


def _unique_slug(db: Session, workspace_id: str, name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "campaign"
    base = base[:80]
    slug = base
    counter = 2
    while (
        db.query(Campaign)
        .filter(Campaign.workspace_id == workspace_id, Campaign.slug == slug)
        .count()
    ):
        slug = f"{base}-{counter}"
        counter += 1
    return slug


@router.get("/", response_model=List[CampaignOut])
def list_campaigns(
    status: Optional[str] = Query(default=None),
    actor: Actor = Depends(require_caps("campaign.read")),
    db: Session = Depends(get_db),
):
    query = db.query(Campaign).filter(Campaign.workspace_id == actor.workspace_id)
    if status:
        query = query.filter(Campaign.status == status)
    campaigns = query.order_by(Campaign.created_at.desc()).all()
    return [campaign_service.serialize_campaign(db, campaign) for campaign in campaigns]


@router.post("/", response_model=CampaignOut, status_code=201)
def create_campaign(
    payload: CampaignCreate,
    actor: Actor = Depends(require_caps("campaign.create")),
    db: Session = Depends(get_db),
):
    campaign = Campaign(
        workspace_id=actor.workspace_id,
        name=payload.name.strip(),
        slug=_unique_slug(db, actor.workspace_id, payload.name),
        description=payload.description,
        status=payload.status,
        target_audience=payload.target_audience,
        launch_target=payload.launch_target,
        created_by_name=actor.name,
        is_demo=settings.DEMO_MODE,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign_service.serialize_campaign(db, campaign)


@router.get("/{campaign_id}", response_model=CampaignOut)
def get_campaign(
    campaign_id: str,
    actor: Actor = Depends(require_caps("campaign.read")),
    db: Session = Depends(get_db),
):
    campaign = _get_campaign(db, actor, campaign_id)
    return campaign_service.serialize_campaign(db, campaign)


@router.patch("/{campaign_id}", response_model=CampaignOut)
def update_campaign(
    campaign_id: str,
    payload: CampaignUpdate,
    actor: Actor = Depends(require_caps("campaign.manage")),
    db: Session = Depends(get_db),
):
    campaign = _get_campaign(db, actor, campaign_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "name" and value:
            value = value.strip()
            campaign.slug = _unique_slug(db, actor.workspace_id, value)
        setattr(campaign, field, value)
    campaign.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(campaign)
    return campaign_service.serialize_campaign(db, campaign)


@router.post("/{campaign_id}/assets", response_model=CampaignOut)
def attach_asset(
    campaign_id: str,
    payload: AttachAssetRequest,
    actor: Actor = Depends(require_caps("campaign.create")),
    db: Session = Depends(get_db),
):
    campaign = _get_campaign(db, actor, campaign_id)
    document = (
        db.query(ContentDocument)
        .filter(
            ContentDocument.id == payload.document_id,
            ContentDocument.workspace_id == actor.workspace_id,
        )
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Content item not found.")
    ensure_document_access(actor, document)
    document.campaign_id = campaign.id
    content_service.add_history(
        db,
        document,
        user_id=actor.id,
        user_name=actor.name,
        event_type="campaign_attached",
        description=f"Attached to campaign “{campaign.name}”.",
        version_id=(
            content_service.latest_version(db, document.id).id
            if content_service.latest_version(db, document.id)
            else None
        ),
    )
    db.commit()
    return campaign_service.serialize_campaign(db, campaign)


@router.post("/{campaign_id}/detect", response_model=CampaignOut)
def detect_conflicts(
    campaign_id: str,
    actor: Actor = Depends(require_caps("campaign.resolve")),
    db: Session = Depends(get_db),
):
    campaign = _get_campaign(db, actor, campaign_id)
    campaign_service.detect_campaign_conflicts(db, campaign)
    return campaign_service.serialize_campaign(db, campaign)


@router.get("/{campaign_id}/readiness", response_model=CampaignReadinessOut)
def readiness(
    campaign_id: str,
    actor: Actor = Depends(require_caps("campaign.read")),
    db: Session = Depends(get_db),
):
    campaign = _get_campaign(db, actor, campaign_id)
    conflicts = (
        db.query(CampaignConflict).filter(CampaignConflict.campaign_id == campaign.id).all()
    )
    return campaign_service.build_readiness(db, campaign, conflicts)


@router.get("/{campaign_id}/graph", response_model=CampaignGraphDataOut)
def campaign_graph(
    campaign_id: str,
    actor: Actor = Depends(require_caps("campaign.read")),
    db: Session = Depends(get_db),
):
    campaign = _get_campaign(db, actor, campaign_id)
    return campaign_service.build_graph(db, campaign)


@router.post("/conflicts/{conflict_id}/resolve", response_model=CampaignConflictOut)
def resolve_conflict(
    conflict_id: str,
    payload: ConflictResolveRequest,
    actor: Actor = Depends(require_caps("campaign.resolve")),
    db: Session = Depends(get_db),
):
    conflict = (
        db.query(CampaignConflict)
        .join(Campaign, Campaign.id == CampaignConflict.campaign_id)
        .filter(
            CampaignConflict.id == conflict_id,
            Campaign.workspace_id == actor.workspace_id,
        )
        .first()
    )
    if not conflict:
        raise HTTPException(status_code=404, detail="Campaign conflict not found.")
    if conflict.status == "resolved":
        raise HTTPException(status_code=400, detail="This conflict is already resolved.")
    conflict.status = "resolved"
    conflict.resolution_notes = (
        f"Resolved value: {payload.resolved_value}. Notes: {payload.resolution_notes.strip()}"
    )
    conflict.resolved_by = actor.name
    conflict.resolved_at = datetime.now(timezone.utc)
    conflict.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(conflict)
    return conflict
