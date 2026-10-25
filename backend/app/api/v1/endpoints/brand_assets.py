from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.security import Actor, require_caps
from app.services.workspace_service import workspace_is_demo
from app.db.session import get_db
from app.models.assets import BrandAsset, UploadedFile
from app.schemas.assets import (
    BrandAssetCreate,
    BrandAssetOut,
    BrandAssetUpdate,
    ContrastCheckRequest,
    ContrastCheckResult,
)

router = APIRouter()


def _normalize_hex(value: str) -> str:
    cleaned = value.strip().lstrip("#").upper()
    if len(cleaned) != 6 or any(ch not in "0123456789ABCDEF" for ch in cleaned):
        raise HTTPException(status_code=422, detail="Enter a six-digit hex color, for example #0F172A.")
    return f"#{cleaned}"


def _relative_luminance(hex_color: str) -> float:
    channels = [
        int(hex_color.lstrip("#")[index:index + 2], 16) / 255
        for index in (0, 2, 4)
    ]

    def linear(channel: float) -> float:
        return channel / 12.92 if channel <= 0.03928 else ((channel + 0.055) / 1.055) ** 2.4

    red, green, blue = (linear(channel) for channel in channels)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def _contrast_ratio(foreground: str, background: str) -> float:
    light = max(_relative_luminance(foreground), _relative_luminance(background))
    dark = min(_relative_luminance(foreground), _relative_luminance(background))
    return (light + 0.05) / (dark + 0.05)


@router.get("/", response_model=List[BrandAssetOut])
def list_brand_assets(
    asset_type: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None, max_length=200),
    actor: Actor = Depends(require_caps("brand.read")),
    db: Session = Depends(get_db),
):
    query = db.query(BrandAsset).filter(BrandAsset.workspace_id == actor.workspace_id)
    if not actor.can("assets.manage"):
        query = query.filter(BrandAsset.status == "active")
    if asset_type:
        query = query.filter(BrandAsset.asset_type == asset_type)
    if status:
        query = query.filter(BrandAsset.status == status)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            (BrandAsset.name.ilike(term)) | (BrandAsset.value.ilike(term))
        )
    return query.order_by(BrandAsset.asset_type, BrandAsset.name).all()


@router.post("/", response_model=BrandAssetOut, status_code=201)
def create_brand_asset(
    payload: BrandAssetCreate,
    actor: Actor = Depends(require_caps("assets.manage")),
    db: Session = Depends(get_db),
):
    upload = None
    if payload.upload_id:
        upload = (
            db.query(UploadedFile)
            .filter(
                UploadedFile.id == payload.upload_id,
                UploadedFile.workspace_id == actor.workspace_id,
            )
            .first()
        )
        if not upload:
            raise HTTPException(status_code=404, detail="Uploaded file not found.")
        if payload.asset_type in {"logo", "image", "template"} and upload.kind not in {
            "image",
            "pdf",
        }:
            raise HTTPException(
                status_code=400,
                detail="Logo, image, and template assets require an image or PDF upload.",
            )
    if payload.asset_type in {"color", "typography"} and not (payload.value or "").strip():
        raise HTTPException(
            status_code=422,
            detail="Enter the color value or typography stack for this asset.",
        )
    if payload.asset_type == "logo" and not payload.upload_id:
        raise HTTPException(status_code=422, detail="Upload a logo file before saving a logo asset.")

    asset = BrandAsset(
        workspace_id=actor.workspace_id,
        file_id=upload.id if upload else None,
        name=payload.name.strip(),
        asset_type=payload.asset_type,
        value=payload.value.strip() if payload.value else None,
        notes=payload.notes,
        status="active",
        owner_name=actor.name,
        is_demo=workspace_is_demo(db, actor.workspace_id),
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


@router.patch("/{asset_id}", response_model=BrandAssetOut)
def update_brand_asset(
    asset_id: str,
    payload: BrandAssetUpdate,
    actor: Actor = Depends(require_caps("assets.manage")),
    db: Session = Depends(get_db),
):
    asset = (
        db.query(BrandAsset)
        .filter(
            BrandAsset.id == asset_id,
            BrandAsset.workspace_id == actor.workspace_id,
        )
        .first()
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Brand asset not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if isinstance(value, str):
            value = value.strip()
        setattr(asset, field, value)
    asset.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(asset)
    return asset


@router.delete("/{asset_id}", response_model=BrandAssetOut)
def archive_brand_asset(
    asset_id: str,
    actor: Actor = Depends(require_caps("assets.manage")),
    db: Session = Depends(get_db),
):
    asset = (
        db.query(BrandAsset)
        .filter(
            BrandAsset.id == asset_id,
            BrandAsset.workspace_id == actor.workspace_id,
        )
        .first()
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Brand asset not found.")
    asset.status = "archived"
    asset.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(asset)
    return asset


@router.post("/contrast-check", response_model=ContrastCheckResult)
def contrast_check(
    payload: ContrastCheckRequest,
    actor: Actor = Depends(require_caps("brand.read")),
):
    foreground = _normalize_hex(payload.foreground)
    background = _normalize_hex(payload.background)
    ratio = round(_contrast_ratio(foreground, background), 2)
    required = 4.5 if payload.text_size == "normal" else 3.0
    passes = ratio >= required
    return {
        "foreground": foreground,
        "background": background,
        "ratio": ratio,
        "normal_text_passes": ratio >= 4.5,
        "large_text_passes": ratio >= 3.0,
        "required_ratio": required,
        "passes_selected_requirement": passes,
        "note": (
            f"Calculated WCAG 2.1 contrast ratio. Text at this size requires {required}:1. "
            + ("This pairing passes." if passes else "This pairing fails; darken or lighten a color.")
            + " This checks color contrast only, not overall accessibility."
        ),
    }
