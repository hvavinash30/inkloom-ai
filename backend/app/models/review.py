import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now():
    return datetime.now(timezone.utc)


class ReviewComment(Base):
    __tablename__ = "review_comments"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    document_id = Column(String(36), ForeignKey("content_documents.id", ondelete="CASCADE"), nullable=False)
    version_id = Column(String(36), ForeignKey("content_versions.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(String(36), ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True)
    author_name = Column(String(255), nullable=False)
    author_role = Column(String(50), nullable=True)
    visibility = Column(String(20), default="shared", nullable=False)  # shared, internal
    comment_text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    document = relationship("ContentDocument", back_populates="comments")


class ApprovalDecision(Base):
    __tablename__ = "approval_decisions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    document_id = Column(String(36), ForeignKey("content_documents.id", ondelete="CASCADE"), nullable=False)
    version_id = Column(String(36), ForeignKey("content_versions.id", ondelete="CASCADE"), nullable=False)
    reviewer_id = Column(String(36), ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True)
    reviewer_name = Column(String(255), nullable=False)
    reviewer_role = Column(String(50), nullable=True)
    decision = Column(String(50), nullable=False)  # approved, rejected, changes_requested
    feedback = Column(Text, nullable=True)
    decision_metadata = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    document = relationship("ContentDocument", back_populates="decisions")
    version = relationship("ContentVersion")


class AuditHistoryEvent(Base):
    __tablename__ = "audit_history_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    document_id = Column(String(36), ForeignKey("content_documents.id", ondelete="CASCADE"), nullable=False)
    version_id = Column(String(36), ForeignKey("content_versions.id", ondelete="SET NULL"), nullable=True)
    user_id = Column(String(36), ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True)
    user_name = Column(String(255), nullable=False)
    event_type = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    event_metadata = Column("metadata", JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    document = relationship("ContentDocument", back_populates="history")
