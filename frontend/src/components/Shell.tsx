import { useEffect, useState } from 'react';
import { Menu, Sparkles, X } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useAsync } from '../lib/router';
import { api } from '../services/api';
import { buildNavigation, isItemActive, routeTitle } from '../lib/navigation';
import type { Route } from '../lib/router';
import { cn } from './ui';
import { RoleSwitcher } from './RoleSwitcher';

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

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#0B1B33] text-slate-300">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/[0.07] px-4">
        <button
          type="button"
          onClick={() => {
            window.location.hash = '#/';
            onNavigate();
          }}
          className="flex min-w-0 items-center gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <InkloomMark />
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold leading-5 tracking-tight text-white">Inkloom</span>
            <span className="block text-[10px] uppercase tracking-[0.12em] text-slate-400">Brand governance</span>
          </span>
        </button>
      </div>

      <div className="px-3 pt-4">
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p
              className="line-clamp-2 min-w-0 break-words text-xs font-medium leading-4 text-slate-100"
              title={session?.workspace.name}
            >
              {session?.workspace.name || 'Loading workspace'}
            </p>
            <span className="shrink-0 rounded border border-amber-300/20 bg-amber-300/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200">
              Demo
            </span>
          </div>
          <p className="mt-0.5 text-[10px] text-slate-400">Acme Cloud · fictional scenario</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 px-3 py-5" aria-label="Main navigation">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
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
                      'group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
                      active
                        ? 'bg-white/[0.09] text-white'
                        : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'
                    )}
                  >
                    {active ? (
                      <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-blue-400" />
                    ) : null}
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        active ? 'text-blue-300' : 'text-slate-500 group-hover:text-slate-300'
                      )}
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
          <div className="rounded-lg bg-white/[0.04] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Evidence-first checks</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-400">
              Findings come from deterministic rules and stored approved facts — no simulated AI.
            </p>
          </div>
        ) : (
          <div className="rounded-lg bg-white/[0.04] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Human decisions stay human</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-400">
              Scores are workflow aids, not legal risk ratings.
            </p>
          </div>
        )}
        <div className="flex items-center gap-2 px-1 py-1">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              health.loading ? 'bg-slate-500' : connected ? 'bg-emerald-400' : 'bg-amber-400'
            )}
          />
          <span className="text-[10px] text-slate-500">
            {health.loading ? 'Checking API…' : connected ? 'API connected · v2.0.0' : 'API unavailable'}
          </span>
        </div>
      </div>
    </div>
  );
}

export function Shell({ route, children }: { route: Route; children: React.ReactNode }) {
  const { openAssistant } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = routeTitle(route);

  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [route]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-[#F6F8FB] lg:flex">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 lg:block">
        <SidebarContent route={route} onNavigate={() => undefined} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[286px] max-w-[85vw] shadow-elevated">
            <SidebarContent route={route} onNavigate={() => setMobileOpen(false)} />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
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
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="hidden text-xs text-slate-400 sm:inline">Acme Cloud Technologies</span>
                <span className="hidden text-slate-300 sm:inline">/</span>
                <h2 className="truncate text-sm font-semibold text-slate-800">{title}</h2>
              </div>
            </div>

            <div className="hidden items-center gap-2 md:flex">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-medium text-amber-800">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Fictional demo data
              </span>
            </div>

            <button
              type="button"
              onClick={() => openAssistant({ pageContext: window.location.hash.replace(/^#/, '') || '/' })}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#0B1B33] px-2.5 text-xs font-medium text-white shadow-subtle transition-colors hover:bg-slate-800 sm:px-3"
            >
              <Sparkles className="h-3.5 w-3.5 text-blue-300" />
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-4 text-[11px] text-slate-400">
            <span>Inkloom AI · Evidence-first brand governance</span>
            <span>Demo workspace · Acme Cloud Technologies is fictional</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
