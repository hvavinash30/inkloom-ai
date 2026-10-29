"""Secure-ish local file ingestion for the demo deployment.

Files are stored under an application-owned directory with generated names.
The content type is derived from the allow-list, PDF signatures are checked,
and size limits are enforced while streaming. Production deployments should
replace local storage with an object store and malware scanning.
"""
from __future__ import annotations

import hashlib
import re
import time
import uuid
from pathlib import Path
from typing import BinaryIO, Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import Actor
from app.models.assets import OcrLine, UploadedFile
from app.services import ocr_service
from app.services.workspace_service import workspace_is_demo


PDF_EXTENSIONS = {".pdf"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}
TEXT_EXTENSIONS = {".txt", ".vtt", ".srt"}

IMAGE_MIMES = {"image/png", "image/jpeg", "image/webp"}
VIDEO_MIMES = {"video/mp4", "video/webm", "video/quicktime"}

ALLOWED_KINDS = {"pdf", "image", "video", "transcript"}


def _safe_name(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._ -]", "_", name).strip()
    return cleaned[:180] or "upload"


def infer_kind(filename: str, content_type: Optional[str]) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix in PDF_EXTENSIONS:
        return "pdf"
    if suffix in IMAGE_EXTENSIONS:
        return "image"
    if suffix in VIDEO_EXTENSIONS:
        return "video"
    if suffix in TEXT_EXTENSIONS:
        return "transcript"
    raise HTTPException(
        status_code=415,
        detail=(
            "Unsupported file type. Supported formats: PDF, PNG/JPEG/WebP images, "
            "MP4/WebM/MOV video, and TXT/VTT/SRT transcripts."
        ),
    )


def _validate_mime(kind: str, content_type: Optional[str]) -> None:
    if not content_type:
        return
    content_type = content_type.split(";")[0].strip().lower()
    if kind == "pdf" and content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=415, detail="The uploaded PDF has an unexpected content type.")
    if kind == "image" and content_type not in IMAGE_MIMES | {"application/octet-stream"}:
        raise HTTPException(status_code=415, detail="The uploaded image has an unexpected content type.")
    if kind == "video" and content_type not in VIDEO_MIMES | {"application/octet-stream"}:
        raise HTTPException(status_code=415, detail="The uploaded video has an unexpected content type.")


def _pdf_result(
    *,
    status: str,
    message: str,
    pages: Optional[list[str]] = None,
    page_count: Optional[int] = None,
    ocr_lines: Optional[list] = None,
    unreadable_pages: Optional[list[int]] = None,
) -> dict:
    texts = pages or []
    return {
        "extraction_status": status,
        "extraction_message": message,
        "page_texts": texts,
        "extracted_text": "\n\f\n".join(text for text in texts if text.strip()),
        "page_count": page_count,
        "ocr_lines": ocr_lines or [],
        "unreadable_pages": unreadable_pages or [],
    }


