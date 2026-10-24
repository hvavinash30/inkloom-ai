import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.db.session import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now():
    return datetime.now(timezone.utc)


class ContentDocument(Base):
    __tablename__ = "content_documents"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    campaign_id = Column(String(36), ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True)
    file_id = Column(String(36), ForeignKey("uploaded_files.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False)
    content_type = Column(String(50), nullable=False)
    asset_type = Column(String(30), default="text", nullable=False)  # text, pdf, image, video, audio
    source_url = Column(Text, nullable=True)
    file_hash = Column(String(64), nullable=True)
    provenance_metadata = Column(JSON, default=dict)
    status = Column(String(50), default="draft", nullable=False)
    # draft, audited, in_review, approved, rejected, changes_requested
    current_version_number = Column(Integer, default=1, nullable=False)
    approved_version_id = Column(String(36), nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    submitted_by_name = Column(String(255), nullable=True)
    created_by = Column(String(36), ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True)
    created_by_name = Column(String(255), nullable=True)
    is_demo = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    workspace = relationship("Workspace", back_populates="documents")
    campaign = relationship("Campaign", back_populates="documents")
    file = relationship("UploadedFile", back_populates="documents")
    versions = relationship(
        "ContentVersion",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="ContentVersion.version_number",
    )
    audit_runs = relationship("AuditRun", back_populates="document", cascade="all, delete-orphan")
    comments = relationship("ReviewComment", back_populates="document", cascade="all, delete-orphan")
    decisions = relationship("ApprovalDecision", back_populates="document", cascade="all, delete-orphan")
    history = relationship("AuditHistoryEvent", back_populates="document", cascade="all, delete-orphan")


class ContentVersion(Base):
    __tablename__ = "content_versions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    document_id = Column(String(36), ForeignKey("content_documents.id", ondelete="CASCADE"), nullable=False)
    version_number = Column(Integer, nullable=False)
    content_text = Column(Text, nullable=False)
    change_summary = Column(Text, nullable=True)
    page_texts = Column(JSON, default=list)
    transcript_segments = Column(JSON, default=list)
    asset_metadata = Column(JSON, default=dict)
    content_hash = Column(String(64), nullable=True)
    created_by = Column(String(36), ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True)
    created_by_name = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    __table_args__ = (
        UniqueConstraint("document_id", "version_number", name="uq_document_version"),
    )

    document = relationship("ContentDocument", back_populates="versions")
    audit_runs = relationship("AuditRun", back_populates="version")
    findings = relationship("AuditFinding", back_populates="version")
