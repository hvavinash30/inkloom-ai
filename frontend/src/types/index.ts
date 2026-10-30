export type Role = 'creator' | 'reviewer' | 'admin';

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type RiskLevel = 'clean' | 'low' | 'medium' | 'high' | 'critical';
export type DocumentStatus =
  | 'draft'
  | 'audited'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'changes_requested';
export type AssetType = 'text' | 'pdf' | 'image' | 'video' | 'audio';
export type ContentType =
  | 'blog_post'
  | 'social_media'
  | 'press_release'
  | 'landing_page'
  | 'product_copy'
  | 'ad_copy'
  | 'email_campaign'
  | 'video_script'
  | 'other';
export type DecisionType = 'approved' | 'rejected' | 'changes_requested';
export type FindingStatus = 'open' | 'accepted' | 'edited' | 'dismissed';
export type VerificationStatus = 'verified' | 'partially_verified' | 'unable_to_verify';
export type ExtractionStatus = 'processed' | 'needs_ocr' | 'needs_transcription' | 'unsupported' | 'no_text' | 'error';

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  title: string;
  role: Role;
  is_demo: boolean;
}

export interface WorkspaceCounts {
  documents: number;
  rules: number;
  facts: number;
  campaigns: number;
}

export interface Workspace {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  is_demo: boolean;
  counts?: Partial<WorkspaceCounts>;
  created_at?: string;
  updated_at?: string;
  mode_notice?: string;
}

export interface WorkspaceCreatePayload {
  name: string;
  owner_name: string;
  description?: string;
  industry?: string;
  audience?: string;
  voice?: string;
  guidelines?: string;
  approved_claims: { claim: string; value: string; category?: string }[];
  restricted_claims: string[];
  terminology: { preferred: string; avoid: string }[];
}

export interface SessionPayload {
  active_user: UserProfile;
  role: Role;
  capabilities: string[];
  users: UserProfile[];
  workspace: Workspace;
  workspaces: Workspace[];
  demo_mode: boolean;
  auth?: {
    mode: string;
    session_id: string;
    issued_at: string;
    expires_at: string;
    is_demo: boolean;
  };
}

export interface TranscriptSegment {
  timestamp_seconds: number;
  text: string;
  [key: string]: unknown;
}

export interface CorrectionCitation {
  kind: 'brand_rule' | 'approved_fact';
  id: string;
  label: string;
  detail?: string | null;
  source_reference?: string | null;
}

export interface CorrectionSuggestion {
  finding_id: string;
  document_id: string;
  version_id: string;
  version_number: number;
  mode: 'ai' | 'rule_based';
  provider?: string | null;
  model?: string | null;
  provider_error?: { kind: string; message: string } | null;
  original_text: string;
  original_is_exact_span: boolean;
  suggested_text: string;
  rationale: string;
  citations: CorrectionCitation[];
  cautions: string[];
  limitations: string[];
  evidence_status: string;
  location_label?: string | null;
  source_reference?: string | null;
}

export interface ReviewSummaryGroup {
  id: string;
  title: string;
  count: number;
  severities: string[];
  finding_ids: string[];
}

export interface ReviewSummary {
  document_id: string;
  title: string;
  asset_type: string;
  content_type: string;
  status: DocumentStatus;
  version: {
    current_version_number: number;
    version_id?: string | null;
    approved_version_id?: string | null;
    approval_stale: boolean;
    is_latest_audited: boolean;
  };
  audit: {
    has_run: boolean;
    overall_score?: number | null;
    risk_level?: string | null;
    verification_status: VerificationStatus;
    score_method?: string | null;
    total_findings: number;
    open_findings: number;
    resolved_findings: number;
    unresolved_high_priority: number;
    awaiting_verification: number;
    evidence_limitations: number;
    suggested_corrections_available: number;
    corrections_awaiting_review: number;
  };
  groups: ReviewSummaryGroup[];
  approval: {
    decisions_count: number;
    latest_decision?: string | null;
    latest_decision_reviewer?: string | null;
    latest_decision_version_number?: number | null;
    latest_decision_at?: string | null;
    latest_feedback?: string | null;
  };
  comments_count: number;
  outstanding_actions: { id: string; label: string; description: string }[];
  data_sources: string[];
}

