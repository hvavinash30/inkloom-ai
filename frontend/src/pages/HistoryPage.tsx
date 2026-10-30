import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  FileClock,
  FileText,
  GitCompareArrows,
  History,
  Search,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';
import { navigate, useAsync } from '../lib/router';
import { useSession } from '../context/SessionContext';
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
  Select,
  StatCard,
} from '../components/ui';
import { DocumentTable } from '../components/DocumentTable';
import { ASSET_TYPE_LABEL, DOCUMENT_STATUS_LABEL } from '../lib/format';
import type { DocumentStatus } from '../types';

export function HistoryPage() {
  const { can } = useSession();
  const { data, loading, error, reload } = useAsync(() => api.listHistory(), []);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [assetType, setAssetType] = useState('');

  const documents = data || [];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return documents
      .filter((doc) => (status ? doc.status === status : true))
      .filter((doc) => (assetType ? doc.asset_type === assetType : true))
      .filter((doc) => {
        if (!term) return true;
        return [doc.title, doc.created_by_name || '', doc.content_type].join(' ').toLowerCase().includes(term);
      });
  }, [documents, search, status, assetType]);

  const stats = useMemo(() => {
    const approved = documents.filter((doc) => doc.status === 'approved').length;
    const inReview = documents.filter((doc) => doc.status === 'in_review').length;
    const changes = documents.filter((doc) => doc.status === 'changes_requested').length;
    const stale = documents.filter((doc) => doc.approval_stale).length;
    return { approved, inReview, changes, stale };
  }, [documents]);

  const hasFilters = Boolean(search || status || assetType);

  return (
    <div>
      <PageHeader
        eyebrow="Audit trail"
        title="Content history"
        description="Every document keeps its versions, checks, comments, and version-bound decisions. Open a document to read the complete event timeline and compare revisions."
        actions={
          <Button variant="secondary" onClick={() => navigate('/content')}>
            <FileText className="h-4 w-4" />
            Open content workspace
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Documents in history"
          value={documents.length}
          hint="Current versions and their recorded events"
          icon={History}
          tone="brand"
        />
        <StatCard
          label="Approved"
          value={stats.approved}
          hint={`${stats.stale} stale approval${stats.stale === 1 ? '' : 's'}`}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="In review"
          value={stats.inReview}
          hint={`${stats.changes} awaiting creator changes`}
          icon={FileClock}
          tone="warning"
        />
        <StatCard
          label="Needing attention"
          value={stats.changes}
          hint="Changes requested by a reviewer"
          icon={ShieldAlert}
          tone={stats.changes ? 'danger' : 'default'}
        />
      </div>

      <div className="mt-5">
        <InfoCallout tone="neutral" title="What is retained">
          Versions, deterministic check runs, finding decisions, review comments, and approvals are stored with version
          IDs. Approving a version does not carry forward to later edits; the newer version is flagged as stale until a
          reviewer decides again.
        </InfoCallout>
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search titles or authors"
                aria-label="Search content history"
                className="pl-8"
              />
            </div>
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filter history by status"
              className="sm:w-44"
            >
              <option value="">All statuses</option>
              {(Object.keys(DOCUMENT_STATUS_LABEL) as DocumentStatus[]).map((key) => (
                <option key={key} value={key}>
                  {DOCUMENT_STATUS_LABEL[key]}
                </option>
              ))}
            </Select>
            <Select
              value={assetType}
              onChange={(event) => setAssetType(event.target.value)}
              aria-label="Filter history by format"
              className="sm:w-36"
            >
              <option value="">All formats</option>
              {Object.entries(ASSET_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-slate-400 lg:justify-end">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
              {filtered.length} of {documents.length}
            </span>
            {hasFilters ? (
              <button
                type="button"
                className="font-medium text-brand-300 hover:underline"
                onClick={() => {
                  setSearch('');
                  setStatus('');
                  setAssetType('');
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="p-4">
            <LoadingBlock rows={5} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} retry={reload} />
          </div>
        ) : (
          <DocumentTable
            documents={filtered}
            emptyState={
              <div className="p-5">
                <EmptyState
                  icon={GitCompareArrows}
                  title={documents.length === 0 ? 'No content has been recorded yet' : 'No documents match'}
                  description={
                    documents.length === 0
                      ? 'Create and check a document; its versions, decisions, and events will be retained here.'
                      : 'Try another status or format, or clear the search.'
                  }
                  action={
                    documents.length === 0 ? (
                      <Button size="sm" onClick={() => navigate('/content/new')}>
                        <FileText className="h-4 w-4" />
                        Create content
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setSearch('');
                          setStatus('');
                          setAssetType('');
                        }}
                      >
                        Clear filters
                      </Button>
                    )
                  }
                />
              </div>
            }
          />
        )}

        {filtered.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] px-4 py-3 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              Showing current documents only — open one for full history.
            </span>
            <button
              type="button"
              onClick={() => navigate('/insights')}
              className="inline-flex items-center gap-1 font-medium text-brand-300 hover:underline"
              hidden={!can('insights.read')}
            >
              View governance insights
              <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
