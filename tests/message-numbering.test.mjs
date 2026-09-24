import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  getMessageNumber,
  normalizeMessageNumbering,
} from '../content/formatters/base.js';
import { MarkdownFormatter } from '../content/formatters/markdown.js';
import { HtmlFormatter } from '../content/formatters/html.js';
import { DocFormatter } from '../content/formatters/doc.js';

const CONVERSATION = {
  title: 'Numbering Test',
  messages: [
    { role: 'User', content: 'First question' },
    { role: 'ChatGPT', content: 'First answer' },
    { role: 'User', content: 'Second question' },
    { role: 'ChatGPT', content: 'Second answer' },
  ],
  metadata: { Source: 'ChatGPT' },
};

test('normalizeMessageNumbering accepts supported modes and falls back to off', () => {
  assert.equal(normalizeMessageNumbering('off'), 'off');
  assert.equal(normalizeMessageNumbering('per-message'), 'per-message');
  assert.equal(normalizeMessageNumbering('per-turn'), 'per-turn');
  assert.equal(normalizeMessageNumbering('perMessage'), 'per-message');
  assert.equal(normalizeMessageNumbering('perTurn'), 'per-turn');
  assert.equal(normalizeMessageNumbering(undefined), 'off');
  assert.equal(normalizeMessageNumbering('bogus'), 'off');
});

test('getMessageNumber supports off, per-message, and per-turn', () => {
  const { messages } = CONVERSATION;
  assert.equal(getMessageNumber(messages, 0, 'off'), null);
  assert.deepEqual(
    [0, 1, 2, 3].map((i) => getMessageNumber(messages, i, 'per-message')),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    [0, 1, 2, 3].map((i) => getMessageNumber(messages, i, 'per-turn')),
    [1, 1, 2, 2],
  );
});

test('getMessageNumber handles leading assistant and out-of-range safely', () => {
  const messages = [
    { role: 'ChatGPT', content: 'hi' },
    { role: 'User', content: 'q' },
  ];
  assert.equal(getMessageNumber(messages, 0, 'per-turn'), 1);
  assert.equal(getMessageNumber(messages, 1, 'per-turn'), 1);
  assert.equal(getMessageNumber(messages, 5, 'per-message'), null);
  assert.equal(getMessageNumber(messages, -1, 'per-message'), null);
});

test('MarkdownFormatter defaults to no numbers', () => {
  const output = new MarkdownFormatter().format(CONVERSATION);
  assert.ok(output.includes('## Prompt:\nFirst question'));
  assert.ok(output.includes('## Response:\nFirst answer'));
  assert.ok(!output.includes('## Prompt ['));
});

test('MarkdownFormatter numbers per-message and per-turn', () => {
  const perMessage = new MarkdownFormatter().format(CONVERSATION, {
    messageNumbering: 'per-message',
  });
  assert.ok(perMessage.includes('## Prompt [1]:\nFirst question'));
  assert.ok(perMessage.includes('## Response [2]:\nFirst answer'));
  assert.ok(perMessage.includes('## Prompt [3]:\nSecond question'));
  assert.ok(perMessage.includes('## Response [4]:\nSecond answer'));

  const perTurn = new MarkdownFormatter().format(CONVERSATION, {
    messageNumbering: 'per-turn',
  });
  assert.ok(perTurn.includes('## Prompt [1]:\nFirst question'));
  assert.ok(perTurn.includes('## Response [1]:\nFirst answer'));
  assert.ok(perTurn.includes('## Prompt [2]:\nSecond question'));
  assert.ok(perTurn.includes('## Response [2]:\nSecond answer'));
});

test('HtmlFormatter and DocFormatter include numbers in headers', () => {
  const html = new HtmlFormatter().format(CONVERSATION, { messageNumbering: 'per-message' });
  assert.ok(html.includes('User [1]'));
  assert.ok(html.includes('[2]'));

  const doc = new DocFormatter().format(CONVERSATION, { messageNumbering: 'per-turn' });
  assert.ok(doc.includes('User [1]'));
  assert.ok(doc.includes('[2]'));

  const htmlOff = new HtmlFormatter().format(CONVERSATION);
  assert.ok(!htmlOff.includes('User [1]'));
});

test('options pages wire messageNumbering storage setting', () => {
  for (const htmlPath of ['options/options.html', 'entrypoints/options/index.html']) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.match(html, /id="message-numbering-select"/);
  }
  for (const jsPath of ['options/options.js', 'entrypoints/options/options.js']) {
    const js = fs.readFileSync(jsPath, 'utf8');
    assert.match(js, /'messageNumbering'/);
    assert.match(js, /messageNumberingSelect/);
  }
});
