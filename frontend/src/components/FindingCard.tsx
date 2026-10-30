import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  MapPin,
  PencilLine,
  ShieldQuestion,
  Sparkles,
  Undo2,
  Wand2,
  XCircle,
} from 'lucide-react';
import { api, ApiError } from '../services/api';
import { useToast } from './Toast';
import { Badge, Button, Card, SeverityBadge, StatusBadge, Textarea, cn } from './ui';
import { FramePreview } from './FramePreview';
import {
  CATEGORY_LABEL,
  SEVERITY_DOT,
  formatDateTime,
  formatSeconds,
} from '../lib/format';
import type { CorrectionSuggestion, Finding } from '../types';

const EVIDENCE_STATUS: Record<string, { label: string; hint: string }> = {
  contradicted: {
    label: 'Direct contradiction',
    hint: 'The content conflicts with an approved workspace fact.',
  },
  rule_violation: {
    label: 'Rule match',
    hint: 'The content matched an active brand policy.',
  },
  missing_required_text: {
    label: 'Required text missing',
    hint: 'Required approved wording was not found in the content.',
  },
  uncertain: {
    label: 'Needs verification',
    hint: 'No approved fact confirmed this. The content is not asserted to be false.',
  },
  processing_limitation: {
    label: 'Inspection limit',
    hint: 'Automated inspection could not cover this content. This is not a content violation.',
  },
  potential_violation: {
    label: 'Potential issue',
    hint: 'No specific evidence status was recorded for this finding.',
  },
};

const evidenceStatusFor = (finding: Finding) =>
  EVIDENCE_STATUS[finding.evidence_status] ?? {
    label: finding.evidence_status.replace(/_/g, ' '),
    hint: 'The backend recorded this evidence status for the finding.',
  };

