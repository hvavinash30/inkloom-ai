import { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Check,
  ChevronsUpDown,
  Menu,
  Mic,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { navigate, useAsync } from '../lib/router';
import { api } from '../services/api';
import { buildNavigation, isItemActive, routeTitle } from '../lib/navigation';
import type { Route } from '../lib/router';
import { cn } from './ui';
import { RoleSwitcher } from './RoleSwitcher';
import { useToast } from './Toast';

function InkloomMark({ size = 34 }: { size?: number }) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-500 via-brand-500 to-violet-500 shadow-glow-brand"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_16%,rgba(255,255,255,0.5),transparent_58%)]" />
      <svg viewBox="0 0 32 32" width={size * 0.6} height={size * 0.6} fill="none" className="relative">
        <path d="M9 8v16M23 8v16M9 16h14" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="9" cy="8" r="1.6" fill="#EAF2FF" />
        <circle cx="23" cy="24" r="1.6" fill="#EAF2FF" />
      </svg>
    </span>
  );
}

function WorkspaceSwitcher() {
  const { session, selectWorkspace } = useSession();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = session?.workspace;
  const workspaces = session?.workspaces?.length
    ? session.workspaces
    : session?.workspace
      ? [session.workspace]
      : [];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Workspace: ${active?.name || 'Loading workspace'}. Open workspace menu.`}
        className="group flex h-10 min-w-0 max-w-[10rem] items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-2 text-left shadow-subtle transition-colors hover:border-brand-200 hover:bg-brand-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:max-w-[16rem] sm:px-2.5"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-100 to-cyan-50 text-brand-600">
          <Building2 className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold leading-4 text-ink-900">
            {active?.name || 'Loading workspace'}
          </span>
          <span className="hidden truncate text-[10px] leading-4 text-ink-500 sm:block">
            {active?.is_demo ? 'Demo workspace' : 'Brand workspace'}
          </span>
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-ink-400 transition-colors group-hover:text-ink-700" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Switch workspace"
          className="animate-rise-in fixed inset-x-3 top-16 z-50 mt-2 overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-elevated sm:absolute sm:inset-x-auto sm:left-0 sm:top-auto sm:mt-2 sm:w-[22rem]"
        >
          <div className="border-b border-slate-100 bg-gradient-to-r from-brand-50/80 to-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">Workspace</p>
            <p className="mt-1 text-xs leading-5 text-ink-500">
              Rules, facts, and audits are scoped to the selected workspace.
            </p>
          </div>
          <div className="p-1.5">
            {workspaces.map((workspace) => {
              const selected = workspace.id === active?.id;
              return (
                <button
                  key={workspace.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    setOpen(false);
                    if (selected) return;
                    selectWorkspace(workspace.id);
                    navigate('/');
                    toast(`Switched to ${workspace.name}`, 'info');
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                    selected ? 'bg-brand-50' : 'hover:bg-slate-50'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                      selected
                        ? 'border-brand-200 bg-white text-brand-600'
                        : 'border-slate-200 bg-slate-50 text-ink-500'
                    )}
                  >
                    <Building2 className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-semibold text-ink-900">{workspace.name}</span>
                      {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden /> : null}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] leading-4 text-ink-500">
                      <span
                        className={cn(
                          'inline-block h-1.5 w-1.5 rounded-full',
                          workspace.is_demo ? 'bg-amber-400' : 'bg-emerald-500'
                        )}
                        aria-hidden
                      />
                      {workspace.is_demo ? 'Demo data · fictional' : 'Custom brand workspace'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/onboarding');
            }}
            className="flex w-full items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-left text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Create your own brand
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SidebarContent({ route, onNavigate }: { route: Route; onNavigate: () => void }) {
  const { session, can } = useSession();
  const health = useAsync(() => api.getHealth(), []);
  const groups = buildNavigation(session?.capabilities || []);
  const connected = health.data?.status === 'online';

  const apiStatus = health.loading
    ? 'Checking connection…'
    : connected
      ? `Connected${health.data?.version ? ` · v${health.data.version.replace(/^v/i, '')}` : ''}`
      : 'Service unavailable';

  return (
    <div className="relative flex h-full flex-col overflow-hidden border-r border-[var(--line)] bg-white/85 text-ink-700 backdrop-blur-2xl">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(ellipse_at_top,rgba(47,107,255,0.12),transparent_68%)]"
        aria-hidden
      />
      <div className="relative flex h-[72px] shrink-0 items-center border-b border-slate-100 px-4">
        <button
          type="button"
          onClick={() => {
            window.location.hash = '#/';
            onNavigate();
          }}
          className="flex min-w-0 items-center gap-2.5 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <InkloomMark />
          <span className="min-w-0">
            <span className="block font-display text-[17px] font-bold leading-5 tracking-tight text-ink-950">
              Inkloom<span className="text-brand-600">.</span>
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">
              Brand governance
            </span>
          </span>
        </button>
      </div>

      <div className="relative px-3 pt-4">
        <div className="rounded-xl border border-[var(--line)] bg-gradient-to-br from-slate-50/90 via-white to-brand-50/40 px-3 py-3 shadow-subtle">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 shadow-subtle">
              <Building2 className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold leading-4 text-ink-900" title={session?.workspace.name}>
                {session?.workspace.name || 'Loading workspace'}
              </p>
              <p className="truncate text-[10px] leading-4 text-ink-500">
                {session?.workspace.is_demo ? 'Acme Cloud · fictional' : 'Custom brand workspace'}
              </p>
            </div>
            {session?.workspace.is_demo ? (
              <span className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
                Demo
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            navigate('/onboarding');
            onNavigate();
          }}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-brand-200 bg-white px-3 py-2 text-[12px] font-semibold text-brand-700 shadow-subtle transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Create Your Own Brand
        </button>
      </div>

      <nav className="sidebar-nav relative min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">
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
                      'group relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
                      active
                        ? 'bg-gradient-to-r from-brand-50 via-brand-50/70 to-transparent text-brand-800 shadow-[inset_0_0_0_1px_rgba(47,107,255,0.08)]'
                        : 'text-ink-600 hover:bg-slate-50 hover:text-ink-950'
                    )}
                  >
                    {active ? (
                      <span
                        className="accent-gradient-bar absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
                        aria-hidden
                      />
                    ) : null}
                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                        active ? 'bg-white text-brand-600 shadow-subtle' : 'text-ink-400 group-hover:text-ink-600'
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="relative shrink-0 space-y-2 border-t border-slate-100 p-3">
        <div className="rounded-xl border border-brand-100/80 bg-gradient-to-br from-brand-50/80 to-cyan-50/50 p-3">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-600" aria-hidden />
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-600">
              {can('insights.read') ? 'Evidence-first checks' : 'Human decisions stay human'}
            </p>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-ink-500">
            {can('insights.read')
              ? 'Findings come from deterministic rules and stored approved facts — no simulated AI.'
              : 'Scores are workflow aids, not legal risk ratings.'}
          </p>
        </div>
        <div className="flex items-center gap-2 px-2 py-1">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              health.loading
                ? 'bg-ink-300'
                : connected
                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                  : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]'
            )}
            aria-hidden
          />
          <span className="text-[11px] text-ink-500">{apiStatus}</span>
        </div>
      </div>
    </div>
  );
}

export function Shell({ route, children }: { route: Route; children: React.ReactNode }) {
  const { openAssistant, assistantOpen, session } = useSession();
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

  const pageContext = window.location.hash.replace(/^#/, '') || '/';
  const assistantContext =
    route.key === 'document'
      ? { documentId: route.id, pageContext: `/content/${route.id}` }
      : route.key === 'campaign'
        ? { campaignId: route.id, pageContext: `/campaigns/${route.id}` }
        : { pageContext };

  return (
    <div className="min-h-screen lg:flex">
      <a
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[120] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-700 focus:shadow-elevated focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        Skip to main content
      </a>

      <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 lg:block">
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
            className="absolute inset-0 bg-ink-950/30 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="animate-rise-in absolute inset-y-0 left-0 w-[290px] max-w-[86vw] shadow-elevated">
            <SidebarContent route={route} onNavigate={() => setMobileOpen(false)} />
            <button
              ref={mobileCloseRef}
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-2.5 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-slate-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-white/80 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-600 transition-colors hover:bg-slate-100 hover:text-ink-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => {
                window.location.hash = '#/';
              }}
              className="shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden"
              aria-label="Inkloom home"
            >
              <InkloomMark size={30} />
            </button>

            <WorkspaceSwitcher />

            <div className="hidden min-w-0 items-center gap-2.5 xl:flex">
              <span className="h-5 w-px shrink-0 bg-slate-200" aria-hidden />
              <h2 className="truncate text-sm font-semibold text-ink-700">{title}</h2>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  'hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold xl:inline-flex',
                  session?.workspace.is_demo
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    session?.workspace.is_demo ? 'bg-amber-400' : 'bg-emerald-500'
                  )}
                  aria-hidden
                />
                {session?.workspace.is_demo ? 'Fictional demo data' : 'Custom brand data'}
              </span>
              <RoleSwitcher compact />
              <button
                type="button"
                onClick={() => openAssistant(assistantContext)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-brand-200 bg-brand-50/80 px-2.5 text-xs font-semibold text-brand-700 shadow-subtle transition-all duration-200 hover:border-brand-300 hover:bg-brand-100/80 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:px-3"
              >
                <Sparkles className="h-3.5 w-3.5 text-brand-500" aria-hidden />
                <span className="hidden sm:inline">Ask Inkloom</span>
                <span className="sr-only sm:hidden">Ask Inkloom</span>
              </button>
            </div>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="relative min-w-0 flex-1 focus:outline-none">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[440px] overflow-hidden" aria-hidden>
            <span className="ambient-orb left-[8%] top-[-120px] h-[320px] w-[320px] animate-drift bg-brand-300/30" />
            <span className="ambient-orb right-[4%] top-[-80px] h-[260px] w-[260px] animate-float-slow bg-aqua-200/30" />
            <span className="ambient-orb left-[55%] top-[120px] h-[220px] w-[220px] bg-violet-200/25" />
          </div>
          <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>

        <footer className="mx-auto w-full max-w-[1440px] px-4 pb-24 sm:px-6 sm:pb-8 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-4 text-[11px] text-ink-400">
            <span>Inkloom AI · Evidence-first brand governance</span>
            <span>
              {session?.workspace.is_demo
                ? 'Demo workspace · Acme Cloud Technologies is fictional'
                : `${session?.workspace.name || 'Brand workspace'} · saved rules and facts drive every audit`}
            </span>
          </div>
        </footer>
      </div>

      {!assistantOpen && session?.capabilities.includes('assistant.use') ? (
        <button
          type="button"
          onClick={() => openAssistant({ ...assistantContext, voice: true })}
          className="group fixed bottom-5 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 via-brand-500 to-violet-500 text-white shadow-glow-brand transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:bottom-7 sm:right-7"
          aria-label="Open Inkloom voice assistant"
          title="Ask Inkloom by voice"
        >
          <span className="absolute inset-0 rounded-full bg-brand-400/40 animate-pulse-ring" aria-hidden />
          <Mic className="relative h-6 w-6" aria-hidden />
          <span className="pointer-events-none absolute right-full mr-3 hidden whitespace-nowrap rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 opacity-0 shadow-elevated transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 lg:block">
            Ask Inkloom
          </span>
        </button>
      ) : null}
    </div>
  );
}
