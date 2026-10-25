import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../services/api';

export type Route =
  | { key: 'onboarding' }
  | { key: 'dashboard' }
  | { key: 'content' }
  | { key: 'new-content' }
  | { key: 'document'; id: string }
  | { key: 'reviews' }
  | { key: 'campaigns' }
  | { key: 'campaign'; id: string }
  | { key: 'brand' }
  | { key: 'policies' }
  | { key: 'history' }
  | { key: 'insights' }
  | { key: 'research' }
  | { key: 'evaluation' }
  | { key: 'team' }
  | { key: 'settings' }
  | { key: 'not-found'; path: string };

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '').split('?')[0] || '/';
  const segments = raw.split('/').filter(Boolean);
  if (segments.length === 0) return { key: 'dashboard' };
  const [first, second] = segments;
  switch (first) {
    case 'onboarding':
      return { key: 'onboarding' };
    case 'content':
      if (second === 'new') return { key: 'new-content' };
      if (second) return { key: 'document', id: decodeURIComponent(second) };
      return { key: 'content' };
    case 'reviews':
      return { key: 'reviews' };
    case 'campaigns':
      if (second) return { key: 'campaign', id: decodeURIComponent(second) };
      return { key: 'campaigns' };
    case 'brand':
      return { key: 'brand' };
    case 'policies':
      return { key: 'policies' };
    case 'history':
      return { key: 'history' };
    case 'insights':
      return { key: 'insights' };
    case 'research':
      return { key: 'research' };
    case 'evaluation':
      return { key: 'evaluation' };
    case 'team':
      return { key: 'team' };
    case 'settings':
      return { key: 'settings' };
    default:
      return { key: 'not-found', path: raw };
  }
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(to: string) {
  const normalized = to.startsWith('/') ? to : `/${to}`;
  if (window.location.hash === `#${normalized}`) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  window.location.hash = `#${normalized}`;
}

export function useAsync<T>(
  loader: () => Promise<T>,
  deps: unknown[] = []
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (value: T | null) => void;
} {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loaderRef
      .current()
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.detail : 'Something went wrong while loading this view.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { data, loading, error, reload, setData };
}
