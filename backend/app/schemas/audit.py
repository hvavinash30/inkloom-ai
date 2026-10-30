from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

ContentType = Literal[
    "blog_post",
    "social_media",
    "press_release",
    "landing_page",
    "product_copy",
    "ad_copy",
    "email_campaign",
    "video_script",
    "other",
]
AssetType = Literal["text", "pdf", "image", "video", "audio"]
SeverityType = Literal["low", "medium", "high", "critical"]
RiskLevel = Literal["clean", "low", "medium", "high", "critical"]
FindingStatus = Literal["open", "accepted", "edited", "dismissed"]
DocumentStatus = Literal["draft", "audited", "in_review", "approved", "rejected", "changes_requested"]
VerificationStatus = Literal["verified", "partially_verified", "unable_to_verify"]


class TranscriptSegmentIn(BaseModel):
    timestamp_seconds: float = Field(..., ge=0)
    text: str = Field(..., min_length=1)


class ContentSubmissionRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    content_type: ContentType = "social_media"
    content_text: str = ""
    asset_type: AssetType = "text"
    campaign_id: Optional[str] = None
    workspace_id: Optional[str] = None
    upload_id: Optional[str] = None
    source_url: Optional[str] = None
    page_texts: Optional[List[str]] = None
    transcript_segments: Optional[List[TranscriptSegmentIn]] = None
    save_as_draft: bool = False


class FindingOut(BaseModel):
    id: str
    audit_run_id: str
    version_id: str
    rule_id: Optional[str] = None
    fact_id: Optional[str] = None
    title: str
    category: str
    severity: SeverityType
    affected_text: str
    start_index: int
    end_index: int
    explanation: str
    supporting_evidence: Optional[str] = None
    source_reference: Optional[str] = None
    source_url: Optional[str] = None
    suggested_correction: Optional[str] = None
    confidence_score: float
    page_number: Optional[int] = None
    timestamp_seconds: Optional[float] = None
    location_label: Optional[str] = None
    frame_url: Optional[str] = None
    source_type: Optional[str] = None
    evidence_status: str = "potential_violation"
    status: FindingStatus
    dismissal_reason: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FindingActionRequest(BaseModel):
    action: Literal["accept", "dismiss", "edit"]
    custom_correction: Optional[str] = None
    dismissal_reason: Optional[str] = None


class CorrectionSuggestionRequest(BaseModel):
    reviewer_notes: Optional[str] = Field(default=None, max_length=600)


class CorrectionCitationOut(BaseModel):
    kind: Literal["brand_rule", "approved_fact"]
    id: str
    label: str
    detail: Optional[str] = None
    source_reference: Optional[str] = None


class CorrectionSuggestionOut(BaseModel):
    finding_id: str
    document_id: str
    version_id: str
    version_number: int
    mode: Literal["ai", "rule_based"]
    provider: Optional[str] = None
    model: Optional[str] = None
    provider_error: Optional[Dict[str, Any]] = None
    original_text: str
    original_is_exact_span: bool = False
    suggested_text: str = ""
    rationale: str = ""
    citations: List[CorrectionCitationOut] = []
    cautions: List[str] = []
    limitations: List[str] = []
    evidence_status: str = "potential_violation"
    location_label: Optional[str] = None
    source_reference: Optional[str] = None


class AuditRunOut(BaseModel):
    id: str
    document_id: str
    version_id: str
    overall_score: int
    risk_level: RiskLevel
    verification_status: VerificationStatus = "verified"
    total_findings: int
    resolved_findings: int
    model_used: str
    execution_time_ms: int
    risk_factors: List[Dict[str, Any]] = []
    score_method: Optional[str] = None
    extraction_notes: Optional[str] = None
    created_at: datetime
    findings: List[FindingOut] = []

    model_config = ConfigDict(from_attributes=True)


