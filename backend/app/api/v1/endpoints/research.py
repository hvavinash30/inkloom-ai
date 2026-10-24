import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import Actor, require_caps
from app.db.session import get_db
from app.models.assets import ResearchRecord
from app.schemas.assets import ResearchRecordCreate, ResearchRecordOut, ResearchRecordUpdate
from app.services import research_service

router = APIRouter()


def _load_sources(raw: Optional[str]) -> list[dict]:
    try:
        return json.loads(raw) if raw else []
    except (TypeError, ValueError):
        return []


def _validate_sources(sources: list[dict]) -> None:
    for source in sources:
        if not isinstance(source, dict):
            raise HTTPException(status_code=422, detail="Each source must be an object with a title and URL.")
        title = str(source.get("title") or "").strip()
        url = str(source.get("url") or "").strip()
        if not title:
            raise HTTPException(status_code=422, detail="Every source needs a title.")
        if url and not url.lower().startswith(("https://", "http://")):
            raise HTTPException(status_code=422, detail="Source URLs must start with http:// or https://.")


@router.get("/")
def list_research(
    section: Optional[str] = None,
    actor: Actor = Depends(require_caps("research.manage")),
    db: Session = Depends(get_db),
):
    query = db.query(ResearchRecord).filter(ResearchRecord.workspace_id == actor.workspace_id)
    if section:
        query = query.filter(ResearchRecord.section == section)
    records = query.order_by(ResearchRecord.section, ResearchRecord.created_at).all()
    return {
        "section_labels": research_service.SECTION_LABELS,
        "records": [research_service.serialize_record(record) for record in records],
        "note": (
            "Demo research records describe standards reviews and planned studies. Planned, in-progress, "
            "and not-conducted work is labeled; no survey or interview results are invented. External "
            "sources are linked exactly as cited and are not independently verified by Inkloom."
        ),
    }


@router.post("/", response_model=ResearchRecordOut, status_code=201)
def create_research_record(
    payload: ResearchRecordCreate,
    actor: Actor = Depends(require_caps("research.manage")),
    db: Session = Depends(get_db),
):
    _validate_sources(payload.sources)
    if payload.status in {"completed", "validated"} and not payload.sources:
        raise HTTPException(
            status_code=422,
            detail=(
                "Completed or validated research must include at least one source. "
                "If the work was not conducted, keep the status as planned or in progress."
            ),
        )
    record = ResearchRecord(
        workspace_id=actor.workspace_id,
        section=payload.section,
        title=payload.title.strip(),
        status=payload.status,
        summary=payload.summary,
        details=json.dumps(payload.details),
        sources=json.dumps(payload.sources),
        owner_name=actor.name,
        is_demo=settings.DEMO_MODE,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return research_service.serialize_record(record)


@router.patch("/{record_id}", response_model=ResearchRecordOut)
def update_research_record(
    record_id: str,
    payload: ResearchRecordUpdate,
    actor: Actor = Depends(require_caps("research.manage")),
    db: Session = Depends(get_db),
):
    record = (
        db.query(ResearchRecord)
        .filter(
            ResearchRecord.id == record_id,
            ResearchRecord.workspace_id == actor.workspace_id,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Research record not found.")
    changes = payload.model_dump(exclude_unset=True)
    if "sources" in changes and changes["sources"] is not None:
        _validate_sources(changes["sources"])
        changes["sources"] = json.dumps(changes["sources"])
    if "details" in changes and changes["details"] is not None:
        changes["details"] = json.dumps(changes["details"])
    for field, value in changes.items():
        if isinstance(value, str) and field in {"title", "summary"}:
            value = value.strip()
        setattr(record, field, value)
    next_status = changes.get("status", record.status)
    if next_status in {"completed", "validated"}:
        sources = _load_sources(record.sources)
        if not sources:
            raise HTTPException(
                status_code=422,
                detail="Add at least one source before marking this research as completed or validated.",
            )
    db.commit()
    db.refresh(record)
    return research_service.serialize_record(record)
