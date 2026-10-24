import { useDeferredValue, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ClipboardCheck,
  FileImage,
  FileText,
  Film,
  Inbox,
  Search,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { navigate, useAsync } from '../lib/router';
import { api } from '../services/api';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  InfoCallout,
  Input,
  LoadingBlock,
  PageHeader,
  ScoreMeter,
  Select,
  StatCard,
  StatusBadge,
  cn,
} from '../components/ui';
import {
  ASSET_TYPE_LABEL,
  CONTENT_TYPE_LABEL,
  relativeTime,
  titleCase,
} from '../lib/format';
import type { AssetType, ContentDocument } from '../types';

function AssetGlyph({ type, className }: { type: AssetType; className?: string }) {
  const Icon = type === 'pdf' ? FileText : type === 'image' ? FileImage : type === 'video' ? Film : FileText;
  return <Icon className={cn('h-4 w-4', className)} />;
}

function openHighFindings(doc: ContentDocument) {
  return (doc.latest_audit?.findings || []).filter(
    (finding) => finding.status === 'open' && ['high', 'critical'].includes(finding.severity)
  ).length;
}

export function ReviewsPage() {
  const { can } = useSession();
  const { data, loading, error, reload } = useAsync(() => api.getReviewQueue(), []);
  const [query, setQuery] = useState('');
  const [assetFilter, setAssetFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const queue = data || [];

  const filtered = useMemo(() => {
    return queue
      .filter((doc) => (assetFilter ? doc.asset_type === assetFilter : true))
      .filter((doc) => {
        if (priorityFilter === 'stale') return doc.approval_stale;
        if (priorityFilter === 'high') return openHighFindings(doc) > 0;
        if (priorityFilter === 'changes') return doc.status === 'changes_requested';
        return true;
      })
      .filter((doc) => {
        if (!deferredQuery) return true;
        return [doc.title, doc.created_by_name || '', CONTENT_TYPE_LABEL[doc.content_type as keyof typeof CONTENT_TYPE_LABEL] || doc.content_type]
          .join(' ')
          .toLowerCase()
          .includes(deferredQuery);
      })
      .sort((a, b) => new Date(b.submitted_at || b.updated_at).getTime() - new Date(a.submitted_at || a.updated_at).getTime());
  }, [queue, assetFilter, priorityFilter, deferredQuery]);

  const highRisk = queue.filter((doc) => openHighFindings(doc) > 0).length;
  const stale = queue.filter((doc) => doc.approval_stale).length;
  const scored = queue.filter((doc) => typeof doc.latest_audit?.overall_score === 'number');
  const average = scored.length
    ? scored.reduce((total, doc) => total + (doc.latest_audit?.overall_score || 0), 0) / scored.length
    : null;
  const filtersActive = Boolean(query || assetFilter || priorityFilter);

  return (
    <div>
      <PageHeader
        eyebrow="Reviewer workspace"
        title="Review queue"
        description="Submitted versions whose checks are complete. A decision is recorded against the exact version you inspected — never against a moving document."
        actions={
          <Button variant="secondary" onClick={() => navigate('/content')}>
            <FileText className="h-4 w-4" />
            Browse all content
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="To review"
          value={queue.length}
          hint="Checked versions ready for a decision"
          icon={ClipboardCheck}
          tone="brand"
        />
        <StatCard
          label="High-risk findings"
          value={highRisk}
          hint="Open high or critical findings"
          icon={ShieldAlert}
          tone="danger"
        />
        <StatCard
          label="Stale approvals"
          value={stale}
          hint="Approved version is no longer latest"
          icon={CalendarClock}
          tone="warning"
        />
        <StatCard
          label="Average score"
          value={average === null ? '—' : average.toFixed(1)}
          hint={`${scored.length} current version${scored.length === 1 ? '' : 's'} scored`}
          icon={TrendingUp}
          tone="success"
        />
      </div>

      <div className="mt-5">
        <InfoCallout tone="info" title="Evidence before decision">
          Open a version to inspect its stored findings, page or timestamp evidence, comments, and comparison.
          Approving the current version does not approve future edits — newer versions are flagged as stale approvals.
        </InfoCallout>
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title or author"
                aria-label="Search review queue"
                className="pl-8"
              />
            </div>
            <Select
              value={assetFilter}
              onChange={(event) => setAssetFilter(event.target.value)}
              aria-label="Filter by asset type"
              className="sm:w-40"
            >
              <option value="">All formats</option>
              {Object.entries(ASSET_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
              aria-label="Filter by review priority"
              className="sm:w-48"
            >
              <option value="">All priorities</option>
              <option value="high">High-risk findings</option>
              <option value="stale">Stale approvals</option>
              <option value="changes">Changes requested</option>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-slate-500 lg:justify-end">
            <span className="tabular-nums">
              {filtered.length} of {queue.length}
            </span>
            {filtersActive ? (
              <button
                type="button"
                className="font-medium text-brand-700 hover:underline"
                onClick={() => {
                  setQuery('');
                  setAssetFilter('');
                  setPriorityFilter('');
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="p-4">
            <LoadingBlock rows={4} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} retry={reload} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Inbox}
              title={queue.length === 0 ? 'Nothing is waiting for review' : 'No items match these filters'}
              description={
                queue.length === 0
                  ? 'When a creator submits a version with a completed check, it appears here for a reviewer decision.'
                  : 'Try a different format or priority, or clear the search and filters.'
              }
              action={
                filtersActive ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setQuery('');
                      setAssetFilter('');
                      setPriorityFilter('');
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => navigate('/content')}>
                    Browse content
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((doc) => {
              const high = openHighFindings(doc);
              const findings = doc.latest_audit?.total_findings ?? null;
              const open = doc.latest_audit?.findings.filter((finding) => finding.status === 'open').length ?? null;
              return (
                <div
                  key={doc.id}
                  className="grid gap-3 px-4 py-4 transition-colors hover:bg-slate-50/50 md:grid-cols-[minmax(0,1fr)_150px_130px_130px] md:items-center"
                >
                  <button
                    type="button"
                    onClick={() => navigate(`/content/${doc.id}`)}
                    className="group flex min-w-0 items-start gap-3 text-left"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <AssetGlyph type={doc.asset_type} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-sm font-semibold text-slate-900 group-hover:text-brand-800">
                          {doc.title}
                        </span>
                        {doc.approval_stale ? (
                          <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            Stale approval
                          </span>
                        ) : null}
                        {high > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-700">
                            <ShieldAlert className="h-2.5 w-2.5" />
                            {high} high risk
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-slate-400">
                        {ASSET_TYPE_LABEL[doc.asset_type]} · v{doc.current_version_number}
                        {doc.created_by_name ? ` · ${doc.created_by_name}` : ''}
                        {doc.submitted_at ? ` · submitted ${relativeTime(doc.submitted_at)}` : ''}
                      </span>
                      <span className="mt-1 block text-[11px] text-slate-500">
                        {CONTENT_TYPE_LABEL[doc.content_type as keyof typeof CONTENT_TYPE_LABEL] || titleCase(doc.content_type)}
                        {findings !== null ? ` · ${open} open of ${findings} finding${findings === 1 ? '' : 's'}` : ' · no stored check'}
                      </span>
                    </span>
                  </button>

                  <div className="flex items-center justify-between gap-2 md:block">
                    <span className="text-[10px] uppercase tracking-wide text-slate-400 md:hidden">Status</span>
                    <StatusBadge status={doc.status} />
                  </div>

                  <div className="flex items-center justify-between gap-2 md:block">
                    <span className="text-[10px] uppercase tracking-wide text-slate-400 md:hidden">Score</span>
                    <ScoreMeter score={doc.latest_audit?.overall_score ?? null} />
                  </div>

                  <div className="flex items-center justify-between gap-2 md:justify-end">
                    <span className="text-[10px] uppercase tracking-wide text-slate-400 md:hidden">Action</span>
                    <Button size="sm" variant="secondary" onClick={() => navigate(`/content/${doc.id}`)}>
                      Review
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {!can('review.decide') ? (
        <p className="mt-4 text-xs text-slate-500">
          Your current role can inspect this queue but cannot record decisions.
        </p>
      ) : (
        <p className="mt-4 text-xs text-slate-500">
          Decisions require feedback when you reject a version or request changes. Dismissed findings always keep the
          recorded reason in the audit history.
        </p>
      )}
    </div>
  );
}