export interface Finding {
  id: string;
  audit_run_id: string;
  version_id: string;
  rule_id?: string | null;
  fact_id?: string | null;
  title: string;
  category: string;
  severity: Severity;
  affected_text: string;
  start_index: number;
  end_index: number;
  explanation: string;
  supporting_evidence?: string | null;
  source_reference?: string | null;
  source_url?: string | null;
  suggested_correction?: string | null;
  confidence_score: number;
  page_number?: number | null;
  timestamp_seconds?: number | null;
  location_label?: string | null;
  frame_url?: string | null;
  source_type?: 'spoken' | 'on_screen' | null;
  evidence_status: string;
  status: FindingStatus;
  dismissal_reason?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RiskFactor {
  label: string;
  severity: Severity;
  count: number;
  deduction_per_item: number;
  deduction: number;
}

export interface AuditRun {
  id: string;
  document_id: string;
  version_id: string;
  overall_score: number;
  risk_level: RiskLevel;
  verification_status: VerificationStatus;
  total_findings: number;
  resolved_findings: number;
  model_used: string;
  execution_time_ms: number;
  risk_factors: RiskFactor[];
  score_method?: string | null;
  extraction_notes?: string | null;
  created_at: string;
  findings: Finding[];
}

export interface ContentVersion {
  id: string;
  document_id: string;
  version_number: number;
  content_text: string;
  change_summary?: string | null;
  page_texts: string[];
  transcript_segments: TranscriptSegment[];
  asset_metadata: Record<string, unknown>;
  content_hash?: string | null;
  created_by_name?: string | null;
  created_at: string;
  audit_summary?: {
    id: string;
    overall_score: number;
    risk_level: RiskLevel;
    total_findings: number;
    resolved_findings: number;
    verification_status: VerificationStatus;
    created_at: string;
  } | null;
}

export interface LatestDecision {
  decision: DecisionType;
  reviewer_name: string;
  version_id: string;
  version_number: number;
  created_at: string;
  feedback?: string | null;
}

export interface ReviewAssignment {
  id: string;
  document_id: string;
  version_id?: string | null;
  assignee_id?: string | null;
  assignee_name: string;
  assignee_role?: string | null;
  assigned_by_name: string;
  status: string;
  instructions?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentDocument {
  id: string;
  workspace_id: string;
  campaign_id?: string | null;
  file_id?: string | null;
  title: string;
  content_type: string;
  asset_type: AssetType;
  source_url?: string | null;
  file_hash?: string | null;
  status: DocumentStatus;
  current_version_number: number;
  approved_version_id?: string | null;
  submitted_at?: string | null;
  submitted_by_name?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  versions_count: number;
  comments_count: number;
  current_version?: ContentVersion | null;
  latest_audit?: AuditRun | null;
  approval_stale: boolean;
  latest_decision?: LatestDecision | null;
  assignment?: ReviewAssignment | null;
}

export interface DocumentSummary {
  id: string;
  title: string;
  asset_type: AssetType;
  content_type: string;
  status: DocumentStatus;
  current_version_number: number;
  created_by_name?: string | null;
  updated_at: string;
  submitted_at?: string | null;
  latest_score: number | null;
  risk_level: RiskLevel | null;
  verification_status: VerificationStatus | null;
  total_findings: number | null;
  approval_stale: boolean;
}

export interface DashboardData {
  workspace: { id: string; name: string; is_demo: boolean };
  role: Role;
  user: { id: string; name: string; title: string };
  stats: {
    documents: number;
    scored_documents: number;
    average_score: number;
    average_risk_band: RiskLevel | null;
    pending_reviews: number;
    open_high_findings: number;
    approved_content: number;
    drafts: number;
    unresolved_conflicts: number;
    stale_approvals: number;
    outdated_facts: number;
  };
  priority_items: {
    kind: string;
    title: string;
    description: string;
    route: string;
    severity: Severity | string;
  }[];
  recent_documents: DocumentSummary[];
  review_queue: DocumentSummary[];
  recent_activity: {
    id: string;
    document_id: string;
    event_type: string;
    actor: string;
    description: string;
    created_at: string;
  }[];
  recent_scores: {
    document_id: string;
    title: string;
    score: number;
    risk_level: RiskLevel;
    status: DocumentStatus;
    audited_at: string | null;
    updated_at: string;
  }[];
  campaigns: { id: string; name: string; status: string; assets_count: number }[];
  integrations: {
    llm_configured: boolean;
    ocr_configured: boolean;
    transcription_configured: boolean;
    note: string;
  };
  demo_mode: boolean;
  capabilities: string[];
}

export interface OverviewStats {
  total_audits: number;
  pending_reviews: number;
  high_severity_findings: number;
  approved_content: number;
  compliance_rate_percent: number;
  recent_activity: {
    id: string;
    document_id: string;
    version_id?: string | null;
    user_name: string;
    event_type: string;
    description: string;
    created_at: string;
  }[];
  top_recurring_issues: {
    title: string;
    severity: Severity;
    category: string;
    category_label: string;
    occurrences: number;
  }[];
}

export interface HistoryEvent {
  id: string;
  document_id: string;
  version_id?: string | null;
  user_name: string;
  event_type: string;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CompareResponse {
  document_id: string;
  from_version: ContentVersion;
  to_version: ContentVersion;
  from_audit: { overall_score: number; risk_level: RiskLevel; total_findings: number } | null;
  to_audit: { overall_score: number; risk_level: RiskLevel; total_findings: number } | null;
  changed: boolean;
  added_lines: number;
  removed_lines: number;
  diff: string[];
  diff_truncated: boolean;
  note: string;
}

export interface Provenance {
  document_id: string;
  title: string;
  asset_type: AssetType;
  current_version_number: number;
  file_hash: string;
  previous_version_hash?: string | null;
  is_tampered_or_changed: boolean;
  approved_by?: string | null;
  approved_at?: string | null;
  verification_status: VerificationStatus;
  audit_history_timeline: {
    id: string;
    event_type: string;
    description: string;
    actor: string;
    version_id?: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }[];
}

export interface ReviewComment {
  id: string;
  document_id: string;
  version_id?: string | null;
  author_name: string;
  author_role?: string | null;
  visibility: 'shared' | 'internal';
  comment_text: string;
  created_at: string;
}

export interface ApprovalDecision {
  id: string;
  document_id: string;
  version_id: string;
  version_number?: number | null;
  reviewer_name: string;
  reviewer_role?: string | null;
  decision: DecisionType;
  feedback?: string | null;
  decision_metadata: Record<string, unknown>;
  created_at: string;
}

export interface CampaignConflict {
  id: string;
  campaign_id: string;
  claim_type: string;
  topic: string;
  asset_a_id?: string | null;
  asset_a_title: string;
  asset_a_value: string;
  asset_a_location?: string | null;
  asset_b_id?: string | null;
  asset_b_title: string;
  asset_b_value: string;
  asset_b_location?: string | null;
  approved_value?: string | null;
  source_reference?: string | null;
  evidence_note?: string | null;
  status: 'unresolved' | 'resolved';
  resolution_notes?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  is_demo: boolean;
  created_at: string;
}

export interface CampaignAsset {
  id: string;
  title: string;
  asset_type: AssetType;
  status: DocumentStatus;
  current_version_number: number;
  updated_at: string;
  created_by_name?: string | null;
  latest_score: number | null;
  risk_level: RiskLevel | null;
  approval_stale: boolean;
}

export interface ReadinessCheck {
  key: string;
  label: string;
  status: 'passed' | 'needs_attention' | 'manual' | 'not_applicable';
  detail: string;
}

export interface CampaignReadiness {
  campaign_id: string;
  campaign_name: string;
  result: string;
  summary: string;
  checks: ReadinessCheck[];
  disclaimer: string;
}

export interface Campaign {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description?: string | null;
  status: 'active' | 'completed' | 'archived';
  target_audience?: string | null;
  launch_target?: string | null;
  created_by_name?: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  assets_count: number;
  conflicts_count: number;
  conflicts: CampaignConflict[];
  assets: CampaignAsset[];
  readiness?: CampaignReadiness | null;
}

export interface CampaignGraph {
  campaign_id: string;
  campaign_name: string;
  nodes: {
    id: string;
    label: string;
    type: 'campaign' | 'asset' | 'approved_fact' | 'conflict';
    status?: string | null;
    metadata: Record<string, unknown>;
  }[];
  links: { source: string; target: string; relationship: string }[];
  conflicts_summary: Record<string, unknown>[];
  detected_now: number;
}

export interface BrandRule {
  id: string;
  workspace_id: string;
  name: string;
  rule_type: string;
  description?: string | null;
  pattern_or_phrase: string;
  trigger_phrase?: string | null;
  replacement_or_guidance?: string | null;
  severity: Severity;
  is_active: boolean;
  status: 'active' | 'draft' | 'archived';
  owner_name?: string | null;
  effective_date?: string | null;
  version: number;
  last_reviewed_at?: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApprovedFact {
  id: string;
  workspace_id: string;
  category: string;
  claim_statement: string;
  approved_value: string;
  source_reference: string;
  source_url?: string | null;
  product?: string | null;
  is_active: boolean;
  status: 'verified' | 'needs_review' | 'expired' | 'draft';
  owner_name?: string | null;
  next_review_at?: string | null;
  version: number;
  last_reviewed_at?: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface BrandAsset {
  id: string;
  name: string;
  asset_type: 'logo' | 'color' | 'typography' | 'image' | 'template';
  value?: string | null;
  notes?: string | null;
  file_id?: string | null;
  status: 'active' | 'archived';
  owner_name?: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContrastResult {
  foreground: string;
  background: string;
  ratio: number;
  normal_text_passes: boolean;
  large_text_passes: boolean;
  required_ratio: number;
  passes_selected_requirement: boolean;
  note: string;
}

export interface MemoryConflict {
  id: string;
  conflict_type: string;
  title: string;
  description: string;
  severity: Severity;
  entity_a_id?: string | null;
  entity_a_type: string;
  entity_a_name: string;
  entity_b_id?: string | null;
  entity_b_type: string;
  entity_b_name: string;
  affected_assets: { document_id: string; title: string; reason: string }[];
  recommended_action: string;
  resolution_options: string[];
}

export interface RuleSuggestion {
  id: string;
  title: string;
  rationale: string;
  affected_text: string;
  occurrences: number;
  category: string;
  severity: Severity;
  example_document_ids: string[];
  proposed_pattern?: string | null;
  proposed_guidance?: string | null;
  proposed_rule_type: string;
}

export interface ImpactItem {
  document_id: string;
  title: string;
  asset_type: AssetType;
  status: DocumentStatus;
  version_number: number;
  match_count: number;
  snippet: string;
  reason: string;
}

export interface ImpactAnalysis {
  entity_type: string;
  entity_id: string;
  entity_name: string;
  entity_summary: string;
  previous_value?: string | null;
  current_value?: string | null;
  items: ImpactItem[];
  scanned_documents: number;
  note: string;
}

export interface InsightsData {
  generated_at: string;
  is_demo: boolean;
  total_audits_evaluated: number;
  documents_evaluated: number;
  audits_all_time: number;
  average_score: number;
  violations_by_category: Record<string, number>;
  violations_by_severity: Record<string, number>;
  top_violated_rules: {
    rule_id: string;
    rule_name: string;
    severity: Severity;
    rule_type: string;
    violations: number;
  }[];
  recurring_patterns: {
    category: string;
    count: number;
    severity: Severity;
    sample_affected_text: string;
    recommendation: string;
  }[];
  governance_health_status: string;
  review_turnaround_hours: number | null;
  turnaround_sample_size: number;
  unresolved_campaign_conflicts: number;
  campaigns_with_unresolved_conflicts: number;
  outdated_facts_count: number;
  outstanding_actions_count: number;
  score_distribution: { label: string; min: number; max: number; count: number }[];
  recurring_violations: {
    key: string;
    category: string;
    category_label: string;
    rule_id: string | null;
    rule_name: string;
    severity: Severity;
    finding_count: number;
    unique_documents: number;
    audit_run_count: number;
    sample_affected_text: string;
    documents: { id: string; title: string }[];
    first_seen: string | null;
    last_seen: string | null;
  }[];
  overridden_rules: {
    rule_id: string | null;
    rule_name: string;
    severity: Severity;
    override_count: number;
    unique_documents: number;
    rule_findings_in_scope: number;
    override_rate_percent: number | null;
    may_need_review: boolean;
    review_note: string;
    reasons: { reason: string; count: number; reviewer_name: string | null }[];
    last_overridden_at: string | null;
  }[];
  facts_needing_verification: {
    count: number;
    total_active_facts: number;
    items: {
      id: string;
      claim_statement: string;
      category: string;
      status: string;
      source_reference: string | null;
      next_review_at: string | null;
      owner_name: string | null;
      reasons: string[];
      reasons_count: number;
    }[];
    criteria: string[];
    method_note: string;
  };
  unclear_guidelines: {
    count: number;
    evaluated_rules: number;
    items: {
      id: string;
      name: string;
      rule_type: string;
      severity: Severity;
      pattern_or_phrase: string;
      signals: string[];
      signals_count: number;
      last_reviewed_at: string | null;
    }[];
    method_note: string;
  };
  risk_signal_counts: Record<string, number>;
  metric_methods: Record<
    string,
    {
      method: string;
      sample_size: number;
      time_range: { from: string | null; to: string | null };
    }
  >;
  reporting_window: {
    audit_runs_from: string | null;
    audit_runs_to: string | null;
    overrides_from: string | null;
    overrides_to: string | null;
  };
  filter_options: {
    content_types?: string[];
    asset_types?: string[];
    statuses?: string[];
    content_type?: string[];
    asset_type?: string[];
    status?: string[];
  };
  applied_filters: Record<string, unknown>;
  scope_note: string;
}

export interface ResearchSource {
  title: string;
  url?: string;
  note?: string;
  [key: string]: unknown;
}

export interface ResearchRecord {
  id: string;
  section: string;
  title: string;
  status: 'planned' | 'in_progress' | 'completed' | 'validated';
  summary?: string | null;
  details: Record<string, unknown>;
  sources: ResearchSource[];
  owner_name?: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ResearchResponse {
  section_labels: Record<string, string>;
  records: ResearchRecord[];
  note: string;
}

export interface EvaluationRun {
  id: string;
  case_id: string;
  case_name?: string | null;
  status: 'passed' | 'failed' | 'error';
  findings_count: number;
  matched_categories: string[];
  actual_location?: string | null;
  details: Record<string, unknown>;
  executed_at: string;
}

export interface EvaluationCase {
  id: string;
  name: string;
  description?: string | null;
  case_type: string;
  input_payload: Record<string, unknown>;
  expected_outcome: Record<string, unknown>;
  expected_summary?: string | null;
  version: number;
  is_demo: boolean;
  last_run?: EvaluationRun | null;
}

export interface EvaluationSummary {
  executed_cases: number;
  passed: number;
  failed: number;
  errors: number;
  pass_rate_percent: number;
  note: string;
  runs: EvaluationRun[];
  cases: EvaluationCase[];
}

export interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  title: string;
  role: Role;
  role_label: string;
  is_demo: boolean;
  created_at: string;
  stats: { documents: number; comments: number; decisions: number };
}

export interface RoleMatrixEntry {
  role: Role;
  label: string;
  description: string;
  capabilities: string[];
}

export interface OrgOverview {
  workspace: {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    is_demo: boolean;
    created_at: string;
  };
  stats: {
    members: number;
    creators: number;
    reviewers: number;
    admins: number;
    documents: number;
    active_rules: number;
    active_facts: number;
    campaigns: number;
    brand_assets: number;
  };
  role_matrix: RoleMatrixEntry[];
  demo_notice: string;
}

export interface TeamResponse {
  members: TeamMember[];
  role_matrix: RoleMatrixEntry[];
  notice: string;
}

export interface IntegrationStatus {
  key: string;
  name: string;
  configured: boolean;
  used_for_audits: boolean;
  env_vars: string[];
  status: string;
}

export interface IntegrationsResponse {
  integrations: IntegrationStatus[];
  limits: {
    max_upload_mb: number;
    max_video_upload_mb: number;
    max_pdf_pages: number;
    allowed_files: string;
  };
  counts: Record<string, number>;
  security_note: string;
}

export interface AssistantGrounding {
  kind: string;
  title: string;
  detail: string;
  source_reference?: string | null;
}

export interface AssistantAction {
  action_type: string;
  label: string;
  route?: string | null;
  target_id?: string | null;
}

export interface AssistantResponse {
  reply: string;
  mode: 'grounded_llm' | 'rule_based';
  verification: 'verified_from_workspace_records' | 'general_guidance' | 'unable_to_verify';
  verification_note: string;
  grounding: AssistantGrounding[];
  suggested_actions: AssistantAction[];
  limitations: string[];
  diagnostic_info?: Record<string, unknown> | null;
  provider?: string | null;
  ai_error?: string | null;
}

export interface AssistantRequest {
  message: string;
  page_context?: string;
  document_id?: string;
  campaign_id?: string;
  audit_run_id?: string;
  finding_id?: string;
}

export interface UploadOcrLine {
  page_number: number;
  text: string;
  confidence: number;
  bbox: number[];
}

export interface UploadOcrPage {
  page_number: number;
  line_count: number;
  mean_confidence: number;
}

export interface UploadOcrSummary {
  available: boolean;
  line_count: number;
  mean_confidence: number | null;
  pages: UploadOcrPage[];
  empty_pages: number[];
  lines: UploadOcrLine[];
}

export interface VideoStageState {
  status: string;
  message?: string | null;
  updated_at?: string | null;
  segment_count?: number;
  provider?: string | null;
  model?: string | null;
  frame_count?: number;
  frames_read?: number;
}

export interface VideoTranscriptState {
  status: string;
  message?: string | null;
  segment_count: number;
  text?: string | null;
  provider?: string | null;
  model?: string | null;
  language?: string | null;
}

export interface VideoFrame {
  timestamp_seconds: number;
  timestamp_label: string;
  text?: string;
  file_name?: string;
  line_count?: number;
  available?: boolean;
  url?: string | null;
}

export interface VideoConfig {
  transcription_configured: boolean;
  transcription_provider: string;
  transcription_model: string;
  transcription_reason: string;
  ocr_available: boolean;
  ocr_reason: string;
  ffmpeg: {
    available: boolean;
    source?: string;
    version?: string | null;
    message?: string;
  };
  frame_interval_seconds: number;
  max_frames: number;
  max_duration_seconds: number;
}

export type VideoExtractionStatus =
  | 'not_started'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'partial'
  | 'no_content'
  | 'failed'
  | 'canceled';

export interface VideoState {
  status: VideoExtractionStatus | string;
  message?: string | null;
  attempt: number;
  duration_seconds?: number | null;
  audio_present?: boolean | null;
  stages: Record<string, VideoStageState>;
  transcript: VideoTranscriptState;
  frames: VideoFrame[];
  frame_count: number;
  frames_read: number;
  onscreen_text?: string | null;
  can_retry: boolean;
  can_cancel: boolean;
  started_at?: string | null;
  finished_at?: string | null;
  updated_at?: string | null;
  config: VideoConfig;
}

export interface UploadRecord {
  id: string;
  original_name: string;
  mime_type?: string | null;
  size_bytes: number;
  kind: string;
  extraction_status: ExtractionStatus;
  extraction_message: string;
  page_count?: number | null;
  has_viewable_file: boolean;
  page_texts: string[];
  ocr?: UploadOcrSummary | null;
  video?: VideoState | null;
  created_at: string;
}

export interface StorageDatabaseReport {
  scheme: string;
  label: string;
  durable: boolean;
  driver_available: boolean;
  driver: string;
  note: string;
}

export interface StorageUploadsReport {
  mode: string;
  durable: boolean;
  writable: boolean;
  note: string;
}

export interface HealthData {
  status: string;
  service: string;
  version: string;
  database: string;
  database_error?: string | null;
  demo_mode: boolean;
  integrations: {
    audit_engine: string;
    llm_configured: boolean;
    llm_provider: string;
    llm_active_provider?: string;
    ocr_configured: boolean;
    ocr_provider?: string;
    ocr_reason?: string;
    transcription_configured: boolean;
  };
  transcription?: {
    configured: boolean;
    provider: string;
    model: string | null;
    language_hint: string | null;
    reason: string;
  };
  video?: {
    ffmpeg: {
      available: boolean;
      source: string;
      version: string | null;
      message: string;
    };
    frame_interval_seconds: number;
    max_frames: number;
    max_duration_seconds: number;
    processing_timeout_seconds: number;
    max_upload_mb: number;
    ocr_available: boolean;
  };
  storage?: {
    database: StorageDatabaseReport;
    uploads: StorageUploadsReport;
  };
  ai?: {
    configured: boolean;
    provider: string;
    model: string | null;
    reason: string;
  };
  limits: {
    max_upload_mb: number;
    max_video_upload_mb: number;
    max_pdf_pages: number;
    max_ocr_pages?: number;
    ocr_max_image_pixels?: number;
    ai_requests_per_minute?: number;
  };
  checked_at: string;
}
