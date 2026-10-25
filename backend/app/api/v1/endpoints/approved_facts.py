from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.security import Actor, require_caps
from app.services.workspace_service import workspace_is_demo
from app.db.session import get_db
from app.models.approved_fact import ApprovedFact
from app.schemas.approved_fact import (
    ApprovedFactCreate,
    ApprovedFactOut,
    ApprovedFactUpdate,
)
from app.services import brand_memory_service

router = APIRouter()


def _get_fact(db: Session, actor: Actor, fact_id: str) -> ApprovedFact:
    fact = (
        db.query(ApprovedFact)
        .filter(
            ApprovedFact.id == fact_id,
            ApprovedFact.workspace_id == actor.workspace_id,
        )
        .first()
    )
    if not fact:
        raise HTTPException(status_code=404, detail="Approved fact not found.")
    return fact


@router.get("/", response_model=List[ApprovedFactOut])
def list_approved_facts(
    category: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None, max_length=200),
    include_inactive: bool = Query(default=False),
    actor: Actor = Depends(require_caps("brand.read")),
    db: Session = Depends(get_db),
):
    query = db.query(ApprovedFact).filter(ApprovedFact.workspace_id == actor.workspace_id)
    if not actor.can("brand.manage"):
        query = query.filter(
            ApprovedFact.is_active.is_(True),
            ApprovedFact.status == "verified",
        )
    elif not include_inactive:
        query = query.filter(ApprovedFact.is_active.is_(True))
    if category:
        query = query.filter(ApprovedFact.category == category)
    if status:
        query = query.filter(ApprovedFact.status == status)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            (ApprovedFact.claim_statement.ilike(term))
            | (ApprovedFact.approved_value.ilike(term))
            | (ApprovedFact.category.ilike(term))
        )
    return query.order_by(ApprovedFact.category, ApprovedFact.updated_at.desc()).all()


@router.post("/", response_model=ApprovedFactOut, status_code=201)
def create_approved_fact(
    payload: ApprovedFactCreate,
    actor: Actor = Depends(require_caps("brand.manage")),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    fact = ApprovedFact(
        workspace_id=actor.workspace_id,
        category=payload.category.strip(),
        claim_statement=payload.claim_statement.strip(),
        approved_value=payload.approved_value.strip(),
        source_reference=payload.source_reference.strip(),
        source_url=payload.source_url,
        product=payload.product,
        is_active=payload.is_active,
        status=payload.status,
        owner_name=payload.owner_name or actor.name,
        next_review_at=payload.next_review_at,
        last_reviewed_at=now,
        version=1,
        is_demo=workspace_is_demo(db, actor.workspace_id),
    )
    db.add(fact)
    db.commit()
    db.refresh(fact)
    return fact


@router.patch("/{fact_id}", response_model=ApprovedFactOut)
def update_approved_fact(
    fact_id: str,
    payload: ApprovedFactUpdate,
    actor: Actor = Depends(require_caps("brand.manage")),
    db: Session = Depends(get_db),
):
    fact = _get_fact(db, actor, fact_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("status") == "expired":
        changes["is_active"] = False
    for field, value in changes.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(fact, field, value)
    fact.version = (fact.version or 1) + 1
    fact.last_reviewed_at = datetime.now(timezone.utc)
    if not fact.owner_name:
        fact.owner_name = actor.name
    db.commit()
    db.refresh(fact)
    return fact


@router.delete("/{fact_id}", response_model=ApprovedFactOut)
def retire_approved_fact(
    fact_id: str,
    actor: Actor = Depends(require_caps("brand.manage")),
    db: Session = Depends(get_db),
):
    fact = _get_fact(db, actor, fact_id)
    fact.status = "expired"
    fact.is_active = False
    fact.version = (fact.version or 1) + 1
    fact.last_reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(fact)
    return fact


@router.get("/{fact_id}/impact")
def approved_fact_impact(
    fact_id: str,
    actor: Actor = Depends(require_caps("brand.manage")),
    db: Session = Depends(get_db),
):
    fact = _get_fact(db, actor, fact_id)
    return brand_memory_service.fact_impact(db, actor.workspace_id, fact)