def _extract_pdf(path: Path) -> dict:
    try:
        from pypdf import PdfReader
    except Exception:
        return _pdf_result(
            status="error",
            message="PDF support is not installed on the server. Install the 'pypdf' package.",
        )

    try:
        reader = PdfReader(str(path))
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception:
                pass
            if reader.is_encrypted:
                return _pdf_result(
                    status="error",
                    message=(
                        "This PDF is password-protected. Remove the password or export a "
                        "readable copy before uploading."
                    ),
                )

        page_count = len(reader.pages)
        if page_count == 0:
            return _pdf_result(status="error", message="The PDF contains no pages.", page_count=0)
        if page_count > settings.MAX_PDF_PAGES:
            return _pdf_result(
                status="error",
                message=(
                    f"This PDF has {page_count} pages. The demo limit is {settings.MAX_PDF_PAGES} pages. "
                    "Split the file before uploading."
                ),
                page_count=page_count,
            )

        pages: list[str] = []
        ocr_lines: list = []
        unreadable_pages: list[int] = []
        native_pages: list[int] = []
        ocr_pages: list[int] = []
        ocr_errors: list[str] = []
        ocr_used = 0
        deadline = time.monotonic() + settings.OCR_TIMEOUT_SECONDS

        for index, page in enumerate(reader.pages, start=1):
            try:
                raw = page.extract_text() or ""
            except Exception:
                raw = ""
            cleaned = re.sub(r"[ \t]+\n", "\n", raw)
            cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()

            if len(cleaned) >= settings.OCR_MIN_NATIVE_CHARS:
                pages.append(cleaned)
                native_pages.append(index)
                continue

            can_ocr = (
                ocr_service.ocr_available()
                and ocr_used < settings.OCR_MAX_PAGES
                and time.monotonic() <= deadline
            )
            if not can_ocr:
                pages.append(cleaned)
                unreadable_pages.append(index)
                continue

            outcome = ocr_service.ocr_pdf_page(path, index - 1, page_number=index)
            ocr_used += 1
            if outcome.status == "processed" and outcome.text.strip():
                pages.append(outcome.text)
                ocr_pages.append(index)
                ocr_lines.extend(outcome.lines)
            else:
                pages.append(cleaned)
                unreadable_pages.append(index)
                ocr_errors.append(outcome.message)

        usable = [text for text in pages if text.strip()]
        if usable:
            detail = (
                f"Extracted text from {len(usable)} of {page_count} page(s) "
                f"(native: {len(native_pages)}, OCR: {len(ocr_pages)}). "
                "Page numbers are preserved on findings."
            )
            if unreadable_pages:
                detail += (
                    f" {len(unreadable_pages)} page(s) could not be read automatically "
                    f"(pages {', '.join(str(number) for number in unreadable_pages[:8])}"
                    f"{'…' if len(unreadable_pages) > 8 else ''}); they are reported as uninspected."
                )
            if ocr_errors:
                detail += f" OCR note: {ocr_errors[0]}"
            return _pdf_result(
                status="processed",
                message=detail,
                pages=pages,
                page_count=page_count,
                ocr_lines=ocr_lines,
                unreadable_pages=unreadable_pages,
            )

        if not ocr_service.ocr_available():
            return _pdf_result(
                status="needs_ocr",
                message=(
                    "No embedded text was found, and OCR is not available on this server. "
                    "The PDF was stored; upload a text version or have a human reviewer inspect it. "
                    + settings.ocr_status_reason
                ),
                pages=pages,
                page_count=page_count,
                unreadable_pages=unreadable_pages,
            )

        if ocr_used >= settings.OCR_MAX_PAGES or time.monotonic() > deadline:
            message = (
                "No readable text was found within the OCR page/time budget. "
                f"The limit is {settings.OCR_MAX_PAGES} OCR pages and "
                f"{int(settings.OCR_TIMEOUT_SECONDS)}s per upload."
            )
        else:
            message = (
                "OCR ran on the scanned pages but found no readable text. "
                "No automated content checks can be performed for this PDF."
            )
        if ocr_errors:
            message += f" {ocr_errors[0]}"
        return _pdf_result(
            status="needs_ocr",
            message=message,
            pages=pages,
            page_count=page_count,
            unreadable_pages=unreadable_pages,
        )
    except Exception as exc:
        return _pdf_result(
            status="error",
            message=f"The PDF could not be read safely: {type(exc).__name__}. Try a different export.",
        )


