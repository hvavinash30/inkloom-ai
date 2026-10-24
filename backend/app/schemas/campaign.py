from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class CampaignBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = None
    target_audience: Optional[str] = None
    status: Literal["active", "completed", "archived"] = "active"
    launch_target: Optional[datetime] = None


class CampaignCreate(CampaignBase):
    workspace_id: Optional[str] = None


class CampaignUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    description: Optional[str] = None
    target_audience: Optional[str] = None
    status: Optional[Literal["active", "completed", "archived"]] = None
    launch_target: Optional[datetime] = None


class CampaignConflictOut(BaseModel):
    id: str
    campaign_id: str
    claim_type: str
    topic: str
    asset_a_id: Optional[str] = None
    asset_a_title: str
    asset_a_value: str
    asset_a_location: Optional[str] = None
    asset_b_id: Optional[str] = None
    asset_b_title: str
    asset_b_value: str
    asset_b_location: Optional[str] = None
    approved_value: Optional[str] = None
    source_reference: Optional[str] = None
    evidence_note: Optional[str] = None
    status: Literal["unresolved", "resolved"]
    resolution_notes: Optional[str] = None
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    is_demo: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConflictResolveRequest(BaseModel):
    resolved_value: str = Field(..., min_length=1, max_length=255)
    resolution_notes: str = Field(..., min_length=3, max_length=2000)


class CampaignAssetOut(BaseModel):
    id: str
    title: str
    asset_type: str
    status: str
    current_version_number: int
    updated_at: datetime
    created_by_name: Optional[str] = None
    latest_score: Optional[int] = None
    risk_level: Optional[str] = None
    approval_stale: bool = False

    model_config = ConfigDict(from_attributes=True)


class ReadinessCheck(BaseModel):
    key: str
    label: str
    status: Literal["passed", "needs_attention", "manual", "not_applicable"]
    detail: str


class CampaignReadinessOut(BaseModel):
    campaign_id: str
    campaign_name: str
    result: str
    summary: str
    checks: List[ReadinessCheck]
    disclaimer: str


class CampaignOut(CampaignBase):
    id: str
    workspace_id: str
    slug: str
    created_by_name: Optional[str] = None
    is_demo: bool = False
    created_at: datetime
    updated_at: datetime
    assets_count: int = 0
    conflicts_count: int = 0
    conflicts: List[CampaignConflictOut] = []
    assets: List[CampaignAssetOut] = []
    readiness: Optional[CampaignReadinessOut] = None

    model_config = ConfigDict(from_attributes=True)


class GraphNode(BaseModel):
    id: str
    label: str
    type: Literal["campaign", "asset", "approved_fact", "conflict"]
    status: Optional[str] = None
    metadata: Dict[str, Any] = {}


class GraphLink(BaseModel):
    source: str
    target: str
    relationship: str


class CampaignGraphDataOut(BaseModel):
    campaign_id: str
    campaign_name: str
    nodes: List[GraphNode]
    links: List[GraphLink]
    conflicts_summary: List[Dict[str, Any]]
    detected_now: int = 0


class AttachAssetRequest(BaseModel):
    document_id: str
