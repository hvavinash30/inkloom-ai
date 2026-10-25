from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import Actor, get_actor, require_caps
from app.db.session import get_db
from app.schemas.workspace import WorkspaceCreate, WorkspaceOut, WorkspaceUpdate
from app.services.workspace_service import (
    create_workspace,
    list_workspaces,
    require_workspace,
    serialize_workspace,
    workspace_counts,
)

router = APIRouter()


@router.get("/", response_model=list[WorkspaceOut])
def get_workspaces(actor: Actor = Depends(get_actor), db: Session = Depends(get_db)):
    return list_workspaces(db)


@router.post("/", response_model=WorkspaceOut, status_code=201)
def post_workspace(
    payload: WorkspaceCreate,
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    return create_workspace(db, actor, payload)


@router.get("/{workspace_id}", response_model=WorkspaceOut)
def get_workspace_by_id(
    workspace_id: str,
    actor: Actor = Depends(get_actor),
    db: Session = Depends(get_db),
):
    workspace = require_workspace(db, workspace_id)
    return serialize_workspace(workspace, workspace_counts(db, workspace.id))


@router.patch("/{workspace_id}", response_model=WorkspaceOut)
def edit_workspace(
    workspace_id: str,
    payload: WorkspaceUpdate,
    actor: Actor = Depends(require_caps("org.manage")),
    db: Session = Depends(get_db),
):
    workspace = require_workspace(db, workspace_id)
    if workspace.id != actor.workspace_id:
        raise HTTPException(
            status_code=403,
            detail="Switch to this workspace before editing its profile.",
        )
    if payload.name is not None:
        workspace.name = payload.name.strip()
    if payload.description is not None:
        workspace.description = payload.description.strip() or None
    workspace.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(workspace)
    return serialize_workspace(workspace, workspace_counts(db, workspace.id))
