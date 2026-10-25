from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import Actor, get_actor, session_payload
from app.db.session import get_db
from app.models.workspace import UserProfile, Workspace
from app.services.workspace_service import list_workspaces, workspace_counts

router = APIRouter()


@router.get("/session")
def get_session(actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    users = (
        db.query(UserProfile)
        .filter(UserProfile.workspace_id == actor.workspace_id)
        .order_by(UserProfile.created_at)
        .all()
    )
    workspace = db.query(Workspace).filter(Workspace.id == actor.workspace_id).first()
    payload = session_payload(actor, users, workspace=workspace, workspaces=list_workspaces(db))
    if workspace:
        payload["workspace"]["counts"] = workspace_counts(db, workspace.id)
    return payload
