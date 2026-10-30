import React, { useEffect, useId, useRef } from 'react';
import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Info,
  Loader2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { navigate } from '../lib/router';
import {
  DOCUMENT_STATUS_LABEL,
  RISK_LABEL,
  RISK_STYLE,
  SEVERITY_LABEL,
  SEVERITY_STYLE,
  STATUS_STYLE,
  scoreTone,
} from '../lib/format';
import type { DocumentStatus, RiskLevel, Severity } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-brand-600 via-brand-500 to-violet-500 text-white shadow-glow-brand hover:from-brand-500 hover:via-brand-400 hover:to-violet-400 active:from-brand-700 active:to-violet-600 disabled:from-brand-300 disabled:via-brand-300 disabled:to-violet-300 disabled:text-white/80 disabled:shadow-none',
  secondary:
    'border border-[var(--line-strong)] bg-white text-ink-800 shadow-subtle hover:border-brand-200 hover:bg-brand-50/60 hover:text-ink-950 disabled:border-slate-200 disabled:bg-white disabled:text-ink-400',
  ghost: 'text-ink-600 hover:bg-slate-100 hover:text-ink-950 disabled:text-ink-300',
  danger:
    'bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow-[0_12px_28px_-14px_rgba(225,29,72,0.55)] hover:from-rose-400 hover:to-rose-500 active:from-rose-600 active:to-rose-700 disabled:from-rose-300 disabled:to-rose-300 disabled:text-white/80',
  subtle:
    'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100 hover:bg-brand-100/70 hover:text-brand-800 disabled:bg-slate-50 disabled:text-ink-300',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 rounded-lg px-3 text-xs',
  md: 'h-9 rounded-lg px-3.5 text-sm',
  lg: 'h-11 rounded-xl px-5 text-sm',
  icon: 'h-9 w-9 rounded-lg',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-slate-100 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-2xl border border-[var(--line)] bg-white shadow-card', className)} {...props}>
      {children}
    </div>
  );
}

export function Badge({
  className,
  children,
  dot,
}: {
  className?: string;
  children: React.ReactNode;
  dot?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
        className
      )}
    >
      {dot ? <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: DocumentStatus | string; className?: string }) {
  const label = DOCUMENT_STATUS_LABEL[status as DocumentStatus] || status.replace(/_/g, ' ');
  return (
    <Badge className={cn(STATUS_STYLE[status] || STATUS_STYLE.draft, className)}>
      {label}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: Severity | string }) {
  const key = severity as Severity;
  return (
    <Badge className={SEVERITY_STYLE[key] || SEVERITY_STYLE.medium}>
      {SEVERITY_LABEL[key] || severity}
    </Badge>
  );
}

export function RiskBadge({ risk }: { risk: RiskLevel | string }) {
  const key = risk as RiskLevel;
  return (
    <Badge className={RISK_STYLE[key] || RISK_STYLE.medium}>
      {RISK_LABEL[key] || risk}
    </Badge>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  backTo,
  backLabel,
}: {
  title: string;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  backTo?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-7 flex flex-col gap-5">
      {backTo ? (
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="inline-flex w-fit items-center gap-1.5 rounded-md text-xs font-semibold text-ink-500 transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {backLabel || 'Back'}
        </button>
      ) : null}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-600">
              <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-brand-500 to-aqua-400" aria-hidden />
              {eyebrow}
            </div>
          ) : null}
          <h1 className="text-balance font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-950 md:text-[34px]">
            {title}
          </h1>
          {description ? (
            <div className="mt-2 max-w-3xl text-sm leading-6 text-ink-500 md:text-[15px]">{description}</div>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div> : null}
      </div>
    </div>
  );
}

