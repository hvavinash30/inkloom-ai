"""Server-issued demo sessions.

The client never asserts a role or workspace on protected requests. It signs in
as a seeded demo account (judge access), and the server returns an opaque bearer
token whose hash is stored. Every request resolves the token to a database user
and takes the role and workspace from that record.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.auth import AuthSession
from app.models.workspace import UserProfile, Workspace


TOKEN_PREFIX = "ink_"
_MAX_SESSIONS_PER_USER = 10


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def issue_demo_session(db: Session, user: UserProfile) -> tuple[str, AuthSession]:
    if not settings.DEMO_MODE:
        raise HTTPException(
            status_code=403,
            detail=(
                "Demo sign-in is disabled on this deployment. Connect an identity provider to "
                "issue sessions."
            ),
        )
    if not user.is_demo:
        raise HTTPException(
            status_code=403,
            detail="This account is not a demo identity. Use the configured identity provider.",
        )
    workspace = db.query(Workspace).filter(Workspace.id == user.workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="The account's workspace no longer exists.")

    now = _now()
    token = TOKEN_PREFIX + secrets.token_urlsafe(32)
    record = AuthSession(
        token_hash=_hash_token(token),
        user_id=user.id,
        workspace_id=user.workspace_id,
        is_demo=True,
        created_at=now,
        expires_at=now + timedelta(hours=max(1, settings.SESSION_TTL_HOURS)),
    )
    db.add(record)
    db.flush()

    stale = (
        db.query(AuthSession)
        .filter(
            AuthSession.user_id == user.id,
            AuthSession.id != record.id,
        )
        .order_by(AuthSession.created_at.desc())
        .offset(_MAX_SESSIONS_PER_USER - 1)
        .all()
    )
    for session in stale:
        db.delete(session)
    db.commit()
    db.refresh(record)
    return token, record


def resolve_token(db: Session, token: str) -> Optional[tuple[AuthSession, UserProfile]]:
    if not token or len(token) > 200:
        return None
    record = (
        db.query(AuthSession)
        .filter(AuthSession.token_hash == _hash_token(token))
        .first()
    )
    if not record or record.revoked_at is not None:
        return None
    if _as_aware(record.expires_at) <= _now():
        return None
    user = db.query(UserProfile).filter(UserProfile.id == record.user_id).first()
    if not user or user.workspace_id != record.workspace_id:
        return None
    return record, user


def revoke_session(db: Session, record: AuthSession) -> None:
    if record.revoked_at is None:
        record.revoked_at = _now()
        db.commit()


def session_auth_payload(record: AuthSession) -> dict:
    return {
        "mode": "demo",
        "session_id": record.id,
        "issued_at": record.created_at,
        "expires_at": record.expires_at,
        "is_demo": bool(record.is_demo),
    }
