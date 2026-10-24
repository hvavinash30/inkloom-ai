import { useEffect, useState, type RefObject } from 'react';
import { Download, ExternalLink, FileQuestion, Loader2, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../services/api';
import { Button, InfoCallout, cn } from './ui';
import type { AssetType } from '../types';

export function EvidenceViewer({
  fileId,
  assetType,
  title,
  page,
  videoRef,
  className,
  emptyMessage,
}: {
  fileId?: string | null;
  assetType: AssetType;
  title: string;
  page?: number;
  videoRef?: RefObject<HTMLVideoElement>;
  className?: string;
  emptyMessage?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [contentType, setContentType] = useState('');
  const [loading, setLoading] = useState(Boolean(fileId));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!fileId) {
      setLoading(false);
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getFile(fileId)
      .then(({ blob, contentType: type }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setContentType(type);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.detail : 'The stored file could not be loaded.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, nonce]);

  const downloadName = `${title.replace(/[^\w\s.-]/g, '').trim() || 'inkloom-file'}`;

  if (!fileId) {
    return (
      <div
        className={cn(
          'flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center',
          className
        )}
      >
        <FileQuestion className="mb-3 h-6 w-6 text-slate-400" />
        <p className="text-sm font-medium text-slate-700">No source file attached</p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
          {emptyMessage ||
            'This content was checked from supplied text or a timestamped transcript. No media file was stored, so there is nothing to preview.'}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={cn('flex min-h-[280px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50', className)}>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
          Loading the stored file…
        </div>
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className={cn('space-y-3', className)}>
        <InfoCallout tone="warning" title="Preview unavailable">
          {error || 'The stored file could not be displayed.'} The audit text and findings are still available.
        </InfoCallout>
        <Button variant="secondary" size="sm" onClick={() => setNonce((value) => value + 1)}>
          <RefreshCw className="h-3.5 w-3.5" />
          Retry preview
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('overflow-hidden rounded-xl border border-slate-200 bg-slate-100/60', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2">
        <p className="min-w-0 truncate text-xs font-medium text-slate-600">
          {assetType === 'pdf' ? 'Original PDF' : assetType === 'video' ? 'Stored video' : 'Stored image'}
          <span className="ml-2 font-normal text-slate-400">Loaded with your role permissions</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={url}
            download={downloadName}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </a>
        </div>
      </div>

      {assetType === 'pdf' ? (
        <iframe
          key={page}
          title={`PDF preview: ${title}`}
          src={`${url}#page=${page && page > 0 ? page : 1}&view=FitH`}
          className="h-[540px] w-full bg-slate-200 lg:h-[640px]"
        />
      ) : assetType === 'video' ? (
        <video
          ref={videoRef}
          controls
          preload="metadata"
          className="max-h-[560px] w-full bg-black"
          src={url}
        >
          Your browser cannot play this video.
        </video>
      ) : (
        <div className="flex min-h-[280px] items-center justify-center bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%,#f1f5f9),linear-gradient(45deg,#f1f5f9_25%,#f8fafc_25%,#f8fafc_75%,#f1f5f9_75%,#f1f5f9)] bg-[length:20px_20px] bg-[position:0_0,10px_10px] p-4">
          <img
            src={url}
            alt={`Stored image for ${title}`}
            className="max-h-[560px] max-w-full rounded-lg object-contain shadow-subtle"
          />
        </div>
      )}

      {contentType ? (
        <div className="flex flex-wrap items-center justify-between gap-1 border-t border-slate-200 bg-white px-3 py-1.5 text-[10px] text-slate-400">
          <span>{contentType}</span>
          <span>File served through an authenticated API request, not a public URL.</span>
        </div>
      ) : null}
    </div>
  );
}
