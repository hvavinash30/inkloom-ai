import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeExactEvidence, locateExactEvidence } from '../src/lib/evidence.ts';

const source = 'Our platform delivers 100% uptime for Acme Cloud customers.';
const start = source.indexOf('100% uptime');

test('recorded indices locate the exact affected text', () => {
  assert.deepEqual(
    locateExactEvidence(source, {
      affected_text: '100% uptime',
      start_index: start,
      end_index: start + '100% uptime'.length,
    }),
    { start, end: start + '100% uptime'.length }
  );
});

test('stale indices fall back only to a verbatim text search', () => {
  assert.deepEqual(
    locateExactEvidence(source, {
      affected_text: 'Acme Cloud',
      start_index: 0,
      end_index: 4,
    }),
    { start: source.indexOf('Acme Cloud'), end: source.indexOf('Acme Cloud') + 'Acme Cloud'.length }
  );
});

test('approximate or missing wording is never matched', () => {
  assert.equal(
    locateExactEvidence(source, {
      affected_text: '100% uptime!',
      start_index: start,
      end_index: start + '100% uptime!'.length,
    }),
    null
  );
  assert.equal(
    locateExactEvidence('The uptime is ninety-nine percent.', {
      affected_text: '99%',
      start_index: 0,
      end_index: 3,
    }),
    null
  );
});

test('parts reproduce the source exactly and report unmatched findings', () => {
  const missing = {
    id: 'missing',
    affected_text: 'SOC 2 certified',
    start_index: 0,
    end_index: 14,
  };
  const analysis = analyzeExactEvidence(source, [
    {
      id: 'one',
      affected_text: '100% uptime',
      start_index: start,
      end_index: start + '100% uptime'.length,
    },
    missing,
  ]);
  assert.equal(analysis.parts.map((part) => part.text).join(''), source);
  assert.equal(analysis.locatedCount, 1);
  assert.deepEqual(analysis.missing.map((finding) => finding.id), ['missing']);
  assert.deepEqual(
    analysis.parts.filter((part) => part.findingIds.length > 0).map((part) => part.text),
    ['100% uptime']
  );
});

test('overlapping findings share a highlight without changing the text', () => {
  const analysis = analyzeExactEvidence('Acme Cloud delivers.', [
    { id: 'short', affected_text: 'Acme', start_index: 0, end_index: 4 },
    { id: 'long', affected_text: 'Acme Cloud', start_index: 0, end_index: 10 },
  ]);
  assert.equal(analysis.parts.map((part) => part.text).join(''), 'Acme Cloud delivers.');
  assert.deepEqual(analysis.parts[0].findingIds.sort(), ['long', 'short']);
  assert.deepEqual(analysis.parts[1].findingIds, ['long']);
  assert.deepEqual(analysis.missing, []);
});

test('absence and limitation findings never highlight their trigger text', () => {
  const pricing = 'The enterprise plan is INR 12,999 per month.';
  const triggerStart = pricing.indexOf('INR');
  const analysis = analyzeExactEvidence(pricing, [
    {
      id: 'missing-disclaimer',
      title: 'Required statement missing: Disclaimer with pricing',
      evidence_status: 'missing_required_text',
      affected_text: 'INR',
      start_index: triggerStart,
      end_index: triggerStart + 3,
    },
    {
      id: 'ocr-limit',
      title: 'Image text was not inspected',
      evidence_status: 'processing_limitation',
      affected_text: 'INR',
      start_index: triggerStart,
      end_index: triggerStart + 3,
    },
  ]);
  assert.equal(analysis.locatedCount, 0);
  assert.equal(analysis.parts.map((part) => part.text).join(''), pricing);
  assert.ok(analysis.parts.every((part) => part.findingIds.length === 0));
  assert.deepEqual(analysis.missing.map((finding) => finding.id), [
    'missing-disclaimer',
    'ocr-limit',
  ]);
});
