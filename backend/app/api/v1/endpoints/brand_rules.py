from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import Actor, require_caps
from app.db.session import get_db
from app.models.brand_rule import BrandRule
from app.schemas.brand_rule import BrandRuleCreate, BrandRuleOut, BrandRuleUpdate
from app.services import brand_memory_service

router = APIRouter()


def _get_rule(db: Session, actor: Actor, rule_id: str) -> BrandRule:
    rule = (
        db.query(BrandRule)
        .filter(
            BrandRule.id == rule_id,
            BrandRule.workspace_id == actor.workspace_id,
        )
        .first()
    )
    if not rule:
        raise HTTPException(status_code=404, detail="Brand rule not found.")
    return rule


@router.get("/", response_model=List[BrandRuleOut])
def list_brand_rules(
    rule_type: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None, max_length=200),
    include_archived: bool = Query(default=False),
    actor: Actor = Depends(require_caps("brand.read")),
    db: Session = Depends(get_db),
):
    query = db.query(BrandRule).filter(BrandRule.workspace_id == actor.workspace_id)
    if not actor.can("brand.manage"):
        query = query.filter(BrandRule.is_active.is_(True), BrandRule.status == "active")
    elif not include_archived:
        query = query.filter(BrandRule.status != "archived")
    if rule_type:
        query = query.filter(BrandRule.rule_type == rule_type)
    if status:
        query = query.filter(BrandRule.status == status)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            (BrandRule.name.ilike(term))
            | (BrandRule.pattern_or_phrase.ilike(term))
            | (BrandRule.description.ilike(term))
        )
    return query.order_by(BrandRule.updated_at.desc()).all()


@router.post("/", response_model=BrandRuleOut, status_code=201)
def create_brand_rule(
    payload: BrandRuleCreate,
    actor: Actor = Depends(require_caps("brand.manage")),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    is_active = payload.is_active and payload.status == "active"
    rule = BrandRule(
        workspace_id=actor.workspace_id,
        name=payload.name.strip(),
        rule_type=payload.rule_type,
        description=payload.description,
        pattern_or_phrase=payload.pattern_or_phrase.strip(),
        trigger_phrase=payload.trigger_phrase,
        replacement_or_guidance=payload.replacement_or_guidance,
        severity=payload.severity,
        is_active=is_active,
        status=payload.status,
        owner_name=payload.owner_name or actor.name,
        effective_date=payload.effective_date,
        last_reviewed_at=now,
        version=1,
        is_demo=settings.DEMO_MODE,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.patch("/{rule_id}", response_model=BrandRuleOut)
def update_brand_rule(
    rule_id: str,
    payload: BrandRuleUpdate,
    actor: Actor = Depends(require_caps("brand.manage")),
    db: Session = Depends(get_db),
):
    rule = _get_rule(db, actor, rule_id)
    changes = payload.model_dump(exclude_unset=True)
    if "status" in changes:
        if changes["status"] == "archived":
            changes["is_active"] = False
        elif changes.get("is_active") is None:
            changes["is_active"] = changes["status"] == "active"
    for field, value in changes.items():
        if field in {"name", "pattern_or_phrase"} and isinstance(value, str):
            value = value.strip()
        setattr(rule, field, value)
    rule.version = (rule.version or 1) + 1
    rule.last_reviewed_at = datetime.now(timezone.utc)
    if not rule.owner_name:
        rule.owner_name = actor.name
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{rule_id}", response_model=BrandRuleOut)
def archive_brand_rule(
    rule_id: str,
    actor: Actor = Depends(require_caps("brand.manage")),
    db: Session = Depends(get_db),
):
    rule = _get_rule(db, actor, rule_id)
    rule.status = "archived"
    rule.is_active = False
    rule.version = (rule.version or 1) + 1
    rule.last_reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(rule)
    return rule


@router.get("/{rule_id}/impact")
def brand_rule_impact(
    rule_id: str,
    actor: Actor = Depends(require_caps("brand.manage")),
    db: Session = Depends(get_db),
):
    rule = _get_rule(db, actor, rule_id)
    return brand_memory_service.rule_impact(db, actor.workspace_id, rule)
