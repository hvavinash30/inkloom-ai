"""Workspace creation, summaries, and demonstration-data labelling.

A workspace owns its own rules, approved facts, assets, campaigns, documents,
and review records. Every query in the API filters on the actor's workspace, so
creating a second workspace never changes the shared Acme Cloud demo records.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.approved_fact import ApprovedFact
from app.models.brand_rule import BrandRule
from app.models.campaign import Campaign
from app.models.content import ContentDocument
from app.models.workspace import UserProfile, Workspace
from app.schemas.workspace import WorkspaceCreate

SETUP_SOURCE = (
    "Provided during workspace setup by {owner}; self-declared, not independently verified."
)


def workspace_is_demo(db: Session, workspace_id: str) -> bool:
    value = (
        db.query(Workspace.is_demo)
        .filter(Workspace.id == workspace_id)
        .scalar()
    )
    return bool(value)


def get_workspace(db: Session, workspace_id: str) -> Optional[Workspace]:
    return db.query(Workspace).filter(Workspace.id == workspace_id).first()


def require_workspace(db: Session, workspace_id: str) -> Workspace:
    workspace = get_workspace(db, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return workspace


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return (slug[:60] or "workspace").strip("-")


def _unique_slug(db: Session, base: str) -> str:
    candidate = base
    suffix = 2
    while db.query(Workspace.id).filter(Workspace.slug == candidate).first():
        candidate = f"{base[:56]}-{suffix}"
        suffix += 1
    return candidate


def _short(value: str, limit: int) -> str:
    text = " ".join(value.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def workspace_counts(db: Session, workspace_id: str) -> dict:
    return {
        "documents": db.query(func.count(ContentDocument.id))
        .filter(ContentDocument.workspace_id == workspace_id)
        .scalar()
        or 0,
        "rules": db.query(func.count(BrandRule.id))
        .filter(
            BrandRule.workspace_id == workspace_id,
            BrandRule.is_active.is_(True),
            BrandRule.status == "active",
        )
        .scalar()
        or 0,
        "facts": db.query(func.count(ApprovedFact.id))
        .filter(
            ApprovedFact.workspace_id == workspace_id,
            ApprovedFact.is_active.is_(True),
            ApprovedFact.status != "expired",
        )
        .scalar()
        or 0,
        "campaigns": db.query(func.count(Campaign.id))
        .filter(Campaign.workspace_id == workspace_id)
        .scalar()
        or 0,
    }


def serialize_workspace(workspace: Workspace, counts: Optional[dict] = None) -> dict:
    return {
        "id": workspace.id,
        "name": workspace.name,
        "slug": workspace.slug,
        "description": workspace.description,
        "is_demo": bool(workspace.is_demo),
        "counts": counts or {},
        "created_at": workspace.created_at,
        "updated_at": workspace.updated_at,
    }


def list_workspaces(db: Session) -> list[dict]:
    workspaces = (
        db.query(Workspace)
        .order_by(Workspace.is_demo.desc(), Workspace.updated_at.desc())
        .all()
    )
    return [serialize_workspace(item, workspace_counts(db, item.id)) for item in workspaces]


def _profile_fact(workspace_id: str, owner: str, category: str, statement: str, value: str) -> ApprovedFact:
    return ApprovedFact(
        workspace_id=workspace_id,
        category=category,
        claim_statement=statement,
        approved_value=value,
        source_reference=SETUP_SOURCE.format(owner=owner),
        is_active=True,
        status="verified",
        owner_name=owner,
        version=1,
        last_reviewed_at=datetime.now(timezone.utc),
        is_demo=False,
    )


def create_workspace(db: Session, actor, payload: WorkspaceCreate) -> dict:
    name = payload.name.strip()
    owner = payload.owner_name.strip()
    slug = _unique_slug(db, _slugify(name))
    workspace = Workspace(
        name=name,
        slug=slug,
        description=(payload.description or "").strip() or None,
        is_demo=False,
    )
    db.add(workspace)
    db.flush()

    profiles = [
        UserProfile(
            workspace_id=workspace.id,
            email=f"admin@{slug}.inkloom.demo",
            full_name=owner,
            title="Workspace owner",
            role="admin",
            is_demo=True,
        ),
        UserProfile(
            workspace_id=workspace.id,
            email=f"reviewer@{slug}.inkloom.demo",
            full_name="Riley Chen",
            title="Brand reviewer",
            role="reviewer",
            is_demo=True,
        ),
        UserProfile(
            workspace_id=workspace.id,
            email=f"creator@{slug}.inkloom.demo",
            full_name="Casey Morgan",
            title="Content creator",
            role="creator",
            is_demo=True,
        ),
    ]
    db.add_all(profiles)

    facts: list[ApprovedFact] = []
    if payload.industry:
        facts.append(
            _profile_fact(workspace.id, owner, "Company profile", "Industry", payload.industry.strip())
        )
    if payload.audience:
        facts.append(
            _profile_fact(
                workspace.id, owner, "Company profile", "Intended audience", payload.audience.strip()
            )
        )
    if payload.voice:
        facts.append(
            _profile_fact(
                workspace.id, owner, "Brand voice", "Preferred voice and tone", payload.voice.strip()
            )
        )
    if payload.guidelines:
        facts.append(
            _profile_fact(
                workspace.id,
                owner,
                "Brand guidelines",
                "Additional brand guidelines",
                payload.guidelines.strip(),
            )
        )
    for claim in payload.approved_claims:
        facts.append(
            ApprovedFact(
                workspace_id=workspace.id,
                category=claim.category.strip(),
                claim_statement=claim.claim.strip(),
                approved_value=claim.value.strip(),
                source_reference=SETUP_SOURCE.format(owner=owner),
                is_active=True,
                status="verified",
                owner_name=owner,
                version=1,
                last_reviewed_at=datetime.now(timezone.utc),
                is_demo=False,
            )
        )
    db.add_all(facts)

    now = datetime.now(timezone.utc)
    seen_claims: set[str] = set()
    rules: list[BrandRule] = []
    for raw in payload.restricted_claims:
        phrase = raw.strip()
        key = phrase.lower()
        if not phrase or key in seen_claims:
            continue
        seen_claims.add(key)
        rules.append(
            BrandRule(
                workspace_id=workspace.id,
                name=f"Restricted claim — {_short(phrase, 200)}",
                rule_type="prohibited_phrase",
                description=(
                    "Do not publish this claim unless an approved fact and supporting source are "
                    "added to the brand library."
                ),
                pattern_or_phrase=phrase,
                replacement_or_guidance=(
                    "Remove the claim or replace it with wording backed by an approved fact."
                ),
                severity="high",
                is_active=True,
                status="active",
                owner_name=owner,
                version=1,
                last_reviewed_at=now,
                is_demo=False,
            )
        )

    seen_terms: set[str] = set()
    for pair in payload.terminology:
        preferred = pair.preferred.strip()
        avoid = pair.avoid.strip()
        key = avoid.lower()
        if not preferred or not avoid or preferred.lower() == key or key in seen_terms:
            continue
        seen_terms.add(key)
        rules.append(
            BrandRule(
                workspace_id=workspace.id,
                name=f"Preferred terminology — {_short(preferred, 200)}",
                rule_type="product_naming",
                description=f"Use “{preferred}” instead of “{avoid}”.",
                pattern_or_phrase=avoid,
                replacement_or_guidance=preferred,
                severity="medium",
                is_active=True,
                status="active",
                owner_name=owner,
                version=1,
                last_reviewed_at=now,
                is_demo=False,
            )
        )
    db.add_all(rules)

    workspace.updated_at = now
    db.commit()
    db.refresh(workspace)
    return serialize_workspace(workspace, workspace_counts(db, workspace.id))
