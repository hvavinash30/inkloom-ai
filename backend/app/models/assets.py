import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now():
    return datetime.now(timezone.utc)


class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    original_name = Column(String(255), nullable=False)
    stored_name = Column(String(255), nullable=False)
    mime_type = Column(String(120), nullable=True)
    size_bytes = Column(BigInteger, default=0, nullable=False)
    kind = Column(String(30), default="text", nullable=False)  # pdf, image, video, audio, transcript
    sha256 = Column(String(64), nullable=True)
    extraction_status = Column(String(40), default="processed", nullable=False)
    # processed | needs_ocr | needs_transcription | no_text | unsupported | error
    extraction_message = Column(Text, nullable=True)
    page_count = Column(Integer, nullable=True)
    page_texts = Column(JSON, default=list)
    extracted_text = Column(Text, nullable=True)
    uploaded_by_id = Column(String(36), ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True)
    uploaded_by_name = Column(String(255), nullable=True)
    is_demo = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    documents = relationship("ContentDocument", back_populates="file")
    brand_assets = relationship("BrandAsset", back_populates="file")
    ocr_lines = relationship("OcrLine", back_populates="upload", cascade="all, delete-orphan")


class OcrLine(Base):
    """One OCR-detected text line with its normalized bounding box.

    Boxes come from the OCR engine; they are stored, never inferred. A page
    without rows was either read from embedded text or not readable at all.
    """

    __tablename__ = "ocr_lines"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    upload_id = Column(String(36), ForeignKey("uploaded_files.id", ondelete="CASCADE"), nullable=False)
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    page_number = Column(Integer, nullable=False)
    line_index = Column(Integer, default=0, nullable=False)
    text = Column(Text, nullable=False)
    confidence = Column(Float, default=0.0, nullable=False)
    bbox = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    upload = relationship("UploadedFile", back_populates="ocr_lines")


class BrandAsset(Base):
    __tablename__ = "brand_assets"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    file_id = Column(String(36), ForeignKey("uploaded_files.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    asset_type = Column(String(40), nullable=False)  # logo, color, typography, image, template
    value = Column(Text, nullable=True)  # hex value, font stack, guidance
    notes = Column(Text, nullable=True)
    status = Column(String(30), default="active", nullable=False)
    owner_name = Column(String(255), nullable=True)
    is_demo = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    workspace = relationship("Workspace", back_populates="brand_assets")
    file = relationship("UploadedFile", back_populates="brand_assets")


class ResearchRecord(Base):
    __tablename__ = "research_records"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    section = Column(String(50), nullable=False)
    # literature, survey, interviews, competitor, validation, traceability
    title = Column(String(255), nullable=False)
    status = Column(String(40), default="planned", nullable=False)
    # planned, in_progress, completed, validated
    summary = Column(Text, nullable=True)
    details = Column(Text, nullable=True)  # JSON string for portable SQLite + Postgres text
    sources = Column(Text, nullable=True)  # JSON string
    owner_name = Column(String(255), nullable=True)
    is_demo = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    workspace = relationship("Workspace", back_populates="research_records")


class EvaluationCase(Base):
    __tablename__ = "evaluation_cases"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    case_type = Column(String(30), default="text", nullable=False)  # text, pdf, video, campaign
    input_payload = Column(Text, nullable=False)  # JSON string
    expected_outcome = Column(Text, nullable=False)  # JSON string
    expected_summary = Column(Text, nullable=True)
    version = Column(Integer, default=1, nullable=False)
    is_demo = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    workspace = relationship("Workspace", back_populates="evaluation_cases")
    runs = relationship("EvaluationRun", back_populates="case", cascade="all, delete-orphan")


class EvaluationRun(Base):
    __tablename__ = "evaluation_runs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    case_id = Column(String(36), ForeignKey("evaluation_cases.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(30), default="failed", nullable=False)  # passed, failed, error
    findings_count = Column(Integer, default=0, nullable=False)
    matched_categories = Column(Text, nullable=True)  # JSON
    actual_location = Column(String(120), nullable=True)
    details = Column(Text, nullable=True)  # JSON
    executed_at = Column(DateTime(timezone=True), default=utc_now)

    case = relationship("EvaluationCase", back_populates="runs")
