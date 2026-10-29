import assert from 'node:assert/strict';
import test from 'node:test';
import { describeSample, formatOverrideRate, hiddenCount } from '../src/lib/insights.ts';

test('override rate never invents a value for missing data', () => {
  assert.equal(formatOverrideRate(null), '—');
  assert.equal(formatOverrideRate(undefined), '—');
  assert.equal(formatOverrideRate(0), '0%');
  assert.equal(formatOverrideRate(50), '50%');
  assert.equal(formatOverrideRate(66.7), '66.7%');
  assert.equal(formatOverrideRate(100), '100%');
});

test('overflow counters never go negative and stay quiet when all rows show', () => {
  assert.equal(hiddenCount(12, 5), 7);
  assert.equal(hiddenCount(5, 5), 0);
  assert.equal(hiddenCount(4, 5), 0);
});

test('sample labels pluralize from the real count', () => {
  assert.equal(describeSample(1, 'finding'), '1 finding');
  assert.equal(describeSample(2, 'finding'), '2 findings');
  assert.equal(describeSample(0, 'audit run'), '0 audit runs');
});
