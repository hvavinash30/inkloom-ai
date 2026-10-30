import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now():
    return datetime.now(timezone.utc)


class AuditRun(Base):
    __tablename__ = "audit_runs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    document_id = Column(String(36), ForeignKey("content_documents.id", ondelete="CASCADE"), nullable=False)
    version_id = Column(String(36), ForeignKey("content_versions.id", ondelete="CASCADE"), nullable=False)
    overall_score = Column(Integer, default=100, nullable=False)
    risk_level = Column(String(20), default="clean", nullable=False)
    verification_status = Column(String(30), default="verified", nullable=False)
    # verified, partially_verified, unable_to_verify
    total_findings = Column(Integer, default=0, nullable=False)
    resolved_findings = Column(Integer, default=0, nullable=False)
    model_used = Column(String(120), default="deterministic-rules-v2", nullable=False)
    execution_time_ms = Column(Integer, default=0, nullable=False)
    risk_factors = Column(JSON, default=list)
    score_method = Column(Text, nullable=True)
    extraction_notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    document = relationship("ContentDocument", back_populates="audit_runs")
    version = relationship("ContentVersion", back_populates="audit_runs")
    findings = relationship(
        "AuditFinding",
        back_populates="audit_run",
        cascade="all, delete-orphan",
    )


class AuditFinding(Base):
    __tablename__ = "audit_findings"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    audit_run_id = Column(String(36), ForeignKey("audit_runs.id", ondelete="CASCADE"), nullable=False)
    version_id = Column(String(36), ForeignKey("content_versions.id", ondelete="CASCADE"), nullable=False)
    rule_id = Column(String(36), ForeignKey("brand_rules.id", ondelete="SET NULL"), nullable=True)
    fact_id = Column(String(36), ForeignKey("approved_facts.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False)
    category = Column(String(50), nullable=False)
    # confirmed_contradiction, unsupported_claim, policy_violation,
    # style_suggestion, accessibility_issue, needs_human_review, processing_issue
    severity = Column(String(20), nullable=False)
    affected_text = Column(Text, nullable=False)
    start_index = Column(Integer, default=0, nullable=False)
    end_index = Column(Integer, default=0, nullable=False)
    explanation = Column(Text, nullable=False)
    supporting_evidence = Column(Text, nullable=True)
    source_reference = Column(String(255), nullable=True)
    source_url = Column(Text, nullable=True)
    suggested_correction = Column(Text, nullable=True)
    confidence_score = Column(Float, default=1.0, nullable=False)
    page_number = Column(Integer, nullable=True)
    timestamp_seconds = Column(Float, nullable=True)
    location_label = Column(String(120), nullable=True)
    frame_url = Column(Text, nullable=True)
    # spoken | on_screen | None. Video findings record which source produced
    # the text so the UI never mixes speech with visible copy.
    source_type = Column(String(20), nullable=True)
    evidence_status = Column(String(50), default="potential_violation", nullable=False)
    status = Column(String(30), default="open", nullable=False)
    dismissal_reason = Column(Text, nullable=True)
    reviewed_by = Column(String(255), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    audit_run = relationship("AuditRun", back_populates="findings")
    version = relationship("ContentVersion", back_populates="findings")
    rule = relationship("BrandRule", back_populates="findings")
    fact = relationship("ApprovedFact", back_populates="findings")
