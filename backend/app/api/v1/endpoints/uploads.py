"""Upload endpoints: ingestion, video job control, and authenticated file access."""
import re
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import Actor, require_caps
from app.db.session import get_db
from app.models.assets import BrandAsset, OcrLine, UploadedFile
from app.services import video_service
from app.services.content_service import serialize_upload
from app.services.ingestion import resolve_upload_path, save_upload

router = APIRouter()


def _serialize(db: Session, record: UploadedFile) -> dict:
    ocr_lines = (
        db.query(OcrLine)
        .filter(OcrLine.upload_id == record.id, OcrLine.workspace_id == record.workspace_id)
        .order_by(OcrLine.page_number, OcrLine.line_index)
        .all()
    )
    has_viewable = (settings.upload_path / record.stored_name).exists()
    return serialize_upload(
        record,
        has_viewable_file=has_viewable,
        ocr_lines=ocr_lines,
        video=video_service.serialize_state(db, record),
    )


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
    video_service.start_processing(db, record)
    return _serialize(db, record)


@router.get("/{upload_id}")
def get_upload(
    upload_id: str,
    actor: Actor = Depends(require_caps("brand.read")),
    db: Session = Depends(get_db),
):
    record = _get_upload(db, actor, upload_id)
    if not _can_read_upload(db, actor, record):
        raise HTTPException(status_code=403, detail="You do not have access to this file.")
    return _serialize(db, record)


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


def _get_owned_video(db: Session, actor: Actor, upload_id: str) -> UploadedFile:
    record = _get_upload(db, actor, upload_id)
    if not _can_read_upload(db, actor, record):
        raise HTTPException(status_code=403, detail="You do not have access to this file.")
    if record.kind != "video":
        raise HTTPException(status_code=400, detail="This upload is not a video.")
    return record


@router.post("/{upload_id}/video/retry")
def retry_video_processing(
    upload_id: str,
    rerun_speech: bool = False,
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    record = _get_owned_video(db, actor, upload_id)
    video_service.retry_processing(db, record, rerun_speech=rerun_speech)
    db.refresh(record)
    return _serialize(db, record)


@router.post("/{upload_id}/video/cancel")
def cancel_video_processing(
    upload_id: str,
    actor: Actor = Depends(require_caps("content.create")),
    db: Session = Depends(get_db),
):
    record = _get_owned_video(db, actor, upload_id)
    video_service.request_cancel(db, record)
    db.refresh(record)
    return _serialize(db, record)


@router.get("/{upload_id}/frames/{file_name}")
def get_video_frame(
    upload_id: str,
    file_name: str,
    actor: Actor = Depends(require_caps("brand.read")),
    db: Session = Depends(get_db),
):
    record = _get_upload(db, actor, upload_id)
    if not _can_read_upload(db, actor, record):
        raise HTTPException(status_code=403, detail="You do not have access to this file.")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,119}", file_name) or ".." in file_name:
        raise HTTPException(status_code=400, detail="Invalid frame name.")
    frame_dir = (settings.upload_path / "frames" / record.id).resolve()
    path = (frame_dir / file_name).resolve()
    if frame_dir not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="This frame is not available on the server.")
    return FileResponse(path, media_type="image/jpeg")
