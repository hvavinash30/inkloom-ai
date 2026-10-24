from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import Actor, get_actor, session_payload
from app.db.session import get_db
from app.models.workspace import UserProfile, Workspace

router = APIRouter()


@router.get("/session")
def get_session(actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    users = (
        db.query(UserProfile)
        .filter(UserProfile.workspace_id == actor.workspace_id)
        .order_by(UserProfile.created_at)
        .all()
    )
    payload = session_payload(actor, users)
    workspace = db.query(Workspace).filter(Workspace.id == actor.workspace_id).first()
    if workspace:
        payload["workspace"]["name"] = workspace.name
        payload["workspace"]["slug"] = workspace.slug
        payload["workspace"]["description"] = workspace.description
        payload["workspace"]["is_demo"] = workspace.is_demo
    return payload
