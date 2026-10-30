import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Shield, UserRound, Users } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useToast } from './Toast';
import { ROLE_SCOPE } from '../lib/navigation';
import { ROLE_LABEL } from '../lib/format';
import { navigate } from '../lib/router';
import { cn } from './ui';
import type { Role } from '../types';

const ROLE_ICON: Record<Role, typeof Users> = {
  creator: UserRound,
  reviewer: Shield,
  admin: Users,
};

const ROLE_RING: Record<Role, string> = {
  creator: 'border-[var(--line-strong)] bg-ink-50 text-ink-700',
  reviewer: 'border-brand-200 bg-brand-50 text-brand-700',
  admin: 'border-violet-200 bg-violet-50 text-violet-700',
};

export function RoleSwitcher({ compact = false }: { compact?: boolean }) {
  const { session, role, setRole } = useSession();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  const activeUser = session?.active_user;
  const Icon = ROLE_ICON[role];
  const roles: Role[] = ['creator', 'reviewer', 'admin'];
  const roleUsers = (candidate: Role) =>
    session?.users.find((user) => user.role === candidate)?.full_name ||
    (candidate === 'creator' ? 'Jordan Patel' : candidate === 'reviewer' ? 'Alex Rivera' : 'Sarah Chen');

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Viewing as ${ROLE_LABEL[role]}. Open role menu.`}
        className={cn(
          'flex h-9 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white py-1 pl-1 pr-2 text-left shadow-subtle transition-colors hover:border-brand-200 hover:bg-brand-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 sm:pr-2.5',
          compact ? '' : 'sm:min-w-[196px]'
        )}
      >
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-md border', ROLE_RING[role])}>
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="hidden min-w-0 flex-1 sm:block">
          <span className="block truncate text-xs font-semibold leading-4 text-ink-900">
            {activeUser?.full_name || roleUsers(role)}
          </span>
          <span className="block truncate text-[10px] leading-4 text-ink-500">{ROLE_LABEL[role]}</span>
        </span>
        <ChevronsUpDown className="hidden h-3.5 w-3.5 shrink-0 text-ink-400 sm:block" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Switch role"
          className="animate-rise-in fixed inset-x-3 top-16 z-50 mt-2 overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-elevated sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[19rem]"
        >
          <div className="border-b border-[var(--line)] bg-ink-50/60 px-3.5 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Demo role switcher</p>
            <p className="mt-0.5 text-xs leading-5 text-ink-500">
              Navigation and server permissions change with the selected role.
            </p>
          </div>
          <div className="p-1.5">
            {roles.map((candidate) => {
              const RoleIcon = ROLE_ICON[candidate];
              const selected = candidate === role;
              return (
                <button
                  key={candidate}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    setOpen(false);
                    if (candidate === role) return;
                    setRole(candidate);
                    navigate('/');
                    toast(`Viewing as ${ROLE_LABEL[candidate]}`, 'info');
                  }}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300',
                    selected ? 'bg-brand-50' : 'hover:bg-ink-50'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
                      ROLE_RING[candidate]
                    )}
                  >
                    <RoleIcon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-ink-900">{ROLE_LABEL[candidate]}</span>
                      {selected ? <Check className="h-3.5 w-3.5 text-brand-600" aria-hidden /> : null}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-ink-500">
                      {roleUsers(candidate)} · {ROLE_SCOPE[candidate]}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="border-t border-[var(--line)] bg-ink-50/60 px-3.5 py-2 text-[10px] leading-4 text-ink-500">
            Demo identities are used only for this preview, and every action is permission-checked.
          </p>
        </div>
      ) : null}
    </div>
  );
}
