from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import Actor, require_caps
from app.db.session import get_db
from app.models.approved_fact import ApprovedFact
from app.models.brand_rule import BrandRule
from app.schemas.brand_memory import (
    ImpactAnalysisOut,
    MemoryConflictOut,
    RuleSuggestionCreateRequest,
    RuleSuggestionOut,
    SimulateRuleRequest,
)
from app.schemas.brand_rule import BrandRuleOut
from app.services import brand_memory_service

router = APIRouter()


@router.get("/conflicts", response_model=List[MemoryConflictOut])
def list_memory_conflicts(
    actor: Actor = Depends(require_caps("insights.read")),
    db: Session = Depends(get_db),
):
    return brand_memory_service.memory_conflicts(db, actor.workspace_id)


@router.get("/suggestions", response_model=List[RuleSuggestionOut])
def list_rule_suggestions(
    actor: Actor = Depends(require_caps("insights.read")),
    db: Session = Depends(get_db),
):
    return brand_memory_service.rule_suggestions(db, actor.workspace_id)


@router.post("/suggestions/create-rule", response_model=BrandRuleOut, status_code=201)
def create_rule_from_suggestion(
    payload: RuleSuggestionCreateRequest,
    actor: Actor = Depends(require_caps("brand.manage")),
    db: Session = Depends(get_db),
):
    if not payload.proposed_pattern.strip():
        raise HTTPException(status_code=422, detail="Enter the pattern or phrase for the new rule.")
    return brand_memory_service.create_rule_from_suggestion(
        db, actor, payload, actor.workspace_id
    )


@router.get("/facts/{fact_id}/impact", response_model=ImpactAnalysisOut)
def fact_impact(
    fact_id: str,
    actor: Actor = Depends(require_caps("brand.manage")),
    db: Session = Depends(get_db),
):
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
    return brand_memory_service.fact_impact(db, actor.workspace_id, fact)


@router.get("/rules/{rule_id}/impact", response_model=ImpactAnalysisOut)
def rule_impact(
    rule_id: str,
    actor: Actor = Depends(require_caps("brand.manage")),
    db: Session = Depends(get_db),
):
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
    return brand_memory_service.rule_impact(db, actor.workspace_id, rule)


@router.post("/simulate-rule", response_model=ImpactAnalysisOut)
def simulate_rule(
    payload: SimulateRuleRequest,
    actor: Actor = Depends(require_caps("brand.manage")),
    db: Session = Depends(get_db),
):
    if len(payload.proposed_pattern.strip()) < 2:
        raise HTTPException(status_code=422, detail="Enter at least two characters to simulate a rule.")
    return brand_memory_service.simulate_rule(
        db,
        actor.workspace_id,
        payload.proposed_pattern.strip(),
        payload.proposed_severity,
    )
