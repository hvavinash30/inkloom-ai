import { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpenCheck,
  Brain,
  CheckCircle2,
  FlaskConical,
  GitBranch,
  Lightbulb,
  Loader2,
  Plus,
  ScanSearch,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { navigate, useAsync } from '../lib/router';
import { api, ApiError } from '../services/api';
import { useToast } from '../components/Toast';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  InfoCallout,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  SectionHeading,
  Select,
  SeverityBadge,
  Textarea,
  cn,
} from '../components/ui';
import { SEVERITY_LABEL, titleCase } from '../lib/format';
import type { ImpactAnalysis, MemoryConflict, RuleSuggestion } from '../types';

export function PoliciesPage() {
  const { toast } = useToast();
  const { data, loading, error, reload } = useAsync(
    () => Promise.all([api.listConflicts(), api.listSuggestions()]),
    []
  );
  const conflicts = data?.[0] || [];
  const suggestions = data?.[1] || [];

  const [activeSuggestion, setActiveSuggestion] = useState<RuleSuggestion | null>(null);
  const [createTitle, setCreateTitle] = useState('');
  const [createPattern, setCreatePattern] = useState('');
  const [createGuidance, setCreateGuidance] = useState('');
  const [createSeverity, setCreateSeverity] = useState('medium');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [simPattern, setSimPattern] = useState('!!!');
  const [simSeverity, setSimSeverity] = useState('high');
  const [simulation, setSimulation] = useState<ImpactAnalysis | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  const openSuggestion = (suggestion: RuleSuggestion) => {
    setActiveSuggestion(suggestion);
    setCreateTitle(suggestion.title);
    setCreatePattern(suggestion.proposed_pattern || suggestion.affected_text);
    setCreateGuidance(suggestion.proposed_guidance || '');
    setCreateSeverity(suggestion.severity);
    setCreateError(null);
  };

  const createDraftRule = async () => {
    if (!activeSuggestion) return;
    if (!createTitle.trim() || !createPattern.trim()) {
      setCreateError('A rule name and pattern are required.');
      return;
    }
    setCreateBusy(true);
    setCreateError(null);
    try {
      await api.createRuleFromSuggestion({
        title: createTitle.trim(),
        rationale: activeSuggestion.rationale,
        affected_text: activeSuggestion.affected_text,
        severity: createSeverity,
        category: activeSuggestion.category,
        proposed_pattern: createPattern.trim(),
        proposed_guidance: createGuidance.trim() || null,
        proposed_rule_type: activeSuggestion.proposed_rule_type,
      });
      toast('Draft rule created. Review and activate it in the brand library.', 'success');
      setActiveSuggestion(null);
      reload();
    } catch (caught) {
      setCreateError(caught instanceof ApiError ? caught.detail : 'The draft rule could not be created.');
    } finally {
      setCreateBusy(false);
    }
  };

  const runSimulation = async () => {
    if (simPattern.trim().length < 2) {
      setSimError('Enter at least two characters to simulate.');
      return;
    }
    setSimBusy(true);
    setSimError(null);
    setSimulation(null);
    try {
      setSimulation(await api.simulateRule({ proposed_pattern: simPattern.trim(), proposed_severity: simSeverity }));
    } catch (caught) {
      setSimError(caught instanceof ApiError ? caught.detail : 'The rule simulation could not be completed.');
    } finally {
      setSimBusy(false);
    }
  };

  const conflictSeverityClass = (severity: string) =>
    severity === 'critical' || severity === 'high'
      ? 'border-rose-400/25 bg-rose-500/10 text-rose-200'
      : severity === 'medium'
        ? 'border-amber-400/25 bg-amber-400/10 text-amber-200'
        : 'border-white/10 bg-white/[0.035] text-slate-300';

  return (
    <div>
      <PageHeader
        eyebrow="Organization workspace"
        title="Policies & brand memory"
        description="Surface conflicts between stored rules, detect recurring issues that no rule covers, and test a proposed pattern against current content before you add it."
        actions={
          <Button variant="secondary" onClick={() => navigate('/brand')}>
            <BookOpenCheck className="h-4 w-4" />
            Open brand library
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Card className="p-5">
            <SectionHeading
              title={
                <span className="inline-flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-slate-400" />
                  Brand memory conflicts
                  <Badge className="border-white/10 bg-white/[0.035] text-slate-400">{conflicts.length}</Badge>
                </span>
              }
              description="Detected from stored fact, rule, and asset records. These are review prompts, not automatic legal findings."
            />
            <div className="mt-4 space-y-3">
              {loading ? (
                <LoadingBlock rows={2} />
              ) : error ? (
                <ErrorState message={error} retry={reload} />
              ) : conflicts.length === 0 ? (
                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-6">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-100">No brand memory conflicts detected</p>
                      <p className="mt-0.5 text-xs leading-5 text-emerald-200/80">
                        Current rules and facts do not contradict each other in a way this deterministic check can see.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                conflicts.map((conflict: MemoryConflict) => (
                  <div key={conflict.id} className="rounded-2xl border border-white/10 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                            conflictSeverityClass(conflict.severity)
                          )}
                        >
                          {titleCase(conflict.conflict_type)}
                        </span>
                        <SeverityBadge severity={conflict.severity} />
                      </div>
                      <span className="text-[10px] text-slate-400">Requires human resolution</span>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-slate-100">{conflict.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{conflict.description}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-white/[0.07] bg-white/[0.035] px-3 py-2">
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                          {conflict.entity_a_type}
                        </p>
                        <p className="mt-0.5 text-xs font-medium text-slate-300">{conflict.entity_a_name}</p>
                      </div>
                      <div className="rounded-lg border border-white/[0.07] bg-white/[0.035] px-3 py-2">
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                          {conflict.entity_b_type}
                        </p>
                        <p className="mt-0.5 text-xs font-medium text-slate-300">{conflict.entity_b_name}</p>
                      </div>
                    </div>
                    {conflict.affected_assets.length > 0 ? (
                      <div className="mt-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Affected assets</p>
                        <div className="mt-1 space-y-1">
                          {conflict.affected_assets.map((asset) => (
                            <button
                              key={`${asset.document_id}-${asset.reason}`}
                              type="button"
                              onClick={() => navigate(`/content/${asset.document_id}`)}
                              className="flex w-full items-start justify-between gap-2 rounded-md px-2 py-1 text-left hover:bg-white/[0.06]"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-[11px] font-medium text-slate-300">{asset.title}</span>
                                <span className="block text-[10px] text-slate-400">{asset.reason}</span>
                              </span>
                              <ArrowUpRight className="mt-1 h-3 w-3 shrink-0 text-slate-300" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-3 rounded-lg border border-brand-400/15 bg-brand-500/10 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-300">Recommended action</p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-300">{conflict.recommended_action}</p>
                      {conflict.resolution_options.length > 0 ? (
                        <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[11px] leading-4 text-slate-400">
                          {conflict.resolution_options.map((option) => (
                            <li key={option}>{option}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
            {conflicts.length > 0 ? (
              <p className="mt-3 text-[10px] leading-4 text-slate-400">
                Inkloom does not automatically overwrite rules or facts. Resolve the underlying records in the brand
                library so the decision and its source stay documented.
              </p>
            ) : null}
          </Card>

          <Card className="p-5">
            <SectionHeading
              title={
                <span className="inline-flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-400" />
                  Suggested rules from audited content
                  <Badge className="border-white/10 bg-white/[0.035] text-slate-400">{suggestions.length}</Badge>
                </span>
              }
              description="Recurring open findings that no active rule currently covers. Suggestions are derived from stored audits, not generated by a language model."
            />
            <div className="mt-4 space-y-3">
              {loading ? (
                <LoadingBlock rows={2} />
              ) : suggestions.length === 0 ? (
                <EmptyState
                  icon={Sparkles}
                  title="No uncovered recurring issues"
                  description="Every current open finding is either already covered by an active rule or does not repeat."
                  className="bg-white/[0.035]"
                />
              ) : (
                suggestions.map((suggestion) => (
                  <div key={suggestion.id} className="rounded-2xl border border-white/10 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-100">{suggestion.title}</h3>
                        <SeverityBadge severity={suggestion.severity} />
                        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                          {suggestion.occurrences} occurrence{suggestion.occurrences === 1 ? '' : 's'}
                        </span>
                      </div>
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">
                        {titleCase(suggestion.category)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{suggestion.rationale}</p>
                    <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2">
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Recurring text</p>
                      <p className="mt-0.5 break-words font-mono text-[11px] leading-4 text-slate-300">{suggestion.affected_text}</p>
                    </div>
                    {suggestion.proposed_guidance ? (
                      <p className="mt-2 text-[11px] leading-5 text-emerald-200">
                        <span className="font-medium">Suggested guidance:</span> {suggestion.proposed_guidance}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {suggestion.example_document_ids.slice(0, 3).map((documentId, index) => (
                          <Button
                            key={documentId}
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/content/${documentId}`)}
                          >
                            Example {index + 1}
                            <ArrowUpRight className="h-3 w-3" />
                          </Button>
                        ))}
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => openSuggestion(suggestion)}>
                        <Plus className="h-3.5 w-3.5" />
                        Create draft rule
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <p className="mt-3 text-[10px] leading-4 text-slate-400">
              Rules created here start as drafts and are not evaluated until an admin reviews and activates them.
            </p>
          </Card>
        </div>

        <aside className="min-w-0 space-y-5">
          <Card className="p-4">
            <SectionHeading
              title={
                <span className="inline-flex items-center gap-2">
                  <ScanSearch className="h-4 w-4 text-slate-400" />
                  Simulate a rule
                </span>
              }
              description="Count matches in current stored text before creating a rule. Nothing is saved."
            />
            <div className="mt-3 space-y-3">
              <Field label="Proposed pattern or phrase" htmlFor="sim-pattern">
                <Input
                  id="sim-pattern"
                  value={simPattern}
                  onChange={(event) => setSimPattern(event.target.value)}
                  placeholder="e.g. guaranteed"
                  className="font-mono"
                />
              </Field>
              <Field label="Proposed severity" htmlFor="sim-severity">
                <Select id="sim-severity" value={simSeverity} onChange={(event) => setSimSeverity(event.target.value)}>
                  {Object.entries(SEVERITY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button className="w-full" onClick={runSimulation} loading={simBusy}>
                <FlaskConical className="h-4 w-4" />
                Run simulation
              </Button>
              {simError ? (
                <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{simError}</p>
              ) : null}
              {simBusy ? (
                <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-300" />
                  Scanning current document versions…
                </div>
              ) : simulation ? (
                <div className="space-y-2 border-t border-white/[0.07] pt-3">
                  <p className="text-xs text-slate-300">
                    <span className="font-semibold text-slate-100">{simulation.items.length}</span> matching document
                    {simulation.items.length === 1 ? '' : 's'} out of {simulation.scanned_documents} scanned.
                  </p>
                  {simulation.items.length === 0 ? (
                    <p className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-200">
                      No current text matches this pattern.
                    </p>
                  ) : (
                    simulation.items.slice(0, 6).map((item) => (
                      <button
                        key={item.document_id}
                        type="button"
                        onClick={() => navigate(`/content/${item.document_id}`)}
                        className="block w-full rounded-lg border border-white/10 px-3 py-2 text-left hover:bg-white/[0.06]"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-[11px] font-medium text-slate-300">{item.title}</span>
                          <span className="shrink-0 text-[10px] text-slate-400">{item.match_count}×</span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block font-mono text-[10px] leading-4 text-slate-400">
                          {item.snippet}
                        </span>
                      </button>
                    ))
                  )}
                  <p className="text-[10px] leading-4 text-slate-400">{simulation.note}</p>
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-start gap-2.5">
              <Brain className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <p className="text-xs font-semibold text-slate-200">Truth boundaries</p>
                <ul className="mt-1.5 space-y-1.5 text-[11px] leading-4 text-slate-400">
                  <li>• Conflicts come from comparing stored values, not inference.</li>
                  <li>• Suggestions come from open audit findings with no matching rule.</li>
                  <li>• Simulations match literal patterns in stored text; they do not predict legal risk.</li>
                  <li>• A human decides whether to change a rule or a fact.</li>
                </ul>
              </div>
            </div>
          </Card>

          <InfoCallout tone="warning" title="No silent policy changes">
            Editing a rule creates a new version but does not rewrite past audit findings. Existing decisions remain
            attached to the version and rule set that produced them.
          </InfoCallout>
        </aside>
      </div>

      <Modal
        open={Boolean(activeSuggestion)}
        onClose={() => setActiveSuggestion(null)}
        title="Create a draft rule"
        description="The rule starts inactive. Review its wording, then activate it from the brand library."
        footer={
          <>
            <Button variant="secondary" onClick={() => setActiveSuggestion(null)} disabled={createBusy}>
              Cancel
            </Button>
            <Button onClick={createDraftRule} loading={createBusy}>
              Create draft rule
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Rule name" htmlFor="suggested-rule-name" required>
            <Input
              id="suggested-rule-name"
              value={createTitle}
              onChange={(event) => setCreateTitle(event.target.value)}
            />
          </Field>
          <Field label="Pattern or phrase" htmlFor="suggested-rule-pattern" required hint="Matched literally, case-insensitively.">
            <Input
              id="suggested-rule-pattern"
              value={createPattern}
              onChange={(event) => setCreatePattern(event.target.value)}
              className="font-mono"
            />
          </Field>
          <Field label="Severity" htmlFor="suggested-rule-severity">
            <Select
              id="suggested-rule-severity"
              value={createSeverity}
              onChange={(event) => setCreateSeverity(event.target.value)}
            >
              {Object.entries(SEVERITY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Guidance" htmlFor="suggested-rule-guidance" hint="What should writers do instead?">
            <Textarea
              id="suggested-rule-guidance"
              rows={2}
              value={createGuidance}
              onChange={(event) => setCreateGuidance(event.target.value)}
            />
          </Field>
          {activeSuggestion ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Evidence from stored audits</p>
              <p className="mt-1 break-words font-mono text-[11px] text-slate-300">{activeSuggestion.affected_text}</p>
              <p className="mt-1 text-[10px] text-slate-400">
                {activeSuggestion.occurrences} occurrence{activeSuggestion.occurrences === 1 ? '' : 's'} ·{' '}
                {titleCase(activeSuggestion.category)}
              </p>
            </div>
          ) : null}
          {createError ? (
            <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{createError}</p>
          ) : null}
        </div>
      </Modal>

      <div className="mt-5 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[11px] leading-5 text-slate-400">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <span>
          Brand memory is a governance aid. It does not verify external sources, conduct legal review, or certify
          compliance. The demo workspace's rules and facts are fictional records.
        </span>
      </div>
      {conflicts.some((conflict) => conflict.severity === 'critical') ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-[11px] leading-5 text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Critical memory conflicts are present. Resolve the source records before relying on the current rules.</span>
        </div>
      ) : null}
    </div>
  );
}
