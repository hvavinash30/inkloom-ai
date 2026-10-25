import { useEffect } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  FileCheck2,
  FlaskConical,
  Layers,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useToast } from '../components/Toast';
import { Badge, Button, cn } from '../components/ui';
import { navigate } from '../lib/router';
import type { Workspace } from '../types';

function InkloomMark({ size = 34 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl bg-brand-600 shadow-inner shadow-brand-950/30"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" width={size * 0.64} height={size * 0.64} fill="none">
        <path d="M9 8v16M23 8v16M9 16h14" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="9" cy="8" r="1.6" fill="#BFDBFE" />
        <circle cx="23" cy="24" r="1.6" fill="#BFDBFE" />
      </svg>
    </span>
  );
}

function statLabel(value: number | undefined, noun: string) {
  if (value === undefined) return null;
  return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

function WorkspaceRow({
  workspace,
  onOpen,
}: {
  workspace: Workspace;
  onOpen: (workspace: Workspace) => void;
}) {
  const counts = workspace.counts || {};
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-subtle sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-slate-900">{workspace.name}</h3>
          <Badge
            className={
              workspace.is_demo
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-slate-50 text-slate-600'
            }
          >
            {workspace.is_demo ? 'Demo' : 'Your brand'}
          </Badge>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
          {workspace.description || 'No description saved yet.'}
        </p>
        <p className="mt-1 text-[11px] text-slate-400">
          {[
            statLabel(counts.documents, 'document'),
            statLabel(counts.rules, 'active rule'),
            statLabel(counts.facts, 'approved fact'),
            statLabel(counts.campaigns, 'campaign'),
          ]
            .filter(Boolean)
            .join(' · ') || 'New workspace'}
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={() => onOpen(workspace)} className="shrink-0">
        Open workspace
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </div>
  );
}

const DEMO_STEPS = [
  {
    icon: FileCheck2,
    title: 'Run an evidence-grounded audit',
    body: 'Open a linked post or PDF and see exact quoted evidence, the rule or fact it violates, and the page or timestamp.',
  },
  {
    icon: Sparkles,
    title: 'Review grounded corrections',
    body: 'Suggestions cite the workspace rule or approved fact. Rule-based fallback is labelled when no AI provider is configured.',
  },
  {
    icon: BadgeCheck,
    title: 'Approve a version, then make it stale',
    body: 'Approvals are bound to a version. Editing approved content creates a new version and flags the old approval as stale.',
  },
];

