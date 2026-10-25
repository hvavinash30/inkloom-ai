import type {
  ApprovalDecision,
  ApprovedFact,
  AssistantRequest,
  AssistantResponse,
  BrandAsset,
  BrandRule,
  Campaign,
  CampaignGraph,
  CampaignReadiness,
  CompareResponse,
  ContentDocument,
  ContentVersion,
  ContrastResult,
  CorrectionSuggestion,
  DashboardData,
  EvaluationSummary,
  HealthData,
  HistoryEvent,
  ImpactAnalysis,
  InsightsData,
  IntegrationsResponse,
  MemoryConflict,
  OrgOverview,
  OverviewStats,
  Provenance,
  ResearchRecord,
  ResearchResponse,
  ReviewComment,
  ReviewSummary,
  Role,
  RuleSuggestion,
  SessionPayload,
  TeamResponse,
  UploadRecord,
  Workspace,
  WorkspaceCreatePayload,
} from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

let activeRole: Role = 'creator';
let activeWorkspace: string | null = null;

export function setApiRole(role: Role) {
  activeRole = role;
}

export function setApiWorkspace(workspaceId: string | null) {
  activeWorkspace = workspaceId;
}

function identityHeaders(headers: Headers) {
  headers.set('X-Inkloom-Role', activeRole);
  if (activeWorkspace) headers.set('X-Inkloom-Workspace', activeWorkspace);
}

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

function extractError(payload: unknown): string {
  if (!payload) return 'The request could not be completed.';
  if (typeof payload === 'string') return payload;
  if (Array.isArray(payload)) {
    return payload
      .map((item) => (typeof item === 'object' && item && 'msg' in item ? String(item.msg) : String(item)))
      .join(' ');
  }
  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (record.detail) return extractError(record.detail);
    if (record.message) return String(record.message);
  }
  return 'The request could not be completed.';
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  identityHeaders(headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(
      0,
      'Cannot reach Inkloom. Make sure the service is running, then try again.'
    );
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const payload = await response.json();
      detail = extractError(payload);
    } catch {
      // Keep the HTTP status text when no JSON error body is returned.
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) return {} as T;
  return (await response.json()) as T;
}

function qs(params?: Record<string, string | number | boolean | undefined | null>) {
  if (!params) return '';
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

async function fetchFile(path: string): Promise<{ blob: Blob; contentType: string }> {
  const headers = new Headers();
  identityHeaders(headers);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { headers });
  } catch {
    throw new ApiError(0, 'The file could not be reached. Check the API connection.');
  }
  if (!response.ok) {
    throw new ApiError(response.status, 'The file could not be loaded for this account.');
  }
  return {
    blob: await response.blob(),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
  };
}