def save_upload(
    db: Session,
    actor: Actor,
    upload: UploadFile,
    *,
    expected_kind: Optional[str] = None,
) -> UploadedFile:
    filename = _safe_name(upload.filename or "upload")
    kind = infer_kind(filename, upload.content_type)
    if expected_kind and kind != expected_kind:
        raise HTTPException(
            status_code=400,
            detail=f"This upload was sent as {expected_kind} but the file looks like {kind}.",
        )
    _validate_mime(kind, upload.content_type)

    limit = settings.MAX_VIDEO_UPLOAD_BYTES if kind == "video" else settings.MAX_UPLOAD_BYTES
    suffix = Path(filename).suffix.lower()
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    destination = settings.upload_path / stored_name
    hasher = hashlib.sha256()
    size = 0

    try:
        with destination.open("wb") as out:
            while True:
                chunk = upload.file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > limit:
                    out.close()
                    destination.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            f"File is too large. The limit for {kind} files is "
                            f"{limit // (1024 * 1024)} MB."
                        ),
                    )
                hasher.update(chunk)
                out.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Could not store the upload: {type(exc).__name__}") from exc
    finally:
        upload.file.close()

    if size == 0:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    if kind == "pdf":
        with destination.open("rb") as handle:
            header = handle.read(5)
        if header != b"%PDF-":
            destination.unlink(missing_ok=True)
            raise HTTPException(status_code=415, detail="The file does not look like a valid PDF.")

    extraction = {
        "extraction_status": "unsupported",
        "extraction_message": "",
        "page_texts": [],
        "extracted_text": "",
        "page_count": None,
        "ocr_lines": [],
        "unreadable_pages": [],
    }
    if kind == "pdf":
        extraction = _extract_pdf(destination)
    elif kind == "image":
        try:
            width, height = ocr_service.validate_image_file(destination)
            outcome = ocr_service.ocr_image(ocr_service.open_image(destination))
        except HTTPException:
            destination.unlink(missing_ok=True)
            raise
        except Exception as exc:  # noqa: BLE001 - reported as a failed extraction
            outcome = ocr_service.OcrOutcome(
                status="error",
                message=f"The image could not be read safely: {type(exc).__name__}.",
            )
            width = height = None

        if outcome.status == "processed":
            extraction = {
                "extraction_status": "processed",
                "extraction_message": (
                    f"{outcome.message} Automated text checks use this extraction. "
                    "Contrast, logo usage, and other visual qualities still require a human reviewer."
                ),
                "page_texts": [outcome.text],
                "extracted_text": outcome.text,
                "page_count": 1,
                "ocr_lines": outcome.lines,
                "unreadable_pages": [],
            }
        else:
            extraction = {
                "extraction_status": "no_text" if outcome.status == "no_text" else (
                    "needs_ocr" if outcome.status == "unavailable" else "error"
                ),
                "extraction_message": (
                    f"{outcome.message} The image was stored, but no automated content checks "
                    "were performed on its text."
                ),
                "page_texts": [],
                "extracted_text": "",
                "page_count": 1 if width and height else None,
                "ocr_lines": [],
                "unreadable_pages": [1],
            }
    elif kind == "video":
        extraction = {
            "extraction_status": "needs_transcription",
            "extraction_message": (
                "Automatic video transcription is not configured in this deployment. "
                "The video can be stored and played, but checks require a timestamped transcript. "
                "Paste or upload a transcript alongside the video."
            ),
            "page_texts": [],
            "extracted_text": "",
            "page_count": None,
        }
    elif kind == "transcript":
        try:
            text = destination.read_text(encoding="utf-8", errors="replace")
        except Exception:
            text = ""
        extraction = {
            "extraction_status": "processed" if text.strip() else "no_text",
            "extraction_message": (
                "Transcript loaded. Timestamps are preserved when present."
                if text.strip()
                else "The transcript file is empty."
            ),
            "page_texts": [],
            "extracted_text": text,
            "page_count": None,
        }

    record = UploadedFile(
        workspace_id=actor.workspace_id,
        original_name=filename,
        stored_name=stored_name,
        mime_type=upload.content_type,
        size_bytes=size,
        kind=kind,
        sha256=hasher.hexdigest(),
        extraction_status=extraction["extraction_status"],
        extraction_message=extraction["extraction_message"],
        page_count=extraction["page_count"],
        page_texts=extraction["page_texts"],
        extracted_text=extraction["extracted_text"],
        uploaded_by_id=actor.id,
        uploaded_by_name=actor.name,
        is_demo=workspace_is_demo(db, actor.workspace_id),
    )
    db.add(record)
    db.flush()

    for index, line in enumerate(extraction.get("ocr_lines", [])):
        db.add(
            OcrLine(
                upload_id=record.id,
                workspace_id=actor.workspace_id,
                page_number=line.page_number,
                line_index=index,
                text=line.text,
                confidence=line.confidence,
                bbox=line.bbox,
            )
        )

    db.commit()
    db.refresh(record)
    return record


def resolve_upload_path(record: UploadedFile) -> Path:
    base = settings.upload_path.resolve()
    candidate = (base / record.stored_name).resolve()
    if base not in candidate.parents:
        raise HTTPException(status_code=400, detail="Invalid stored file path.")
    if not candidate.exists():
        raise HTTPException(status_code=404, detail="The stored file is no longer available.")
    return candidate
