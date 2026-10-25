import { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Check,
  ChevronsUpDown,
  LayoutGrid,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useToast } from './Toast';
import { navigate } from '../lib/router';
import { cn } from './ui';
import type { Workspace } from '../types';

function workspaceMeta(workspace: Workspace) {
  const counts = workspace.counts || {};
  const parts = [
    typeof counts.rules === 'number' ? `${counts.rules} rule${counts.rules === 1 ? '' : 's'}` : null,
    typeof counts.facts === 'number' ? `${counts.facts} fact${counts.facts === 1 ? '' : 's'}` : null,
    typeof counts.documents === 'number'
      ? `${counts.documents} document${counts.documents === 1 ? '' : 's'}`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'New workspace';
}

export function WorkspaceSwitcher({ className }: { className?: string }) {
  const { session, selectWorkspace, refreshWorkspaces } = useSession();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void refreshWorkspaces();
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    const frame = window.requestAnimationFrame(() => {
      const items = menuRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitemradio"], [role="menuitem"]'
      );
      if (!items || items.length === 0) return;
      const selected = Array.from(items).find(
        (item) => item.getAttribute('aria-checked') === 'true'
      );
      (selected ?? items[0]).focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, refreshWorkspaces]);

  const workspace = session?.workspace;
  const workspaces = session?.workspaces || [];
  const hasCustom = workspaces.some((item) => !item.is_demo);

  const moveFocus = (direction: 1 | -1) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"], [role="menuitem"]') || []
    );
    if (items.length === 0) return;
    const activeIndex = items.findIndex((item) => item === document.activeElement);
    const nextIndex =
      activeIndex === -1
        ? 0
        : (activeIndex + direction + items.length) % items.length;
    items[nextIndex].focus();
  };

  const openWorkspace = (item: Workspace) => {
    setOpen(false);
    if (item.id === workspace?.id) {
      triggerRef.current?.focus();
      return;
    }
    selectWorkspace(item.id);
    navigate('/');
    toast(`Viewing ${item.name}`, 'success');
  };

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  if (!workspace) return null;

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Switch workspace. Current workspace: ${workspace.name}`}
        title={`Current workspace: ${workspace.name}`}
        className="inline-flex h-9 max-w-[11rem] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 text-left text-xs font-medium text-slate-700 shadow-subtle transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 xl:max-w-[15rem]"
      >
        <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
        <span className="hidden truncate sm:inline">{workspace.name}</span>
        <ChevronsUpDown className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Switch workspace"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              moveFocus(1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              moveFocus(-1);
            }
          }}
          className="absolute right-0 z-50 mt-2 w-[min(92vw,340px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-elevated"
        >
          <div className="border-b border-slate-100 bg-slate-50/70 px-3.5 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Switch workspace
            </p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
              Rules, facts, documents, and reviews stay scoped to the workspace you choose.
            </p>
          </div>

          <div className="max-h-72 overflow-y-auto p-1.5">
            {workspaces.length === 0 ? (
              <p className="px-2.5 py-3 text-xs leading-5 text-slate-500">No workspaces loaded.</p>
            ) : (
              workspaces.map((item) => {
                const selected = item.id === workspace.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => openWorkspace(item)}
                    className={cn(
                      'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                      selected ? 'bg-brand-50/80' : 'hover:bg-slate-50'
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                        item.is_demo ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand-700'
                      )}
                    >
                      {item.is_demo ? (
                        <Sparkles className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <Building2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-semibold text-slate-800">{item.name}</span>
                        {item.is_demo ? (
                          <span className="shrink-0 rounded border border-amber-200 bg-amber-50 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800">
                            Demo
                          </span>
                        ) : null}
                        {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" /> : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] leading-4 text-slate-500">
                        {workspaceMeta(item)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-slate-100 p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => go('/welcome')}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <LayoutGrid className="h-3.5 w-3.5 text-slate-400" aria-hidden />
              All workspaces
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => go('/onboarding')}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Plus className="h-3.5 w-3.5 text-slate-400" aria-hidden />
              Create a brand
            </button>
          </div>

          {hasCustom ? (
            <p className="border-t border-slate-100 px-3.5 py-2 text-[10px] leading-4 text-slate-400">
              Demo and custom workspaces share demo identities. Nothing is copied between them.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
