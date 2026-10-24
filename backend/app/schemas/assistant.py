from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class AssistantChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    page_context: Optional[str] = "home"
    document_id: Optional[str] = None
    campaign_id: Optional[str] = None
    audit_run_id: Optional[str] = None
    finding_id: Optional[str] = None


class AssistantActionSuggestion(BaseModel):
    action_type: str  # navigate, open_document, open_finding, open_campaign
    label: str
    route: Optional[str] = None
    target_id: Optional[str] = None


class AssistantGroundingItem(BaseModel):
    kind: str  # approved_fact, brand_rule, audit_finding, campaign_conflict, record
    title: str
    detail: str
    source_reference: Optional[str] = None


class AssistantChatResponse(BaseModel):
    reply: str
    mode: str  # grounded_llm, rule_based
    verification: str  # verified_from_workspace_records, general_guidance, unable_to_verify
    verification_note: str
    grounding: List[AssistantGroundingItem] = []
    suggested_actions: List[AssistantActionSuggestion] = []
    limitations: List[str] = []
    diagnostic_info: Optional[Dict[str, Any]] = None
