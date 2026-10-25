import type {
  AssetType,
  ContentType,
  DocumentStatus,
  RiskLevel,
  Role,
  Severity,
} from '../types';

export const ROLE_LABEL: Record<Role, string> = {
  creator: 'Creator',
  reviewer: 'Reviewer',
  admin: 'Organization Admin',
};

export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  blog_post: 'Blog post',
  social_media: 'Social post',
  press_release: 'Press release',
  landing_page: 'Landing page',
  product_copy: 'Product copy',
  ad_copy: 'Ad copy',
  email_campaign: 'Email campaign',
  video_script: 'Video script',
  other: 'Other',
};

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  text: 'Text',
  pdf: 'PDF',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
};

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  draft: 'Draft',
  audited: 'Checked',
  in_review: 'In review',
  approved: 'Approved',
  rejected: 'Rejected',
  changes_requested: 'Changes requested',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  clean: 'Clean',
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
  critical: 'Critical risk',
};

export const CATEGORY_LABEL: Record<string, string> = {
  confirmed_contradiction: 'Confirmed contradiction',
  unsupported_claim: 'Unsupported claim',
  policy_violation: 'Brand policy violation',
  style_suggestion: 'Style suggestion',
  accessibility_issue: 'Accessibility issue',
  needs_human_review: 'Needs human review',
  processing_issue: 'Processing issue',
};

export const RULE_TYPE_LABEL: Record<string, string> = {
  prohibited_phrase: 'Prohibited phrase',
  required_terminology: 'Required terminology',
  tone_guideline: 'Tone guideline',
  claim_restriction: 'Claim restriction',
  product_naming: 'Product naming',
};

export const RULE_STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  draft: 'Draft',
  archived: 'Archived',
};

export const FACT_STATUS_LABEL: Record<string, string> = {
  verified: 'Verified',
  needs_review: 'Needs review',
  expired: 'Expired',
  draft: 'Draft',
};

export const CAPABILITY_LABEL: Record<string, string> = {
  'content.create': 'Create and check content',
  'content.read.own': 'Read own content',
  'content.read.all': 'Read all workspace content',
  'content.edit.own': 'Edit own content',
  'content.edit.all': 'Edit all content',
  'content.submit.own': 'Submit own content for review',
  'content.submit.all': 'Submit any content for review',
  'findings.review.own': 'Review own findings',
  'findings.dismiss': 'Dismiss findings with a reason',
  'review.queue': 'Access the review queue',
  'review.decide': 'Record approvals and rejections',
  'review.comment': 'Comment in review',
  'brand.read': 'Read brand rules and assets',
  'brand.manage': 'Manage brand rules and facts',
  'assets.manage': 'Manage brand assets',
  'campaign.read': 'View campaigns',
  'campaign.create': 'Create campaigns and attach content',
  'campaign.manage': 'Edit campaign details',
  'campaign.resolve': 'Detect and resolve campaign conflicts',
  'insights.read': 'Read governance insights',
  'org.manage': 'Manage organization settings and team',
  'research.manage': 'Manage research records',
  'evaluation.run': 'Run evaluation cases',
  'assistant.use': 'Use the assistant',
};

export function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAIVE_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/;

/**
 * API datetimes are stored as naive UTC. Date-only values are calendar dates.
 * Parsing both without this distinction shifts timestamps by the local offset.
 */
