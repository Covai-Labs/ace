import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import {
  getMessageNumber,
  getMessageNumbers,
  normalizeMessageNumbering,
} from '../content/formatters/base.js';
import { MarkdownFormatter } from '../content/formatters/markdown.js';
import { HtmlFormatter } from '../content/formatters/html.js';
import { DocFormatter } from '../content/formatters/doc.js';
import { ImageFormatter } from '../content/formatters/image.js';

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

test('getMessageNumbers preserves turn numbering and reflects message updates', () => {
  const messages = [
    { role: 'ChatGPT' },
    { role: 'User' },
    { role: 'ChatGPT' },
    { role: 'User' },
    { role: 'ChatGPT' },
  ];
  assert.deepEqual(getMessageNumbers(messages, 'perTurn'), [1, 1, 1, 2, 2]);
  assert.deepEqual(getMessageNumbers(messages, 'per-message'), [1, 2, 3, 4, 5]);
  assert.deepEqual(getMessageNumbers(messages, 'off'), [null, null, null, null, null]);
  messages[3].role = 'ChatGPT';
  assert.deepEqual(getMessageNumbers(messages, 'per-turn'), [1, 1, 1, 1, 1]);
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

test('HtmlFormatter uses only explicit numbering in the table of contents when enabled', () => {
  const formatter = new HtmlFormatter();
  const numbered = formatter.format(CONVERSATION, {
    includeToc: true,
    messageNumbering: 'per-turn',
  });
  assert.match(numbered, /<ol class="toc-list toc-list-numbered">/);
  assert.match(numbered, /\.toc-list-numbered\s*\{\s*list-style-type: none;/);
  const { document } = parseHTML(numbered);
  assert.deepEqual(
    Array.from(document.querySelectorAll('.toc-list li'), (item) => item.textContent.trim()),
    [
      '[1] User: First question',
      '[1] ChatGPT: First answer',
      '[2] User: Second question',
      '[2] ChatGPT: Second answer',
    ],
  );

  const unnumbered = formatter.format(CONVERSATION, { includeToc: true });
  assert.match(unnumbered, /<ol class="toc-list">/);
  assert.doesNotMatch(unnumbered, /<ol class="toc-list toc-list-numbered">/);
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
    assert.match(
      js,
      /messageNumberingSelect\.value = normalizeMessageNumbering\(stored\.messageNumbering\)/,
    );
  }
});

test('ImageFormatter numbers screenshot headers when enabled', () => {
  if (typeof globalThis.document === 'undefined') {
    const { document, window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
    globalThis.document = document;
    globalThis.window = window;
  }
  const formatter = new ImageFormatter();
  const numbered = formatter.createScreenshotContainer(CONVERSATION, {
    messageNumbering: 'per-message',
  });
  assert.ok(numbered.innerHTML.includes('User [1]'));
  assert.ok(numbered.innerHTML.includes('[2]'));

  const plain = formatter.createScreenshotContainer(CONVERSATION);
  assert.ok(!plain.innerHTML.includes('User [1]'));
});

test('preview pages load and forward messageNumbering/exportOptions to formatters', () => {
  for (const previewPath of ['entrypoints/preview/preview.js', 'popup/preview.js']) {
    const js = fs.readFileSync(previewPath, 'utf8');
    assert.match(
      js,
      /'messageNumbering'|getExportOptions/,
      `${previewPath} should read the export setting`,
    );
    assert.match(
      js,
      /markdownFormatter\.format\(.*(?:messageNumbering|exportOptions)/s,
      `${previewPath} should forward numbering to Markdown`,
    );
    assert.match(
      js,
      /htmlFormatter\.format\(.*(?:messageNumbering|exportOptions)/s,
      `${previewPath} should forward numbering to HTML`,
    );
    assert.match(
      js,
      /docFormatter\.format\(.*(?:messageNumbering|exportOptions)/s,
      `${previewPath} should forward numbering to Word`,
    );
    assert.match(
      js,
      /imageFormatter\.format\(.*(?:messageNumbering|exportOptions)/s,
      `${previewPath} should forward numbering to PNG`,
    );
  }
});

test('preview scripts invoke recalculateContent on live export option changes', () => {
  for (const previewPath of ['entrypoints/preview/preview.js', 'popup/preview.js']) {
    const js = fs.readFileSync(previewPath, 'utf8');
    assert.match(
      js,
      /chrome\.storage\.onChanged\.addListener\([^)]*\)\s*=>\s*\{[\s\S]*?applyExportOptionChanges\(exportOptions,\s*changes\)[\s\S]*?recalculateContent\(\)[\s\S]*?\}\);/,
      `${previewPath} should recalculate content within the storage change listener`,
    );
  }
});
