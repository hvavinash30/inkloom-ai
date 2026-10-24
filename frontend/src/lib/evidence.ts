import type { Finding } from '../types';

export type EvidenceFinding = Pick<
  Finding,
  'id' | 'affected_text' | 'start_index' | 'end_index'
> &
  Partial<Pick<Finding, 'title' | 'severity' | 'evidence_status' | 'location_label'>>;

export type EvidenceRange = { start: number; end: number };

export type EvidencePart = {
  text: string;
  start: number;
  end: number;
  findingIds: string[];
};

/**
 * Finds the exact recorded affected text in the stored source. It prefers the
 * recorded indices and falls back to a verbatim text search, never a fuzzy or
 * normalized match.
 */
export function locateExactEvidence(
  source: string,
  finding: Pick<Finding, 'affected_text' | 'start_index' | 'end_index'>
): EvidenceRange | null {
  const text = finding.affected_text;
  if (!source || !text) return null;

  const start = Number(finding.start_index);
  const end = Number(finding.end_index);
  if (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end > start &&
    end <= source.length &&
    source.slice(start, end) === text
  ) {
    return { start, end };
  }

  const index = source.indexOf(text);
  return index >= 0 ? { start: index, end: index + text.length } : null;
}

// Absence and limitation findings have no offending passage. Their affected
// text is only a trigger or context anchor, so highlighting it would imply a
// false location.
const NO_PASSAGE_STATUSES = new Set(['missing_required_text', 'processing_limitation']);

/**
 * Builds highlight parts for all findings that can be located verbatim.
 * Joining the parts always reproduces the source exactly. Overlapping
 * findings are represented on the same part instead of being approximated.
 */
export function analyzeExactEvidence(
  source: string,
  findings: EvidenceFinding[]
): { parts: EvidencePart[]; missing: EvidenceFinding[]; locatedCount: number } {
  const located = findings.flatMap((finding) => {
    if (finding.evidence_status && NO_PASSAGE_STATUSES.has(finding.evidence_status)) return [];
    const range = locateExactEvidence(source, finding);
    return range ? [{ finding, range }] : [];
  });
  const missing = findings.filter(
    (finding) => !located.some((entry) => entry.finding.id === finding.id)
  );

  if (!source) return { parts: [], missing, locatedCount: 0 };

  const boundaries = new Set<number>([0, source.length]);
  for (const entry of located) {
    boundaries.add(entry.range.start);
    boundaries.add(entry.range.end);
  }
  const ordered = [...boundaries].sort((a, b) => a - b);
  const parts: EvidencePart[] = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = ordered[index];
    const end = ordered[index + 1];
    if (end <= start) continue;
    const findingIds = located
      .filter((entry) => entry.range.start <= start && entry.range.end >= end)
      .map((entry) => entry.finding.id);
    parts.push({ text: source.slice(start, end), start, end, findingIds });
  }

  return { parts, missing, locatedCount: located.length };
}
