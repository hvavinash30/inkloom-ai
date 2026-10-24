import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now():
    return datetime.now(timezone.utc)


class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="active", nullable=False)
    target_audience = Column(String(255), nullable=True)
    launch_target = Column(DateTime(timezone=True), nullable=True)
    created_by_name = Column(String(255), nullable=True)
    is_demo = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    workspace = relationship("Workspace", backref="campaigns")
    documents = relationship("ContentDocument", back_populates="campaign")
    conflicts = relationship(
        "CampaignConflict", back_populates="campaign", cascade="all, delete-orphan"
    )


class CampaignConflict(Base):
    __tablename__ = "campaign_conflicts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    campaign_id = Column(String(36), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    claim_type = Column(String(50), nullable=False)
    topic = Column(String(255), nullable=False)
    asset_a_id = Column(String(36), ForeignKey("content_documents.id", ondelete="SET NULL"), nullable=True)
    asset_a_title = Column(String(255), nullable=False)
    asset_a_value = Column(String(255), nullable=False)
    asset_a_location = Column(String(100), nullable=True)
    asset_b_id = Column(String(36), ForeignKey("content_documents.id", ondelete="SET NULL"), nullable=True)
    asset_b_title = Column(String(255), nullable=False)
    asset_b_value = Column(String(255), nullable=False)
    asset_b_location = Column(String(100), nullable=True)
    approved_value = Column(String(255), nullable=True)
    source_reference = Column(String(255), nullable=True)
    evidence_note = Column(Text, nullable=True)
    status = Column(String(50), default="unresolved", nullable=False)  # unresolved, resolved
    resolution_notes = Column(Text, nullable=True)
    resolved_by = Column(String(255), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    is_demo = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    campaign = relationship("Campaign", back_populates="conflicts")
