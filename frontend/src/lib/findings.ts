import type { Finding } from '../types';

export type FindingGroup = {
  id: string;
  title: string;
  description: string;
  findings: Finding[];
};

/**
 * Organizes findings into the groups the reviewer workspace presents.
 * First match wins, mirroring the backend `group_findings` chain so a finding
 * is counted in exactly one group and the counts can never double-count.
 */
export function groupFindings(items: Finding[]): FindingGroup[] {
  const resolved: Finding[] = [];
  const priority: Finding[] = [];
  const claims: Finding[] = [];
  const missingRequired: Finding[] = [];
  const toneStyle: Finding[] = [];
  const review: Finding[] = [];
  const limits: Finding[] = [];
  const guidance: Finding[] = [];

  for (const finding of items) {
    if (finding.status !== 'open') {
      resolved.push(finding);
    } else if (finding.severity === 'critical' || finding.severity === 'high') {
      priority.push(finding);
    } else if (finding.category === 'unsupported_claim') {
      claims.push(finding);
    } else if (finding.evidence_status === 'missing_required_text') {
      missingRequired.push(finding);
    } else if (finding.category === 'style_suggestion') {
      toneStyle.push(finding);
    } else if (finding.category === 'needs_human_review') {
      review.push(finding);
    } else if (
      finding.category === 'processing_issue' ||
      finding.evidence_status === 'processing_limitation'
    ) {
      limits.push(finding);
    } else {
      guidance.push(finding);
    }
  }

  return [
    {
      id: 'priority',
      title: 'Critical and high severity',
      description: 'Resolve these first. Severity comes from the stored finding record.',
      findings: priority,
    },
    {
      id: 'claims',
      title: 'Unsupported claims',
      description:
        'Claim restrictions matched by the deterministic check. Review the evidence attached to each finding.',
      findings: claims,
    },
    {
      id: 'missing_required',
      title: 'Missing required content',
      description:
        'Required wording or a mandatory disclaimer was not found where a brand policy requires it.',
      findings: missingRequired,
    },
    {
      id: 'tone_style',
      title: 'Tone and style',
      description: 'Tone, naming, and consistency suggestions. These are wording recommendations.',
      findings: toneStyle,
    },
    {
      id: 'review',
      title: 'Needs human review',
      description:
        'The check could not confirm or refute these claims. A finding is not proof that a claim is false.',
      findings: review,
    },
    {
      id: 'limits',
      title: 'Inspection limits',
      description: 'These record what automated checks could not inspect, not content violations.',
      findings: limits,
    },
    {
      id: 'guidance',
      title: 'Policy and accessibility',
      description: 'Remaining rule matches and readability guidance from the deterministic check.',
      findings: guidance,
    },
    {
      id: 'resolved',
      title: 'Resolved and dismissed',
      description: 'Findings a person already accepted, edited, or dismissed on this run.',
      findings: resolved,
    },
  ].filter((group) => group.findings.length > 0);
}

/**
 * Applies a replacement to the exact affected span only.
 * Uses the recorded indices when they still reproduce the stored text verbatim;
 * otherwise falls back to a verbatim substring search. It never rewrites
 * approximate text, so a stale or fuzzy match returns null instead of guessing.
 */
export function replaceAffected(
  source: string,
  finding: Pick<Finding, 'affected_text' | 'start_index' | 'end_index'>,
  replacement: string
): string | null {
  if (finding.affected_text) {
    const { start_index, end_index } = finding;
    if (
      typeof start_index === 'number' &&
      typeof end_index === 'number' &&
      start_index >= 0 &&
      end_index <= source.length &&
      source.slice(start_index, end_index) === finding.affected_text
    ) {
      return source.slice(0, start_index) + replacement + source.slice(end_index);
    }
    const index = source.indexOf(finding.affected_text);
    if (index >= 0) {
      return source.slice(0, index) + replacement + source.slice(index + finding.affected_text.length);
    }
  }
  return null;
}