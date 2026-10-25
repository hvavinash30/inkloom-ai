from datetime import datetime
from typing import Annotated, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ApprovedClaimInput(BaseModel):
    claim: str = Field(..., min_length=2, max_length=300)
    value: str = Field(..., min_length=1, max_length=500)
    category: str = Field(default="Approved claim", min_length=2, max_length=100)


class TerminologyInput(BaseModel):
    preferred: str = Field(..., min_length=1, max_length=120)
    avoid: str = Field(..., min_length=1, max_length=120)


class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    owner_name: str = Field(..., min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)
    industry: Optional[str] = Field(default=None, max_length=120)
    audience: Optional[str] = Field(default=None, max_length=300)
    voice: Optional[str] = Field(default=None, max_length=1000)
    guidelines: Optional[str] = Field(default=None, max_length=2000)
    approved_claims: List[ApprovedClaimInput] = Field(default_factory=list, max_length=25)
    restricted_claims: List[Annotated[str, Field(min_length=2, max_length=200)]] = Field(
        default_factory=list, max_length=25
    )
    terminology: List[TerminologyInput] = Field(default_factory=list, max_length=25)


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)


class WorkspaceCounts(BaseModel):
    documents: int = 0
    rules: int = 0
    facts: int = 0
    campaigns: int = 0


class WorkspaceOut(BaseModel):
    id: str
    name: str
    slug: str
    description: Optional[str] = None
    is_demo: bool = False
    counts: WorkspaceCounts = Field(default_factory=WorkspaceCounts)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
