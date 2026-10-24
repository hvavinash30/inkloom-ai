import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTranscript, splitTranscriptText } from '../src/lib/format.ts';

test('plain text never receives invented timestamps', () => {
  assert.deepEqual(parseTranscript('Line one.\nLine two.'), []);
  assert.deepEqual(parseTranscript('A single transcript paragraph.'), []);
});

test('bracketed timestamp lines preserve their supplied values', () => {
  assert.deepEqual(
    parseTranscript('[00:18] Welcome to the launch.\n[01:02] Our platform delivers 100% uptime.'),
    [
      { timestamp_seconds: 18, text: 'Welcome to the launch.' },
      { timestamp_seconds: 62, text: 'Our platform delivers 100% uptime.' },
    ]
  );
});

test('SRT cues preserve start times and multi-line text', () => {
  const srt = [
    '1',
    '00:00:02,000 --> 00:00:04,000',
    'Hello.',
    '',
    '2',
    '00:00:07,500 --> 00:00:09,000',
    'A two-line',
    'cue.',
    '',
  ].join('\n');

  assert.deepEqual(parseTranscript(srt), [
    { timestamp_seconds: 2, text: 'Hello.' },
    { timestamp_seconds: 7.5, text: 'A two-line cue.' },
  ]);
});

test('WEBVTT headers, cue ids, and note blocks are excluded', () => {
  const vtt = [
    'WEBVTT',
    '',
    'cue-1',
    '00:01.000 --> 00:03.000',
    'Hello from the video.',
    '',
    'NOTE reviewer context',
    'This block is not spoken content.',
    '',
    '00:05.000 --> 00:06.000',
    'Second line.',
  ].join('\n');

  assert.deepEqual(parseTranscript(vtt), [
    { timestamp_seconds: 1, text: 'Hello from the video.' },
    { timestamp_seconds: 5, text: 'Second line.' },
  ]);
});

test('untimestamped trailing text is not attached to a previous cue', () => {
  assert.deepEqual(parseTranscript('[00:05] First line.\n\nUnrelated plain text.'), [
    { timestamp_seconds: 5, text: 'First line.' },
  ]);
});

test('a malformed timing line does not produce a cue', () => {
  assert.deepEqual(parseTranscript('not-a-time --> 00:00:04,000\nIgnored text.'), []);
});

test('plain transcript text is returned separately without timestamps', () => {
  const { segments, untimestamped } = splitTranscriptText('Line one.\nLine two.');
  assert.deepEqual(segments, []);
  assert.equal(untimestamped, 'Line one.\nLine two.');
});

test('mixed transcripts keep untimed lines separate from cues', () => {
  const { segments, untimestamped } = splitTranscriptText(
    '[00:42] Our platform delivers 100% uptime.\n\nIn addition, AcmeCloud is the #1 fastest cloud!!!'
  );
  assert.deepEqual(segments, [
    { timestamp_seconds: 42, text: 'Our platform delivers 100% uptime.' },
  ]);
  assert.equal(untimestamped, 'In addition, AcmeCloud is the #1 fastest cloud!!!');
});

test('SRT cue ids and cue text are not reported as untimed transcript text', () => {
  const srt = [
    '1',
    '00:00:02,000 --> 00:00:04,000',
    'Hello.',
    '',
    '2',
    '00:00:07,500 --> 00:00:09,000',
    'A two-line',
    'cue.',
  ].join('\n');
  const { segments, untimestamped } = splitTranscriptText(srt);
  assert.equal(segments.length, 2);
  assert.equal(untimestamped, '');
});