export function WelcomePage() {
  const { session, selectWorkspace, refreshWorkspaces } = useSession();
  const { toast } = useToast();
  useEffect(() => {
    void refreshWorkspaces();
  }, [refreshWorkspaces]);
  const workspaces = session?.workspaces || [];
  const demo =
    workspaces.find((workspace) => workspace.is_demo) ||
    (session?.workspace.is_demo ? session.workspace : undefined);
  const custom = workspaces.filter((workspace) => !workspace.is_demo);
  const demoCounts = demo?.counts || {};

  const open = (workspace: Workspace) => {
    selectWorkspace(workspace.id);
    toast(`Opening ${workspace.name}`, 'success');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-900 focus:shadow-elevated"
      >
        Skip to workspace options
      </a>

      <header className="border-b border-slate-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <InkloomMark />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-5 tracking-tight text-slate-950">Inkloom AI</p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Brand governance</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 sm:inline-flex">
              <Users className="h-3 w-3 text-slate-400" aria-hidden />
              Shared demo identities
            </span>
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-700">
            Evidence-first brand governance
          </p>
          <h1 className="mt-3 text-[32px] font-semibold leading-[1.15] tracking-tight text-slate-950 sm:text-[42px]">
            Protect brand consistency and content accuracy before it ships.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Inkloom audits marketing content against your stored rules and approved facts, shows the exact
            evidence behind every finding, and keeps approvals tied to the version that was reviewed.
          </p>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <section
            aria-labelledby="demo-heading"
            className="relative overflow-hidden rounded-2xl border border-navy-800 bg-navy-900 p-6 text-slate-200 shadow-elevated sm:p-7"
          >
            <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand-500/10 blur-2xl" aria-hidden />
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-100">
                  <FlaskConical className="h-3 w-3" aria-hidden />
                  Preloaded demo
                </span>
                <span className="text-[11px] text-slate-400">No setup, upload, or AI key required</span>
              </div>
              <h2 id="demo-heading" className="mt-4 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Explore the demo workspace
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Acme Cloud Technologies is a fictional B2B cloud brand seeded with its own rules, approved
                facts, campaigns, documents, audits, review comments, and approval history.
              </p>

              <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  { label: 'Documents', value: demoCounts.documents },
                  { label: 'Active rules', value: demoCounts.rules },
                  { label: 'Approved facts', value: demoCounts.facts },
                  { label: 'Campaigns', value: demoCounts.campaigns },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2.5">
                    <dt className="text-[10px] uppercase tracking-wide text-slate-400">{item.label}</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums text-white">
                      {item.value ?? '—'}
                    </dd>
                  </div>
                ))}
              </dl>

              <ul className="mt-5 space-y-2">
                {[
                  'Open seeded documents with verbatim findings on the exact page or timestamp',
                  'Review a creator submission with a persisted reviewer decision history',
                  'See a stale approval after a corrected version is saved',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2 text-xs leading-5 text-slate-300">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>

              <Button
                size="lg"
                className="mt-6 w-full bg-white text-navy-900 hover:bg-slate-100 sm:w-auto"
                onClick={() => {
                  if (!demo) {
                    toast('The demo workspace is not available yet. Retry the session.', 'error');
                    return;
                  }
                  open(demo);
                }}
                disabled={!demo}
              >
                Explore demo workspace
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
              <p className="mt-3 text-[11px] leading-5 text-slate-400">
                Fictional company and data. Demo roles are shared identities, not customer accounts.
              </p>
            </div>
          </section>

          <section
            aria-labelledby="custom-heading"
            className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-panel sm:p-7"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-brand-800">
                <Building2 className="h-3 w-3" aria-hidden />
                Judge-controlled
              </span>
              <span className="text-[11px] text-slate-500">Your own empty workspace</span>
            </div>
            <h2 id="custom-heading" className="mt-4 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
              Create your own brand
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Set up a separate brand workspace with your company profile, voice, writing rules, approved
              facts, restricted claims, and preferred terminology. Then upload content and audit it.
            </p>

            <ul className="mt-5 space-y-2.5">
              {[
                'Rules and facts you define become the evidence used by audits',
                'Your documents, reviews, and corrections stay in your workspace',
                'The shared demo workspace is never changed by your edits',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2 text-xs leading-5 text-slate-600">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>

            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50/80 px-3.5 py-3">
              <p className="flex items-start gap-2 text-[11px] leading-5 text-slate-500">
                <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                Brand guideline files can be added from the brand library after creation. Only stored,
                extracted text is audited; images and scanned files are flagged for manual review.
              </p>
            </div>

            <Button size="lg" className="mt-6 w-full sm:w-auto" onClick={() => navigate('/onboarding')}>
              Create your own brand
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
            <p className="mt-3 text-[11px] leading-5 text-slate-400">
              No payment or external account required. Setup creates demo workspace identities you can
              switch between for creator, reviewer, and admin checks.
            </p>
          </section>
        </div>

        <section aria-labelledby="brands-heading" className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="brands-heading" className="text-base font-semibold tracking-tight text-slate-900">
                Workspaces on this deployment
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Returning to a brand keeps its saved rules, facts, documents, and review history.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/onboarding')}>
              New brand
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>

          <div className="mt-4 space-y-2.5">
            {demo ? <WorkspaceRow workspace={demo} onOpen={open} /> : null}
            {custom.map((workspace) => (
              <WorkspaceRow key={workspace.id} workspace={workspace} onOpen={open} />
            ))}
            {!demo && custom.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
                <p className="text-sm font-medium text-slate-700">No workspaces are available yet.</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  The API may still be seeding the demo workspace. Retry in a moment.
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="walkthrough-heading" className="mt-10">
          <h2 id="walkthrough-heading" className="text-base font-semibold tracking-tight text-slate-900">
            The demo walkthrough
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {DEMO_STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-subtle">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Step {index + 1}
                    </span>
                  </div>
                  <h3 className="mt-2.5 text-xs font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">{step.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        <footer className="mt-10 flex flex-col gap-2 border-t border-slate-200/70 pt-4 text-[11px] leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Inkloom AI · Evidence-first brand governance</span>
          <span className={cn('flex items-center gap-1.5')}>
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
            Demo data is fictional and clearly labelled throughout the app.
          </span>
        </footer>
      </main>
    </div>
  );
}