export function FindingCard({
  finding,
  canEdit,
  canDismiss,
  onUpdated,
  onApplyCorrection,
  onAsk,
}: {
  finding: Finding;
  canEdit: boolean;
  canDismiss: boolean;
  onUpdated: () => void;
  onApplyCorrection: (finding: Finding, replacement?: string) => void;
  onAsk: (finding: Finding) => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<'idle' | 'edit' | 'dismiss' | 'suggest'>('idle');
  const [correction, setCorrection] = useState(finding.suggested_correction || '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [suggestion, setSuggestion] = useState<CorrectionSuggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const location =
    finding.location_label ||
    (finding.page_number ? `Page ${finding.page_number}` : null) ||
    (finding.timestamp_seconds !== null && finding.timestamp_seconds !== undefined
      ? `Timestamp ${formatSeconds(finding.timestamp_seconds)}`
      : 'Whole document');

  const isOpen = finding.status === 'open';
  const evidence = evidenceStatusFor(finding);

  const locationIcon = finding.page_number ? (
    <MapPin className="h-3 w-3" />
  ) : finding.timestamp_seconds !== null && finding.timestamp_seconds !== undefined ? (
    <Clock3 className="h-3 w-3" />
  ) : (
    <FileText className="h-3 w-3" />
  );

  const run = async (
    action: 'accept' | 'dismiss' | 'edit',
    payload?: { custom_correction?: string; dismissal_reason?: string }
  ) => {
    setBusy(true);
    setError(null);
    try {
      await api.updateFinding(finding.id, { action, ...payload });
      toast(
        action === 'accept'
          ? 'Finding marked accepted. The content draft was not changed.'
          : action === 'dismiss'
            ? 'Finding dismissed with a recorded reason.'
            : 'Suggested wording updated on this finding. The document was not changed.',
        'success'
      );
      setMode('idle');
      onUpdated();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : 'The finding could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  const requestSuggestion = async () => {
    setSuggesting(true);
    setError(null);
    setSuggestion(null);
    try {
      const result = await api.suggestCorrection(finding.id, notes.trim() || undefined);
      setSuggestion(result);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.detail
          : 'A correction suggestion could not be prepared right now.'
      );
    } finally {
      setSuggesting(false);
    }
  };

  const openSuggest = () => {
    setMode(mode === 'suggest' ? 'idle' : 'suggest');
    setError(null);
  };

  const isInspectionLimit = finding.category === 'processing_issue';

  return (
    <Card className={cn('overflow-hidden', !isOpen && 'bg-white/[0.035]')}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <SeverityBadge severity={finding.severity} />
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            {CATEGORY_LABEL[finding.category] || finding.category.replace(/_/g, ' ')}
          </span>
          {isInspectionLimit ? null : finding.source_type === 'spoken' ? (
            <span
              title="Found in speech transcribed automatically from the stored video's audio. Extraction, not verified truth."
              className="rounded border border-sky-400/25 bg-sky-400/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-200"
            >
              Spoken
            </span>
          ) : finding.source_type === 'on_screen' ? (
            <span
              title="Found in text read by OCR from a sampled video frame. Check the frame preview."
              className="rounded border border-violet-400/25 bg-violet-400/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-200"
            >
              On screen
            </span>
          ) : null}
          {!isOpen ? <StatusBadge status={finding.status} /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-0.5 font-medium text-slate-300">
            {locationIcon}
            {location}
          </span>
        </div>
      </div>

      <div className="space-y-3.5 px-4 py-4">
        <div>
          <h3 className="text-sm font-semibold leading-5 text-slate-100">{finding.title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-300">{finding.explanation}</p>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2.5">
          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <span className={cn('h-1.5 w-1.5 rounded-full', SEVERITY_DOT[finding.severity])} />
            Affected text
          </p>
          <p className="whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-slate-200">
            {finding.affected_text || '—'}
          </p>
          {isInspectionLimit ? (
            <p className="mt-1.5 text-[10px] leading-4 text-slate-400">
              This records a stage the pipeline could not inspect. It is not a content violation.
            </p>
          ) : finding.source_type === 'spoken' ? (
            <p className="mt-1.5 text-[10px] leading-4 text-slate-400">
              Extracted from automatically transcribed speech. Wording and timestamps come from the transcription
              provider and are evidence to verify, not confirmed truth.
            </p>
          ) : finding.source_type === 'on_screen' ? (
            <p className="mt-1.5 text-[10px] leading-4 text-slate-400">
              Read by OCR from a sampled frame. OCR can miss or misread text; verify against the frame preview.
            </p>
          ) : null}
        </div>

        {finding.frame_url ? (
          <FramePreview
            path={finding.frame_url}
            caption={
              finding.timestamp_seconds !== null && finding.timestamp_seconds !== undefined
                ? `Sampled frame near ${formatSeconds(finding.timestamp_seconds)}`
                : 'Sampled video frame'
            }
          />
        ) : null}

        {finding.supporting_evidence || finding.source_reference ? (
          <div className="rounded-lg border border-brand-400/15 bg-brand-500/10 px-3 py-2.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-brand-300">Evidence</p>
            {finding.supporting_evidence ? (
              <p className="break-words text-xs leading-5 text-slate-300">{finding.supporting_evidence}</p>
            ) : null}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
              {finding.source_reference ? <span>Source: {finding.source_reference}</span> : null}
              {finding.source_url ? (
                <a
                  href={finding.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-brand-300 hover:underline"
                >
                  Open source
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400">
            Matched deterministically from the workspace rule set. No external citation is attached.
          </p>
        )}

        {finding.suggested_correction ? (
          <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
              Suggested correction
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-emerald-100">
              {finding.suggested_correction}
            </p>
            {canEdit && isOpen && !isInspectionLimit ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-h-11 border-emerald-400/25 bg-white/[0.04] text-emerald-200 hover:bg-emerald-400/10 sm:min-h-8"
                  onClick={() => onApplyCorrection(finding)}
                >
                  Apply correction to draft
                </Button>
                <span className="text-[10px] leading-4 text-emerald-200/80">
                  Changes the editable draft only. It does not mark this finding accepted.
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-[11px] text-slate-400">
            No automatic correction is available. A human decision is required.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-[10px] text-slate-400">
            <span
              title={evidence.hint}
              className="rounded bg-white/[0.06] px-1.5 py-0.5 font-medium text-slate-300"
            >
              Evidence: {evidence.label}
            </span>
            <span className="hidden sm:inline">{evidence.hint}</span>
            <span className="hidden md:inline">This status is not a probability score.</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 sm:min-h-8"
              onClick={() => onAsk(finding)}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Ask about this
            </Button>
            {isOpen && canEdit ? (
              <>
                {isInspectionLimit ? null : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11 sm:min-h-8"
                      onClick={openSuggest}
                      aria-expanded={mode === 'suggest'}
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      Suggest correction
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11 sm:min-h-8"
                      onClick={() => {
                        setMode(mode === 'edit' ? 'idle' : 'edit');
                        setCorrection(finding.suggested_correction || '');
                      }}
                    >
                      <PencilLine className="h-3.5 w-3.5" />
                      Edit suggested wording
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11 sm:min-h-8"
                  onClick={() => run('accept')}
                  loading={busy && mode === 'idle'}
                >
                  <Check className="h-3.5 w-3.5" />
                  Mark accepted
                </Button>
              </>
            ) : null}
            {isOpen && canDismiss ? (
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11 text-slate-400 hover:text-rose-300 sm:min-h-8"
                onClick={() => setMode(mode === 'dismiss' ? 'idle' : 'dismiss')}
              >
                <XCircle className="h-3.5 w-3.5" />
                Dismiss finding
              </Button>
            ) : null}
          </div>
        </div>

        {mode === 'suggest' ? (
          <div className="rounded-lg border border-brand-400/25 bg-brand-500/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <Wand2 className="h-3.5 w-3.5 text-brand-300" />
                Correction suggestion
              </p>
              <span className="text-[10px] text-slate-400">
                Advisory only. Preparing a suggestion never changes the content.
              </span>
            </div>

            {suggestion ? (
              <span
                className={cn(
                  'mt-2 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                  suggestion.mode === 'ai'
                    ? 'border-brand-400/25 bg-white/[0.04] text-brand-200'
                    : 'border-white/10 bg-white/[0.04] text-slate-300'
                )}
              >
                {suggestion.mode === 'ai'
                  ? `AI-assisted${suggestion.provider ? ` · ${suggestion.provider}` : ''}`
                  : 'Deterministic rule engine'}
              </span>
            ) : null}

            <label htmlFor={`notes-${finding.id}`} className="mt-2 block text-[11px] text-slate-300">
              Optional note for the suggestion (for example, preferred wording)
            </label>
            <div className="mt-1 flex flex-wrap items-start gap-2">
              <Textarea
                id={`notes-${finding.id}`}
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="e.g. keep the price approved in the Brand Library"
                className="flex-1 bg-white/[0.04]"
              />
              <Button
                size="sm"
                className="min-h-11 sm:min-h-8"
                loading={suggesting}
                onClick={requestSuggestion}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {suggestion ? 'Regenerate' : 'Generate suggestion'}
              </Button>
            </div>

            {suggestion ? (
              <div className="mt-3 space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Original
                      {!suggestion.original_is_exact_span ? ' (as recorded)' : ''}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-slate-300">
                      {suggestion.original_text || '—'}
                    </p>
                  </div>
                  <div className="rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">Suggested</p>
                    <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-emerald-100">
                      {suggestion.suggested_text || 'No replacement wording was produced.'}
                    </p>
                  </div>
                </div>

                {suggestion.rationale ? (
                  <p className="text-xs leading-5 text-slate-300">{suggestion.rationale}</p>
                ) : null}

                {suggestion.citations.length ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Grounded in stored records
                    </p>
                    <ul className="mt-1 space-y-1">
                      {suggestion.citations.map((citation) => (
                        <li
                          key={`${citation.kind}-${citation.id}`}
                          className="rounded border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] leading-5 text-slate-300"
                        >
                          <span className="font-medium">
                            {citation.kind === 'brand_rule' ? 'Brand rule' : 'Approved fact'}:
                          </span>{' '}
                          {citation.label}
                          {citation.detail ? <span className="text-slate-400"> — {citation.detail}</span> : null}
                          {citation.source_reference ? (
                            <span className="block text-[10px] text-slate-400">{citation.source_reference}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-[11px] text-amber-200">
                    No stored rule or approved fact was cited, so verify this wording against the Brand Library.
                  </p>
                )}

                {suggestion.provider_error && suggestion.mode !== 'ai' ? (
                  <p className="flex items-start gap-1.5 rounded border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] leading-5 text-slate-300">
                    <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span>{suggestion.provider_error.message}</span>
                  </p>
                ) : null}

                {suggestion.cautions.length ? (
                  <ul className="space-y-1 rounded border border-amber-400/25 bg-amber-400/10 px-2.5 py-2 text-[11px] leading-5 text-amber-200">
                    {suggestion.cautions.map((note) => (
                      <li key={note}>• {note}</li>
                    ))}
                  </ul>
                ) : null}

                <ul className="space-y-1 text-[10px] leading-4 text-slate-400">
                  {suggestion.limitations.map((note) => (
                    <li key={note}>• {note}</li>
                  ))}
                </ul>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-h-11 border-emerald-400/25 bg-white/[0.04] text-emerald-200 hover:bg-emerald-400/10 sm:min-h-8"
                    disabled={!suggestion.suggested_text.trim()}
                    onClick={() => onApplyCorrection(finding, suggestion.suggested_text.trim())}
                  >
                    Apply to draft
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11 sm:min-h-8"
                    disabled={!suggestion.suggested_text.trim()}
                    loading={busy}
                    onClick={() => run('edit', { custom_correction: suggestion.suggested_text.trim() })}
                  >
                    Record as suggested wording
                  </Button>
                  <span className="text-[10px] text-slate-400">
                    Applying stages the text in the editor; you still save a new version to re-check it.
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {mode === 'edit' ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
            <label htmlFor={`correction-${finding.id}`} className="text-xs font-medium text-slate-300">
              Replacement wording recorded on this finding
            </label>
            <Textarea
              id={`correction-${finding.id}`}
              rows={2}
              value={correction}
              onChange={(event) => setCorrection(event.target.value)}
              className="mt-1.5 bg-white/[0.04]"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              This only changes the suggested wording on the finding. Use “Apply correction to draft” to change the
              document text.
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="min-h-11 sm:min-h-8"
                onClick={() => setMode('idle')}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="min-h-11 sm:min-h-8"
                disabled={!correction.trim()}
                loading={busy}
                onClick={() => run('edit', { custom_correction: correction.trim() })}
              >
                Save suggested wording
              </Button>
            </div>
          </div>
        ) : null}

        {mode === 'dismiss' ? (
          <div className="rounded-lg border border-rose-400/25 bg-rose-500/10 p-3">
            <label htmlFor={`dismiss-${finding.id}`} className="text-xs font-medium text-rose-200">
              Why is this finding not a violation?
            </label>
            <Textarea
              id={`dismiss-${finding.id}`}
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="A reason is required and will stay in the audit history."
              className="mt-1.5 bg-white/[0.04]"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="min-h-11 sm:min-h-8"
                onClick={() => setMode('idle')}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="min-h-11 sm:min-h-8"
                disabled={reason.trim().length < 3}
                loading={busy}
                onClick={() => run('dismiss', { dismissal_reason: reason.trim() })}
              >
                Dismiss finding
              </Button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </p>
        ) : null}

        {!isOpen ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white/[0.035] px-3 py-2 text-[11px] text-slate-400">
            {finding.status === 'dismissed' ? (
              <XCircle className="h-3.5 w-3.5 text-slate-400" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            )}
            <span>
              Marked {finding.status}
              {finding.reviewed_by ? ` by ${finding.reviewed_by}` : ''}
              {finding.reviewed_at ? ` · ${formatDateTime(finding.reviewed_at)}` : ''}
            </span>
            {finding.dismissal_reason ? (
              <span className="w-full text-slate-300">Reason: {finding.dismissal_reason}</span>
            ) : null}
            {finding.status === 'dismissed' && canDismiss ? (
              <Button
                variant="secondary"
                size="sm"
                className="ml-auto min-h-11 sm:min-h-8"
                onClick={() => run('accept')}
                loading={busy}
              >
                <Undo2 className="h-3 w-3" />
                Reopen as accepted
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function FindingSummaryChips({ findings }: { findings: Finding[] }) {
  const counts = findings.reduce<Record<string, number>>((accumulator, finding) => {
    accumulator[finding.category] = (accumulator[finding.category] || 0) + 1;
    return accumulator;
  }, {});
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(counts).map(([category, count]) => (
        <Badge key={category} className="border-white/10 bg-white/[0.04] text-slate-300">
          {CATEGORY_LABEL[category] || category} · {count}
        </Badge>
      ))}
      {findings.length === 0 ? (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" /> No findings in this run
        </span>
      ) : null}
    </div>
  );
}
