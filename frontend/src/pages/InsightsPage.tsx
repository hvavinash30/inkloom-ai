import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileWarning,
  Filter,
  Layers,
  RefreshCw,
  Scale,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { navigate, useAsync } from '../lib/router';
import { api } from '../services/api';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  InfoCallout,
  Input,
  LoadingBlock,
  PageHeader,
  Select,
  SeverityBadge,
  StatCard,
  cn,
} from '../components/ui';
import { CAPABILITY_LABEL, SEVERITY_LABEL, formatDateTime, titleCase } from '../lib/format';
import { formatOverrideRate, hiddenCount } from '../lib/insights';
import type { InsightsData, Severity } from '../types';

const SEVERITY_BAR: Record<string, string> = {
  critical: 'bg-rose-600',
  high: 'bg-orange-500',
  medium: 'bg-amber-400',
  low: 'bg-slate-300',
};

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

const FACT_STATUS_TONE: Record<string, string> = {
  verified: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  needs_review: 'border-amber-200 bg-amber-50 text-amber-700',
  expired: 'border-rose-200 bg-rose-50 text-rose-700',
  draft: 'border-slate-200 bg-slate-50 text-slate-600',
};

const HEALTH_TONE: Record<string, { wrap: string; text: string; icon: typeof CheckCircle2 }> = {
  healthy: { wrap: 'border-emerald-200 bg-emerald-50/60', text: 'text-emerald-950', icon: CheckCircle2 },
  good: { wrap: 'border-emerald-200 bg-emerald-50/60', text: 'text-emerald-950', icon: CheckCircle2 },
  needs_attention: { wrap: 'border-amber-200 bg-amber-50/60', text: 'text-amber-950', icon: AlertTriangle },
  at_risk: { wrap: 'border-rose-200 bg-rose-50/60', text: 'text-rose-950', icon: AlertTriangle },
};

function healthInfo(status: string) {
  const key = status.toLowerCase().replace(/\s+/g, '_');
  return HEALTH_TONE[key] || { wrap: 'border-slate-200 bg-slate-50', text: 'text-slate-900', icon: BarChart3 };
}

