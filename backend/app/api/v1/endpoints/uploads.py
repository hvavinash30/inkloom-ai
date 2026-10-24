from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import Actor, require_caps
from app.db.session import get_db
from app.models.assets import BrandAsset, UploadedFile
from app.services.content_service import serialize_upload
from app.services.ingestion import resolve_upload_path, save_upload

router = APIRouter()


def _get_upload(db: Session, actor: Actor, upload_id: str) -> UploadedFile:
    record = (
        db.query(UploadedFile)
        .filter(
            UploadedFile.id == upload_id,
            UploadedFile.workspace_id == actor.workspace_id,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Upload not found.")
    return record


def _can_read_upload(db: Session, actor: Actor, record: UploadedFile) -> bool:
    if actor.can("content.read.all"):
        return True
    if record.uploaded_by_id == actor.id:
        return True
    if actor.can("brand.read"):
        used_as_brand_asset = (
            db.query(BrandAsset)
            .filter(
                BrandAsset.file_id == record.id,
                BrandAsset.workspace_id == actor.workspace_id,
            )
            .count()
        )
        if used_as_brand_asset:
            return True
    return False


@router.post("/", status_code=201)
def upload_file(
    file: UploadFile = File(...),
    kind: Optional[str] = Form(default=None),
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    record = save_upload(db, actor, file, expected_kind=kind)
    has_viewable = (settings.upload_path / record.stored_name).exists()
    return serialize_upload(record, has_viewable_file=has_viewable)


@router.get("/{upload_id}")
def get_upload(
    upload_id: str,
    actor: Actor = Depends(require_caps("brand.read")),
    db: Session = Depends(get_db),
):
    record = _get_upload(db, actor, upload_id)
    if not _can_read_upload(db, actor, record):
        raise HTTPException(status_code=403, detail="You do not have access to this file.")
    return serialize_upload(record)


@router.get("/{upload_id}/file")
def get_upload_file(
    upload_id: str,
    download: bool = False,
    actor: Actor = Depends(require_caps("brand.read")),
    db: Session = Depends(get_db),
):
    record = _get_upload(db, actor, upload_id)
    if not _can_read_upload(db, actor, record):
        raise HTTPException(status_code=403, detail="You do not have access to this file.")
    path = resolve_upload_path(record)
    safe_name = record.original_name.replace('"', "").replace("\n", " ")
    disposition = "attachment" if download else "inline"
    media_type = record.mime_type or "application/octet-stream"
    return FileResponse(
        path,
        media_type=media_type,
        headers={"Content-Disposition": f'{disposition}; filename="{safe_name}"'},
    )
