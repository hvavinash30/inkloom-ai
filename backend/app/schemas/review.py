from datetime import datetime
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

DecisionType = Literal["approved", "rejected", "changes_requested"]


class ReviewCommentCreate(BaseModel):
    comment_text: str = Field(..., min_length=2, max_length=5000)
    visibility: Literal["shared", "internal"] = "shared"
    version_id: Optional[str] = None


class ReviewCommentOut(BaseModel):
    id: str
    document_id: str
    version_id: Optional[str] = None
    author_name: str
    author_role: Optional[str] = None
    visibility: str
    comment_text: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ApprovalDecisionCreate(BaseModel):
    decision: DecisionType
    version_id: str
    feedback: Optional[str] = None
    override_reason: Optional[str] = Field(default=None, max_length=2000)


class ApprovalDecisionOut(BaseModel):
    id: str
    document_id: str
    version_id: str
    version_number: Optional[int] = None
    reviewer_name: str
    reviewer_role: Optional[str] = None
    decision: DecisionType
    feedback: Optional[str] = None
    decision_metadata: Dict[str, Any] = {}
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SubmitForReviewRequest(BaseModel):
    notes: Optional[str] = Field(
        default="Submitted for brand review",
        max_length=2000,
    )


class ReviewAssignmentCreate(BaseModel):
    assignee_id: Optional[str] = None
    instructions: Optional[str] = Field(default=None, max_length=2000)


class ReviewAssignmentOut(BaseModel):
    id: str
    document_id: str
    version_id: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: str
    assignee_role: Optional[str] = None
    assigned_by_name: str
    status: str
    instructions: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
