from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

FactStatus = Literal["verified", "needs_review", "expired", "draft"]


class ApprovedFactBase(BaseModel):
    category: str = Field(..., min_length=2, max_length=100)
    claim_statement: str = Field(..., min_length=3)
    approved_value: str = Field(..., min_length=1)
    source_reference: str = Field(..., min_length=2, max_length=255)
    source_url: Optional[str] = None
    product: Optional[str] = None
    is_active: bool = True
    status: FactStatus = "verified"
    owner_name: Optional[str] = None
    next_review_at: Optional[datetime] = None


class ApprovedFactCreate(ApprovedFactBase):
    workspace_id: Optional[str] = None


class ApprovedFactUpdate(BaseModel):
    category: Optional[str] = None
    claim_statement: Optional[str] = None
    approved_value: Optional[str] = None
    source_reference: Optional[str] = None
    source_url: Optional[str] = None
    product: Optional[str] = None
    is_active: Optional[bool] = None
    status: Optional[FactStatus] = None
    owner_name: Optional[str] = None
    next_review_at: Optional[datetime] = None


class ApprovedFactOut(ApprovedFactBase):
    id: str
    workspace_id: str
    version: int = 1
    last_reviewed_at: Optional[datetime] = None
    is_demo: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
