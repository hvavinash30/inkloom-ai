import assert from 'node:assert/strict';
import test from 'node:test';
import { groupFindings, replaceAffected } from '../src/lib/findings.ts';

function finding(overrides) {
  return {
    id: overrides.id || 'finding',
    category: 'policy_violation',
    severity: 'medium',
    status: 'open',
    evidence_status: 'potential_violation',
    affected_text: '',
    start_index: -1,
    end_index: -1,
    ...overrides,
  };
}

test('each finding lands in exactly one group', () => {
  const items = [
    finding({ id: 'crit', severity: 'critical' }),
    finding({ id: 'claim', category: 'unsupported_claim' }),
    finding({ id: 'missing', evidence_status: 'missing_required_text' }),
    finding({ id: 'tone', category: 'style_suggestion' }),
    finding({ id: 'human', category: 'needs_human_review' }),
    finding({ id: 'limit', category: 'processing_issue' }),
    finding({ id: 'guide', category: 'policy_violation' }),
    finding({ id: 'dismissed', status: 'dismissed' }),
    finding({ id: 'accepted', status: 'accepted' }),
  ];

  const groups = groupFindings(items);
  const placed = groups.flatMap((group) => group.findings.map((f) => f.id));

  // No duplicates and nothing dropped.
  assert.equal(placed.length, items.length);
  assert.equal(new Set(placed).size, items.length);
});

test('group membership follows the documented priority order', () => {
  const critical = finding({ id: 'crit', severity: 'critical' });
  const highClaim = finding({ id: 'hc', severity: 'high', category: 'unsupported_claim' });
  const missing = finding({ id: 'missing', evidence_status: 'missing_required_text' });
  const dismissed = finding({ id: 'dismissed', status: 'edited' });

  const groups = groupFindings([critical, highClaim, missing, dismissed]);
  const byId = new Map(groups.map((group) => [group.id, group.findings.map((f) => f.id)]));

  assert.deepEqual(byId.get('priority'), ['crit', 'hc']);
  assert.deepEqual(byId.get('missing_required'), ['missing']);
  assert.deepEqual(byId.get('resolved'), ['dismissed']);
});

test('empty groups are omitted so counts stay honest', () => {
  const groups = groupFindings([finding({ id: 'only', category: 'policy_violation' })]);
  assert.deepEqual(
    groups.map((group) => group.id),
    ['guidance']
  );
});

test('replaceAffected rewrites only the exact recorded span', () => {
  const source = 'Acme Cloud is the cheapest platform for enterprise teams.';
  const start = source.indexOf('cheapest');
  const result = replaceAffected(
    source,
    {
      affected_text: 'cheapest',
      start_index: start,
      end_index: start + 'cheapest'.length,
    },
    'cost-effective'
  );
  assert.equal(result, 'Acme Cloud is the cost-effective platform for enterprise teams.');
});

test('replaceAffected falls back to a verbatim match when indices are stale', () => {
  const source = 'Our platform delivers 100% uptime for customers.';
  const at = source.indexOf('100% uptime');
  const result = replaceAffected(
    source,
    { affected_text: '100% uptime', start_index: 0, end_index: 4 },
    '99.9% uptime'
  );
  assert.equal(result, 'Our platform delivers 99.9% uptime for customers.');
  assert.equal(at, source.indexOf('100% uptime'));
});

test('replaceAffected refuses approximate or absent wording instead of guessing', () => {
  const source = 'Our platform delivers 100% uptime for customers.';
  assert.equal(
    replaceAffected(source, { affected_text: '100% uptime!', start_index: 0, end_index: 4 }, '99.9%'),
    null
  );
  assert.equal(
    replaceAffected(source, { affected_text: 'not present', start_index: -1, end_index: -1 }, 'x'),
    null
  );
});