export const api = {
  setRole: setApiRole,
  setWorkspace: setApiWorkspace,
  getSession: () => request<SessionPayload>('/session'),
  getHealth: () => request<HealthData>('/health'),
  getDashboard: () => request<DashboardData>('/dashboard/'),

  listWorkspaces: () => request<Workspace[]>('/workspaces/'),
  getWorkspaceById: (id: string) =>
    request<Workspace>(`/workspaces/${encodeURIComponent(id)}`),
  createWorkspace: (payload: WorkspaceCreatePayload) =>
    request<Workspace>('/workspaces/', { method: 'POST', body: JSON.stringify(payload) }),
  updateWorkspaceById: (id: string, payload: { name?: string; description?: string }) =>
    request<Workspace>(`/workspaces/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getOverviewStats: () => request<OverviewStats>('/audits/overview-stats'),

  listDocuments: (params?: {
    status?: string;
    asset_type?: string;
    content_type?: string;
    campaign_id?: string;
    search?: string;
    limit?: number;
  }) => request<ContentDocument[]>(`/audits/documents${qs(params)}`),
  getDocument: (id: string) =>
    request<ContentDocument>(`/audits/documents/${encodeURIComponent(id)}`),
  getProvenance: (id: string) =>
    request<Provenance>(`/audits/documents/${encodeURIComponent(id)}/provenance`),
  submitAndAudit: (payload: {
    title: string;
    content_type: string;
    content_text: string;
    asset_type: string;
    campaign_id?: string | null;
    upload_id?: string | null;
    source_url?: string | null;
    page_texts?: string[];
    transcript_segments?: { timestamp_seconds: number; text: string }[];
    save_as_draft?: boolean;
  }) =>
    request<ContentDocument>('/audits/submit-and-audit', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createVersion: (
    id: string,
    payload: {
      content_text?: string;
      change_summary?: string;
      page_texts?: string[];
      transcript_segments?: { timestamp_seconds: number; text: string }[];
    }
  ) =>
    request<ContentDocument>(`/audits/documents/${encodeURIComponent(id)}/versions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  rerunAudit: (id: string) =>
    request<ContentDocument>(`/audits/documents/${encodeURIComponent(id)}/rerun`, {
      method: 'POST',
    }),
  updateFinding: (
    id: string,
    payload: {
      action: 'accept' | 'dismiss' | 'edit';
      custom_correction?: string;
      dismissal_reason?: string;
    }
  ) =>
    request(`/audits/findings/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  suggestCorrection: (findingId: string, reviewerNotes?: string) =>
    request<CorrectionSuggestion>(
      `/audits/findings/${encodeURIComponent(findingId)}/suggest-correction`,
      { method: 'POST', body: JSON.stringify({ reviewer_notes: reviewerNotes || null }) }
    ),
  getReviewSummary: (id: string) =>
    request<ReviewSummary>(`/audits/documents/${encodeURIComponent(id)}/review-summary`),

  getReviewQueue: () => request<ContentDocument[]>('/reviews/queue'),
  submitForReview: (id: string, notes?: string) =>
    request<ContentDocument>(`/reviews/documents/${encodeURIComponent(id)}/submit`, {
      method: 'POST',
      body: JSON.stringify({ notes: notes || 'Submitted for brand review' }),
    }),
  recordDecision: (
    id: string,
    payload: { decision: string; version_id: string; feedback?: string }
  ) =>
    request<ApprovalDecision>(`/reviews/documents/${encodeURIComponent(id)}/decision`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listDecisions: (id: string) =>
    request<ApprovalDecision[]>(`/reviews/documents/${encodeURIComponent(id)}/decisions`),
  addComment: (id: string, payload: { comment_text: string; visibility?: string }) =>
    request<ReviewComment>(`/reviews/documents/${encodeURIComponent(id)}/comments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listComments: (id: string) =>
    request<ReviewComment[]>(`/reviews/documents/${encodeURIComponent(id)}/comments`),

  listHistory: (params?: { status?: string; asset_type?: string; search?: string }) =>
    request<ContentDocument[]>(`/history/${qs(params)}`),
  listEvents: (id: string) =>
    request<HistoryEvent[]>(`/history/documents/${encodeURIComponent(id)}/events`),
  listVersions: (id: string) =>
    request<ContentVersion[]>(`/history/documents/${encodeURIComponent(id)}/versions`),
  compareVersions: (id: string, from: number, to: number) =>
    request<CompareResponse>(
      `/history/documents/${encodeURIComponent(id)}/compare${qs({
        from_version: from,
        to_version: to,
      })}`
    ),

  listCampaigns: () => request<Campaign[]>('/campaigns/'),
  getCampaign: (id: string) =>
    request<Campaign>(`/campaigns/${encodeURIComponent(id)}`),
  createCampaign: (payload: {
    name: string;
    description?: string;
    target_audience?: string;
    launch_target?: string | null;
    status?: string;
  }) =>
    request<Campaign>('/campaigns/', { method: 'POST', body: JSON.stringify(payload) }),
  updateCampaign: (id: string, payload: Record<string, unknown>) =>
    request<Campaign>(`/campaigns/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  attachAsset: (id: string, documentId: string) =>
    request<Campaign>(`/campaigns/${encodeURIComponent(id)}/assets`, {
      method: 'POST',
      body: JSON.stringify({ document_id: documentId }),
    }),
  detectConflicts: (id: string) =>
    request<Campaign>(`/campaigns/${encodeURIComponent(id)}/detect`, { method: 'POST' }),
  getReadiness: (id: string) =>
    request<CampaignReadiness>(`/campaigns/${encodeURIComponent(id)}/readiness`),
  getCampaignGraph: (id: string) =>
    request<CampaignGraph>(`/campaigns/${encodeURIComponent(id)}/graph`),
  resolveConflict: (
    id: string,
    payload: { resolved_value: string; resolution_notes: string }
  ) =>
    request(`/campaigns/conflicts/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listRules: (params?: { include_archived?: boolean; rule_type?: string; search?: string }) =>
    request<BrandRule[]>(`/brand-rules/${qs(params)}`),
  createRule: (payload: Record<string, unknown>) =>
    request<BrandRule>('/brand-rules/', { method: 'POST', body: JSON.stringify(payload) }),
  updateRule: (id: string, payload: Record<string, unknown>) =>
    request<BrandRule>(`/brand-rules/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  archiveRule: (id: string) =>
    request<BrandRule>(`/brand-rules/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listFacts: () => request<ApprovedFact[]>('/approved-facts/'),
  createFact: (payload: Record<string, unknown>) =>
    request<ApprovedFact>('/approved-facts/', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateFact: (id: string, payload: Record<string, unknown>) =>
    request<ApprovedFact>(`/approved-facts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  retireFact: (id: string) =>
    request<ApprovedFact>(`/approved-facts/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listAssets: (params?: { asset_type?: string; status?: string; search?: string }) =>
    request<BrandAsset[]>(`/brand-assets/${qs(params)}`),
  createAsset: (payload: Record<string, unknown>) =>
    request<BrandAsset>('/brand-assets/', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateAsset: (id: string, payload: Record<string, unknown>) =>
    request<BrandAsset>(`/brand-assets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  archiveAsset: (id: string) =>
    request<BrandAsset>(`/brand-assets/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  checkContrast: (payload: {
    foreground: string;
    background: string;
    text_size: 'normal' | 'large';
  }) =>
    request<ContrastResult>('/brand-assets/contrast-check', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listConflicts: () => request<MemoryConflict[]>('/brand-memory/conflicts'),
  listSuggestions: () => request<RuleSuggestion[]>('/brand-memory/suggestions'),
  createRuleFromSuggestion: (payload: Record<string, unknown>) =>
    request<BrandRule>('/brand-memory/suggestions/create-rule', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  factImpact: (id: string) =>
    request<ImpactAnalysis>(`/brand-memory/facts/${encodeURIComponent(id)}/impact`),
  ruleImpact: (id: string) =>
    request<ImpactAnalysis>(`/brand-memory/rules/${encodeURIComponent(id)}/impact`),
  simulateRule: (payload: { proposed_pattern: string; proposed_severity: string }) =>
    request<ImpactAnalysis>('/brand-memory/simulate-rule', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getInsights: (params?: Record<string, string | undefined>) =>
    request<InsightsData>(`/insights/${qs(params)}`),

  listResearch: () => request<ResearchResponse>('/research/'),
  createResearch: (payload: Record<string, unknown>) =>
    request<ResearchRecord>('/research/', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateResearch: (id: string, payload: Record<string, unknown>) =>
    request<ResearchRecord>(`/research/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getEvaluation: () => request<EvaluationSummary>('/evaluation/'),
  runAllEvaluations: () =>
    request<EvaluationSummary>('/evaluation/run-all', { method: 'POST' }),
  runEvaluationCase: (id: string) =>
    request<EvaluationSummary>(`/evaluation/cases/${encodeURIComponent(id)}/run`, {
      method: 'POST',
    }),

  getOrgOverview: () => request<OrgOverview>('/organization/overview'),
  getTeam: () => request<TeamResponse>('/organization/team'),
  updateWorkspace: (payload: { name?: string; description?: string }) =>
    request('/organization/workspace', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getIntegrations: () => request<IntegrationsResponse>('/organization/integrations'),

  assistantChat: (payload: AssistantRequest) =>
    request<AssistantResponse>('/assistant/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  uploadFile: (file: File, kind?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (kind) form.append('kind', kind);
    return request<UploadRecord>('/uploads/', { method: 'POST', body: form });
  },
  getUpload: (id: string) =>
    request<UploadRecord>(`/uploads/${encodeURIComponent(id)}`),
  getFile: (uploadId: string) =>
    fetchFile(`/uploads/${encodeURIComponent(uploadId)}/file`),
};
