import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now():
    return datetime.now(timezone.utc)


class BrandRule(Base):
    __tablename__ = "brand_rules"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    rule_type = Column(String(50), nullable=False)
    # prohibited_phrase | required_terminology | tone_guideline | claim_restriction | product_naming
    description = Column(Text, nullable=True)
    pattern_or_phrase = Column(Text, nullable=False)
    trigger_phrase = Column(Text, nullable=True)
    replacement_or_guidance = Column(Text, nullable=True)
    severity = Column(String(20), default="medium", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    status = Column(String(30), default="active", nullable=False)  # active, draft, archived
    owner_name = Column(String(255), nullable=True)
    version = Column(Integer, default=1, nullable=False)
    effective_date = Column(DateTime(timezone=True), nullable=True)
    last_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    is_demo = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    workspace = relationship("Workspace", back_populates="rules")
    findings = relationship("AuditFinding", back_populates="rule")
