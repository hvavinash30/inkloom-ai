import { AlertTriangle } from 'lucide-react';
import { analyzeExactEvidence, type EvidenceFinding } from '../lib/evidence';
import { cn } from './ui';

function findingLabel(finding: EvidenceFinding) {
  return finding.title || finding.affected_text || 'Recorded finding';
}

function missingReason(finding: EvidenceFinding) {
  if (finding.evidence_status === 'missing_required_text') {
    return 'This finding records required wording that is absent, so no passage is highlighted.';
  }
  if (finding.evidence_status === 'processing_limitation') {
    return 'This finding records an inspection limit, not a text match, so no passage is highlighted.';
  }
  return 'The stored text does not contain the recorded affected wording verbatim.';
}

export function HighlightedText({
  source,
  findings,
  activeFindingId,
  className,
}: {
  source: string;
  findings: EvidenceFinding[];
  activeFindingId?: string | null;
  className?: string;
}) {
  const { parts } = analyzeExactEvidence(source, findings);
  return (
    <span className={className}>
      {parts.map((part) => {
        if (part.findingIds.length === 0) {
          return <span key={`${part.start}-${part.end}`}>{part.text}</span>;
        }
        const active = Boolean(activeFindingId && part.findingIds.includes(activeFindingId));
        const labels = findings
          .filter((finding) => part.findingIds.includes(finding.id))
          .map(findingLabel)
          .join(' · ');
        return (
          <mark
            key={`${part.start}-${part.end}`}
            data-evidence-finding-ids={part.findingIds.join(',')}
            title={labels}
            className={cn(
              'rounded-sm px-0.5 text-inherit',
              active
                ? 'bg-orange-400/45 text-orange-50 ring-1 ring-orange-300/70'
                : 'bg-amber-300/25 text-amber-50 ring-1 ring-amber-300/40'
            )}
          >
            {part.text}
          </mark>
        );
      })}
    </span>
  );
}

export function MissingEvidenceNote({
  source,
  findings,
  contextLabel,
}: {
  source: string;
  findings: EvidenceFinding[];
  contextLabel: string;
}) {
  const { missing } = analyzeExactEvidence(source, findings);
  if (missing.length === 0) return null;

  return (
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-lg border border-amber-400/25 bg-amber-400/[0.08] px-3 py-2.5"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
      <div className="min-w-0 text-[11px] leading-5 text-amber-100">
        <p className="font-medium">
          Exact evidence unavailable for {missing.length} finding{missing.length === 1 ? '' : 's'}
        </p>
        <ul className="mt-1 space-y-1">
          {missing.map((finding) => (
            <li key={finding.id}>
              <span className="font-medium">{findingLabel(finding)}</span>
              {' — '}
              {missingReason(finding)}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-amber-200/80">
          No highlight was added to the {contextLabel}. This view never approximates, normalizes, or rewrites stored
          text.
        </p>
      </div>
    </div>
  );
}
