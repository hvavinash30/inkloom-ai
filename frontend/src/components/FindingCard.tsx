import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  MapPin,
  PencilLine,
  Sparkles,
  Undo2,
  XCircle,
} from 'lucide-react';
import { api, ApiError } from '../services/api';
import { useToast } from './Toast';
import { Badge, Button, Card, SeverityBadge, StatusBadge, Textarea, cn } from './ui';
import {
  CATEGORY_LABEL,
  SEVERITY_DOT,
  formatDateTime,
  formatSeconds,
} from '../lib/format';
import type { Finding } from '../types';

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
  onApplyCorrection: (finding: Finding) => void;
  onAsk: (finding: Finding) => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<'idle' | 'edit' | 'dismiss'>('idle');
  const [correction, setCorrection] = useState(finding.suggested_correction || '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <Card className={cn('overflow-hidden', !isOpen && 'bg-slate-50/40')}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <SeverityBadge severity={finding.severity} />
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            {CATEGORY_LABEL[finding.category] || finding.category.replace(/_/g, ' ')}
          </span>
          {!isOpen ? <StatusBadge status={finding.status} /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
            {locationIcon}
            {location}
          </span>
        </div>
      </div>

      <div className="space-y-3.5 px-4 py-4">
        <div>
          <h3 className="text-sm font-semibold leading-5 text-slate-900">{finding.title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{finding.explanation}</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <span className={cn('h-1.5 w-1.5 rounded-full', SEVERITY_DOT[finding.severity])} />
            Affected text
          </p>
          <p className="whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-slate-800">
            {finding.affected_text || '—'}
          </p>
        </div>

        {finding.supporting_evidence || finding.source_reference ? (
          <div className="rounded-lg border border-brand-100 bg-brand-50/40 px-3 py-2.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-brand-700">Evidence</p>
            {finding.supporting_evidence ? (
              <p className="break-words text-xs leading-5 text-slate-700">{finding.supporting_evidence}</p>
            ) : null}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
              {finding.source_reference ? <span>Source: {finding.source_reference}</span> : null}
              {finding.source_url ? (
                <a
                  href={finding.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
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
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              Suggested correction
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-emerald-950">
              {finding.suggested_correction}
            </p>
            {canEdit && isOpen ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-h-11 border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50 sm:min-h-8"
                  onClick={() => onApplyCorrection(finding)}
                >
                  Apply correction to draft
                </Button>
                <span className="text-[10px] leading-4 text-emerald-800/80">
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

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-[10px] text-slate-400">
            <span
              title={evidence.hint}
              className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600"
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
            ) : null}
            {isOpen && canDismiss ? (
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11 text-slate-500 hover:text-rose-700 sm:min-h-8"
                onClick={() => setMode(mode === 'dismiss' ? 'idle' : 'dismiss')}
              >
                <XCircle className="h-3.5 w-3.5" />
                Dismiss finding
              </Button>
            ) : null}
          </div>
        </div>

        {mode === 'edit' ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label htmlFor={`correction-${finding.id}`} className="text-xs font-medium text-slate-700">
              Replacement wording recorded on this finding
            </label>
            <Textarea
              id={`correction-${finding.id}`}
              rows={2}
              value={correction}
              onChange={(event) => setCorrection(event.target.value)}
              className="mt-1.5 bg-white"
            />
            <p className="mt-1 text-[10px] text-slate-500">
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
          <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3">
            <label htmlFor={`dismiss-${finding.id}`} className="text-xs font-medium text-rose-900">
              Why is this finding not a violation?
            </label>
            <Textarea
              id={`dismiss-${finding.id}`}
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="A reason is required and will stay in the audit history."
              className="mt-1.5 bg-white"
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
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
          </p>
        ) : null}

        {!isOpen ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            {finding.status === 'dismissed' ? (
              <XCircle className="h-3.5 w-3.5 text-slate-400" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            )}
            <span>
              Marked {finding.status}
              {finding.reviewed_by ? ` by ${finding.reviewed_by}` : ''}
              {finding.reviewed_at ? ` · ${formatDateTime(finding.reviewed_at)}` : ''}
            </span>
            {finding.dismissal_reason ? (
              <span className="w-full text-slate-600">Reason: {finding.dismissal_reason}</span>
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
        <Badge key={category} className="border-slate-200 bg-white text-slate-600">
          {CATEGORY_LABEL[category] || category} · {count}
        </Badge>
      ))}
      {findings.length === 0 ? (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> No findings in this run
        </span>
      ) : null}
    </div>
  );
}