export function SectionHeading({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div>
        <h2 className="font-display text-base font-bold tracking-tight text-ink-950">{title}</h2>
        {description ? <p className="mt-0.5 text-xs leading-5 text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-brand-500', className)} />;
}

export function LoadingBlock({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-xl border border-slate-100 bg-slate-50"
          style={{ opacity: 1 - index * 0.16 }}
        />
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-gradient-to-b from-slate-50/80 to-white px-6 py-12 text-center',
        className
      )}
    >
      {Icon ? (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-brand-100 bg-brand-50 text-brand-600 shadow-subtle">
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
      <h3 className="font-display text-sm font-bold text-ink-900">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm leading-6 text-ink-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  message,
  retry,
  className,
}: {
  message: string;
  retry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('rounded-2xl border border-rose-200 bg-rose-50/80 p-5', className)}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-rose-800">This view could not be loaded</p>
          <p className="mt-1 text-sm leading-6 text-rose-700">{message}</p>
          {retry ? (
            <Button variant="secondary" size="sm" className="mt-3" onClick={retry}>
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type CalloutTone = 'info' | 'warning' | 'success' | 'danger' | 'neutral';

const CALLOUT_STYLES: Record<CalloutTone, { wrap: string; icon: string; title: string }> = {
  info: {
    wrap: 'border-brand-200 bg-brand-50/80',
    icon: 'text-brand-600',
    title: 'text-brand-800',
  },
  warning: {
    wrap: 'border-amber-200 bg-amber-50/80',
    icon: 'text-amber-600',
    title: 'text-amber-800',
  },
  success: {
    wrap: 'border-emerald-200 bg-emerald-50/80',
    icon: 'text-emerald-600',
    title: 'text-emerald-800',
  },
  danger: {
    wrap: 'border-rose-200 bg-rose-50/80',
    icon: 'text-rose-600',
    title: 'text-rose-800',
  },
  neutral: {
    wrap: 'border-slate-200 bg-slate-50/80',
    icon: 'text-ink-500',
    title: 'text-ink-900',
  },
};

export function InfoCallout({
  tone = 'info',
  title,
  children,
  className,
  icon: IconOverride,
}: {
  tone?: CalloutTone;
  title?: string;
  children: React.ReactNode;
  className?: string;
  icon?: LucideIcon;
}) {
  const styles = CALLOUT_STYLES[tone];
  const Icon = IconOverride || (tone === 'warning' ? AlertTriangle : tone === 'danger' ? AlertCircle : tone === 'success' ? CheckCircle2 : Info);
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border p-4', styles.wrap, className)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', styles.icon)} />
      <div className="min-w-0 text-sm leading-6 text-ink-600">
        {title ? <p className={cn('font-semibold', styles.title)}>{title}</p> : null}
        <div className={cn(title ? 'mt-0.5' : '', 'text-sm leading-6 text-ink-600')}>{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="block text-xs font-semibold text-ink-700">
          {label}
          {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p
          id={htmlFor ? `${htmlFor}-error` : undefined}
          role="alert"
          className="text-xs leading-5 text-rose-600"
        >
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-5 text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass =
  'w-full rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 shadow-subtle transition-colors focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-ink-400';

export const selectClass = cn(inputClass, 'h-9 cursor-pointer py-0 pr-8');

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, 'h-9', props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClass, 'leading-6', props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(selectClass, props.className)} />;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Capture the trigger during render, before an autoFocus child claims focus.
  if (open && restoreFocusRef.current === null) {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const focusableInPanel = () => {
      const panel = panelRef.current;
      if (!panel) return [];
      return Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) =>
          !element.hasAttribute('disabled') &&
          element.getAttribute('aria-hidden') !== 'true' &&
          element.offsetParent !== null
      );
    };

    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      (focusableInPanel()[0] ?? panel).focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = focusableInPanel();
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // StrictMode replays mount effects while the panel is still mounted; only restore on real close.
      if (!panelRef.current) {
        if (restoreFocusRef.current?.isConnected) restoreFocusRef.current.focus();
        restoreFocusRef.current = null;
      }
    };
  }, [open]);

  if (!open) return null;
  const widths = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  };
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center overflow-y-auto bg-ink-950/35 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'animate-rise-in flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-[var(--line)] bg-white shadow-elevated focus:outline-none sm:rounded-3xl',
          widths[size]
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-base font-bold text-ink-950">
              {title}
            </h2>
            {description ? (
              <div id={descriptionId} className="mt-1 text-sm leading-6 text-ink-500">
                {description}
              </div>
            ) : null}
          </div>
          <IconButton label="Close dialog" onClick={onClose} className="-mr-1 -mt-1">
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-6 text-ink-600">{description}</div>
    </Modal>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
  className,
  idBase,
  label = 'Sections',
}: {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
  idBase?: string;
  label?: string;
}) {
  const generatedId = useId().replace(/:/g, '');
  const base = idBase || `tabs-${generatedId}`;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const selectTab = (index: number) => {
    const next = tabs[(index + tabs.length) % tabs.length];
    if (!next) return;
    onChange(next.id);
    window.requestAnimationFrame(() => refs.current[next.id]?.focus());
  };

  return (
    <div className={cn('tab-scroll overflow-x-auto overscroll-x-contain border-b border-slate-200', className)}>
      <div role="tablist" aria-label={label} aria-orientation="horizontal" className="flex min-w-max gap-1">
        {tabs.map((tab, index) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                refs.current[tab.id] = element;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  selectTab(index + 1);
                } else if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  selectTab(index - 1);
                } else if (event.key === 'Home') {
                  event.preventDefault();
                  selectTab(0);
                } else if (event.key === 'End') {
                  event.preventDefault();
                  selectTab(tabs.length - 1);
                }
              }}
              className={cn(
                'relative flex min-h-11 items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:min-h-0',
                selected ? 'text-brand-700' : 'text-ink-500 hover:text-ink-900'
              )}
            >
              {tab.label}
              {tab.count !== undefined ? (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                    selected ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-ink-500'
                  )}
                >
                  {tab.count}
                </span>
              ) : null}
              {selected ? (
                <span className="accent-gradient-bar absolute inset-x-2 -bottom-px h-0.5 rounded-full" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ScoreRing({
  score,
  size = 64,
  strokeWidth = 5,
  label,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const tone = scoreTone(score);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, score)) / 100) * circumference;
  const color =
    score >= 85 ? '#10b981' : score >= 70 ? '#f59e0b' : score >= 50 ? '#f97316' : '#ef4467';
  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      title={`Audit score ${score} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(24, 53, 114, 0.1)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 500ms ease', filter: `drop-shadow(0 2px 4px ${color}33)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-display font-bold tabular-nums', tone.text)} style={{ fontSize: size * 0.28 }}>
          {Math.round(score)}
        </span>
        {label ? <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-400">{label}</span> : null}
      </div>
    </div>
  );
}

export function ScoreMeter({ score, className }: { score: number | null; className?: string }) {
  if (score === null || score === undefined) {
    return <span className="text-xs text-ink-400">Not checked</span>;
  }
  const tone = scoreTone(score);
  return (
    <div className={cn('flex min-w-[92px] items-center gap-2', className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full', tone.bar)}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
      <span className={cn('w-8 text-right text-xs font-bold tabular-nums', tone.text)}>{score}</span>
    </div>
  );
}

export function Avatar({ name, role, size = 'md' }: { name: string; role?: string; size?: 'sm' | 'md' | 'lg' }) {
  const roleStyle =
    role === 'admin'
      ? 'bg-gradient-to-br from-ink-900 to-ink-700 text-white'
      : role === 'reviewer'
        ? 'bg-brand-100 text-brand-700'
        : 'bg-slate-100 text-ink-700';
  const sizes = { sm: 'h-7 w-7 text-[10px]', md: 'h-8 w-8 text-[11px]', lg: 'h-10 w-10 text-sm' };
  const label = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold ring-2 ring-white',
        roleStyle,
        sizes[size]
      )}
      aria-hidden
    >
      {label || '?'}
    </span>
  );
}

