import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronsUpDown, Menu, Plus, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { navigate, useAsync } from '../lib/router';
import { api } from '../services/api';
import { buildNavigation, isItemActive, routeTitle } from '../lib/navigation';
import type { Route } from '../lib/router';
import { cn } from './ui';
import { RoleSwitcher } from './RoleSwitcher';
import { useToast } from './Toast';

function InkloomMark({ size = 30 }: { size?: number }) {
  return (
    <span
      className="glow-brand relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-400 via-brand-500 to-violet-500"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.45),transparent_55%)]" />
      <svg viewBox="0 0 32 32" width={size * 0.62} height={size * 0.62} fill="none" className="relative">
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
        className="group flex h-9 min-w-0 max-w-[9.5rem] items-center gap-2 rounded-lg border border-white/15 bg-white/[0.045] px-2 text-left shadow-subtle transition-colors hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 sm:max-w-[15rem] sm:px-2.5"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-brand-400/25 bg-brand-500/15 text-brand-200">
          <Building2 className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold leading-4 text-slate-100">
            {active?.name || 'Loading workspace'}
          </span>
          <span className="hidden truncate text-[10px] leading-4 text-slate-400 sm:block">
            {active?.is_demo ? 'Demo workspace' : 'Brand workspace'}
          </span>
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-colors group-hover:text-slate-200" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Switch workspace"
          className="glass-strong animate-rise-in fixed inset-x-3 top-16 z-50 mt-2 overflow-hidden rounded-2xl sm:absolute sm:inset-x-auto sm:left-0 sm:top-auto sm:mt-2 sm:w-[21rem]"
        >
          <div className="border-b border-white/15 px-3.5 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Workspace</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-400">
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
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
                    selected ? 'bg-brand-500/15' : 'hover:bg-white/[0.06]'
                  )}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/[0.05] text-slate-200">
                    <Building2 className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-semibold text-slate-100">{workspace.name}</span>
                      {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-brand-300" aria-hidden /> : null}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] leading-4 text-slate-400">
                      <span
                        className={cn(
                          'inline-block h-1.5 w-1.5 rounded-full',
                          workspace.is_demo ? 'bg-amber-300' : 'bg-emerald-300'
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
            className="flex w-full items-center gap-2 border-t border-white/15 bg-white/[0.03] px-3.5 py-2.5 text-left text-xs font-medium text-brand-200 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
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
    <div className="relative flex h-full flex-col overflow-y-auto border-r border-white/15 bg-[#070c19]/80 text-slate-300 backdrop-blur-2xl">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_at_top,rgba(67,136,255,0.18),transparent_65%)]"
        aria-hidden
      />
      <div className="relative flex h-16 shrink-0 items-center border-b border-white/[0.07] px-4">
        <button
          type="button"
          onClick={() => {
            window.location.hash = '#/';
            onNavigate();
          }}
          className="flex min-w-0 items-center gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070b18]"
        >
          <InkloomMark />
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold leading-5 tracking-tight text-white">Inkloom</span>
            <span className="block text-[10px] uppercase tracking-[0.14em] text-slate-400">Brand governance</span>
          </span>
        </button>
      </div>

      <div className="relative px-3 pt-4">
        <div className="glass-soft rounded-xl px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p
              className="line-clamp-2 min-w-0 break-words text-xs font-medium leading-4 text-slate-100"
              title={session?.workspace.name}
            >
              {session?.workspace.name || 'Loading workspace'}
            </p>
            {session?.workspace.is_demo ? (
              <span className="shrink-0 rounded border border-amber-400/35 bg-amber-300/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200">
                Demo
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {session?.workspace.is_demo ? 'Acme Cloud · fictional scenario' : 'Custom brand workspace'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            navigate('/onboarding');
            onNavigate();
          }}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand-400/25 bg-brand-500/[0.09] px-3 py-2 text-[12px] font-medium text-brand-100 transition-colors hover:border-brand-400/40 hover:bg-brand-500/[0.16] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070b18]"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Create Your Own Brand
        </button>
      </div>

      <nav className="relative flex-1 space-y-6 px-3 py-6" aria-label="Main navigation">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
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
                      'group relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070b18]',
                      active
                        ? 'bg-gradient-to-r from-brand-500/[0.2] via-brand-500/[0.08] to-transparent text-white shadow-[inset_0_0_0_1px_rgba(151,176,255,0.12)]'
                        : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'
                    )}
                  >
                    {active ? (
                      <span
                        className="accent-gradient-bar absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full shadow-[0_0_10px_rgba(67,136,255,0.9)]"
                        aria-hidden
                      />
                    ) : null}
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0 transition-colors',
                        active ? 'text-brand-300' : 'text-slate-400 group-hover:text-slate-300'
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

      <div className="relative shrink-0 space-y-2 border-t border-white/[0.07] p-3">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-300" aria-hidden />
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
              {can('insights.read') ? 'Evidence-first checks' : 'Human decisions stay human'}
            </p>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-slate-400">
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
                ? 'bg-slate-400'
                : connected
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
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
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-[268px] shrink-0 lg:block">
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
            className="absolute inset-0 bg-[#02050e]/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="animate-rise-in absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-elevated">
            <SidebarContent route={route} onNavigate={() => setMobileOpen(false)} />
            <button
              ref={mobileCloseRef}
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-white/15 bg-[#070b18]/70 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => {
                window.location.hash = '#/';
              }}
              className="shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 lg:hidden"
              aria-label="Inkloom home"
            >
              <InkloomMark size={28} />
            </button>

            <WorkspaceSwitcher />

            <div className="hidden min-w-0 items-center gap-2.5 xl:flex">
              <span className="h-5 w-px shrink-0 bg-white/[0.04]" aria-hidden />
              <h2 className="truncate text-sm font-semibold text-slate-100">{title}</h2>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  'hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium xl:inline-flex',
                  session?.workspace.is_demo
                    ? 'border-amber-400/35 bg-amber-300/10 text-amber-200'
                    : 'border-emerald-400/35 bg-emerald-300/10 text-emerald-200'
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    session?.workspace.is_demo ? 'bg-amber-300' : 'bg-emerald-300'
                  )}
                  aria-hidden
                />
                {session?.workspace.is_demo ? 'Fictional demo data' : 'Custom brand data'}
              </span>
              <RoleSwitcher compact />
              <button
                type="button"
                onClick={() => openAssistant({ pageContext: window.location.hash.replace(/^#/, '') || '/' })}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-brand-400/25 bg-brand-500/[0.12] px-2.5 text-xs font-medium text-brand-100 shadow-subtle transition-all duration-200 hover:border-brand-400/40 hover:bg-brand-500/[0.2] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 sm:px-3"
              >
                <Sparkles className="h-3.5 w-3.5 text-brand-300" aria-hidden />
                <span className="hidden sm:inline">Ask Inkloom</span>
                <span className="sr-only sm:hidden">Ask Inkloom</span>
              </button>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>

        <footer className="mx-auto w-full max-w-[1440px] px-4 pb-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] pt-4 text-[11px] text-slate-400">
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
