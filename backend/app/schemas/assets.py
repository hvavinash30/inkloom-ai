from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class BrandAssetCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    asset_type: Literal["logo", "color", "typography", "image", "template"]
    value: Optional[str] = None
    notes: Optional[str] = None
    upload_id: Optional[str] = None


class BrandAssetUpdate(BaseModel):
    name: Optional[str] = None
    value: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[Literal["active", "archived"]] = None


class BrandAssetOut(BaseModel):
    id: str
    name: str
    asset_type: str
    value: Optional[str] = None
    notes: Optional[str] = None
    file_id: Optional[str] = None
    status: str
    owner_name: Optional[str] = None
    is_demo: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ContrastCheckRequest(BaseModel):
    foreground: str = Field(..., pattern=r"^#?[0-9a-fA-F]{6}$")
    background: str = Field(..., pattern=r"^#?[0-9a-fA-F]{6}$")
    text_size: Literal["normal", "large"] = "normal"


class ContrastCheckResult(BaseModel):
    foreground: str
    background: str
    ratio: float
    normal_text_passes: bool
    large_text_passes: bool
    required_ratio: float
    passes_selected_requirement: bool
    note: str


class ResearchRecordCreate(BaseModel):
    section: Literal["literature", "survey", "interviews", "competitor", "validation", "traceability"]
    title: str = Field(..., min_length=2, max_length=255)
    status: Literal["planned", "in_progress", "completed", "validated"] = "planned"
    summary: Optional[str] = None
    details: Dict[str, Any] = {}
    sources: List[Dict[str, Any]] = []


class ResearchRecordUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[Literal["planned", "in_progress", "completed", "validated"]] = None
    summary: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    sources: Optional[List[Dict[str, Any]]] = None
    owner_name: Optional[str] = None


class ResearchRecordOut(BaseModel):
    id: str
    section: str
    title: str
    status: str
    summary: Optional[str] = None
    details: Dict[str, Any] = {}
    sources: List[Dict[str, Any]] = []
    owner_name: Optional[str] = None
    is_demo: bool = False
    created_at: datetime
    updated_at: datetime


class EvaluationCaseOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    case_type: str
    input_payload: Dict[str, Any] = {}
    expected_outcome: Dict[str, Any] = {}
    expected_summary: Optional[str] = None
    version: int
    is_demo: bool = False
    last_run: Optional[Dict[str, Any]] = None


class EvaluationRunOut(BaseModel):
    id: str
    case_id: str
    case_name: Optional[str] = None
    status: str
    findings_count: int
    matched_categories: List[str] = []
    actual_location: Optional[str] = None
    details: Dict[str, Any] = {}
    executed_at: datetime


class EvaluationSummaryOut(BaseModel):
    executed_cases: int
    passed: int
    failed: int
    errors: int
    pass_rate_percent: float
    note: str
    runs: List[EvaluationRunOut] = []
    cases: List[EvaluationCaseOut] = []
