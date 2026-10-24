import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now():
    return datetime.now(timezone.utc)


class ApprovedFact(Base):
    __tablename__ = "approved_facts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    category = Column(String(100), nullable=False)
    claim_statement = Column(Text, nullable=False)
    approved_value = Column(Text, nullable=False)
    source_reference = Column(String(255), nullable=False)
    source_url = Column(Text, nullable=True)
    product = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    status = Column(String(30), default="verified", nullable=False)  # verified, needs_review, expired, draft
    owner_name = Column(String(255), nullable=True)
    version = Column(Integer, default=1, nullable=False)
    last_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    next_review_at = Column(DateTime(timezone=True), nullable=True)
    is_demo = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    workspace = relationship("Workspace", back_populates="facts")
    findings = relationship("AuditFinding", back_populates="fact")
