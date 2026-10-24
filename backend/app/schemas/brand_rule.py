from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

RuleType = Literal[
    "prohibited_phrase",
    "required_terminology",
    "tone_guideline",
    "claim_restriction",
    "product_naming",
]
SeverityType = Literal["low", "medium", "high", "critical"]
RuleStatus = Literal["active", "draft", "archived"]


class BrandRuleBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    rule_type: RuleType
    description: Optional[str] = None
    pattern_or_phrase: str = Field(..., min_length=1)
    trigger_phrase: Optional[str] = None
    replacement_or_guidance: Optional[str] = None
    severity: SeverityType = "medium"
    is_active: bool = True
    status: RuleStatus = "active"
    owner_name: Optional[str] = None
    effective_date: Optional[datetime] = None


class BrandRuleCreate(BrandRuleBase):
    workspace_id: Optional[str] = None


class BrandRuleUpdate(BaseModel):
    name: Optional[str] = None
    rule_type: Optional[RuleType] = None
    description: Optional[str] = None
    pattern_or_phrase: Optional[str] = None
    trigger_phrase: Optional[str] = None
    replacement_or_guidance: Optional[str] = None
    severity: Optional[SeverityType] = None
    is_active: Optional[bool] = None
    status: Optional[RuleStatus] = None
    owner_name: Optional[str] = None
    effective_date: Optional[datetime] = None


class BrandRuleOut(BrandRuleBase):
    id: str
    workspace_id: str
    version: int = 1
    last_reviewed_at: Optional[datetime] = None
    is_demo: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
