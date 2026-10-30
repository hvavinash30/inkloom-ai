import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FilePlus2,
  FileText,
  Layers,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useAsync, navigate } from '../lib/router';
import { api } from '../services/api';
import {
  Button,
  EmptyState,
  ErrorState,
  InfoCallout,
  ScoreRing,
  SeverityBadge,
  StatusBadge,
  cn,
} from '../components/ui';
import { ROLE_LABEL, RISK_LABEL, relativeTime, scoreTone } from '../lib/format';
import type { DashboardData, DocumentSummary } from '../types';

const TABLE_GRID = 'grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_136px_68px_16px]';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function dedupeDocuments(docs: DocumentSummary[]) {
  const seen = new Set<string>();
  return docs.filter((doc) => {
    if (seen.has(doc.id)) return false;
    seen.add(doc.id);
    return true;
  });
}

function documentIdFromRoute(route: string) {
  const match = route.match(/^\/content\/([^/?#]+)/);
  return match ? match[1] : null;
}

function prepareAttentionItems(
  items: DashboardData['priority_items'],
  queueIds: Set<string>,
  canReviewQueue: boolean
) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (canReviewQueue && item.kind === 'review') {
      const documentId = documentIdFromRoute(item.route);
      if (documentId && queueIds.has(documentId)) return false;
    }
    const key = `${item.kind}:${item.route}:${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findingsLabel(count: number | null) {
  if (count === null) return null;
  return `${count} finding${count === 1 ? '' : 's'}`;
}

function queueTiming(doc: DocumentSummary) {
  if (doc.submitted_at) {
    return `${doc.status === 'changes_requested' ? 'Sent back' : 'Submitted'} ${relativeTime(doc.submitted_at)}`;
  }
  return `Updated ${relativeTime(doc.updated_at)}`;
}

type KpiTone = 'brand' | 'danger' | 'warning' | 'success';

const KPI_DOT: Record<KpiTone, string> = {
  brand: 'bg-brand-500',
  danger: 'bg-rose-500',
  warning: 'bg-amber-500',
  success: 'bg-emerald-500',
};

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  meter,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint: string;
  icon: LucideIcon;
  tone: KpiTone;
  meter?: number;
  onClick?: () => void;
}) {
  const className = cn(
    'glass flex min-h-[148px] flex-col rounded-2xl p-4 text-left sm:p-5',
    onClick &&
      'lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2'
  );
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium leading-5 text-slate-300">{label}</span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] text-slate-300">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[26px] font-semibold leading-none tracking-tight text-white tabular-nums sm:text-[28px]">
          {value}
        </span>
        <span className={cn('h-1.5 w-1.5 rounded-full', KPI_DOT[tone])} aria-hidden />
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-400">{hint}</p>
      {typeof meter === 'number' ? (
        <div className="mt-auto pt-3" aria-hidden>
          <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className={cn('h-full rounded-full', scoreTone(meter).bar)}
              style={{ width: `${Math.min(100, Math.max(0, meter))}%` }}
            />
          </div>
        </div>
      ) : null}
    </>
  );

  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn('glass overflow-hidden rounded-2xl', className)}>
      {children}
    </section>
  );
}

function PanelHeader({
  title,
  description,
  meta,
  action,
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-white/[0.07] px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight text-slate-100">{title}</h2>
          {meta}
        </div>
        {description ? <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function CountPill({ count, label }: { count: number; label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-brand-400/25 bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-300">
      <span className="tabular-nums">{count}</span>
      <span className="sr-only"> {label}</span>
    </span>
  );
}

function TableColumns({ first }: { first: string }) {
  return (
    <div
      className={cn(
        'hidden items-center gap-x-3 border-b border-white/[0.07] bg-white/[0.035] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 md:grid sm:px-5',
        TABLE_GRID
      )}
      aria-hidden
    >
      <span>{first}</span>
      <span>Status</span>
      <span>Score</span>
      <span />
    </div>
  );
}

function ScoreChip({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="text-xs text-slate-400">Not checked</span>;
  }
  const tone = scoreTone(score);
  return (
    <span
      className={cn(
        'inline-flex h-7 min-w-[46px] items-center justify-center rounded-md border px-2 text-xs font-semibold tabular-nums',
        tone.bg,
        tone.border,
        tone.text
      )}
    >
      {score}
    </span>
  );
}

function MobileBadges({ doc }: { doc: DocumentSummary }) {
  const tone = scoreTone(doc.latest_score);
  return (
    <span className="mt-2 flex flex-wrap items-center gap-1.5 md:hidden">
      <StatusBadge status={doc.status} />
      <span
        className={cn(
          'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
          doc.latest_score === null ? 'border-white/10 bg-white/[0.035] text-slate-300' : cn(tone.bg, tone.border, tone.text)
        )}
      >
        <span className="sr-only">Check score: </span>
        {doc.latest_score === null ? 'Not checked' : `${doc.latest_score}/100`}
      </span>
    </span>
  );
}

function QueueRow({ doc, showAuthor }: { doc: DocumentSummary; showAuthor: boolean }) {
  const findings = findingsLabel(doc.total_findings);
  return (
    <li>
      <button
        type="button"
        onClick={() => navigate(`/content/${doc.id}`)}
        className="group block w-full text-left transition-colors hover:bg-white/[0.06] focus-visible:bg-brand-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
      >
        <span
          className={cn(
            'grid items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5',
            TABLE_GRID
          )}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-slate-100" title={doc.title}>
              {doc.title}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-5 text-slate-400">
              {showAuthor && doc.created_by_name ? (
                <>
                  <span className="max-w-[12rem] truncate">{doc.created_by_name}</span>
                  <span aria-hidden>·</span>
                </>
              ) : null}
              <span className="capitalize">{doc.asset_type}</span>
              <span aria-hidden>·</span>
              <span>v{doc.current_version_number}</span>
              {findings ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{findings}</span>
                </>
              ) : null}
              <span aria-hidden>·</span>
              <span>{queueTiming(doc)}</span>
              {doc.approval_stale ? (
                <span className="inline-flex items-center gap-1 font-medium text-amber-300">
                  <span className="h-1 w-1 rounded-full bg-amber-500" aria-hidden />
                  Approval stale
                </span>
              ) : null}
            </span>
            <MobileBadges doc={doc} />
          </span>
          <span className="flex items-center justify-end gap-3 md:contents">
            <span className="hidden md:block">
              <StatusBadge status={doc.status} />
            </span>
            <span className="hidden md:block">
              <span className="sr-only">Check score: </span>
              <ScoreChip score={doc.latest_score} />
            </span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-300"
              aria-hidden
            />
          </span>
        </span>
      </button>
    </li>
  );
}

function RecentRow({ doc }: { doc: DocumentSummary }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => navigate(`/content/${doc.id}`)}
        className="group block w-full text-left transition-colors hover:bg-white/[0.06] focus-visible:bg-brand-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
      >
        <span className={cn('grid items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5', TABLE_GRID)}>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-slate-100" title={doc.title}>
              {doc.title}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-5 text-slate-400">
              <span className="capitalize">{doc.asset_type}</span>
              <span aria-hidden>·</span>
              <span>v{doc.current_version_number}</span>
              <span aria-hidden>·</span>
              <span>Updated {relativeTime(doc.updated_at)}</span>
              {doc.approval_stale ? (
                <span className="inline-flex items-center gap-1 font-medium text-amber-300">
                  <span className="h-1 w-1 rounded-full bg-amber-500" aria-hidden />
                  Approval stale
                </span>
              ) : null}
            </span>
            <MobileBadges doc={doc} />
          </span>
          <span className="flex items-center justify-end gap-3 md:contents">
            <span className="hidden md:block">
              <StatusBadge status={doc.status} />
            </span>
            <span className="hidden md:block">
              <span className="sr-only">Check score: </span>
              <ScoreChip score={doc.latest_score} />
            </span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-300"
              aria-hidden
            />
          </span>
        </span>
      </button>
    </li>
  );
}

function attentionIcon(kind: string) {
  if (kind === 'review') return ClipboardCheck;
  if (kind === 'campaigns') return Layers;
  if (kind === 'changes') return RefreshCw;
  return ShieldAlert;
}

function AttentionList({
  items,
  canReviewQueue,
}: {
  items: DashboardData['priority_items'];
  canReviewQueue: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="m-4 flex items-start gap-3 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-4 py-3.5 sm:m-5">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
        <div>
          <p className="text-sm font-medium text-emerald-100">
            {canReviewQueue ? 'No additional signals' : "You're caught up"}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-emerald-200/80">
            {canReviewQueue
              ? 'Everything currently awaiting attention is already listed in your review queue.'
              : 'No review requests or urgent findings are waiting for you right now.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-white/[0.08]">
      {items.map((item, index) => {
        const Icon = attentionIcon(item.kind);
        const high = item.severity === 'high';
        return (
          <li key={`${item.kind}:${item.route}:${item.title}:${index}`}>
            <button
              type="button"
              onClick={() => navigate(item.route)}
              className="group flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.06] focus-visible:bg-brand-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:px-5"
            >
              <span
                className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  high ? 'bg-rose-500/10 text-rose-300' : 'bg-amber-400/10 text-amber-300'
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-100">{item.title}</span>
                  <SeverityBadge severity={high ? 'high' : 'medium'} />
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-400">{item.description}</span>
              </span>
              <ChevronRight
                className="mt-1.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-300"
                aria-hidden
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function QueueEmpty({
  canReviewQueue,
  pendingTotal,
}: {
  canReviewQueue: boolean;
  pendingTotal: number;
}) {
  if (pendingTotal > 0) {
    return (
      <div className="flex flex-col items-center px-5 py-9 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10 text-brand-300">
          <ClipboardCheck className="h-5 w-5" aria-hidden />
        </span>
        <p className="mt-3 text-sm font-medium text-slate-100">
          {canReviewQueue ? 'Review items are ready' : 'Open submissions are outside this list'}
        </p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">
          {pendingTotal} item{pendingTotal === 1 ? '' : 's'} {pendingTotal === 1 ? 'is' : 'are'} awaiting review.
          {canReviewQueue
            ? ' Open the review queue to inspect each exact version.'
            : ' Open Content to find all of your submissions.'}
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={() => navigate(canReviewQueue ? '/reviews' : '/content')}
        >
          {canReviewQueue ? 'Open review queue' : 'View content'}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-5 py-9 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
        <CheckCircle2 className="h-5 w-5" aria-hidden />
      </span>
      <p className="mt-3 text-sm font-medium text-slate-100">
        {canReviewQueue ? 'No versions are waiting' : 'Nothing is in review yet'}
      </p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">
        {canReviewQueue
          ? 'Submitted versions appear here when their latest check is ready for a version-specific decision.'
          : 'Start an audit on a draft, then submit the checked version when it is ready for review.'}
      </p>
      {canReviewQueue ? null : (
        <Button size="sm" className="mt-4" onClick={() => navigate('/content/new')}>
          <FilePlus2 className="h-3.5 w-3.5" aria-hidden />
          Start an audit
        </Button>
      )}
    </div>
  );
}

export function DashboardPage() {
  const { session, role, can } = useSession();
  const { data, loading, error, reload } = useAsync(() => api.getDashboard(), [role]);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading Overview">
        <div className="space-y-3">
          <div className="h-3 w-56 animate-pulse rounded bg-white/[0.09]" />
          <div className="h-9 w-80 max-w-full animate-pulse rounded-lg bg-white/[0.09]" />
          <div className="h-4 w-[32rem] max-w-full animate-pulse rounded bg-white/[0.09]" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-[148px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.04] shadow-panel"
            />
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_336px]">
          <div className="h-[420px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.04] shadow-panel" />
          <div className="h-[300px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.04] shadow-panel" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <ErrorState message={error || 'No dashboard data was returned.'} retry={reload} />;
  }

  const stats = data.stats;
  const firstName = (session?.active_user.full_name || data.user.name).split(' ')[0];
  const isReviewer = role === 'reviewer';
  const isAdmin = role === 'admin';
  const canReviewQueue = can('review.queue');
  const hasCheckedVersions = stats.scored_documents > 0;
  const averageValue = hasCheckedVersions ? stats.average_score.toFixed(1) : '—';
  const averageHint = `${stats.scored_documents} current version${stats.scored_documents === 1 ? '' : 's'} checked`;
  const qualityLabel = hasCheckedVersions
    ? RISK_LABEL[
        stats.average_score >= 85 ? 'low' : stats.average_score >= 70 ? 'medium' : 'high'
      ]
    : 'No checks yet';

  const statCards: {
    label: string;
    value: string | number;
    hint: string;
    icon: LucideIcon;
    tone: KpiTone;
    route?: string;
    meter?: number;
  }[] = isReviewer
    ? [
        {
          label: 'To review',
          value: stats.pending_reviews,
          hint: 'Versions with a completed check',
          icon: ClipboardCheck,
          tone: 'brand',
          route: '/reviews',
        },
        {
          label: 'High-risk findings',
          value: stats.open_high_findings,
          hint: 'Open high and critical severity',
          icon: ShieldAlert,
          tone: 'danger',
          route: '/content',
        },
        {
          label: 'Stale approvals',
          value: stats.stale_approvals,
          hint: 'Approved version is no longer latest',
          icon: CalendarClock,
          tone: 'warning',
          route: '/content',
        },
        {
          label: 'Average check score',
          value: averageValue,
          hint: averageHint,
          icon: TrendingUp,
          tone: 'success',
          meter: hasCheckedVersions ? stats.average_score : undefined,
        },
      ]
    : isAdmin
      ? [
          {
            label: 'Workspace content',
            value: stats.documents,
            hint: `${stats.approved_content} approved · ${stats.drafts} draft`,
            icon: FileText,
            tone: 'brand',
            route: '/content',
          },
          {
            label: 'Average score',
            value: averageValue,
            hint: averageHint,
            icon: TrendingUp,
            tone: 'success',
            meter: hasCheckedVersions ? stats.average_score : undefined,
          },
          {
            label: 'Open conflicts',
            value: stats.unresolved_conflicts,
            hint: 'Cross-asset claim disagreements',
            icon: Layers,
            tone: 'danger',
            route: '/campaigns',
          },
          {
            label: 'Facts to review',
            value: stats.outdated_facts,
            hint: 'Expired, flagged, or past review date',
            icon: CalendarClock,
            tone: 'warning',
            route: '/brand',
          },
        ]
      : [
          {
            label: 'Your content',
            value: stats.documents,
            hint: `${stats.approved_content} approved · ${stats.drafts} drafts`,
            icon: FileText,
            tone: 'brand',
            route: '/content',
          },
          {
            label: 'High-risk findings',
            value: stats.open_high_findings,
            hint: 'Across your current versions',
            icon: ShieldAlert,
            tone: 'danger',
            route: '/content',
          },
          {
            label: 'Awaiting review',
            value: stats.pending_reviews,
            hint: 'In review or changes requested',
            icon: ClipboardCheck,
            tone: 'warning',
            route: '/content',
          },
          {
            label: 'Average score',
            value: averageValue,
            hint: averageHint,
            icon: TrendingUp,
            tone: 'success',
            meter: hasCheckedVersions ? stats.average_score : undefined,
          },
        ];

  const queueDocs = dedupeDocuments(
    canReviewQueue
      ? data.review_queue
      : data.recent_documents.filter(
          (doc) => doc.status === 'in_review' || doc.status === 'changes_requested'
        )
  );
  const queueIds = new Set(queueDocs.map((doc) => doc.id));
  const attentionItems = prepareAttentionItems(data.priority_items, queueIds, canReviewQueue);
  const hiddenQueueCount = Math.max(0, stats.pending_reviews - queueDocs.length);
  const showQueueOverflow = hiddenQueueCount > 0 && queueDocs.length > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-300">
            {session?.workspace.is_demo
              ? 'Demo workspace · fictional Acme Cloud scenario'
              : `${session?.workspace.name || 'Brand workspace'} · custom workspace`}
          </p>
          <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-white sm:text-[32px]">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400 sm:text-[15px]">
            {isReviewer
              ? 'Review submitted versions, inspect stored evidence, and record decisions against the exact version you reviewed.'
              : isAdmin
                ? 'Your governance picture, built from stored checks, version-bound approvals, and campaign conflicts.'
                : 'Draft and check content, fix evidence-backed findings, and track your submissions through review.'}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:w-auto xl:shrink-0 xl:justify-end">
          <Button size="lg" className="w-full sm:w-auto" onClick={() => navigate('/content/new')}>
            <FilePlus2 className="h-4 w-4" aria-hidden />
            Start an audit
          </Button>
          <div
            className={cn(
              'grid w-full grid-cols-1 gap-2 sm:contents',
              canReviewQueue && 'min-[380px]:grid-cols-2'
            )}
          >
            <Button
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => navigate('/content')}
            >
              <FileText className="h-4 w-4" aria-hidden />
              Browse content
            </Button>
            {canReviewQueue ? (
              <Button
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => navigate('/reviews')}
              >
                <ClipboardCheck className="h-4 w-4" aria-hidden />
                Review queue
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {statCards.map((card) => (
          <KpiCard
            key={card.label}
            label={card.label}
            value={card.value}
            hint={card.hint}
            icon={card.icon}
            tone={card.tone}
            meter={card.meter}
            onClick={card.route ? () => navigate(card.route as string) : undefined}
          />
        ))}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_336px]">
        <div className="min-w-0 space-y-6">
          <Panel>
            <PanelHeader
              title={canReviewQueue ? 'Review queue' : 'Your submissions'}
              meta={<CountPill count={stats.pending_reviews} label="awaiting review" />}
              description={
                canReviewQueue
                  ? 'The latest submitted versions waiting for a decision. Open one to inspect its exact evidence.'
                  : 'Your content currently with a reviewer. Open a submission to see its version-specific notes and checks.'
              }
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(canReviewQueue ? '/reviews' : '/content')}
                >
                  {canReviewQueue ? 'Open queue' : 'View all'}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              }
            />
            {queueDocs.length === 0 ? (
              <QueueEmpty canReviewQueue={canReviewQueue} pendingTotal={stats.pending_reviews} />
            ) : (
              <>
                <TableColumns first="Submission" />
                <ul className="divide-y divide-white/[0.08]">
                  {queueDocs.map((doc) => (
                    <QueueRow key={doc.id} doc={doc} showAuthor={canReviewQueue} />
                  ))}
                </ul>
                {showQueueOverflow ? (
                  <div className="border-t border-white/[0.07] bg-white/[0.035] px-4 py-2.5 text-xs text-slate-400 sm:px-5">
                    Showing {queueDocs.length} of {stats.pending_reviews} awaiting review.{' '}
                    <button
                      type="button"
                      onClick={() => navigate(canReviewQueue ? '/reviews' : '/content')}
                      className="font-medium text-brand-300 underline-offset-2 hover:text-brand-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      {canReviewQueue ? 'Open the review queue' : 'View all content'}
                    </button>{' '}
                    to see the rest.
                  </div>
                ) : null}
              </>
            )}
          </Panel>

          <Panel>
            <PanelHeader
              title={
                isReviewer
                  ? 'Other attention signals'
                  : isAdmin
                    ? 'Attention signals'
                    : 'Needs attention'
              }
              description={
                isReviewer
                  ? 'Check findings and campaign conflicts beyond the review queue.'
                  : isAdmin
                    ? 'Check findings, stale approvals, and campaign conflicts drawn from stored records.'
                    : 'Reviewer changes, low-scoring checks, and campaign conflicts.'
              }
              action={
                <Button variant="ghost" size="sm" onClick={() => navigate('/content')}>
                  All content
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              }
            />
            <AttentionList items={attentionItems} canReviewQueue={canReviewQueue} />
          </Panel>

          <Panel>
            <PanelHeader
              title="Recent content"
              description="Latest checks and review status. Scores reflect stored findings, not legal risk."
              action={
                <Button variant="ghost" size="sm" onClick={() => navigate('/content')}>
                  View all
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              }
            />
            {data.recent_documents.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={FileText}
                  title="No content yet"
                  description="Start with a draft or a PDF. A check runs automatically when you save the first version."
                  action={
                    <Button size="sm" onClick={() => navigate('/content/new')}>
                      <FilePlus2 className="h-4 w-4" aria-hidden />
                      Create content
                    </Button>
                  }
                />
              </div>
            ) : (
              <>
                <TableColumns first="Content" />
                <ul className="divide-y divide-white/[0.08]">
                  {data.recent_documents.slice(0, 5).map((doc) => (
                    <RecentRow key={doc.id} doc={doc} />
                  ))}
                </ul>
              </>
            )}
          </Panel>

          <div className="grid gap-6 md:grid-cols-2">
            <Panel>
              <PanelHeader
                title="Campaign readiness"
                description="Cross-asset claims checked against current content."
                action={
                  <Button variant="ghost" size="sm" onClick={() => navigate('/campaigns')}>
                    Open
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                }
              />
              <div className="space-y-2 p-4 sm:p-5">
                {data.campaigns.length === 0 ? (
                  <p className="text-xs text-slate-400">No campaigns yet.</p>
                ) : (
                  data.campaigns.map((campaign) => (
                    <button
                      key={campaign.id}
                      type="button"
                      onClick={() => navigate(`/campaigns/${campaign.id}`)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-slate-200">{campaign.name}</span>
                        <span className="mt-0.5 block text-[11px] text-slate-400">
                          {campaign.assets_count} asset{campaign.assets_count === 1 ? '' : 's'}
                        </span>
                      </span>
                      <StatusBadge status={campaign.status} />
                    </button>
                  ))
                )}
                {stats.unresolved_conflicts > 0 ? (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2.5 text-xs leading-5 text-rose-200">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>
                      {stats.unresolved_conflicts} unresolved conflict
                      {stats.unresolved_conflicts === 1 ? '' : 's'} across campaign assets.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2.5 text-xs text-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    No unresolved campaign conflicts recorded.
                  </div>
                )}
              </div>
            </Panel>

            <Panel>
              <PanelHeader
                title="Checks in this deployment"
                description="Only configured services are reported as available."
              />
              <div className="space-y-3 p-4 sm:p-5">
                {[
                  { label: 'Rules & approved facts', active: true, detail: 'Deterministic audit engine' },
                  {
                    label: 'LLM assistance',
                    active: data.integrations.llm_configured,
                    detail: data.integrations.llm_configured
                      ? 'Configured on the server'
                      : 'Not configured — no simulated AI',
                  },
                  {
                    label: 'OCR for images/scans',
                    active: data.integrations.ocr_configured,
                    detail: data.integrations.ocr_configured
                      ? 'Local OCR — images and scanned pages'
                      : 'Not configured — human review required',
                  },
                  {
                    label: 'Video transcription',
                    active: data.integrations.transcription_configured,
                    detail: data.integrations.transcription_configured
                      ? 'Configured on the server'
                      : 'Not configured — supply a transcript',
                  },
                ].map((item) => (
                  <div key={item.label} className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                        item.active ? 'bg-emerald-500' : 'bg-white/[0.14]'
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-200">{item.label}</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-slate-400">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="border-t border-white/[0.07] px-4 py-3 text-[11px] leading-4 text-slate-400 sm:px-5">
                {data.integrations.note}
              </p>
            </Panel>
          </div>
        </div>

        <aside className="min-w-0 space-y-6">
          <Panel>
            <PanelHeader title="Quality snapshot" />
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-4">
                {hasCheckedVersions ? (
                  <ScoreRing
                    score={stats.average_score}
                    label="average"
                    size={82}
                    strokeWidth={7}
                  />
                ) : (
                  <div className="flex h-[82px] w-[82px] shrink-0 items-center justify-center rounded-full border border-dashed border-white/15 bg-white/[0.035] text-lg font-semibold text-slate-400">
                    —
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100">{qualityLabel}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    {hasCheckedVersions
                      ? `Average across ${stats.scored_documents} latest checked version${stats.scored_documents === 1 ? '' : 's'}.`
                      : 'Run a check on a current version to establish a baseline.'}
                  </p>
                </div>
              </div>

              {data.recent_scores.length > 0 ? (
                <div className="mt-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Latest checks
                  </p>
                  <div className="mt-2.5 space-y-2.5">
                    {data.recent_scores.slice(0, 4).map((item) => {
                      const tone = scoreTone(item.score);
                      return (
                        <button
                          key={item.document_id}
                          type="button"
                          onClick={() => navigate(`/content/${item.document_id}`)}
                          className="group block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-xs text-slate-300 group-hover:text-slate-100">
                              {item.title}
                            </span>
                            <span className={cn('shrink-0 text-xs font-semibold tabular-nums', tone.text)}>
                              {item.score}
                            </span>
                          </span>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
                            <span
                              className={cn('block h-full rounded-full', tone.bar)}
                              style={{ width: `${Math.min(100, Math.max(0, item.score))}%` }}
                            />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <details className="mt-4 border-t border-white/[0.07] pt-3">
                <summary className="cursor-pointer select-none rounded text-xs font-medium text-slate-400 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                  How is this score calculated?
                </summary>
                <p className="mt-2 text-[11px] leading-5 text-slate-400">
                  Each open finding deducts points from 100 based on its category and severity. Checks compare your
                  content against active workspace rules and approved facts. Human approvals are tracked separately.
                </p>
              </details>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Activity" description="Latest stored events." />
            {data.recent_activity.length === 0 ? (
              <p className="p-5 text-xs text-slate-400">No recorded activity yet.</p>
            ) : (
              <ol className="space-y-4 p-4 sm:p-5">
                {data.recent_activity.slice(0, 5).map((event) => (
                  <li key={event.id} className="flex gap-3">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500 ring-4 ring-brand-500/20"
                      aria-hidden
                    />
                    <button
                      type="button"
                      onClick={() => navigate(`/content/${event.document_id}`)}
                      className="group -mt-0.5 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <span className="line-clamp-2 block text-xs leading-5 text-slate-300 group-hover:text-slate-100">
                        {event.description}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-400">
                        {event.actor} · {relativeTime(event.created_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel>
            <div className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0b1224] text-white">
                  <Sparkles className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-100">Ask with evidence</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    The assistant answers from stored findings, facts, and campaign checks — and says when a claim is
                    not verified.
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="mt-4 w-full"
                onClick={() => navigate('/content')}
              >
                Open a document to ask
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          </Panel>

          {isAdmin ? (
            <Panel>
              <PanelHeader
                title="Governance signals"
                description="Computed from stored records."
                action={
                  <Button variant="ghost" size="sm" onClick={() => navigate('/insights')}>
                    <BarChart3 className="h-3.5 w-3.5" aria-hidden />
                    Insights
                  </Button>
                }
              />
              <dl className="divide-y divide-white/[0.08] px-2 py-2">
                {[
                  { label: 'Pending reviews', value: stats.pending_reviews, route: '/reviews' },
                  { label: 'Stale approvals', value: stats.stale_approvals, route: '/content' },
                  { label: 'Unresolved conflicts', value: stats.unresolved_conflicts, route: '/campaigns' },
                  { label: 'Outdated facts', value: stats.outdated_facts, route: '/brand' },
                ].map((row) => (
                  <button
                    key={row.label}
                    type="button"
                    onClick={() => navigate(row.route)}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <dt className="text-xs text-slate-300">{row.label}</dt>
                    <dd className="text-xs font-semibold tabular-nums text-slate-100">{row.value}</dd>
                  </button>
                ))}
              </dl>
            </Panel>
          ) : null}
        </aside>
      </div>

      {session?.workspace.is_demo ? (
        <InfoCallout tone="neutral" title="Demo data disclosure">
          Acme Cloud Technologies, its people, pricing, benchmarks, and claims are fictional and seeded for this
          demo workspace. Research records cite real public standards where linked; planned studies are labelled
          and were not conducted. Your role is <strong>{ROLE_LABEL[role]}</strong>.
        </InfoCallout>
      ) : (
        <InfoCallout tone="neutral" title="Workspace data notice">
          {session?.workspace.name || 'This workspace'} is a custom workspace. Audit findings are derived only
          from its saved rules and approved facts, which were entered by workspace users and are not independently
          verified. Your role is <strong>{ROLE_LABEL[role]}</strong>.
        </InfoCallout>
      )}
    </div>
  );
}
