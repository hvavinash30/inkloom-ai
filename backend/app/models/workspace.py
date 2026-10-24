import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now():
    return datetime.now(timezone.utc)


class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    is_demo = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    users = relationship("UserProfile", back_populates="workspace", cascade="all, delete-orphan")
    rules = relationship("BrandRule", back_populates="workspace", cascade="all, delete-orphan")
    facts = relationship("ApprovedFact", back_populates="workspace", cascade="all, delete-orphan")
    documents = relationship("ContentDocument", back_populates="workspace", cascade="all, delete-orphan")
    brand_assets = relationship("BrandAsset", back_populates="workspace", cascade="all, delete-orphan")
    research_records = relationship("ResearchRecord", back_populates="workspace", cascade="all, delete-orphan")
    evaluation_cases = relationship("EvaluationCase", back_populates="workspace", cascade="all, delete-orphan")


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    full_name = Column(String(255), nullable=False)
    title = Column(String(255), nullable=True)
    role = Column(String(50), default="creator", nullable=False)  # creator, reviewer, admin
    avatar_url = Column(Text, nullable=True)
    is_demo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    workspace = relationship("Workspace", back_populates="users")