function Bars({
  counts,
  labeler,
  total,
}: {
  counts: Record<string, number>;
  labeler?: (value: string) => string;
  total: number;
}) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return <p className="py-4 text-xs text-slate-400">No findings recorded in this scope.</p>;
  }
  return (
    <div className="space-y-2.5">
      {entries.map(([key, count]) => (
        <div key={key}>
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-600">{labeler ? labeler(key) : titleCase(key)}</span>
            <span className="tabular-nums text-slate-400">
              {count}
              <span className="ml-1 text-slate-300">{total > 0 ? `${Math.round((count / total) * 100)}%` : ''}</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn('h-full rounded-full', SEVERITY_BAR[key] || 'bg-brand-400')}
              style={{ width: `${total > 0 ? Math.max(2, (count / total) * 100) : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ScopeFilters({
  data,
  filters,
  setFilters,
  reload,
  loading,
}: {
  data: InsightsData;
  filters: Record<string, string>;
  setFilters: (next: Record<string, string>) => void;
  reload: () => void;
  loading: boolean;
}) {
  const options = data.filter_options;
  const contentTypes = options.content_types ?? options.content_type ?? [];
  const assetTypes = options.asset_types ?? options.asset_type ?? [];
  const statuses = options.statuses ?? options.status ?? [];
  const hasFilters = Object.values(filters).some(Boolean);
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          Scope
        </p>
        <div className="flex items-center gap-2">
          {hasFilters ? (
            <button
              type="button"
              className="text-[11px] font-medium text-brand-700 hover:underline"
              onClick={() => setFilters({})}
            >
              Reset
            </button>
          ) : null}
          <button
            type="button"
            onClick={reload}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-900"
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <Select
          value={filters.content_type || ''}
          onChange={(event) => setFilters({ ...filters, content_type: event.target.value })}
          aria-label="Filter by content type"
        >
          <option value="">All content types</option>
          {contentTypes.map((value) => (
            <option key={String(value)} value={String(value)}>
              {titleCase(String(value))}
            </option>
          ))}
        </Select>
        <Select
          value={filters.asset_type || ''}
          onChange={(event) => setFilters({ ...filters, asset_type: event.target.value })}
          aria-label="Filter by asset type"
        >
          <option value="">All formats</option>
          {assetTypes.map((value) => (
            <option key={String(value)} value={String(value)}>
              {titleCase(String(value))}
            </option>
          ))}
        </Select>
        <Select
          value={filters.status || ''}
          onChange={(event) => setFilters({ ...filters, status: event.target.value })}
          aria-label="Filter by document status"
        >
          <option value="">All statuses</option>
          {statuses.map((value) => (
            <option key={String(value)} value={String(value)}>
              {titleCase(String(value))}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={filters.date_from || ''}
          onChange={(event) => setFilters({ ...filters, date_from: event.target.value })}
          aria-label="From date"
        />
        <Input
          type="date"
          value={filters.date_to || ''}
          onChange={(event) => setFilters({ ...filters, date_to: event.target.value })}
          aria-label="To date"
        />
      </div>
    </Card>
  );
}

function SignalMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-slate-50 px-2 py-1.5 text-center">
      <p className="text-sm font-semibold tabular-nums text-slate-800">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

function scrollToSignal(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function windowLabel(from: string | null, to: string | null) {
  if (!from && !to) return 'not time-bound';
  const start = from ? formatDateTime(from) : 'earliest record';
  const end = to ? formatDateTime(to) : 'latest record';
  return `${start} – ${end}`;
}

export function InsightsPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const { data, loading, error, reload } = useAsync(
    () =>
      api.getInsights({
        content_type: filters.content_type || undefined,
        asset_type: filters.asset_type || undefined,
        status: filters.status || undefined,
        date_from: filters.date_from ? `${filters.date_from}T00:00:00` : undefined,
        date_to: filters.date_to ? `${filters.date_to}T23:59:59` : undefined,
      }),
    [filters.content_type, filters.asset_type, filters.status, filters.date_from, filters.date_to]
  );

  const totalFindings = useMemo(() => {
    if (!data) return 0;
    return Object.values(data.violations_by_severity).reduce((sum, value) => sum + value, 0);
  }, [data]);

  if (loading && !data) {
    return (
      <div>
        <div className="mb-6 h-20 animate-pulse rounded-xl border border-slate-100 bg-white" />
        <LoadingBlock rows={5} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <PageHeader eyebrow="Governance reporting" title="Insights" />
        <ErrorState message={error || 'Insights could not be loaded.'} retry={reload} />
      </div>
    );
  }

  const health = healthInfo(data.governance_health_status);
  const HealthIcon = health.icon;
  const severityEntries = SEVERITY_ORDER.map((severity) => [
    severity,
    data.violations_by_severity[severity] || 0,
  ]).filter(([, count]) => Number(count) > 0) as [string, number][];
  const maxDistribution = Math.max(1, ...data.score_distribution.map((item) => item.count));
  const noAudits = data.total_audits_evaluated === 0;
  const signals = data.risk_signal_counts;
  const factSignal = data.facts_needing_verification;
  const guidelineSignal = data.unclear_guidelines;

  return (
    <div>
      <PageHeader
        eyebrow="Organization workspace"
        title="Governance insights"
        description="Aggregated from stored audit runs, findings, approvals, and campaign conflicts. Every number here can be traced to records in this workspace."
        actions={
          <Button variant="secondary" onClick={() => navigate('/research')}>
            Research & validation
            <ArrowRight className="h-4 w-4" />
          </Button>
        }
      />

      <ScopeFilters data={data} filters={filters} setFilters={setFilters} reload={reload} loading={loading} />

      <div className={cn('mt-4 rounded-xl border p-4', health.wrap)}>
        <div className="flex items-start gap-3">
          <HealthIcon className={cn('mt-0.5 h-5 w-5 shrink-0', health.text)} />
          <div className="min-w-0">
            <p className={cn('text-sm font-semibold', health.text)}>
              Governance health: {titleCase(data.governance_health_status)}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-slate-600">{data.scope_note}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Average check score"
          value={noAudits ? '—' : data.average_score.toFixed(1)}
          hint={`${data.total_audits_evaluated} audit run${data.total_audits_evaluated === 1 ? '' : 's'} evaluated`}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label="Documents evaluated"
          value={data.documents_evaluated}
          hint={`${data.audits_all_time} audit runs all time`}
          icon={Layers}
          tone="brand"
        />
        <StatCard
          label="Review turnaround"
          value={
            data.review_turnaround_hours === null ? '—' : `${data.review_turnaround_hours.toFixed(1)}h`
          }
          hint={
            data.turnaround_sample_size
              ? `Median from ${data.turnaround_sample_size} decision${data.turnaround_sample_size === 1 ? '' : 's'}`
              : 'No completed decisions yet'
          }
          icon={Clock3}
        />
        <StatCard
          label="Outstanding actions"
          value={data.outstanding_actions_count}
          hint="Facts to review and unresolved conflicts"
          icon={CalendarClock}
          tone={data.outstanding_actions_count > 0 ? 'warning' : 'success'}
        />
      </div>

      {noAudits ? (
        <Card className="mt-5 p-5">
          <EmptyState
            icon={FileWarning}
            title="No audit runs match this scope"
            description="Insights are calculated only from stored checks. Create and check content, or widen the filters."
            action={
              <Button size="sm" onClick={() => navigate('/content/new')}>
                Check new content
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Findings by severity</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Open and resolved findings in the evaluated audit runs.
                  </p>
                </div>
                <Badge className="border-slate-200 bg-slate-50 text-slate-500">{totalFindings} total</Badge>
              </div>
              <div className="mt-4">
                <Bars
                  counts={Object.fromEntries(severityEntries)}
                  labeler={(value) => SEVERITY_LABEL[value as Severity] || titleCase(value)}
                  total={totalFindings}
                />
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Findings by category</h2>
                  <p className="mt-0.5 text-xs text-slate-500">What kind of governance issues dominate this scope.</p>
                </div>
              </div>
              <div className="mt-4">
                <Bars counts={data.violations_by_category} total={totalFindings} />
              </div>
            </Card>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-5">
              <Card className="overflow-hidden">
                <div className="border-b border-slate-100 px-4 py-3.5">
                  <h2 className="text-sm font-semibold text-slate-900">Most violated active rules</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Rule-linked findings, counted from stored audit runs.</p>
                </div>
                {data.top_violated_rules.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-slate-400">No rule-linked findings in this scope.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {data.top_violated_rules.map((rule) => (
                      <div key={rule.rule_id} className="flex items-center gap-3 px-4 py-3">
                        <span className="flex-1 min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-800">{rule.rule_name}</span>
                          <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-slate-400">
                            {titleCase(rule.rule_type)} · {rule.severity}
                          </span>
                        </span>
                        <SeverityBadge severity={rule.severity} />
                        <span className="w-10 text-right text-sm font-semibold tabular-nums text-slate-700">
                          {rule.violations}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="p-5">
                <h2 className="text-sm font-semibold text-slate-900">Recurring patterns</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Repeated evidence from current audits, with a suggested governance action.
                </p>
                {data.recurring_patterns.length === 0 ? (
                  <p className="py-6 text-xs text-slate-400">No repeated open issues were found in this scope.</p>
                ) : (
                  <div className="mt-3 space-y-2.5">
                    {data.recurring_patterns.map((pattern, index) => (
                      <div key={`${pattern.category}-${index}`} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-800">{titleCase(pattern.category)}</span>
                          <span className="flex items-center gap-2">
                            <SeverityBadge severity={pattern.severity} />
                            <span className="text-[10px] text-slate-400">{pattern.count} finding{pattern.count === 1 ? '' : 's'}</span>
                          </span>
                        </div>
                        <p className="mt-1.5 break-words rounded bg-slate-50 px-2 py-1.5 font-mono text-[11px] leading-4 text-slate-600">
                          {pattern.sample_affected_text}
                        </p>
                        <p className="mt-1.5 text-[11px] leading-5 text-slate-500">{pattern.recommendation}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <aside className="min-w-0 space-y-5">
              <Card className="p-5">
                <h2 className="text-sm font-semibold text-slate-900">Score distribution</h2>
                <p className="mt-0.5 text-xs text-slate-500">Current evaluated versions, out of 100.</p>
                <div className="mt-4 space-y-2.5">
                  {data.score_distribution.map((bucket) => (
                    <div key={bucket.label}>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-600">{bucket.label}</span>
                        <span className="tabular-nums text-slate-400">{bucket.count}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            bucket.min >= 85
                              ? 'bg-emerald-500'
                              : bucket.min >= 70
                                ? 'bg-amber-500'
                                : bucket.min >= 50
                                  ? 'bg-orange-500'
                                  : 'bg-rose-500'
                          )}
                          style={{ width: `${(bucket.count / maxDistribution) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="text-sm font-semibold text-slate-900">Open governance gaps</h2>
                <div className="mt-3 space-y-3">
                  <button
                    type="button"
                    onClick={() => navigate('/campaigns')}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50"
                  >
                    <span>
                      <span className="block text-xs font-medium text-slate-700">Campaign conflicts</span>
                      <span className="block text-[10px] text-slate-400">
                        {data.campaigns_with_unresolved_conflicts} campaign
                        {data.campaigns_with_unresolved_conflicts === 1 ? '' : 's'} affected
                      </span>
                    </span>
                    <span
                      className={cn(
                        'text-sm font-semibold tabular-nums',
                        data.unresolved_campaign_conflicts ? 'text-rose-700' : 'text-emerald-700'
                      )}
                    >
                      {data.unresolved_campaign_conflicts}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/brand')}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50"
                  >
                    <span>
                      <span className="block text-xs font-medium text-slate-700">Facts needing review</span>
                      <span className="block text-[10px] text-slate-400">Expired, flagged, or past review date</span>
                    </span>
                    <span
                      className={cn(
                        'text-sm font-semibold tabular-nums',
                        data.outdated_facts_count ? 'text-amber-700' : 'text-emerald-700'
                      )}
                    >
                      {data.outdated_facts_count}
                    </span>
                  </button>
                </div>
              </Card>

              <Card className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Method</p>
                <ul className="mt-2 space-y-1.5 text-[11px] leading-4 text-slate-500">
                  <li>• Averages use the latest audit run per evaluated document.</li>
                  <li>• Turnaround uses stored decision timestamps on submitted versions.</li>
                  <li>• No external benchmarks, industry averages, or invented survey data are shown.</li>
                  <li>• Scores aid workflow; they are not legal risk ratings.</li>
                </ul>
                <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
                  Generated {formatDateTime(data.generated_at)}
                  {data.is_demo ? ' · demo workspace data' : ''}
                </p>
              </Card>
            </aside>
          </div>
        </>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-slate-900">Governance risk signals</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Each signal is derived from stored workspace records and reports its own sample size. Select a card to jump to
          the underlying evidence.
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Recurring violations"
          value={signals.recurring_violation_groups ?? 0}
          hint="Rule or pattern groups across stored runs"
          icon={ShieldAlert}
          tone={(signals.recurring_violation_groups ?? 0) > 0 ? 'warning' : 'success'}
          onClick={() => scrollToSignal('recurring-violations')}
        />
        <StatCard
          label="Rules overridden"
          value={signals.overridden_rule_groups ?? 0}
          hint="Rules dismissed with a recorded reason"
          icon={Scale}
          tone={(signals.overridden_rule_groups ?? 0) > 0 ? 'warning' : 'success'}
          onClick={() => scrollToSignal('overridden-rules')}
        />
        <StatCard
          label="Facts needing verification"
          value={factSignal.count}
          hint={`of ${factSignal.total_active_facts} active approved facts`}
          icon={ClipboardCheck}
          tone={factSignal.count > 0 ? 'danger' : 'success'}
          onClick={() => scrollToSignal('facts-verification')}
        />
        <StatCard
          label="Unclear guideline signals"
          value={guidelineSignal.count}
          hint={`of ${guidelineSignal.evaluated_rules} active rules`}
          icon={BookOpen}
          tone={guidelineSignal.count > 0 ? 'warning' : 'success'}
          onClick={() => scrollToSignal('guideline-signals')}
        />
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <Card id="recurring-violations" className="scroll-mt-24 p-5 lg:col-span-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Recurring violations</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Every stored finding in scope, grouped by rule. Findings, unique documents, and audit runs are counted
                separately.
              </p>
            </div>
            <Badge className="border-slate-200 bg-slate-50 text-slate-500">
              {data.recurring_violations.length} group{data.recurring_violations.length === 1 ? '' : 's'}
            </Badge>
          </div>
          {data.recurring_violations.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
              {noAudits
                ? 'No stored audit runs match this scope, so no recurring pattern can be computed.'
                : 'Stored audit runs in this scope contain no findings.'}
            </p>
          ) : (
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {data.recurring_violations.map((item) => (
                <div key={item.key} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words text-xs font-semibold text-slate-800">{item.rule_name}</span>
                    <SeverityBadge severity={item.severity} />
                  </div>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                    {item.category_label}
                    {item.rule_id ? '' : ' · not linked to a stored rule'}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <SignalMetric label="Findings" value={item.finding_count} />
                    <SignalMetric label="Documents" value={item.unique_documents} />
                    <SignalMetric label="Audit runs" value={item.audit_run_count} />
                  </div>
                  <p className="mt-2 break-words rounded bg-slate-50 px-2 py-1.5 font-mono text-[11px] leading-4 text-slate-600">
                    {item.sample_affected_text}
                  </p>
                  {item.documents.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.documents.map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => navigate(`/content/${doc.id}`)}
                          className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
                        >
                          <span className="max-w-[160px] truncate">{doc.title}</span>
                          <ChevronRight className="h-3 w-3 shrink-0" />
                        </button>
                      ))}
                      {item.unique_documents > item.documents.length ? (
                        <span className="self-center text-[10px] text-slate-400">
                          +{hiddenCount(item.unique_documents, item.documents.length)} more
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="mt-2 text-[10px] text-slate-400">
                    First seen {formatDateTime(item.first_seen)} · Last seen {formatDateTime(item.last_seen)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card id="overridden-rules" className="scroll-mt-24 p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Frequently overridden rules</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Reasoned dismissals of findings on the evaluated documents, with the rate against all findings linked to
                the same rule.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => navigate('/brand')}>
              Review rules
            </Button>
          </div>
          {data.overridden_rules.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
              No reasoned overrides have been recorded for documents in this scope.
            </p>
          ) : (
            <div className="mt-3 space-y-2.5">
              {data.overridden_rules.map((item, index) => (
                <div key={`${item.rule_id || item.rule_name}-${index}`} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words text-xs font-semibold text-slate-800">{item.rule_name}</span>
                    <span className="flex items-center gap-1.5">
                      <SeverityBadge severity={item.severity} />
                      {item.may_need_review ? (
                        <Badge className="border-amber-200 bg-amber-50 text-amber-700">May need review</Badge>
                      ) : null}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <SignalMetric label="Overrides" value={item.override_count} />
                    <SignalMetric label="Documents" value={item.unique_documents} />
                    <div className="rounded-md bg-slate-50 px-2 py-1.5 text-center">
                      <p className="text-sm font-semibold tabular-nums text-slate-800">
                        {formatOverrideRate(item.override_rate_percent)}
                      </p>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Override rate</p>
                    </div>
                  </div>
                  {item.reasons.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {item.reasons.map((reason) => (
                        <li key={reason.reason} className="text-[11px] leading-4 text-slate-600">
                          <span className="break-words">“{reason.reason}”</span>
                          <span className="ml-1 text-slate-400">
                            ×{reason.count}
                            {reason.reviewer_name ? ` · ${reason.reviewer_name}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mt-2 text-[11px] leading-5 text-slate-500">{item.review_note}</p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {item.rule_findings_in_scope} finding{item.rule_findings_in_scope === 1 ? '' : 's'} linked to this
                    rule in scope · Last override {formatDateTime(item.last_overridden_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card id="facts-verification" className="scroll-mt-24 p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Approved facts needing verification</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {factSignal.count} of {factSignal.total_active_facts} active facts match at least one recorded criterion.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => navigate('/brand')}>
              Open brand memory
            </Button>
          </div>
          <details className="mt-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
            <summary className="cursor-pointer text-[11px] font-medium text-slate-600">Verification criteria</summary>
            <ul className="mt-1.5 space-y-1 text-[11px] leading-4 text-slate-500">
              {factSignal.criteria.map((criterion) => (
                <li key={criterion}>• {criterion}</li>
              ))}
            </ul>
            <p className="mt-1.5 text-[10px] leading-4 text-slate-400">{factSignal.method_note}</p>
          </details>
          {factSignal.items.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
              No active fact matches the verification criteria. This reflects the stored records, not an external
              compliance check.
            </p>
          ) : (
            <div className="mt-3 space-y-2.5">
              {factSignal.items.map((fact) => (
                <div key={fact.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="min-w-0 break-words text-xs font-semibold text-slate-800">
                      {fact.claim_statement}
                    </span>
                    <Badge className={FACT_STATUS_TONE[fact.status] || FACT_STATUS_TONE.draft}>
                      {titleCase(fact.status)}
                    </Badge>
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {fact.reasons.map((reason) => (
                      <li key={reason} className="text-[11px] leading-4 text-amber-700">
                        • {reason}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 break-words text-[10px] text-slate-400">
                    {fact.category} · Source: {fact.source_reference || '—'} · Next review{' '}
                    {formatDateTime(fact.next_review_at)}
                    {fact.owner_name ? ` · Owner ${fact.owner_name}` : ''}
                  </p>
                </div>
              ))}
              {factSignal.count > factSignal.items.length ? (
                <p className="text-center text-[10px] text-slate-400">
                  Showing {factSignal.items.length} of {factSignal.count} matching facts.
                </p>
              ) : null}
            </div>
          )}
        </Card>

        <Card id="guideline-signals" className="scroll-mt-24 p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Unclear guideline signals</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Active rules whose stored text leaves reviewers without concrete guidance. Signals prompt a human rule
                review.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => navigate('/brand')}>
              Open rules
            </Button>
          </div>
          <p className="mt-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-[10px] leading-4 text-slate-400">
            {guidelineSignal.method_note} Evaluated {guidelineSignal.evaluated_rules} active rule
            {guidelineSignal.evaluated_rules === 1 ? '' : 's'}.
          </p>
          {guidelineSignal.items.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
              No active rule triggers a deterministic clarity signal in this workspace.
            </p>
          ) : (
            <div className="mt-3 space-y-2.5">
              {guidelineSignal.items.map((rule) => (
                <div key={rule.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words text-xs font-semibold text-slate-800">{rule.name}</span>
                    <span className="flex items-center gap-1.5">
                      <Badge className="border-slate-200 bg-slate-50 text-slate-500">{titleCase(rule.rule_type)}</Badge>
                      <SeverityBadge severity={rule.severity} />
                    </span>
                  </div>
                  <p className="mt-1 break-words rounded bg-slate-50 px-2 py-1 font-mono text-[10px] leading-4 text-slate-500">
                    {rule.pattern_or_phrase}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {rule.signals.map((signal) => (
                      <li key={signal} className="text-[11px] leading-4 text-slate-600">
                        • {signal}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-[10px] text-slate-400">
                    Last reviewed {formatDateTime(rule.last_reviewed_at)}
                  </p>
                </div>
              ))}
              {guidelineSignal.count > guidelineSignal.items.length ? (
                <p className="text-center text-[10px] text-slate-400">
                  Showing {guidelineSignal.items.length} of {guidelineSignal.count} flagged rules.
                </p>
              ) : null}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">How these signals are computed</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Every figure lists its input sample and stored time window. No benchmark, projection, or external comparison is
          used.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {Object.entries(data.metric_methods).map(([key, item]) => (
            <div key={key} className="rounded-lg border border-slate-100 p-3">
              <p className="text-xs font-semibold text-slate-700">{titleCase(key)}</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">{item.method}</p>
              <p className="mt-1.5 text-[10px] text-slate-400">
                Sample size: {item.sample_size} · Window: {windowLabel(item.time_range.from, item.time_range.to)}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
          Audit records span {windowLabel(data.reporting_window.audit_runs_from, data.reporting_window.audit_runs_to)} ·
          Overrides span {windowLabel(data.reporting_window.overrides_from, data.reporting_window.overrides_to)}.
        </p>
      </Card>
      </div>

      <div className="mt-5">
        <InfoCallout tone="neutral" title="No simulated intelligence">
          {CAPABILITY_LABEL['insights.read']} is based only on stored workspace records. Inkloom does not claim industry
          benchmarks, accuracy percentages, or external validation here.
        </InfoCallout>
      </div>
    </div>
  );
}
