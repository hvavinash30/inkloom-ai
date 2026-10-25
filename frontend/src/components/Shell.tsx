import { useEffect, useRef, useState } from 'react';
import { Menu, Sparkles, X } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { navigate, useAsync } from '../lib/router';
import { api } from '../services/api';
import { buildNavigation, isItemActive, routeTitle } from '../lib/navigation';
import type { Route } from '../lib/router';
import { cn } from './ui';
import { RoleSwitcher } from './RoleSwitcher';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

function InkloomMark({ size = 30 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-lg bg-brand-600 shadow-inner shadow-brand-950/30"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" width={size * 0.66} height={size * 0.66} fill="none">
        <path d="M9 8v16M23 8v16M9 16h14" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="9" cy="8" r="1.6" fill="#BFDBFE" />
        <circle cx="23" cy="24" r="1.6" fill="#BFDBFE" />
      </svg>
    </span>
  );
}

function SidebarContent({ route, onNavigate }: { route: Route; onNavigate: () => void }) {
  const { session, can } = useSession();
  const health = useAsync(() => api.getHealth(), []);
  const groups = buildNavigation(session?.capabilities || []);
  const connected = health.data?.status === 'online';

  const apiStatus = health.loading
    ? 'Checking API…'
    : connected
      ? `API connected${health.data?.version ? ` · v${health.data.version.replace(/^v/i, '')}` : ''}`
      : 'API unavailable';

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-navy-900 text-slate-300">
      <div className="flex h-16 shrink-0 items-center border-b border-white/[0.07] px-4">
        <button
          type="button"
          onClick={() => {
            window.location.hash = '#/';
            onNavigate();
          }}
          className="flex min-w-0 items-center gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900"
        >
          <InkloomMark />
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold leading-5 tracking-tight text-white">Inkloom</span>
            <span className="block text-[10px] uppercase tracking-[0.14em] text-slate-400">Brand governance</span>
          </span>
        </button>
      </div>

      <div className="px-3 pt-4">
        <button
          type="button"
          onClick={() => {
            navigate('/welcome');
            onNavigate();
          }}
          className="w-full rounded-lg border border-white/[0.09] bg-white/[0.05] px-3 py-2.5 text-left transition-colors hover:border-white/20 hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900"
          aria-label={`Workspace: ${session?.workspace.name || 'loading'}. Open the workspace selector.`}
        >
          <div className="flex items-center justify-between gap-2">
            <p
              className="line-clamp-2 min-w-0 break-words text-xs font-medium leading-4 text-slate-100"
              title={session?.workspace.name}
            >
              {session?.workspace.name || 'Loading workspace'}
            </p>
            {session?.workspace.is_demo ? (
              <span className="shrink-0 rounded border border-amber-300/20 bg-amber-300/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200">
                Demo
              </span>
            ) : (
              <span className="shrink-0 rounded border border-blue-300/20 bg-blue-300/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-200">
                Yours
              </span>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
            {session?.workspace.is_demo ? 'Fictional demo data' : 'Custom brand workspace'}
            <span aria-hidden>·</span>
            <span className="font-medium text-slate-300">Switch</span>
          </p>
        </button>
      </div>

      <nav className="flex-1 space-y-6 px-3 py-6" aria-label="Main navigation">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isItemActive(item, route);
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => {
                      window.location.hash = `#${item.path}`;
                      onNavigate();
                    }}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900',
                      active
                        ? 'bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]'
                        : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'
                    )}
                  >
                    {active ? (
                      <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-blue-400" />
                    ) : null}
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0 transition-colors',
                        active ? 'text-blue-300' : 'text-slate-500 group-hover:text-slate-300'
                      )}
                      aria-hidden
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-2 border-t border-white/[0.07] p-3">
        {can('insights.read') ? (
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.04] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Evidence-first checks</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-400">
              Findings come from deterministic rules and stored approved facts — no simulated AI.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.04] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Human decisions stay human</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-400">
              Scores are workflow aids, not legal risk ratings.
            </p>
          </div>
        )}
        <div className="flex items-center gap-2 px-2 py-1">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              health.loading ? 'bg-slate-500' : connected ? 'bg-emerald-400' : 'bg-amber-400'
            )}
            aria-hidden
          />
          <span className="text-[11px] text-slate-400">{apiStatus}</span>
        </div>
      </div>
    </div>
  );
}

export function Shell({ route, children }: { route: Route; children: React.ReactNode }) {
  const { openAssistant, session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileDialogRef = useRef<HTMLDivElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const title = routeTitle(route);

  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [route]);

  useEffect(() => {
    if (!mobileOpen) return;
    const dialog = mobileDialogRef.current;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>(focusableSelector) ?? []).filter(
        (element) => element.getClientRects().length > 0
      );
    const focusFrame = window.requestAnimationFrame(() => {
      (mobileCloseRef.current ?? focusables()[0] ?? dialog)?.focus();
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!dialog?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      const target = restoreFocusRef.current;
      if (target?.isConnected) target.focus();
      restoreFocusRef.current = null;
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-canvas lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">
        <SidebarContent route={route} onNavigate={() => undefined} />
      </aside>

      {mobileOpen ? (
        <div
          ref={mobileDialogRef}
          id="mobile-navigation"
          tabIndex={-1}
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-elevated">
            <SidebarContent route={route} onNavigate={() => setMobileOpen(false)} />
            <button
              ref={mobileCloseRef}
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="hidden max-w-[14rem] truncate text-xs text-slate-500 sm:inline">
                  {session?.workspace.name || 'Workspace'}
                </span>
                <span className="hidden text-slate-300 sm:inline" aria-hidden>/</span>
                <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>
              </div>
            </div>

            <WorkspaceSwitcher className="shrink-0" />

            <div className="hidden items-center gap-2 xl:flex">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
                  session?.workspace.is_demo
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    session?.workspace.is_demo ? 'bg-amber-500' : 'bg-slate-400'
                  )}
                  aria-hidden
                />
                {session?.workspace.is_demo ? 'Fictional demo data' : 'Custom brand data'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => openAssistant({ pageContext: window.location.hash.replace(/^#/, '') || '/' })}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-navy-900 px-2.5 text-xs font-medium text-white shadow-subtle transition-colors hover:bg-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:px-3"
            >
              <Sparkles className="h-3.5 w-3.5 text-blue-300" aria-hidden />
              <span className="hidden sm:inline">Ask Inkloom</span>
              <span className="sr-only sm:hidden">Ask Inkloom</span>
            </button>

            <RoleSwitcher compact />
          </div>
        </header>

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>

        <footer className="mx-auto w-full max-w-[1440px] px-4 pb-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-4 text-[11px] text-slate-500">
            <span>Inkloom AI · Evidence-first brand governance</span>
            <span>
              {session?.workspace.is_demo
                ? 'Demo workspace · Acme Cloud Technologies is fictional'
                : `${session?.workspace.name || 'Brand workspace'} · saved rules and facts drive every audit`}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
