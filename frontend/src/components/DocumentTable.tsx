import type { ReactNode } from 'react';
import { ArrowUpRight, FileImage, FileText, Film, FileAudio, Files } from 'lucide-react';
import { navigate } from '../lib/router';
import {
  ASSET_TYPE_LABEL,
  CONTENT_TYPE_LABEL,
  relativeTime,
} from '../lib/format';
import { ScoreMeter, StatusBadge, cn } from './ui';
import type { AssetType, ContentDocument, ContentType } from '../types';

export function AssetIcon({
  assetType,
  className,
}: {
  assetType: AssetType | string;
  className?: string;
}) {
  const Icon =
    assetType === 'pdf'
      ? FileText
      : assetType === 'image'
        ? FileImage
        : assetType === 'video'
          ? Film
          : assetType === 'audio'
            ? FileAudio
            : Files;
  return <Icon className={cn('h-4 w-4', className)} />;
}

export function documentMeta(doc: ContentDocument): string {
  const type = CONTENT_TYPE_LABEL[doc.content_type as ContentType] || doc.content_type.replace(/_/g, ' ');
  const asset = ASSET_TYPE_LABEL[doc.asset_type] || doc.asset_type;
  return `${asset} · ${type}`;
}

export function DocumentTable({
  documents,
  emptyState,
  compact,
}: {
  documents: ContentDocument[];
  emptyState?: ReactNode;
  compact?: boolean;
}) {
  if (documents.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <div>
      <div className="hidden border-b border-slate-200 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-500 md:grid md:grid-cols-[minmax(0,1fr)_116px_132px_78px_92px] md:items-center md:gap-3">
        <span>Content</span>
        <span>Status</span>
        <span>Latest check</span>
        <span>Version</span>
        <span className="text-right">Updated</span>
      </div>
      <div className="divide-y divide-slate-200">
        {documents.map((doc) => {
          const run = doc.latest_audit;
          return (
            <button
              key={doc.id}
              type="button"
              onClick={() => navigate(`/content/${doc.id}`)}
              className={cn(
                'group block w-full px-4 py-3 text-left transition-colors hover:bg-slate-100 focus-visible:bg-slate-50 focus-visible:outline-none',
                compact ? '' : 'md:grid md:grid-cols-[minmax(0,1fr)_116px_132px_78px_92px] md:items-center md:gap-3'
              )}
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-ink-500">
                  <AssetIcon assetType={doc.asset_type} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-ink-800 group-hover:text-ink-900">
                      {doc.title}
                    </span>
                    <ArrowUpRight className="hidden h-3 w-3 shrink-0 text-ink-700 group-hover:text-ink-500 sm:block" />
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-ink-500">
                    <span>{documentMeta(doc)}</span>
                    <span aria-hidden>·</span>
                    <span>v{doc.current_version_number}</span>
                    {doc.comments_count > 0 ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>{doc.comments_count} comment{doc.comments_count === 1 ? '' : 's'}</span>
                      </>
                    ) : null}
                    {doc.approval_stale ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="font-medium text-amber-700">Approval stale</span>
                      </>
                    ) : null}
                  </span>
                  <span className="mt-1.5 flex items-center gap-2 md:hidden">
                    <StatusBadge status={doc.status} />
                    <ScoreMeter score={run?.overall_score ?? null} className="max-w-[110px]" />
                  </span>
                </span>
              </div>

              <div className="hidden md:block">
                <StatusBadge status={doc.status} />
              </div>
              <div className="hidden md:block">
                <ScoreMeter score={run?.overall_score ?? null} />
                {run && run.total_findings > 0 ? (
                  <span className="mt-0.5 block text-[10px] text-ink-500">
                    {run.total_findings} finding{run.total_findings === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>
              <span className="hidden text-xs tabular-nums text-ink-500 md:block">
                v{doc.current_version_number}
              </span>
              <span className="hidden text-right text-[11px] text-ink-500 md:block">
                {relativeTime(doc.updated_at)}
              </span>
              <span className="mt-2 flex items-center justify-between text-[11px] text-ink-500 md:hidden">
                <span>v{doc.current_version_number}</span>
                <span>{relativeTime(doc.updated_at)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
