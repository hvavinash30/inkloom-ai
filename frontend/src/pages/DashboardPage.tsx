import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FilePlus2,
  FileSearch,
  FileText,
  Layers,
  Mic,
  Pause,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
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

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

interface Slide {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  cta: string;
  icon: LucideIcon;
  accentTile: string;
  tint: string;
  orb: string;
  route?: string;
  assistant?: boolean;
}

const SLIDES: Slide[] = [
  {
    id: 'compliance',
    eyebrow: 'Brand compliance',
    title: 'Every asset checked against your brand memory',
    description:
      'Drafts, PDFs, transcripts, and video are compared with the rules and approved facts stored in this workspace — with the exact rule cited.',
    bullets: ['Rules + approved facts drive each check', 'Severity-ranked, evidence-linked findings', 'Human approvals tracked separately'],
    cta: 'Open brand library',
    icon: ShieldCheck,
    accentTile: 'bg-brand-50 text-brand-600 border-brand-100',
    tint: 'bg-gradient-to-br from-brand-50/90 via-white to-white',
    orb: 'bg-brand-300/40',
    route: '/brand',
  },
  {
    id: 'evidence',
    eyebrow: 'Evidence-backed auditing',
    title: 'Findings you can open, quote, and verify',
    description:
      'Each finding points back to the stored page, transcript span, or video frame that triggered it. Unverified claims are labelled instead of guessed.',
    bullets: ['Page and excerpt references', 'Grouped by category and severity', 'Unverified items flagged honestly'],
    cta: 'Browse content',
    icon: FileSearch,
    accentTile: 'bg-aqua-50 text-cyan-700 border-cyan-100',
    tint: 'bg-gradient-to-br from-cyan-50/80 via-white to-white',
    orb: 'bg-cyan-300/35',
    route: '/content',
  },
  {
    id: 'approvals',
    eyebrow: 'Collaborative approvals',
    title: 'Review decisions bound to the exact version',
    description:
      'Reviewers inspect the version that was submitted, leave comments on the record, and approve or send it back with a documented reason.',
    bullets: ['Version-specific decisions', 'Stale approvals surfaced automatically', 'Assignments and comments stay on record'],
    cta: 'Open review queue',
    icon: ClipboardCheck,
    accentTile: 'bg-violet-50 text-violet-600 border-violet-100',
    tint: 'bg-gradient-to-br from-violet-50/80 via-white to-white',
    orb: 'bg-violet-300/35',
    route: '/reviews',
  },
  {
    id: 'insights',
    eyebrow: 'Governance insights',
    title: 'A governance picture built from stored records',
    description:
      'Average checks, campaign conflicts, stale approvals, and outdated facts are computed from real workspace data — never from placeholder metrics.',
    bullets: ['Workspace-scoped reporting', 'Campaign conflict tracking', 'Outdated facts and approvals'],
    cta: 'View governance insights',
    icon: BarChart3,
    accentTile: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    tint: 'bg-gradient-to-br from-emerald-50/70 via-white to-white',
    orb: 'bg-emerald-300/30',
    route: '/insights',
  },
  {
    id: 'voice',
    eyebrow: 'Voice-assisted workflow',
    title: 'Ask by voice, verify the answer in the record',
    description:
      'Open a page, find a document, or ask about a finding using your browser’s speech recognition. Answers stay grounded in this workspace, and typing always works.',
    bullets: ['Browser speech recognition where supported', 'Pages and documents by voice', 'Typed fallback and spoken-reply controls'],
    cta: 'Open voice assistant',
    icon: Mic,
    accentTile: 'bg-brand-50 text-brand-600 border-brand-100',
    tint: 'bg-gradient-to-br from-brand-50/80 via-white to-violet-50/60',
    orb: 'bg-violet-300/35',
    assistant: true,
  },
];

