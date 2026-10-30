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
    return { text: 'text-slate-300', bg: 'bg-white/[0.06]', border: 'border-white/10', bar: 'bg-slate-400' };
  }
  if (score >= 85) {
    return { text: 'text-emerald-300', bg: 'bg-emerald-400/10', border: 'border-emerald-400/25', bar: 'bg-emerald-400' };
  }
  if (score >= 70) {
    return { text: 'text-amber-300', bg: 'bg-amber-400/10', border: 'border-amber-400/25', bar: 'bg-amber-400' };
  }
  if (score >= 50) {
    return { text: 'text-orange-300', bg: 'bg-orange-500/10', border: 'border-orange-400/25', bar: 'bg-orange-400' };
  }
  return { text: 'text-rose-300', bg: 'bg-rose-500/10', border: 'border-rose-400/25', bar: 'bg-rose-400' };
}

export const SEVERITY_STYLE: Record<Severity, string> = {
  low: 'bg-white/[0.06] text-slate-200 border-white/10',
  medium: 'bg-amber-400/10 text-amber-200 border-amber-400/25',
  high: 'bg-orange-500/10 text-orange-200 border-orange-400/25',
  critical: 'bg-rose-500/10 text-rose-200 border-rose-400/30',
};

export const SEVERITY_DOT: Record<Severity, string> = {
  low: 'bg-slate-400',
  medium: 'bg-amber-500',
  high: 'bg-orange-500',
  critical: 'bg-rose-500',
};

const NETURAL_STYLE = 'bg-white/[0.06] text-slate-300 border-white/10';
const INFO_STYLE = 'bg-sky-500/10 text-sky-200 border-sky-400/25';
const BRAND_STYLE = 'bg-blue-500/10 text-blue-200 border-blue-400/25';
const SUCCESS_STYLE = 'bg-emerald-400/10 text-emerald-200 border-emerald-400/25';
const WARNING_STYLE = 'bg-amber-400/10 text-amber-200 border-amber-400/25';
const DANGER_STYLE = 'bg-rose-500/10 text-rose-200 border-rose-400/30';

export const STATUS_STYLE: Record<string, string> = {
  draft: NETURAL_STYLE,
  audited: INFO_STYLE,
  in_review: BRAND_STYLE,
  approved: SUCCESS_STYLE,
  rejected: DANGER_STYLE,
  changes_requested: WARNING_STYLE,
  active: SUCCESS_STYLE,
  completed: INFO_STYLE,
  archived: NETURAL_STYLE,
  verified: SUCCESS_STYLE,
  needs_review: WARNING_STYLE,
  expired: DANGER_STYLE,
  planned: NETURAL_STYLE,
  in_progress: WARNING_STYLE,
  validated: SUCCESS_STYLE,
  passed: SUCCESS_STYLE,
  failed: DANGER_STYLE,
  error: DANGER_STYLE,
  needs_attention: WARNING_STYLE,
  manual: INFO_STYLE,
  not_applicable: NETURAL_STYLE,
  open: INFO_STYLE,
  accepted: SUCCESS_STYLE,
  edited: BRAND_STYLE,
  dismissed: NETURAL_STYLE,
  unresolved: DANGER_STYLE,
  resolved: SUCCESS_STYLE,
};

export const RISK_STYLE: Record<RiskLevel, string> = {
  clean: SUCCESS_STYLE,
  low: SUCCESS_STYLE,
  medium: WARNING_STYLE,
  high: 'bg-orange-500/10 text-orange-200 border-orange-400/25',
  critical: DANGER_STYLE,
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
