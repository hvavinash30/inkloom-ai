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
          'glass-soft flex min-h-[280px] flex-col items-center justify-center rounded-2xl border-dashed px-6 py-10 text-center',
          className
        )}
      >
        <FileQuestion className="mb-3 h-6 w-6 text-slate-400" />
        <p className="text-sm font-medium text-slate-200">No source file attached</p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">
          {emptyMessage ||
            'This content was checked from supplied text or a timestamped transcript. No media file was stored, so there is nothing to preview.'}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={cn('glass-inset flex min-h-[280px] items-center justify-center rounded-2xl', className)}>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-brand-400" />
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
    <div className={cn('glass overflow-hidden rounded-2xl', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 bg-white/[0.03] px-3 py-2">
        <p className="min-w-0 truncate text-xs font-medium text-slate-300">
          {assetType === 'pdf' ? 'Original PDF' : assetType === 'video' ? 'Stored video' : 'Stored image'}
          <span className="ml-2 font-normal text-slate-400">Loaded with your role permissions</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={url}
            download={downloadName}
            className="inline-flex items-center gap-1 rounded text-xs font-medium text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded text-xs font-medium text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
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
          className="h-[540px] w-full bg-[#0b1224] lg:h-[640px]"
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
        <div className="flex min-h-[280px] items-center justify-center bg-[linear-gradient(45deg,rgba(255,255,255,0.035)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.035)_75%,rgba(255,255,255,0.035)),linear-gradient(45deg,rgba(255,255,255,0.035)_25%,rgba(255,255,255,0.01)_25%,rgba(255,255,255,0.01)_75%,rgba(255,255,255,0.035)_75%,rgba(255,255,255,0.035))] bg-[length:20px_20px] bg-[position:0_0,10px_10px] p-4">
          <img
            src={url}
            alt={`Stored image for ${title}`}
            className="max-h-[560px] max-w-full rounded-lg object-contain shadow-subtle"
          />
        </div>
      )}

      {contentType ? (
        <div className="flex flex-wrap items-center justify-between gap-1 border-t border-white/15 bg-white/[0.03] px-3 py-1.5 text-[10px] text-slate-400">
          <span>{contentType}</span>
          <span>File served through an authenticated API request, not a public URL.</span>
        </div>
      ) : null}
    </div>
  );
}
