from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.security import Actor, require_caps
from app.db.session import get_db
from app.schemas.insights import InsightsOut
from app.services import insights_service

router = APIRouter()


@router.get("/", response_model=InsightsOut)
def get_governance_insights(
    content_type: Optional[str] = Query(default=None),
    asset_type: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    date_from: Optional[datetime] = Query(default=None),
    date_to: Optional[datetime] = Query(default=None),
    actor: Actor = Depends(require_caps("insights.read")),
    db: Session = Depends(get_db),
):
    return insights_service.build_insights(
        db,
        actor.workspace_id,
        content_type=content_type,
        asset_type=asset_type,
        status=status,
        date_from=date_from,
        date_to=date_to,
    )
