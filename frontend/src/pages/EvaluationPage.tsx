import { useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  FlaskConical,
  Play,
  XCircle,
} from 'lucide-react';
import { useAsync } from '../lib/router';
import { api, ApiError } from '../services/api';
import { useToast } from '../components/Toast';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  InfoCallout,
  LoadingBlock,
  PageHeader,
  StatCard,
  cn,
} from '../components/ui';
import { formatDateTime, titleCase } from '../lib/format';
import type { EvaluationRun, EvaluationSummary } from '../types';

const RUN_STATUS: Record<string, { className: string; icon: typeof CheckCircle2 }> = {
  passed: { className: 'border-emerald-200 bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  failed: { className: 'border-rose-200 bg-rose-50 text-rose-600', icon: XCircle },
  error: { className: 'border-amber-200 bg-amber-50 text-amber-800', icon: AlertTriangle },
};

function RunBadge({ status }: { status: string }) {
  const style = RUN_STATUS[status] || RUN_STATUS.error;
  const Icon = style.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide', style.className)}>
      <Icon className="h-2.5 w-2.5" />
      {titleCase(status)}
    </span>
  );
}

function formatDetails(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.length ? value.map((item) => String(item)).join(', ') : 'None';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function EvaluationPage() {
  const { toast } = useToast();
  const { data, loading, error, reload, setData } = useAsync(() => api.getEvaluation(), []);
  const [runningAll, setRunningAll] = useState(false);
  const [runningCase, setRunningCase] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) {
    return (
      <div>
        <div className="mb-6 h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
        <LoadingBlock rows={4} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <PageHeader eyebrow="Organization workspace" title="Evaluation" />
        <ErrorState message={error || 'Evaluation results could not be loaded.'} retry={reload} />
      </div>
    );
  }

  const summary: EvaluationSummary = data;
  const lastRunByCase = new Map<string, EvaluationRun>();
  summary.runs.forEach((run) => {
    const current = lastRunByCase.get(run.case_id);
    if (!current || new Date(run.executed_at) > new Date(current.executed_at)) {
      lastRunByCase.set(run.case_id, run);
    }
  });

  const runAll = async () => {
    setRunningAll(true);
    setActionError(null);
    try {
      const updated = await api.runAllEvaluations();
      setData(updated);
      toast(
        `Evaluation finished: ${updated.passed} passed, ${updated.failed} failed, ${updated.errors} error${
          updated.errors === 1 ? '' : 's'
        }.`,
        updated.failed || updated.errors ? 'info' : 'success'
      );
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.detail : 'The evaluation run could not be completed.');
    } finally {
      setRunningAll(false);
    }
  };

  const runCase = async (caseId: string) => {
    setRunningCase(caseId);
    setActionError(null);
    try {
      const updated = await api.runEvaluationCase(caseId);
      setData(updated);
      const run = updated.runs.find((item) => item.case_id === caseId);
      toast(
        run
          ? `Case finished: ${titleCase(run.status)} with ${run.findings_count} finding${run.findings_count === 1 ? '' : 's'}.`
          : 'Case executed.',
        run?.status === 'passed' ? 'success' : 'info'
      );
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.detail : 'The evaluation case could not be run.');
    } finally {
      setRunningCase(null);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Organization workspace"
        title="Evaluation"
        description="Deterministic audit cases with stored expected outcomes. Every result below comes from an actual engine run — not a simulated benchmark."
        actions={
          <Button onClick={runAll} loading={runningAll}>
            <Play className="h-4 w-4" />
            Run all cases
          </Button>
        }
      />

      {actionError ? (
        <div className="mb-5">
          <InfoCallout tone="danger" title="Evaluation action failed">
            {actionError}
          </InfoCallout>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Cases executed"
          value={summary.executed_cases}
          hint={`${summary.cases.length} case definitions in the workspace`}
          icon={FlaskConical}
          tone="brand"
        />
        <StatCard
          label="Pass rate"
          value={`${summary.pass_rate_percent.toFixed(0)}%`}
          hint={`${summary.passed} passed of ${summary.executed_cases} executed`}
          icon={BadgeCheck}
          tone={summary.pass_rate_percent >= 100 ? 'success' : 'warning'}
        />
        <StatCard
          label="Failed"
          value={summary.failed}
          hint="Expectation mismatches in the latest run"
          icon={XCircle}
          tone={summary.failed ? 'danger' : 'success'}
        />
        <StatCard
          label="Errors"
          value={summary.errors}
          hint="Cases that could not complete"
          icon={AlertTriangle}
          tone={summary.errors ? 'warning' : 'success'}
        />
      </div>

      <div className="mt-5">
        <InfoCallout tone="neutral" title="Measured, not asserted">
          {summary.note} Passing means the deterministic engine produced the expected stored outcome; it is not a claim
          of general accuracy, safety, or legal compliance.
        </InfoCallout>
      </div>

      {summary.cases.length === 0 ? (
        <Card className="mt-5 p-5">
          <EmptyState
            icon={FlaskConical}
            title="No evaluation cases are defined"
            description="Cases are seeded with the demo workspace. In this build, cases cannot be created from the UI."
          />
        </Card>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {summary.cases.map((testCase) => {
            const lastRun = lastRunByCase.get(testCase.id) || testCase.last_run || null;
            const isExpanded = expanded === testCase.id;
            return (
              <Card key={testCase.id} className="flex flex-col p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-ink-900">{testCase.name}</h3>
                      {lastRun ? <RunBadge status={lastRun.status} /> : (
                        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-500">
                          Not run
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-500">
                      {titleCase(testCase.case_type)} · v{testCase.version}
                      {testCase.is_demo ? ' · demo case' : ''}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => runCase(testCase.id)}
                    loading={runningCase === testCase.id}
                    disabled={runningAll}
                  >
                    {runningCase === testCase.id ? null : <Play className="h-3.5 w-3.5" />}
                    Run case
                  </Button>
                </div>

                {testCase.description ? (
                  <p className="mt-2 text-xs leading-5 text-ink-500">{testCase.description}</p>
                ) : null}

                {testCase.expected_summary ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-500">Stored expectation</p>
                    <p className="mt-0.5 text-[11px] leading-5 text-ink-700">{testCase.expected_summary}</p>
                  </div>
                ) : null}

                {lastRun ? (
                  <div className="mt-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-500">
                      <span>
                        <span className="font-medium text-ink-700">{lastRun.findings_count}</span> finding
                        {lastRun.findings_count === 1 ? '' : 's'}
                      </span>
                      {lastRun.actual_location ? <span>Location: {lastRun.actual_location}</span> : null}
                      <span>{formatDateTime(lastRun.executed_at)}</span>
                    </div>
                    {lastRun.matched_categories.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {lastRun.matched_categories.map((category) => (
                          <span key={category} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-ink-700">
                            {titleCase(category)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setExpanded(isExpanded ? null : testCase.id)}
                      className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-brand-600 hover:underline"
                    >
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {isExpanded ? 'Hide run details' : 'View run details'}
                    </button>
                    {isExpanded ? (
                      <div className="mt-2 space-y-2">
                        <dl className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          {Object.entries(lastRun.details).map(([key, value]) => (
                            <div key={key} className="flex flex-col gap-0.5 py-0.5 sm:flex-row sm:gap-2">
                              <dt className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-500 sm:w-32">
                                {titleCase(key)}
                              </dt>
                              <dd className="min-w-0 break-words text-[11px] leading-4 text-ink-700">{formatDetails(value)}</dd>
                            </div>
                          ))}
                          {Object.keys(lastRun.details).length === 0 ? (
                            <p className="text-[11px] text-ink-500">No additional run details were stored.</p>
                          ) : null}
                        </dl>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-500">
                            Stored expected outcome
                          </p>
                          <dl className="mt-1 space-y-0.5">
                            {Object.entries(testCase.expected_outcome).map(([key, value]) => (
                              <div key={key} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                                <dt className="shrink-0 text-[10px] text-ink-500 sm:w-32">{titleCase(key)}</dt>
                                <dd className="min-w-0 break-words font-mono text-[10px] text-ink-700">
                                  {formatDetails(value)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[11px] text-ink-500">
                    This case has not been run. Run it to compare the engine output with the stored expectation.
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">Recent evaluation runs</h2>
            <p className="mt-0.5 text-xs text-ink-500">Stored execution records, newest first.</p>
          </div>
          <span className="text-[11px] text-ink-500">{summary.runs.length} run{summary.runs.length === 1 ? '' : 's'} retained</span>
        </div>
        {summary.runs.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-ink-500">No cases have been run yet.</p>
        ) : (
          <div className="divide-y divide-slate-200">
            {summary.runs.map((run) => (
              <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink-800">
                    {run.case_name || summary.cases.find((testCase) => testCase.id === run.case_id)?.name || 'Evaluation case'}
                  </p>
                  <p className="mt-0.5 text-[10px] text-ink-500">
                    {formatDateTime(run.executed_at)} · {run.findings_count} finding{run.findings_count === 1 ? '' : 's'}
                    {run.actual_location ? ` · ${run.actual_location}` : ''}
                  </p>
                </div>
                <RunBadge status={run.status} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-5 flex items-start gap-2 text-[11px] leading-5 text-ink-500">
        <ClipboardCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Evaluation results reflect this build's deterministic engine and the seeded fictional demo cases. They are not
          evidence of performance on customer content.
        </span>
      </div>
    </div>
  );
}
