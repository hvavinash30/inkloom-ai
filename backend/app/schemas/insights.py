from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class ViolationPattern(BaseModel):
    category: str
    count: int
    severity: str
    sample_affected_text: str
    recommendation: str


class InsightsOut(BaseModel):
    generated_at: str
    is_demo: bool
    total_audits_evaluated: int
    documents_evaluated: int
    audits_all_time: int
    average_score: float
    violations_by_category: Dict[str, int]
    violations_by_severity: Dict[str, int]
    top_violated_rules: List[Dict[str, Any]]
    recurring_patterns: List[ViolationPattern]
    governance_health_status: str
    review_turnaround_hours: Optional[float]
    turnaround_sample_size: int
    unresolved_campaign_conflicts: int
    campaigns_with_unresolved_conflicts: int
    outdated_facts_count: int
    recurring_violations: List[Dict[str, Any]]
    overridden_rules: List[Dict[str, Any]]
    facts_needing_verification: Dict[str, Any]
    unclear_guidelines: Dict[str, Any]
    risk_signal_counts: Dict[str, int]
    metric_methods: Dict[str, Any]
    reporting_window: Dict[str, Any]
    outstanding_actions_count: int
    score_distribution: List[Dict[str, Any]]
    filter_options: Dict[str, List[Any]]
    applied_filters: Dict[str, Any]
    scope_note: str
