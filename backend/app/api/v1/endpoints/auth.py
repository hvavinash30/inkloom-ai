"""Demo sign-in endpoints.

These issue short-lived bearer sessions for the seeded demo accounts. They are
the only unauthenticated data endpoints besides health and the account picker;
every protected route resolves the token server-side.
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    ROLE_LABELS,
    Actor,
    get_actor,
    public_user,
)
from app.db.session import get_db
from app.models.auth import AuthSession
from app.models.workspace import UserProfile, Workspace
from app.services import auth_service
from app.services.workspace_service import serialize_workspace

router = APIRouter()

DemoRole = Literal["creator", "reviewer", "admin"]


class DemoSessionRequest(BaseModel):
    user_id: Optional[str] = Field(default=None, max_length=64)
    workspace_id: Optional[str] = Field(default=None, max_length=64)
    role: Optional[DemoRole] = None

    @model_validator(mode="after")
    def require_selector(self):
        if not self.user_id and not self.role:
            raise ValueError(
                "Choose a demo account with user_id, or provide a role (and optionally a workspace)."
            )
        return self


class DemoSessionResponse(BaseModel):
    token: str
    token_type: str = "bearer"
    expires_at: str
    auth: dict
    user: dict
    workspace: dict


@router.get("/auth/demo/accounts")
def list_demo_accounts(db: Session = Depends(get_db)):
    if not settings.DEMO_MODE:
        raise HTTPException(
            status_code=404,
            detail="Demo sign-in is disabled on this deployment.",
        )
    workspaces = db.query(Workspace).order_by(Workspace.is_demo.desc(), Workspace.name).all()
    accounts = []
    for workspace in workspaces:
        users = (
            db.query(UserProfile)
            .filter(UserProfile.workspace_id == workspace.id, UserProfile.is_demo.is_(True))
            .order_by(UserProfile.role.desc())
            .all()
        )
        if not users:
            continue
        accounts.append(
            {
                "workspace": serialize_workspace(workspace),
                "users": [
                    {
                        **public_user(user),
                        "role_label": ROLE_LABELS.get(user.role, user.role),
                    }
                    for user in users
                ],
            }
        )
    return {
        "demo_mode": True,
        "session_ttl_hours": settings.SESSION_TTL_HOURS,
        "notice": (
            "Demo accounts are fictional. Choose one to receive a server-issued, expiring "
            "session; the server never trusts a role or workspace sent by the browser."
        ),
        "accounts": accounts,
    }


@router.post("/auth/demo/session", response_model=DemoSessionResponse, status_code=201)
def create_demo_session(
    payload: DemoSessionRequest,
    db: Session = Depends(get_db),
):
    if not settings.DEMO_MODE:
        raise HTTPException(
            status_code=403,
            detail=(
                "Demo sign-in is disabled on this deployment. Connect an identity provider to "
                "issue sessions."
            ),
        )
    user: Optional[UserProfile] = None
    if payload.user_id:
        user = (
            db.query(UserProfile)
            .filter(UserProfile.id == payload.user_id, UserProfile.is_demo.is_(True))
            .first()
        )
        if user and payload.workspace_id and user.workspace_id != payload.workspace_id:
            user = None
    else:
        workspace_id = payload.workspace_id or settings.DEFAULT_WORKSPACE_ID
        workspace = (
            db.query(Workspace)
            .filter(Workspace.id == workspace_id)
            .first()
        )
        if not workspace:
            raise HTTPException(status_code=404, detail="Workspace not found.")
        user = (
            db.query(UserProfile)
            .filter(
                UserProfile.workspace_id == workspace.id,
                UserProfile.role == payload.role,
                UserProfile.is_demo.is_(True),
            )
            .order_by(UserProfile.created_at.asc())
            .first()
        )
    if not user:
        raise HTTPException(
            status_code=404,
            detail=(
                "No seeded demo account matches that choice. Refresh the account list and "
                "try again."
            ),
        )

    token, record = auth_service.issue_demo_session(db, user)
    workspace = db.query(Workspace).filter(Workspace.id == record.workspace_id).first()
    return DemoSessionResponse(
        token=token,
        expires_at=record.expires_at.isoformat(),
        auth=auth_service.session_auth_payload(record),
        user={
            **public_user(user),
            "role_label": ROLE_LABELS.get(user.role, user.role),
        },
        workspace=serialize_workspace(workspace),
    )


@router.post("/auth/logout")
def logout(
    actor: Actor = Depends(get_actor),
    db: Session = Depends(get_db),
):
    if isinstance(actor.session, AuthSession):
        auth_service.revoke_session(db, actor.session)
    return {"revoked": True}
