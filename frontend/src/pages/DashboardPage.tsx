import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  FileText,
  Layers,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useAsync, navigate } from '../lib/router';
import { api } from '../services/api';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  InfoCallout,
  LoadingBlock,
  PageHeader,
  ScoreMeter,
  ScoreRing,
  SectionHeading,
  SeverityBadge,
  StatCard,
  StatusBadge,
  cn,
} from '../components/ui';
import { ROLE_LABEL, relativeTime, RISK_LABEL } from '../lib/format';
import type { DashboardData, DocumentSummary } from '../types';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function PriorityList({
  data,
  onNavigate,
}: {
  data: DashboardData;
  onNavigate: (route: string) => void;
}) {
  if (data.priority_items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-4">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-medium text-emerald-950">You're caught up</p>
          <p className="text-xs leading-5 text-emerald-800/80">
            No review requests or urgent findings are waiting for you right now.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="divide-y divide-slate-100">
      {data.priority_items.map((item, index) => (
        <button
          key={`${item.kind}-${index}-${item.title}`}
          type="button"
          onClick={() => onNavigate(item.route)}
          className="group flex w-full items-start gap-3 py-3 text-left transition-colors first:pt-0 last:pb-0 hover:bg-slate-50/40"
        >
          <span
            className={cn(
              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
              item.severity === 'high' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
            )}
          >
            {item.kind === 'review' ? (
              <ClipboardCheck className="h-3.5 w-3.5" />
            ) : item.kind === 'campaigns' ? (
              <Layers className="h-3.5 w-3.5" />
            ) : item.kind === 'changes' ? (
              <RefreshCw className="h-3.5 w-3.5" />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-800 group-hover:text-slate-950">{item.title}</span>
              <SeverityBadge severity={item.severity === 'high' ? 'high' : 'medium'} />
            </span>
            <span className="mt-0.5 block text-xs leading-5 text-slate-500">{item.description}</span>
          </span>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
        </button>
      ))}
    </div>
  );
}

function DocumentRow({ doc }: { doc: DocumentSummary }) {
  return (
    <button
      type="button"
      onClick={() => navigate(`/content/${doc.id}`)}
      className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50/60 md:grid-cols-[minmax(0,1fr)_120px_130px_92px]"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          {doc.asset_type === 'pdf' ? (
            <FileText className="h-4 w-4" />
          ) : doc.asset_type === 'video' ? (
            <Layers className="h-4 w-4" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-800 group-hover:text-slate-950">
            {doc.title}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="capitalize">{doc.asset_type}</span>
            <span>·</span>
            <span>v{doc.current_version_number}</span>
            {doc.approval_stale ? (
              <>
                <span>·</span>
                <span className="font-medium text-amber-600">Approval stale</span>
              </>
            ) : null}
          </span>
        </span>
      </div>
      <div className="hidden md:block">
        <StatusBadge status={doc.status} />
      </div>
      <div className="hidden md:block">
        <ScoreMeter score={doc.latest_score} />
      </div>
      <span className="text-right text-[11px] text-slate-400">{relativeTime(doc.updated_at)}</span>
    </button>
  );
}

export function DashboardPage() {
  const { session, role, can } = useSession();
  const { data, loading, error, reload } = useAsync(() => api.getDashboard(), [role]);

  if (loading) {
    return (
      <div>
        <div className="mb-6 h-20 animate-pulse rounded-xl border border-slate-100 bg-white" />
        <LoadingBlock rows={4} />
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

  const statCards = isReviewer
    ? [
        {
          label: 'To review',
          value: stats.pending_reviews,
          hint: 'Versions with a completed check',
          icon: ClipboardCheck,
          tone: 'brand' as const,
          route: '/reviews',
        },
        {
          label: 'High-risk findings',
          value: stats.open_high_findings,
          hint: 'Open high and critical severity',
          icon: ShieldAlert,
          tone: 'danger' as const,
          route: '/content',
        },
        {
          label: 'Stale approvals',
          value: stats.stale_approvals,
          hint: 'Approved version is no longer latest',
          icon: CalendarClock,
          tone: 'warning' as const,
          route: '/content',
        },
        {
          label: 'Average check score',
          value: stats.average_score ? stats.average_score.toFixed(1) : '—',
          hint: `${stats.scored_documents} current versions checked`,
          icon: TrendingUp,
          tone: 'success' as const,
        },
      ]
    : isAdmin
      ? [
          {
            label: 'Workspace content',
            value: stats.documents,
            hint: `${stats.approved_content} approved · ${stats.drafts} draft`,
            icon: FileText,
            tone: 'brand' as const,
            route: '/content',
          },
          {
            label: 'Average score',
            value: stats.average_score ? stats.average_score.toFixed(1) : '—',
            hint: `${stats.scored_documents} current versions checked`,
            icon: TrendingUp,
            tone: 'success' as const,
          },
          {
            label: 'Open conflicts',
            value: stats.unresolved_conflicts,
            hint: 'Cross-asset claim disagreements',
            icon: Layers,
            tone: 'danger' as const,
            route: '/campaigns',
          },
          {
            label: 'Facts to review',
            value: stats.outdated_facts,
            hint: 'Expired, flagged, or past review date',
            icon: CalendarClock,
            tone: 'warning' as const,
            route: '/brand',
          },
        ]
      : [
          {
            label: 'Your content',
            value: stats.documents,
            hint: `${stats.approved_content} approved · ${stats.drafts} drafts`,
            icon: FileText,
            tone: 'brand' as const,
            route: '/content',
          },
          {
            label: 'High-risk findings',
            value: stats.open_high_findings,
            hint: 'Across your current versions',
            icon: ShieldAlert,
            tone: 'danger' as const,
            route: '/content',
          },
          {
            label: 'Awaiting review',
            value: stats.pending_reviews,
            hint: 'In review or changes requested',
            icon: ClipboardCheck,
            tone: 'warning' as const,
            route: '/content',
          },
          {
            label: 'Average score',
            value: stats.average_score ? stats.average_score.toFixed(1) : '—',
            hint: `${stats.scored_documents} current versions checked`,
            icon: TrendingUp,
            tone: 'success' as const,
          },
        ];

  return (
    <div>
      <PageHeader
        eyebrow="Demo workspace · fictional Acme Cloud scenario"
        title={`${greeting()}, ${firstName}`}
        description={
          isReviewer
            ? 'Review submitted versions, inspect stored evidence, and record decisions against the exact version you reviewed.'
            : isAdmin
              ? 'Your governance picture, built from stored checks, version-bound approvals, and campaign conflicts.'
              : 'Draft and check content, fix evidence-backed findings, and track your submissions through review.'
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/content')}>
              <FileText className="h-4 w-4" />
              Browse content
            </Button>
            {can('review.queue') ? (
              <Button variant="secondary" onClick={() => navigate('/reviews')}>
                <ClipboardCheck className="h-4 w-4" />
                Review queue
              </Button>
            ) : null}
            <Button onClick={() => navigate('/content/new')}>
              <FilePlus2 className="h-4 w-4" />
              New content
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {statCards.map((card) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={card.value}
                hint={card.hint}
                icon={card.icon}
                tone={card.tone}
                onClick={card.route ? () => navigate(card.route as string) : undefined}
              />
            ))}
          </div>

          <Card>
            <div className="border-b border-slate-100 px-4 py-3.5">
              <SectionHeading
                title={isReviewer ? 'Waiting on your decision' : 'Needs attention'}
                description={
                  isReviewer
                    ? 'Content with a completed check, ready for a version-specific decision.'
                    : 'Prioritized from stored review status, audit findings, and campaign conflicts.'
                }
                action={
                  can('review.queue') ? (
                    <Button variant="ghost" size="sm" onClick={() => navigate('/reviews')}>
                      Review queue
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => navigate('/content')}>
                      All content
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  )
                }
              />
            </div>
            <div className="px-4 py-3">
              <PriorityList data={data} onNavigate={navigate} />
            </div>
          </Card>

          <Card>
            <div className="border-b border-slate-100 px-4 py-3.5">
              <SectionHeading
                title="Recent content"
                description="Latest checks and review status. Scores reflect stored findings, not legal risk."
                action={
                  <Button variant="ghost" size="sm" onClick={() => navigate('/content')}>
                    View all
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                }
              />
            </div>
            {data.recent_documents.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={FileText}
                  title="No content yet"
                  description="Start with a draft or a PDF. A check runs automatically when you save the first version."
                  action={
                    <Button size="sm" onClick={() => navigate('/content/new')}>
                      <FilePlus2 className="h-4 w-4" />
                      Create content
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.recent_documents.slice(0, 5).map((doc) => (
                  <DocumentRow key={doc.id} doc={doc} />
                ))}
              </div>
            )}
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card className="p-4">
              <SectionHeading
                title="Campaign readiness"
                description="Cross-asset claims checked against current content."
                action={
                  <Button variant="ghost" size="sm" onClick={() => navigate('/campaigns')}>
                    Open
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                }
              />
              <div className="mt-3 space-y-2">
                {data.campaigns.length === 0 ? (
                  <p className="text-xs text-slate-500">No campaigns yet.</p>
                ) : (
                  data.campaigns.map((campaign) => (
                    <button
                      key={campaign.id}
                      type="button"
                      onClick={() => navigate(`/campaigns/${campaign.id}`)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-left transition-colors hover:border-slate-200 hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-slate-700">{campaign.name}</span>
                        <span className="block text-[10px] text-slate-400">
                          {campaign.assets_count} asset{campaign.assets_count === 1 ? '' : 's'}
                        </span>
                      </span>
                      <StatusBadge status={campaign.status} />
                    </button>
                  ))
                )}
              </div>
              {stats.unresolved_conflicts > 0 ? (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-[11px] leading-4 text-rose-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {stats.unresolved_conflicts} unresolved conflict{stats.unresolved_conflicts === 1 ? '' : 's'} across
                    campaign assets.
                  </span>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[11px] text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  No unresolved campaign conflicts recorded.
                </div>
              )}
            </Card>

            <Card className="p-4">
              <SectionHeading
                title="Checks in this deployment"
                description="Only configured services are reported as available."
              />
              <div className="mt-3 space-y-2.5">
                {[
                  { label: 'Rules & approved facts', active: true, detail: 'Deterministic audit engine' },
                  { label: 'LLM assistance', active: data.integrations.llm_configured, detail: data.integrations.llm_configured ? 'Configured on the server' : 'Not configured — no simulated AI' },
                  { label: 'OCR for images/scans', active: data.integrations.ocr_configured, detail: data.integrations.ocr_configured ? 'Configured on the server' : 'Not configured — human review required' },
                  { label: 'Video transcription', active: data.integrations.transcription_configured, detail: data.integrations.transcription_configured ? 'Configured on the server' : 'Not configured — supply a transcript' },
                ].map((item) => (
                  <div key={item.label} className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                        item.active ? 'bg-emerald-500' : 'bg-slate-300'
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-700">{item.label}</p>
                      <p className="text-[10px] leading-4 text-slate-400">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 border-t border-slate-100 pt-2.5 text-[10px] leading-4 text-slate-400">
                {data.integrations.note}
              </p>
            </Card>
          </div>
        </div>

        <aside className="min-w-0 space-y-5">
          <Card className="p-4">
            <SectionHeading title="Quality snapshot" />
            <div className="mt-3 flex items-center gap-4">
              <ScoreRing score={stats.average_score || 0} label="out of 100" size={78} strokeWidth={6} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">
                  {stats.average_score ? RISK_LABEL[stats.average_score >= 85 ? 'low' : stats.average_score >= 70 ? 'medium' : 'high'] : 'No checks yet'}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                  Average across {stats.scored_documents} latest checked version{stats.scored_documents === 1 ? '' : 's'}.
                </p>
              </div>
            </div>
            {data.recent_scores.length > 0 ? (
              <div className="mt-4 space-y-2.5">
                {data.recent_scores.slice(0, 4).map((item) => (
                  <button
                    key={item.document_id}
                    type="button"
                    onClick={() => navigate(`/content/${item.document_id}`)}
                    className="block w-full text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[11px] text-slate-600">{item.title}</span>
                      <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{item.score}</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          item.score >= 85 ? 'bg-emerald-500' : item.score >= 70 ? 'bg-amber-500' : item.score >= 50 ? 'bg-orange-500' : 'bg-rose-500'
                        )}
                        style={{ width: `${item.score}%` }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
            <details className="mt-3 border-t border-slate-100 pt-2.5">
              <summary className="cursor-pointer select-none text-[11px] font-medium text-slate-500 hover:text-slate-800">
                How is this score calculated?
              </summary>
              <p className="mt-1.5 text-[10px] leading-4 text-slate-500">
                Each open finding deducts points from 100 based on its category and severity. Checks compare your content
                against active workspace rules and approved facts. Human approvals are tracked separately.
              </p>
            </details>
          </Card>

          <Card className="p-4">
            <SectionHeading title="Activity" description="Latest stored events." />
            {data.recent_activity.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">No recorded activity yet.</p>
            ) : (
              <ol className="mt-3 space-y-3">
                {data.recent_activity.slice(0, 5).map((event) => (
                  <li key={event.id} className="flex gap-2.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                    <button
                      type="button"
                      onClick={() => navigate(`/content/${event.document_id}`)}
                      className="min-w-0 text-left"
                    >
                      <p className="line-clamp-2 text-[11px] leading-4 text-slate-600 hover:text-slate-900">
                        {event.description}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {event.actor} · {relativeTime(event.created_at)}
                      </p>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-start gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">Ask with evidence</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">
                  The assistant answers from stored findings, facts, and campaign checks — and says when a claim is not
                  verified.
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              onClick={() => navigate('/content')}
            >
              Open a document to ask
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Card>

          {isAdmin ? (
            <Card className="p-4">
              <SectionHeading
                title="Governance signals"
                description="Computed from stored records."
                action={
                  <Button variant="ghost" size="sm" onClick={() => navigate('/insights')}>
                    <BarChart3 className="h-3.5 w-3.5" />
                    Insights
                  </Button>
                }
              />
              <dl className="mt-3 space-y-2">
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
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
                  >
                    <dt className="text-xs text-slate-600">{row.label}</dt>
                    <dd className="text-xs font-semibold tabular-nums text-slate-900">{row.value}</dd>
                  </button>
                ))}
              </dl>
            </Card>
          ) : null}
        </aside>
      </div>

      <div className="mt-5">
        <InfoCallout tone="neutral" title="Demo data disclosure">
          Acme Cloud Technologies, its people, pricing, benchmarks, and claims are fictional and seeded for this demo
          workspace. Research records cite real public standards where linked; planned studies are labelled and were not
          conducted. Your role is <strong>{ROLE_LABEL[role]}</strong>.
        </InfoCallout>
      </div>
    </div>
  );
}
