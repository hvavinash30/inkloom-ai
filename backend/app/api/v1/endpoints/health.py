from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import driver_available, get_db

router = APIRouter()


@router.get("/health", tags=["System"])
def health_check(db: Session = Depends(get_db)):
    database = "connected"
    database_error = None
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 - reported by type only, never a DSN
        database = "unavailable"
        database_error = type(exc).__name__

    driver_ok, driver_label = driver_available()

    return {
        "status": "online" if database == "connected" else "degraded",
        "service": "Inkloom AI Brand Governance Engine",
        "version": "2.0.0",
        "database": database,
        "database_error": database_error,
        "demo_mode": settings.DEMO_MODE,
        "integrations": {
            "audit_engine": "deterministic-rules-v2",
            "llm_configured": settings.llm_configured,
            "llm_provider": settings.LLM_PROVIDER,
            "llm_active_provider": settings.ai_provider_name,
            "ocr_configured": settings.ocr_configured,
            "transcription_configured": settings.transcription_configured,
        },
        # What actually persists. Reported without credentials so operators and
        # reviewers can see durability guarantees instead of assuming them.
        "storage": {
            "database": {
                "scheme": settings.database_scheme,
                "label": settings.database_label,
                "durable": settings.database_durable,
                "driver_available": driver_ok,
                "driver": driver_label,
                "note": settings.database_durability_note,
            },
            "uploads": {
                "mode": "server-filesystem",
                "durable": settings.uploads_durable,
                "writable": settings.upload_dir_writable,
                "note": settings.upload_durability_note,
            },
        },
        "ai": {
            "configured": settings.llm_configured,
            "provider": settings.ai_provider_name,
            "model": settings.LLM_MODEL if settings.llm_configured else None,
            "reason": settings.ai_status_reason,
        },
        "limits": {
            "max_upload_mb": settings.MAX_UPLOAD_BYTES // (1024 * 1024),
            "max_video_upload_mb": settings.MAX_VIDEO_UPLOAD_BYTES // (1024 * 1024),
            "max_pdf_pages": settings.MAX_PDF_PAGES,
            "ai_requests_per_minute": settings.AI_RATE_LIMIT_PER_MINUTE,
        },
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }