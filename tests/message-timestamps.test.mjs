import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatMessageTimestamp,
  getMessageTimestamp,
  normalizeEpochToMs,
  shouldIncludeTimestamps,
} from '../content/formatters/base.js';
import { MarkdownFormatter } from '../content/formatters/markdown.js';

test('normalizeEpochToMs treats small values as seconds', () => {
  assert.equal(normalizeEpochToMs(0), 0);
  assert.equal(normalizeEpochToMs(1710000000), 1710000000000);
  assert.equal(normalizeEpochToMs(1710000000000), 1710000000000);
});

test('formatMessageTimestamp normalizes numeric epochs to ISO', () => {
  assert.equal(formatMessageTimestamp(0), '1970-01-01T00:00:00.000Z');
  assert.equal(formatMessageTimestamp(1710000000), '2024-03-09T16:00:00.000Z');
  assert.equal(formatMessageTimestamp(1710000000000), '2024-03-09T16:00:00.000Z');
  assert.equal(formatMessageTimestamp('1789378586'), '2026-09-14T09:36:26.000Z');
});

test('formatMessageTimestamp standardizes date strings to ISO', () => {
  assert.equal(
    formatMessageTimestamp('2026-09-12T05:38:57.460670+00:00'),
    '2026-09-12T05:38:57.460Z',
  );
  assert.equal(formatMessageTimestamp('2026-09-14T09:20:38.494750Z'), '2026-09-14T09:20:38.494Z');
  // ChatGPT-style locale strings become ISO instead of raw passthrough.
  assert.match(formatMessageTimestamp('9/30/2026 08:48:07'), /^\d{4}-\d{2}-\d{2}T/);
});

test('formatMessageTimestamp never silently swaps day and month', () => {
  // Explicit M/D contract for en-US producer strings (May 9, never Sept 5;
  // UTC conversion may land on the 8th past midnight east of Greenwich)…
  assert.match(formatMessageTimestamp('05/09/2026'), /^2026-05-0[89]T/);
  // …while anything outside the known formats passes through untouched.
  assert.equal(formatMessageTimestamp('30.09.2026'), '30.09.2026');
  assert.equal(formatMessageTimestamp('not a date'), 'not a date');
});

test('formatMessageTimestamp rejects blank and undatable values', () => {
  assert.equal(formatMessageTimestamp(null), null);
  assert.equal(formatMessageTimestamp(undefined), null);
  assert.equal(formatMessageTimestamp(''), null);
  assert.equal(formatMessageTimestamp('   '), null);
  assert.equal(formatMessageTimestamp(8640000000000001), null);
  assert.equal(formatMessageTimestamp('8640000000000001'), null);
  assert.equal(formatMessageTimestamp(NaN), null);
  assert.equal(formatMessageTimestamp({}), null);
});

test('formatMessageTimestamp collapses newlines but keeps unparseable text', () => {
  assert.equal(formatMessageTimestamp('Sept 20\n## Hacked'), 'Sept 20 ## Hacked');
  assert.equal(formatMessageTimestamp('not a date'), 'not a date');
});

test('getMessageTimestamp and shouldIncludeTimestamps behave', () => {
  assert.equal(getMessageTimestamp({ timestamp: 0 }), '1970-01-01T00:00:00.000Z');
  assert.equal(getMessageTimestamp({}), null);
  assert.equal(getMessageTimestamp(null), null);
  assert.equal(shouldIncludeTimestamps({ includeTimestamps: true }), true);
  assert.equal(shouldIncludeTimestamps({}), false);
  assert.equal(shouldIncludeTimestamps(), false);
});

test('MarkdownFormatter renders ISO dates when enabled and nothing when off', () => {
  const formatter = new MarkdownFormatter();
  const conversation = {
    title: 'T',
    messages: [
      { role: 'User', content: 'Hi', timestamp: '9/30/2026 08:48:07' },
      { role: 'ChatGPT', content: 'Hello' },
    ],
    metadata: { Source: 'ChatGPT' },
  };

  const off = formatter.format(conversation);
  assert.ok(off.includes('## Prompt:\nHi'));
  assert.ok(!off.includes('## Prompt —'));

  const on = formatter.format(conversation, { includeTimestamps: true });
  assert.match(on, /## Prompt — \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z:/);
  assert.ok(on.includes('## Response:\nHello'));
});
