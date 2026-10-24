from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db

router = APIRouter()


@router.get("/health", tags=["System"])
def health_check(db: Session = Depends(get_db)):
    database = "connected"
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        database = "unavailable"

    return {
        "status": "online" if database == "connected" else "degraded",
        "service": "Inkloom AI Brand Governance Engine",
        "version": "2.0.0",
        "database": database,
        "demo_mode": settings.DEMO_MODE,
        "integrations": {
            "audit_engine": "deterministic-rules-v2",
            "llm_configured": settings.llm_configured,
            "llm_provider": settings.LLM_PROVIDER,
            "ocr_configured": settings.ocr_configured,
            "transcription_configured": settings.transcription_configured,
        },
        "limits": {
            "max_upload_mb": settings.MAX_UPLOAD_BYTES // (1024 * 1024),
            "max_video_upload_mb": settings.MAX_VIDEO_UPLOAD_BYTES // (1024 * 1024),
            "max_pdf_pages": settings.MAX_PDF_PAGES,
        },
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
