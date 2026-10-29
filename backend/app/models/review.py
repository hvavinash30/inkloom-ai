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


class ReviewAssignment(Base):
    """An explicit reviewer assignment for one document version.

    Reassigning supersedes the previous row instead of deleting it, so the
    assignment history remains auditable.
    """

    __tablename__ = "review_assignments"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    document_id = Column(String(36), ForeignKey("content_documents.id", ondelete="CASCADE"), nullable=False)
    version_id = Column(String(36), ForeignKey("content_versions.id", ondelete="SET NULL"), nullable=True)
    assignee_id = Column(String(36), ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True)
    assignee_name = Column(String(255), nullable=False)
    assignee_role = Column(String(50), nullable=True)
    assigned_by_id = Column(String(36), ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True)
    assigned_by_name = Column(String(255), nullable=False)
    status = Column(String(20), default="active", nullable=False)  # active, superseded, completed
    instructions = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class FindingOverride(Base):
    """A reasoned dismissal of an audit finding, kept for governance insights."""

    __tablename__ = "finding_overrides"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    document_id = Column(String(36), ForeignKey("content_documents.id", ondelete="CASCADE"), nullable=False)
    version_id = Column(String(36), ForeignKey("content_versions.id", ondelete="SET NULL"), nullable=True)
    finding_id = Column(String(36), ForeignKey("audit_findings.id", ondelete="SET NULL"), nullable=True)
    rule_id = Column(String(36), ForeignKey("brand_rules.id", ondelete="SET NULL"), nullable=True)
    rule_name = Column(String(255), nullable=True)
    severity = Column(String(20), nullable=False)
    action = Column(String(30), default="dismissed", nullable=False)
    reason = Column(Text, nullable=False)
    reviewer_id = Column(String(36), ForeignKey("user_profiles.id", ondelete="SET NULL"), nullable=True)
    reviewer_name = Column(String(255), nullable=False)
    reviewer_role = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
