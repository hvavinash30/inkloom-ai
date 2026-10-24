from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import Actor, get_actor
from app.db.session import get_db
from app.services import dashboard_service

router = APIRouter()


@router.get("/")
def get_dashboard(
    actor: Actor = Depends(get_actor),
    db: Session = Depends(get_db),
):
    return dashboard_service.build_dashboard(db, actor)
