"""Server-issued identity and permission checks.

Protected endpoints never trust a client-declared role or workspace. A demo
account signs in through the auth endpoints; the response carries an opaque
bearer token, and every request resolves that token to a stored session and a
database user. Role and workspace come from those records. Replacing the demo
sign-in with Supabase Auth (or another provider) is the production boundary.
"""
from dataclasses import dataclass
from typing import Callable, Iterable, Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.auth import AuthSession
from app.models.workspace import UserProfile, Workspace
from app.core.config import settings
from app.services import auth_service
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
    session: Optional[AuthSession] = None

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


def _bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=401,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_actor(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> Actor:
    token = _bearer_token(authorization)
    if not token:
        raise _unauthorized(
            "Sign in as a demo account to continue. Protected endpoints do not accept a "
            "client-declared role or workspace."
        )
    resolved = auth_service.resolve_token(db, token)
    if not resolved:
        raise _unauthorized("Your session is invalid, expired, or revoked. Sign in again.")
    record, user = resolved
    role = (user.role or "").lower()
    if role not in ROLE_CAPABILITIES:
        raise _unauthorized("This account has no valid workspace role. Ask an administrator.")
    workspace = db.query(Workspace).filter(Workspace.id == record.workspace_id).first()
    if not workspace:
        raise _unauthorized("The workspace for this session no longer exists.")
    return Actor(
        user=user,
        role=role,
        workspace_id=record.workspace_id,
        session=record,
    )


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
            "Demo access: signed in as a seeded demo account. The server resolves your role "
            "and workspace from the database on every request and rejects client-declared "
            "roles. Production deployments must connect an authentication provider."
        ),
    }
    payload = {
        "active_user": public_user(actor.user),
        "role": actor.role,
        "capabilities": sorted(actor.capabilities),
        "users": [public_user(u) for u in users],
        "workspace": workspace_data,
        "workspaces": workspaces or [],
        "demo_mode": settings.DEMO_MODE,
    }
    if actor.session is not None:
        payload["auth"] = auth_service.session_auth_payload(actor.session)
    return payload
