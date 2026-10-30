import { useDeferredValue, useMemo, useState } from 'react';
import {
  FilePlus2,
  Filter,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useAsync, navigate } from '../lib/router';
import { api } from '../services/api';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingBlock,
  PageHeader,
  Select,
  StatCard,
  cn,
} from '../components/ui';
import { DocumentTable } from '../components/DocumentTable';
import { ASSET_TYPE_LABEL, DOCUMENT_STATUS_LABEL } from '../lib/format';
import type { AssetType, DocumentStatus } from '../types';

export function ContentListPage() {
  const { role, can } = useSession();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState('');
  const [assetType, setAssetType] = useState('');
  const { data, loading, error, reload } = useAsync(
    () =>
      api.listDocuments({
        search: deferredSearch.trim() || undefined,
        status: status || undefined,
        asset_type: assetType || undefined,
        limit: 250,
      }),
    [deferredSearch, status, assetType, role]
  );

  const documents = data || [];
  const summary = useMemo(() => {
    const open = documents.filter((doc) => doc.status === 'in_review' || doc.status === 'changes_requested').length;
    const drafts = documents.filter((doc) => doc.status === 'draft').length;
    const approved = documents.filter((doc) => doc.status === 'approved').length;
    const stale = documents.filter((doc) => doc.approval_stale).length;
    return { open, drafts, approved, stale };
  }, [documents]);

  const hasFilters = Boolean(search || status || assetType);

  return (
    <div>
      <PageHeader
        eyebrow={can('content.read.all') ? 'Workspace content' : 'Your workspace'}
        title="Content"
        description={
          can('content.read.all')
            ? 'Every checked asset in the workspace, with its latest deterministic check, review status, and version.'
            : 'Draft, check, and submit your own content. Reviewers only see versions after you submit them.'
        }
        actions={
          <Button onClick={() => navigate('/content/new')}>
            <FilePlus2 className="h-4 w-4" />
            New content
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Content items" value={documents.length} hint="Matching current view" icon={SlidersHorizontal} />
        <StatCard
          label="Awaiting review"
          value={summary.open}
          hint="In review or changes requested"
          icon={ShieldCheck}
          tone="warning"
        />
        <StatCard label="Approved" value={summary.approved} hint="Version-bound approvals" tone="success" />
        <StatCard
          label="Stale approvals"
          value={summary.stale}
          hint="Approval is not on the latest version"
          tone={summary.stale ? 'danger' : 'default'}
        />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by title…"
              className="pl-9"
              aria-label="Search content by title"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden items-center gap-1 text-[11px] font-medium text-ink-500 sm:flex">
              <Filter className="h-3.5 w-3.5" />
              Filter
            </span>
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filter by status"
              className="w-auto min-w-[132px]"
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
              aria-label="Filter by asset type"
              className="w-auto min-w-[118px]"
            >
              <option value="">All formats</option>
              {(['text', 'pdf', 'image', 'video', 'audio'] as AssetType[]).map((key) => (
                <option key={key} value={key}>
                  {ASSET_TYPE_LABEL[key]}
                </option>
              ))}
            </Select>
            {hasFilters ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setStatus('');
                  setAssetType('');
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {loading && !data ? (
          <div className="p-4">
            <LoadingBlock rows={5} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} retry={reload} />
          </div>
        ) : documents.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={FilePlus2}
              title={hasFilters ? 'No content matches those filters' : 'No content yet'}
              description={
                hasFilters
                  ? 'Try a different search term, status, or format.'
                  : 'Start with a text draft, a PDF, an image, or a video transcript. Checks compare the content with active rules and approved facts.'
              }
              action={
                hasFilters ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSearch('');
                      setStatus('');
                      setAssetType('');
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => navigate('/content/new')}>
                    <FilePlus2 className="h-4 w-4" />
                    Create content
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <DocumentTable documents={documents} />
        )}

        {documents.length > 0 ? (
          <div className={cn('flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-2.5 text-[11px] text-ink-500')}>
            <span>
              Showing {documents.length} item{documents.length === 1 ? '' : 's'}
              {hasFilters ? ' matching filters' : ''}.
            </span>
            <span>Checks use stored rules and approved facts; scores are workflow aids, not legal ratings.</span>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
