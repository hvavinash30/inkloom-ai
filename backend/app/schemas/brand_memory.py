from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class MemoryConflictOut(BaseModel):
    id: str
    conflict_type: str
    title: str
    description: str
    severity: str
    entity_a_id: Optional[str] = None
    entity_a_type: str
    entity_a_name: str
    entity_b_id: Optional[str] = None
    entity_b_type: str
    entity_b_name: str
    affected_assets: List[Dict[str, str]] = []
    recommended_action: str
    resolution_options: List[str] = []


class RuleSuggestionOut(BaseModel):
    id: str
    title: str
    rationale: str
    affected_text: str
    occurrences: int
    category: str
    severity: str
    example_document_ids: List[str] = []
    proposed_pattern: Optional[str] = None
    proposed_guidance: Optional[str] = None
    proposed_rule_type: str = "prohibited_phrase"


class RuleSuggestionCreateRequest(BaseModel):
    title: str
    rationale: str
    affected_text: str
    severity: str = "medium"
    category: str = "policy_violation"
    proposed_pattern: str
    proposed_guidance: Optional[str] = None
    proposed_rule_type: str = "prohibited_phrase"


class ImpactItem(BaseModel):
    document_id: str
    title: str
    asset_type: str
    status: str
    version_number: int
    match_count: int
    snippet: str
    reason: str


class ImpactAnalysisOut(BaseModel):
    entity_type: str
    entity_id: str
    entity_name: str
    entity_summary: str
    previous_value: Optional[str] = None
    current_value: Optional[str] = None
    items: List[ImpactItem] = []
    scanned_documents: int
    note: str


class ResolveMemoryConflictRequest(BaseModel):
    resolution: str
    notes: str


class SimulateRuleRequest(BaseModel):
    proposed_pattern: str
    proposed_severity: str = "high"