function CapabilityCarousel({ onOpenAssistant }: { onOpenAssistant: () => void }) {
  const [index, setIndex] = useState(0);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const paused = hoverPaused || focusPaused || userPaused || reducedMotion;
  const total = SLIDES.length;

  const goTo = (next: number) => setIndex(((next % total) + total) % total);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => setIndex((current) => (current + 1) % total), 6500);
    return () => window.clearTimeout(timer);
  }, [index, paused, total]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Inkloom platform highlights"
      tabIndex={0}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocusCapture={() => setFocusPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusPaused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          goTo(index + 1);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          goTo(index - 1);
        }
      }}
      className="surface-card group/carousel relative overflow-hidden rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
    >
      <div
        className="flex transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {SLIDES.map((slide, slideIndex) => {
          const Icon = slide.icon;
          const active = slideIndex === index;
          return (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${slideIndex + 1} of ${total}: ${slide.eyebrow}`}
              aria-hidden={!active}
              className={cn('w-full shrink-0', slide.tint)}
            >
              <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-center">
                <span className={cn('ambient-orb -left-16 -top-20 h-52 w-52', slide.orb)} aria-hidden />
                <span className="ambient-orb -bottom-24 right-1/4 h-44 w-44 bg-white/70" aria-hidden />
                <div className="relative min-w-0">
                  <span className="eyebrow">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {slide.eyebrow}
                  </span>
                  <h2 className="mt-3 max-w-xl font-display text-xl font-extrabold leading-tight tracking-tight text-ink-950 sm:text-2xl">
                    {slide.title}
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-ink-600">{slide.description}</p>
                  <ul className="mt-3 hidden flex-wrap gap-x-4 gap-y-1.5 sm:flex">
                    {slide.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-center gap-1.5 text-[11px] font-medium text-ink-600">
                        <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" aria-hidden />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant={slide.assistant ? 'primary' : 'secondary'}
                      tabIndex={active ? 0 : -1}
                      onClick={() => {
                        if (slide.assistant) {
                          onOpenAssistant();
                          return;
                        }
                        if (slide.route) navigate(slide.route);
                      }}
                    >
                      {slide.assistant ? <Mic className="h-3.5 w-3.5" aria-hidden /> : null}
                      {slide.cta}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                    <span className="text-[11px] text-ink-400">
                      {String(slideIndex + 1).padStart(2, '0')}
                      <span className="sr-only"> of </span>
                      <span aria-hidden> / </span>
                      {String(total).padStart(2, '0')}
                    </span>
                  </div>
                </div>
                <div className="relative hidden items-center justify-center lg:flex" aria-hidden>
                  <div className={cn('absolute h-44 w-44 rounded-full border bg-white/50', slide.accentTile.split(' ')[2])} />
                  <div className={cn('absolute h-32 w-32 rounded-full border border-dashed bg-white/40', slide.accentTile.split(' ')[2])} />
                  <div className={cn('absolute h-20 w-20 rounded-full opacity-60 blur-xl', slide.accentTile.split(' ')[0])} />
                  <span className={cn('relative flex h-16 w-16 items-center justify-center rounded-2xl border bg-white shadow-card', slide.accentTile)}>
                    <Icon className="h-7 w-7" aria-hidden />
                  </span>
                  <span className="absolute -right-1 top-6 h-2.5 w-2.5 rounded-full bg-brand-400/70" />
                  <span className="absolute bottom-8 -left-2 h-2 w-2 rounded-full bg-violet-400/70" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] bg-white/85 py-2.5 pl-4 pr-20 backdrop-blur sm:pl-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            aria-label="Previous highlight"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line-strong)] bg-white text-ink-600 transition-colors hover:border-brand-200 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <div className="flex items-center gap-1.5" aria-label="Choose highlight">
            {SLIDES.map((slide, dotIndex) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => goTo(dotIndex)}
                aria-label={`Show ${slide.eyebrow}`}
                aria-current={dotIndex === index ? 'true' : undefined}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                  dotIndex === index ? 'w-6 bg-gradient-to-r from-brand-500 to-violet-500' : 'w-1.5 bg-ink-200 hover:bg-ink-300'
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            aria-label="Next highlight"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line-strong)] bg-white text-ink-600 transition-colors hover:border-brand-200 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] font-medium tabular-nums text-ink-400" aria-live="polite">
            {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </span>
          {reducedMotion ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-ink-50 px-2 py-1 text-[10px] font-medium text-ink-500">
              Auto-play off · reduced motion
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setUserPaused((value) => !value)}
              aria-pressed={userPaused}
              aria-label={userPaused ? 'Resume automatic highlights' : 'Pause automatic highlights'}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-white px-2.5 py-1 text-[10px] font-semibold text-ink-600 transition-colors hover:border-brand-200 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              {userPaused ? <Play className="h-3 w-3" aria-hidden /> : <Pause className="h-3 w-3" aria-hidden />}
              {userPaused ? 'Resume' : 'Pause'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

type KpiTone = 'brand' | 'danger' | 'warning' | 'success';

const KPI_TONE: Record<KpiTone, { dot: string; tile: string }> = {
  brand: { dot: 'bg-brand-500', tile: 'border-brand-100 bg-brand-50 text-brand-600' },
  danger: { dot: 'bg-rose-500', tile: 'border-rose-100 bg-rose-50 text-rose-600' },
  warning: { dot: 'bg-amber-500', tile: 'border-amber-100 bg-amber-50 text-amber-600' },
  success: { dot: 'bg-emerald-500', tile: 'border-emerald-100 bg-emerald-50 text-emerald-600' },
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
    'surface-card lift group relative flex min-h-[148px] flex-col overflow-hidden rounded-2xl p-4 text-left sm:p-5',
    onClick &&
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2'
  );
  const body = (
    <>
      <span
        className={cn(
          'absolute -right-8 -top-10 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-60',
          tone === 'brand' ? 'bg-brand-200' : tone === 'danger' ? 'bg-rose-200' : tone === 'warning' ? 'bg-amber-200' : 'bg-emerald-200'
        )}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        <span className="text-xs font-semibold leading-5 text-ink-500">{label}</span>
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border', KPI_TONE[tone].tile)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <div className="relative mt-2 flex items-center gap-2">
        <span className="font-display text-[28px] font-extrabold leading-none tracking-tight text-ink-950 tabular-nums sm:text-[30px]">
          {value}
        </span>
        <span className={cn('h-1.5 w-1.5 rounded-full', KPI_TONE[tone].dot)} aria-hidden />
      </div>
      <p className="relative mt-2 text-xs leading-5 text-ink-500">{hint}</p>
      {typeof meter === 'number' ? (
        <div className="relative mt-auto pt-3" aria-hidden>
          <div className="h-1 overflow-hidden rounded-full bg-ink-100">
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
  return <section className={cn('surface-card overflow-hidden rounded-2xl', className)}>{children}</section>;
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
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-[var(--line)] px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-[15px] font-bold tracking-tight text-ink-900">{title}</h2>
          {meta}
        </div>
        {description ? <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function CountPill({ count, label }: { count: number; label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
      <span className="tabular-nums">{count}</span>
      <span className="sr-only"> {label}</span>
    </span>
  );
}

function TableColumns({ first }: { first: string }) {
  return (
    <div
      className={cn(
        'hidden items-center gap-x-3 border-b border-[var(--line)] bg-ink-50/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400 md:grid sm:px-5',
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
    return <span className="text-xs text-ink-400">Not checked</span>;
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
          doc.latest_score === null ? 'border-[var(--line)] bg-ink-50 text-ink-600' : cn(tone.bg, tone.border, tone.text)
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
        className="group block w-full text-left transition-colors hover:bg-brand-50/50 focus-visible:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
      >
        <span className={cn('grid items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5', TABLE_GRID)}>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink-900" title={doc.title}>
              {doc.title}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-5 text-ink-500">
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
                <span className="inline-flex items-center gap-1 font-medium text-amber-700">
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
              className="h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
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
        className="group block w-full text-left transition-colors hover:bg-brand-50/50 focus-visible:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
      >
        <span className={cn('grid items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5', TABLE_GRID)}>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink-900" title={doc.title}>
              {doc.title}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-5 text-ink-500">
              <span className="capitalize">{doc.asset_type}</span>
              <span aria-hidden>·</span>
              <span>v{doc.current_version_number}</span>
              <span aria-hidden>·</span>
              <span>Updated {relativeTime(doc.updated_at)}</span>
              {doc.approval_stale ? (
                <span className="inline-flex items-center gap-1 font-medium text-amber-700">
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
              className="h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
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
      <div className="m-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 sm:m-5">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-emerald-900">
            {canReviewQueue ? 'No additional signals' : "You're caught up"}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-emerald-700">
            {canReviewQueue
              ? 'Everything currently awaiting attention is already listed in your review queue.'
              : 'No review requests or urgent findings are waiting for you right now.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--line)]">
      {items.map((item, index) => {
        const Icon = attentionIcon(item.kind);
        const high = item.severity === 'high';
        return (
          <li key={`${item.kind}:${item.route}:${item.title}:${index}`}>
            <button
              type="button"
              onClick={() => navigate(item.route)}
              className="group flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-brand-50/50 focus-visible:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400 sm:px-5"
            >
              <span
                className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                  high ? 'border-rose-100 bg-rose-50 text-rose-600' : 'border-amber-100 bg-amber-50 text-amber-600'
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink-900">{item.title}</span>
                  <SeverityBadge severity={high ? 'high' : 'medium'} />
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-ink-500">{item.description}</span>
              </span>
              <ChevronRight
                className="mt-1.5 h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
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
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-100 bg-brand-50 text-brand-600">
          <ClipboardCheck className="h-5 w-5" aria-hidden />
        </span>
        <p className="mt-3 text-sm font-semibold text-ink-900">
          {canReviewQueue ? 'Review items are ready' : 'Open submissions are outside this list'}
        </p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-ink-500">
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
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-600">
        <CheckCircle2 className="h-5 w-5" aria-hidden />
      </span>
      <p className="mt-3 text-sm font-semibold text-ink-900">
        {canReviewQueue ? 'No versions are waiting' : 'Nothing is in review yet'}
      </p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-ink-500">
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
  const { session, role, can, openAssistant } = useSession();
  const { data, loading, error, reload } = useAsync(() => api.getDashboard(), [role]);
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading Overview">
        <div className="surface-card space-y-4 rounded-3xl p-6">
          <div className="h-3 w-56 animate-pulse rounded bg-ink-100" />
          <div className="h-9 w-80 max-w-full animate-pulse rounded-lg bg-ink-100" />
          <div className="h-4 w-[32rem] max-w-full animate-pulse rounded bg-ink-100" />
        </div>
        <div className="h-[286px] animate-pulse rounded-3xl border border-[var(--line)] bg-ink-100/60" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[148px] animate-pulse rounded-2xl border border-[var(--line)] bg-white" />
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_336px]">
          <div className="h-[420px] animate-pulse rounded-2xl border border-[var(--line)] bg-white" />
          <div className="h-[300px] animate-pulse rounded-2xl border border-[var(--line)] bg-white" />
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
    ? RISK_LABEL[stats.average_score >= 85 ? 'low' : stats.average_score >= 70 ? 'medium' : 'high']
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
      <header className="hero-mesh relative overflow-hidden rounded-3xl border border-[var(--line)] shadow-card">
        <span className="ambient-orb -left-20 -top-24 h-64 w-64 animate-drift bg-brand-300/35" aria-hidden />
        <span className="ambient-orb -right-16 top-0 h-56 w-56 animate-float-slow bg-aqua-300/35" aria-hidden />
        <div className="relative flex flex-col gap-5 p-5 sm:p-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 max-w-2xl">
            <p className="eyebrow">
              <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-brand-500 to-violet-500" aria-hidden />
              {session?.workspace.is_demo
                ? 'Demo workspace · fictional Acme Cloud scenario'
                : `${session?.workspace.name || 'Brand workspace'} · custom workspace`}
            </p>
            <h1 className="mt-3 font-display text-[30px] font-extrabold leading-[1.1] tracking-tight text-ink-950 sm:text-[38px]">
              {greeting()}, <span className="text-gradient-brand">{firstName}</span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-600 sm:text-[15px]">
              {isReviewer
                ? 'Review submitted versions, inspect stored evidence, and record decisions against the exact version you reviewed.'
                : isAdmin
                  ? 'Your governance picture, built from stored checks, version-bound approvals, and campaign conflicts.'
                  : 'Draft and check content, fix evidence-backed findings, and track your submissions through review.'}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/80 px-2.5 py-1 text-[11px] font-medium text-ink-600">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden />
                {ROLE_LABEL[role]} view
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/80 px-2.5 py-1 text-[11px] font-medium text-ink-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                Evidence-first audits
              </span>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:w-auto xl:shrink-0 xl:justify-end">
            <Button size="lg" className="w-full sm:w-auto" onClick={() => navigate('/content/new')}>
              <FilePlus2 className="h-4 w-4" aria-hidden />
              Start an audit
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => openAssistant({ pageContext: '/', voice: true })}
            >
              <Mic className="h-4 w-4" aria-hidden />
              Ask with voice
            </Button>
            {canReviewQueue ? (
              <Button
                variant="ghost"
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

      <CapabilityCarousel onOpenAssistant={() => openAssistant({ pageContext: '/', voice: true })} />

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
              title={canReviewQueue ? 'Pending reviews' : 'Your submissions'}
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
                <ul className="divide-y divide-[var(--line)]">
                  {queueDocs.map((doc) => (
                    <QueueRow key={doc.id} doc={doc} showAuthor={canReviewQueue} />
                  ))}
                </ul>
                {showQueueOverflow ? (
                  <div className="border-t border-[var(--line)] bg-ink-50/60 px-4 py-2.5 text-xs text-ink-500 sm:px-5">
                    Showing {queueDocs.length} of {stats.pending_reviews} awaiting review.{' '}
                    <button
                      type="button"
                      onClick={() => navigate(canReviewQueue ? '/reviews' : '/content')}
                      className="font-semibold text-brand-700 underline-offset-2 hover:text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
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
                isReviewer ? 'Other attention signals' : isAdmin ? 'Attention signals' : 'Needs attention'
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
              title="Recent documents"
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
                <ul className="divide-y divide-[var(--line)]">
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
                  <p className="text-xs text-ink-500">No campaigns yet.</p>
                ) : (
                  data.campaigns.map((campaign) => (
                    <button
                      key={campaign.id}
                      type="button"
                      onClick={() => navigate(`/campaigns/${campaign.id}`)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-left transition-colors hover:border-brand-200 hover:bg-brand-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-ink-800">{campaign.name}</span>
                        <span className="mt-0.5 block text-[11px] text-ink-500">
                          {campaign.assets_count} asset{campaign.assets_count === 1 ? '' : 's'}
                        </span>
                      </span>
                      <StatusBadge status={campaign.status} />
                    </button>
                  ))
                )}
                {stats.unresolved_conflicts > 0 ? (
                  <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" aria-hidden />
                    <span>
                      {stats.unresolved_conflicts} unresolved conflict
                      {stats.unresolved_conflicts === 1 ? '' : 's'} across campaign assets.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
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
                      ? 'Configured on the server — automatic speech-to-text'
                      : 'Not configured — manual transcript or on-screen text only',
                  },
                ].map((item) => (
                  <div key={item.label} className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                        item.active ? 'bg-emerald-500' : 'bg-ink-300'
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ink-800">{item.label}</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-ink-500">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="border-t border-[var(--line)] px-4 py-3 text-[11px] leading-4 text-ink-500 sm:px-5">
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
                  <ScoreRing score={stats.average_score} label="average" size={82} strokeWidth={7} />
                ) : (
                  <div className="flex h-[82px] w-[82px] shrink-0 items-center justify-center rounded-full border border-dashed border-ink-200 bg-ink-50 text-lg font-semibold text-ink-400">
                    —
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">{qualityLabel}</p>
                  <p className="mt-1 text-xs leading-5 text-ink-500">
                    {hasCheckedVersions
                      ? `Average across ${stats.scored_documents} latest checked version${stats.scored_documents === 1 ? '' : 's'}.`
                      : 'Run a check on a current version to establish a baseline.'}
                  </p>
                </div>
              </div>

              {data.recent_scores.length > 0 ? (
                <div className="mt-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">Recent audits</p>
                  <div className="mt-2.5 space-y-2.5">
                    {data.recent_scores.slice(0, 4).map((item) => {
                      const tone = scoreTone(item.score);
                      return (
                        <button
                          key={item.document_id}
                          type="button"
                          onClick={() => navigate(`/content/${item.document_id}`)}
                          className="group block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-xs text-ink-600 group-hover:text-ink-900">
                              {item.title}
                            </span>
                            <span className={cn('shrink-0 text-xs font-semibold tabular-nums', tone.text)}>
                              {item.score}
                            </span>
                          </span>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden>
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

              <details className="mt-4 border-t border-[var(--line)] pt-3">
                <summary className="cursor-pointer select-none rounded text-xs font-medium text-ink-500 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300">
                  How is this score calculated?
                </summary>
                <p className="mt-2 text-[11px] leading-5 text-ink-500">
                  Each open finding deducts points from 100 based on its category and severity. Checks compare your
                  content against active workspace rules and approved facts. Human approvals are tracked separately.
                </p>
              </details>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Activity" description="Latest stored events." />
            {data.recent_activity.length === 0 ? (
              <p className="p-5 text-xs text-ink-500">No recorded activity yet.</p>
            ) : (
              <ol className="space-y-4 p-4 sm:p-5">
                {data.recent_activity.slice(0, 5).map((event) => (
                  <li key={event.id} className="flex gap-3">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500 ring-4 ring-brand-100"
                      aria-hidden
                    />
                    <button
                      type="button"
                      onClick={() => navigate(`/content/${event.document_id}`)}
                      className="group -mt-0.5 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                    >
                      <span className="line-clamp-2 block text-xs leading-5 text-ink-600 group-hover:text-ink-900">
                        {event.description}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-ink-400">
                        {event.actor} · {relativeTime(event.created_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <section className="relative overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-600 via-brand-600 to-violet-600 p-5 text-white shadow-glow-brand">
            <span className="ambient-orb -right-10 -top-12 h-36 w-36 bg-white/20" aria-hidden />
            <span className="ambient-orb -bottom-16 -left-8 h-32 w-32 bg-aqua-300/30" aria-hidden />
            <div className="relative flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                <Sparkles className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="font-display text-sm font-bold">Ask with evidence</p>
                <p className="mt-1 text-xs leading-5 text-brand-50/90">
                  Ask by voice or text. The assistant answers from stored findings, facts, and campaign checks — and
                  says when a claim is not verified.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openAssistant({ pageContext: '/', voice: true })}
              className="relative mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-brand-700 shadow-subtle transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-600"
            >
              <Mic className="h-3.5 w-3.5" aria-hidden />
              Open voice assistant
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </button>
            <p className="relative mt-2 text-[10px] leading-4 text-brand-100/80">
              Browser speech recognition where supported. Typing is always available.
            </p>
          </section>

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
              <dl className="divide-y divide-[var(--line)] px-2 py-2">
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
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-brand-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                  >
                    <dt className="text-xs text-ink-600">{row.label}</dt>
                    <dd className="text-xs font-semibold tabular-nums text-ink-900">{row.value}</dd>
                  </button>
                ))}
              </dl>
            </Panel>
          ) : null}
        </aside>
      </div>

      {noticeDismissed ? null : session?.workspace.is_demo ? (
        <div className="relative">
          <InfoCallout tone="neutral" title="Demo data disclosure">
            Acme Cloud Technologies, its people, pricing, benchmarks, and claims are fictional and seeded for this
            demo workspace. Research records cite real public standards where linked; planned studies are labelled
            and were not conducted. Your role is <strong>{ROLE_LABEL[role]}</strong>.
          </InfoCallout>
          <button
            type="button"
            onClick={() => setNoticeDismissed(true)}
            className="absolute right-3 top-3 rounded px-1.5 py-0.5 text-[10px] font-semibold text-ink-400 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            aria-label="Dismiss demo disclosure"
          >
            Dismiss
          </button>
        </div>
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