class ContentVersionOut(BaseModel):
    id: str
    document_id: str
    version_number: int
    content_text: str
    change_summary: Optional[str] = None
    page_texts: List[str] = []
    transcript_segments: List[Dict[str, Any]] = []
    asset_metadata: Dict[str, Any] = {}
    content_hash: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: datetime
    audit_summary: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(from_attributes=True)


class ApprovalSummaryOut(BaseModel):
    decision: str
    reviewer_name: str
    version_id: str
    version_number: int
    created_at: datetime
    feedback: Optional[str] = None


class ContentDocumentOut(BaseModel):
    id: str
    workspace_id: str
    campaign_id: Optional[str] = None
    file_id: Optional[str] = None
    title: str
    content_type: str
    asset_type: str = "text"
    source_url: Optional[str] = None
    file_hash: Optional[str] = None
    status: DocumentStatus
    current_version_number: int
    approved_version_id: Optional[str] = None
    submitted_at: Optional[datetime] = None
    submitted_by_name: Optional[str] = None
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    is_demo: bool = False
    created_at: datetime
    updated_at: datetime
    versions_count: int = 0
    comments_count: int = 0
    current_version: Optional[ContentVersionOut] = None
    latest_audit: Optional[AuditRunOut] = None
    approval_stale: bool = False
    latest_decision: Optional[ApprovalSummaryOut] = None
    assignment: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(from_attributes=True)


class UploadedFileOut(BaseModel):
    id: str
    original_name: str
    mime_type: Optional[str] = None
    size_bytes: int
    kind: str
    extraction_status: str
    extraction_message: Optional[str] = None
    page_count: Optional[int] = None
    has_viewable_file: bool = True
    page_texts: List[str] = []
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CreateNewVersionRequest(BaseModel):
    content_text: str = Field(..., min_length=1)
    change_summary: Optional[str] = "Revised after review"
    page_texts: Optional[List[str]] = None
    transcript_segments: Optional[List[TranscriptSegmentIn]] = None


class OverviewStatsOut(BaseModel):
    total_audits: int
    pending_reviews: int
    high_severity_findings: int
    approved_content: int
    compliance_rate_percent: float
    recent_activity: List[Any] = []
    top_recurring_issues: List[Any] = []


class ContentProvenancePassportOut(BaseModel):
    document_id: str
    title: str
    asset_type: str
    current_version_number: int
    file_hash: str
    previous_version_hash: Optional[str] = None
    is_tampered_or_changed: bool = False
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    verification_status: str
    audit_history_timeline: List[Dict[str, Any]] = []


class ReviewSummaryVersionOut(BaseModel):
    current_version_number: int
    version_id: Optional[str] = None
    approved_version_id: Optional[str] = None
    approval_stale: bool = False
    is_latest_audited: bool = False


class ReviewSummaryAuditOut(BaseModel):
    has_run: bool
    overall_score: Optional[int] = None
    risk_level: Optional[str] = None
    verification_status: str
    score_method: Optional[str] = None
    total_findings: int = 0
    open_findings: int = 0
    resolved_findings: int = 0
    unresolved_high_priority: int = 0
    awaiting_verification: int = 0
    evidence_limitations: int = 0
    suggested_corrections_available: int = 0
    corrections_awaiting_review: int = 0


class ReviewSummaryApprovalOut(BaseModel):
    decisions_count: int = 0
    latest_decision: Optional[str] = None
    latest_decision_reviewer: Optional[str] = None
    latest_decision_version_number: Optional[int] = None
    latest_decision_at: Optional[datetime] = None
    latest_feedback: Optional[str] = None


class ReviewSummaryOut(BaseModel):
    document_id: str
    title: str
    asset_type: str
    content_type: str
    status: DocumentStatus
    version: ReviewSummaryVersionOut
    audit: ReviewSummaryAuditOut
    groups: List[Dict[str, Any]] = []
    approval: ReviewSummaryApprovalOut
    comments_count: int = 0
    outstanding_actions: List[Dict[str, Any]] = []
    data_sources: List[str] = []