export function CopyButton({
  value,
  label = 'Copy',
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      className={cn(
        'inline-flex items-center gap-1 rounded text-xs font-semibold text-ink-500 transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        className
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : label}
    </button>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: 'default' | 'warning' | 'danger' | 'success' | 'brand';
  onClick?: () => void;
}) {
  const tones = {
    default: 'border-slate-200 bg-slate-50 text-ink-600',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    danger: 'border-rose-200 bg-rose-50 text-rose-600',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    brand: 'border-brand-200 bg-brand-50 text-brand-700',
  };
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'lift group relative overflow-hidden rounded-2xl border border-[var(--line)] bg-white p-4 text-left shadow-card',
        onClick && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2'
      )}
    >
      <span
        className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-brand-500/10 blur-2xl transition-opacity duration-200 group-hover:opacity-100"
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase leading-4 tracking-wide text-ink-500">{label}</p>
          <div className="mt-1.5 font-display text-2xl font-bold tracking-tight text-ink-950 tabular-nums">{value}</div>
          {hint ? <p className="mt-1 text-xs leading-5 text-ink-500">{hint}</p> : null}
        </div>
        {Icon ? (
          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border', tones[tone])}>
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
      </div>
    </Component>
  );
}

export function useFormId(prefix: string) {
  const id = useId();
  return `${prefix}-${id}`;
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-slate-100', className)} />;
}

export function KeyValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="text-sm text-ink-800">{children}</dd>
    </div>
  );
}
