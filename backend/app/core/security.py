"""Demo identity and server-side permission checks.

Inkloom AI's hackathon build does not ship a production auth provider. The
role switcher is an explicit demo-access mechanism: the frontend sends the
selected demo role and user in headers, and every protected endpoint re-checks
the role server-side. Replacing this module with Supabase Auth (or another
provider) is the documented production boundary.
"""
from dataclasses import dataclass
from typing import Callable, Iterable, Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.workspace import UserProfile, Workspace
from app.core.config import settings
from app.services.workspace_service import serialize_workspace


ROLE_CAPABILITIES = {
    "creator": {
        "content.create",
        "content.read.own",
        "content.edit.own",
        "content.submit.own",
        "findings.review.own",
        "brand.read",
        "campaign.read",
        "campaign.create",
        "assistant.use",
    },
    "reviewer": {
        "content.create",
        "content.read.all",
        "content.edit.all",
        "review.queue",
        "review.decide",
        "review.comment",
        "findings.dismiss",
        "brand.read",
        "campaign.read",
        "campaign.create",
        "campaign.resolve",
        "assistant.use",
    },
    "admin": {
        "content.create",
        "content.read.all",
        "content.edit.all",
        "content.submit.all",
        "review.queue",
        "review.decide",
        "review.comment",
        "findings.dismiss",
        "brand.read",
        "brand.manage",
        "assets.manage",
        "campaign.read",
        "campaign.create",
        "campaign.resolve",
        "campaign.manage",
        "org.manage",
        "research.manage",
        "evaluation.run",
        "insights.read",
        "assistant.use",
    },
}

ROLE_LABELS = {
    "creator": "Creator",
    "reviewer": "Reviewer",
    "admin": "Organization Admin",
}


@dataclass
class Actor:
    user: UserProfile
    role: str
    workspace_id: str

    @property
    def id(self) -> str:
        return self.user.id

    @property
    def name(self) -> str:
        return self.user.full_name

    @property
    def capabilities(self) -> set[str]:
        return ROLE_CAPABILITIES.get(self.role, set())

    def can(self, capability: str) -> bool:
        return capability in self.capabilities

    def can_access_document(self, document) -> bool:
        if self.can("content.read.all"):
            return document.workspace_id == self.workspace_id
        if self.can("content.read.own"):
            return (
                document.workspace_id == self.workspace_id
                and document.created_by == self.user.id
            )
        return False

    def can_edit_document(self, document) -> bool:
        if self.can("content.edit.all"):
            return document.workspace_id == self.workspace_id
        return self.can("content.edit.own") and document.created_by == self.user.id


def _resolve_user(
    db: Session, workspace_id: str, role: str, user_hint: str | None
) -> UserProfile | None:
    query = db.query(UserProfile).filter(
        UserProfile.workspace_id == workspace_id,
        UserProfile.role == role,
    )
    if user_hint:
        hinted = query.filter(
            (UserProfile.id == user_hint)
            | (UserProfile.email == user_hint)
            | (UserProfile.full_name == user_hint)
        ).first()
        if hinted:
            return hinted
    return query.order_by(UserProfile.created_at.asc()).first()


def get_actor(
    x_inkloom_role: str | None = Header(default=None, alias="X-Inkloom-Role"),
    x_inkloom_user: str | None = Header(default=None, alias="X-Inkloom-User"),
    x_inkloom_workspace: str | None = Header(default=None, alias="X-Inkloom-Workspace"),
    db: Session = Depends(get_db),
) -> Actor:
    role = (x_inkloom_role or "creator").lower()
    if role not in ROLE_CAPABILITIES:
        raise HTTPException(status_code=400, detail="Unknown demo role. Use creator, reviewer, or admin.")
    workspace_id = (x_inkloom_workspace or settings.DEFAULT_WORKSPACE_ID).strip()
    if len(workspace_id) > 64:
        raise HTTPException(status_code=400, detail="Malformed workspace identifier.")
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found. Choose a workspace to continue.")
    user = _resolve_user(db, workspace_id, role, x_inkloom_user)
    if not user:
        raise HTTPException(
            status_code=503,
            detail=(
                "Demo identities are not initialized for this workspace. Recreate the workspace "
                "or restart the API so the demo profiles are provisioned."
            ),
        )
    return Actor(user=user, role=role, workspace_id=user.workspace_id)


def require_caps(*capabilities: str) -> Callable:
    def dependency(actor: Actor = Depends(get_actor)) -> Actor:
        missing = [cap for cap in capabilities if not actor.can(cap)]
        if missing:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Your {ROLE_LABELS.get(actor.role, actor.role)} role cannot perform this action. "
                    "Switch roles or ask an organization administrator."
                ),
            )
        return actor

    return dependency


def ensure_document_access(actor: Actor, document) -> None:
    if not actor.can_access_document(document):
        raise HTTPException(status_code=403, detail="You do not have access to this content.")


def ensure_document_edit(actor: Actor, document) -> None:
    if not actor.can_edit_document(document):
        raise HTTPException(status_code=403, detail="Only the content owner can make this change.")


def public_user(user: UserProfile) -> dict:
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "role_label": ROLE_LABELS.get(user.role, user.role),
        "title": getattr(user, "title", None),
        "is_demo": getattr(user, "is_demo", True),
    }


def session_payload(
    actor: Actor,
    users: Iterable[UserProfile],
    workspace: Optional[Workspace] = None,
    workspaces: Optional[list[dict]] = None,
) -> dict:
    workspace_data = serialize_workspace(workspace) if workspace else {
        "id": actor.workspace_id,
        "name": settings.DEFAULT_WORKSPACE_NAME,
        "is_demo": settings.DEMO_MODE,
    }
    workspace_data = {
        **workspace_data,
        "mode_notice": (
            "Demo access: the workspace and role are selected locally and re-checked by the API. "
            "Production deployments must connect an authentication provider and enforce membership "
            "on the server."
        ),
    }
    return {
        "active_user": public_user(actor.user),
        "role": actor.role,
        "capabilities": sorted(actor.capabilities),
        "users": [public_user(u) for u in users],
        "workspace": workspace_data,
        "workspaces": workspaces or [],
        "demo_mode": settings.DEMO_MODE,
    }
