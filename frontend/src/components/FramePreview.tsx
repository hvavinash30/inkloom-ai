import { useEffect, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { api, ApiError } from '../services/api';
import { cn } from './ui';

export function FramePreview({
  path,
  caption,
  className,
}: {
  path: string;
  caption: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setError(null);
    api
      .getFrame(path)
      .then(({ blob }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.detail : 'The sampled frame could not be loaded.');
        }
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (error) {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-[11px] text-slate-400', className)}>
        <ImageOff className="h-3.5 w-3.5 text-slate-400" />
        {error} The finding text is still recorded.
      </div>
    );
  }

  if (!url) {
    return (
      <div className={cn('flex min-h-[96px] items-center justify-center rounded-lg border border-white/10 bg-white/[0.035]', className)}>
        <span className="flex items-center gap-2 text-[11px] text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-400" />
          Loading sampled frame…
        </span>
      </div>
    );
  }

  return (
    <figure className={cn('overflow-hidden rounded-lg border border-white/10 bg-black/40', className)}>
      <a href={url} target="_blank" rel="noreferrer" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
        <img src={url} alt={`Sampled video frame for ${caption}`} className="max-h-56 w-full object-contain" />
      </a>
      <figcaption className="border-t border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-slate-400">
        {caption} · served through an authenticated request
      </figcaption>
    </figure>
  );
}