export function parseApiDate(value?: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  const dateOnly = DATE_ONLY_RE.exec(trimmed);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  const naive = NAIVE_DATETIME_RE.exec(trimmed);
  const date = new Date(naive ? `${naive[1]}T${naive[2]}Z` : trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value?: string | null): string {
  const date = parseApiDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(value?: string | null): string {
  const date = parseApiDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function relativeTime(value?: string | null): string {
  const date = parseApiDate(value);
  if (!date) return '—';
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const divisions: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
    { amount: 60, unit: 'second' },
    { amount: 60, unit: 'minute' },
    { amount: 24, unit: 'hour' },
    { amount: 7, unit: 'day' },
    { amount: 4.34524, unit: 'week' },
    { amount: 12, unit: 'month' },
    { amount: Number.POSITIVE_INFINITY, unit: 'year' },
  ];
  let duration = diffSeconds;
  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return formatDate(value);
}

export function formatFileSize(bytes: number): string {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatSeconds(seconds?: number | null): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '';
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function scoreTone(score?: number | null): {
  text: string;
  bg: string;
  border: string;
  bar: string;
} {
  if (score === null || score === undefined) {
    return { text: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200', bar: 'bg-slate-300' };
  }
  if (score >= 85) {
    return { text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', bar: 'bg-emerald-500' };
  }
  if (score >= 70) {
    return { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', bar: 'bg-amber-500' };
  }
  if (score >= 50) {
    return { text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', bar: 'bg-orange-500' };
  }
  return { text: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', bar: 'bg-rose-500' };
}

export const SEVERITY_STYLE: Record<Severity, string> = {
  low: 'bg-slate-100 text-slate-700 border-slate-200',
  medium: 'bg-amber-50 text-amber-800 border-amber-200',
  high: 'bg-orange-50 text-orange-800 border-orange-200',
  critical: 'bg-rose-50 text-rose-800 border-rose-200',
};

export const SEVERITY_DOT: Record<Severity, string> = {
  low: 'bg-slate-400',
  medium: 'bg-amber-500',
  high: 'bg-orange-500',
  critical: 'bg-rose-500',
};

export const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  audited: 'bg-sky-50 text-sky-700 border-sky-200',
  in_review: 'bg-blue-50 text-blue-700 border-blue-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  changes_requested: 'bg-amber-50 text-amber-800 border-amber-200',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-sky-50 text-sky-700 border-sky-200',
  archived: 'bg-slate-100 text-slate-600 border-slate-200',
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  needs_review: 'bg-amber-50 text-amber-800 border-amber-200',
  expired: 'bg-rose-50 text-rose-700 border-rose-200',
  planned: 'bg-slate-100 text-slate-700 border-slate-200',
  in_progress: 'bg-amber-50 text-amber-800 border-amber-200',
  validated: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  passed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
  error: 'bg-rose-50 text-rose-700 border-rose-200',
  needs_attention: 'bg-amber-50 text-amber-800 border-amber-200',
  manual: 'bg-sky-50 text-sky-700 border-sky-200',
  not_applicable: 'bg-slate-100 text-slate-600 border-slate-200',
  open: 'bg-sky-50 text-sky-700 border-sky-200',
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  edited: 'bg-blue-50 text-blue-700 border-blue-200',
  dismissed: 'bg-slate-100 text-slate-600 border-slate-200',
  unresolved: 'bg-rose-50 text-rose-700 border-rose-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export const RISK_STYLE: Record<RiskLevel, string> = {
  clean: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-800 border-amber-200',
  high: 'bg-orange-50 text-orange-800 border-orange-200',
  critical: 'bg-rose-50 text-rose-800 border-rose-200',
};

/**
 * Splits explicitly timestamped cues from untimestamped transcript text.
 * It never synthesizes timestamps and keeps both parts in source order.
 */
export function splitTranscriptText(raw: string): {
  segments: { timestamp_seconds: number; text: string }[];
  untimestamped: string;
} {
  const segments: { timestamp_seconds: number; text: string }[] = [];
  const untimestamped: string[] = [];
  const lines = raw.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n');
  let pending: { timestamp_seconds: number; lines: string[] } | null = null;
  let inBlock = false;

  const parseStamp = (value: string): number | null => {
    const parts = value.split(':').map((part) => Number.parseFloat(part.replace(',', '.')));
    if (parts.some((part) => Number.isNaN(part))) return null;
    if (parts.some((part) => part < 0)) return null;
    if (parts.slice(-2).some((part) => part >= 60)) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return null;
  };

  const flush = () => {
    if (!pending) return;
    const text = pending.lines.join(' ').trim();
    if (text) segments.push({ timestamp_seconds: pending.timestamp_seconds, text });
    pending = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      flush();
      inBlock = false;
      continue;
    }
    if (inBlock) continue;
    if (/^WEBVTT\b/i.test(trimmed)) continue;
    if (/^(NOTE|STYLE|REGION)\b/i.test(trimmed)) {
      flush();
      inBlock = true;
      continue;
    }

    if (trimmed.includes('-->')) {
      flush();
      const seconds = parseStamp(trimmed.split('-->')[0].trim());
      pending = seconds !== null ? { timestamp_seconds: seconds, lines: [] } : null;
      continue;
    }

    const bracketMatch = trimmed.match(/^\[?(\d{1,2}(?::\d{1,2}){1,2}(?:[.,]\d+)?)\]?\s*(.*)$/);
    if (bracketMatch) {
      flush();
      const seconds = parseStamp(bracketMatch[1]);
      if (seconds !== null) {
        pending = { timestamp_seconds: seconds, lines: [] };
        const rest = bracketMatch[2].trim();
        if (rest) {
          pending.lines.push(rest);
          flush();
        }
      }
      continue;
    }

    if (
      /^\d+$/.test(trimmed) &&
      index + 1 < lines.length &&
      lines[index + 1].includes('-->')
    ) {
      continue;
    }

    if (pending) pending.lines.push(trimmed);
    else untimestamped.push(trimmed);
  }

  flush();
  return { segments, untimestamped: untimestamped.join('\n').trim() };
}

/** Returns only explicitly timestamped cues. It never synthesizes timestamps. */
export function parseTranscript(raw: string): { timestamp_seconds: number; text: string }[] {
  return splitTranscriptText(raw).segments;
}

export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}
