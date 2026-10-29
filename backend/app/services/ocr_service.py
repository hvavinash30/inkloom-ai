"""Local OCR for images and scanned PDF pages.

RapidOCR ships ONNX detection/recognition models and runs on the API host, so
extracted text feeds the existing deterministic audit engine without calling an
external service. Processing is synchronous and bounded by image pixels, page
count, and a wall-clock budget; a page that cannot be read is reported as such
instead of being silently treated as empty content.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError

from app.core.config import settings


ALLOWED_IMAGE_FORMATS = {"PNG", "JPEG", "WEBP"}

_engine = None
_engine_lock = threading.Lock()
_engine_error: Optional[str] = None


@dataclass
class OcrLine:
    text: str
    confidence: float
    bbox: list[float]
    page_number: int = 1


@dataclass
class OcrOutcome:
    status: str  # processed | no_text | unavailable | error
    message: str
    text: str = ""
    lines: list[OcrLine] = field(default_factory=list)
    mean_confidence: Optional[float] = None


def ocr_available() -> bool:
    return settings.ocr_configured


def validate_image_file(path: Path) -> tuple[int, int]:
    """Verify that the stored bytes are a readable, bounded PNG/JPEG/WebP image."""
    try:
        with Image.open(path) as probe:
            probe.verify()
        with Image.open(path) as image:
            image_format = (image.format or "").upper()
            if image_format not in ALLOWED_IMAGE_FORMATS:
                raise HTTPException(
                    status_code=415,
                    detail=(
                        "The uploaded image is not a supported format. Use PNG, JPEG, or WebP."
                    ),
                )
            width, height = image.size
            # Force a full decode so truncated or corrupted files are rejected here
            # rather than being stored with an unusable "image" label.
            image.load()
            if width <= 0 or height <= 0:
                raise HTTPException(status_code=415, detail="The uploaded image has no readable pixels.")
            if width * height > settings.OCR_MAX_IMAGE_PIXELS:
                raise HTTPException(
                    status_code=413,
                    detail=(
                        f"The image is {width}×{height} px. The OCR limit is "
                        f"{settings.OCR_MAX_IMAGE_PIXELS:,} pixels; downscale the image and retry."
                    ),
                )
            return width, height
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
        raise HTTPException(
            status_code=415,
            detail="The uploaded image is malformed or unreadable. Export a fresh PNG or JPEG.",
        ) from exc
    except Image.DecompressionBombError as exc:
        raise HTTPException(
            status_code=413,
            detail="The image is too large to decode safely. Downscale it and retry.",
        ) from exc


def open_image(path: Path) -> Image.Image:
    with Image.open(path) as image:
        image.load()
        if image.mode not in {"RGB", "L"}:
            return image.convert("RGB")
        return image.convert("RGB") if image.mode == "L" else image.copy()


def _get_engine():
    global _engine, _engine_error
    if _engine is not None:
        return _engine
    with _engine_lock:
        if _engine is not None:
            return _engine
        try:
            from rapidocr_onnxruntime import RapidOCR

            _engine = RapidOCR()
        except Exception as exc:  # noqa: BLE001 - surfaced as an honest status
            _engine_error = f"{type(exc).__name__}: {exc}"[:200]
            _engine = None
    return _engine


def _run_engine(image: Image.Image) -> tuple[list, Optional[str]]:
    engine = _get_engine()
    if engine is None:
        return [], _engine_error or "The OCR engine is not installed on this server."
    try:
        import numpy as np

        array = np.ascontiguousarray(np.array(image.convert("RGB"))[:, :, ::-1])
        with _engine_lock:
            result, _elapse = engine(array)
        return list(result or []), None
    except Exception as exc:  # noqa: BLE001 - bounded, reported, not hidden
        return [], f"{type(exc).__name__}: {exc}"[:200]


def ocr_image(image: Image.Image, *, page_number: int = 1) -> OcrOutcome:
    """Run OCR on an in-memory image. Never claims success without readable text."""
    if not ocr_available():
        return OcrOutcome(
            status="unavailable",
            message=settings.ocr_status_reason,
        )
    if image.width * image.height > settings.OCR_MAX_IMAGE_PIXELS:
        return OcrOutcome(
            status="error",
            message=(
                f"Page {page_number} is {image.width}×{image.height} px, above the OCR limit of "
                f"{settings.OCR_MAX_IMAGE_PIXELS:,} pixels. It was not read automatically."
            ),
        )

    started = time.time()
    raw_lines, error = _run_engine(image)
    if error:
        return OcrOutcome(
            status="error",
            message=f"OCR could not process page {page_number}: {error}",
        )

    width, height = image.size
    lines: list[OcrLine] = []
    for entry in raw_lines:
        try:
            box, text, score = entry[0], entry[1], entry[2]
        except (TypeError, IndexError):
            continue
        cleaned = " ".join(str(text or "").split())
        if not cleaned:
            continue
        try:
            xs = [float(point[0]) for point in box]
            ys = [float(point[1]) for point in box]
            confidence = max(0.0, min(1.0, float(score)))
        except (TypeError, ValueError, IndexError):
            xs, ys, confidence = [0.0, width], [0.0, height], 0.0
        lines.append(
            OcrLine(
                text=cleaned,
                confidence=round(confidence, 3),
                bbox=[
                    round(max(0.0, min(xs) / width), 4),
                    round(max(0.0, min(ys) / height), 4),
                    round(min(1.0, max(xs) / width), 4),
                    round(min(1.0, max(ys) / height), 4),
                ],
                page_number=page_number,
            )
        )

    if not lines:
        return OcrOutcome(
            status="no_text",
            message=(
                f"OCR ran on page {page_number} but found no readable text. "
                "No automated text checks were performed for it."
            ),
        )

    text = "\n".join(line.text for line in lines)
    truncated = len(text) > settings.OCR_MAX_PAGE_CHARS
    if truncated:
        text = text[: settings.OCR_MAX_PAGE_CHARS]

    mean = round(sum(line.confidence for line in lines) / len(lines), 3)
    seconds = round(time.time() - started, 2)
    message = (
        f"OCR read {len(lines)} line(s) from page {page_number} in {seconds}s "
        f"(mean confidence {int(mean * 100)}%)."
    )
    if truncated:
        message += f" Text stopped at the {settings.OCR_MAX_PAGE_CHARS:,}-character page limit."
    return OcrOutcome(
        status="processed",
        message=message,
        text=text,
        lines=lines,
        mean_confidence=mean,
    )


def render_pdf_page(path: Path, page_index: int, *, dpi: Optional[int] = None) -> Image.Image:
    """Render one PDF page to RGB pixels for OCR. Raises ValueError on failure."""
    try:
        import pymupdf
    except Exception as exc:  # noqa: BLE001
        try:
            import fitz as pymupdf  # type: ignore
        except Exception:
            raise ValueError("PDF rendering support is not installed on this server.") from exc

    document = pymupdf.open(str(path))
    try:
        page = document.load_page(page_index)
        resolution = dpi or settings.OCR_RENDER_DPI
        scale = resolution / 72
        expected_pixels = (page.rect.width * scale) * (page.rect.height * scale)
        if expected_pixels > settings.OCR_MAX_IMAGE_PIXELS:
            resolution = max(
                72,
                int(settings.OCR_RENDER_DPI * (settings.OCR_MAX_IMAGE_PIXELS / expected_pixels) ** 0.5),
            )
            scale = resolution / 72
        pixmap = page.get_pixmap(
            matrix=pymupdf.Matrix(scale, scale), colorspace=pymupdf.csRGB, alpha=False
        )
        image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
        return image
    finally:
        document.close()


def ocr_pdf_page(path: Path, page_index: int, *, page_number: int) -> OcrOutcome:
    try:
        image = render_pdf_page(path, page_index)
    except ValueError as exc:
        return OcrOutcome(status="error", message=f"Page {page_number} could not be rendered: {exc}")
    except Exception as exc:  # noqa: BLE001 - reported per page
        return OcrOutcome(
            status="error",
            message=f"Page {page_number} could not be rendered: {type(exc).__name__}.",
        )
    return ocr_image(image, page_number=page_number)
