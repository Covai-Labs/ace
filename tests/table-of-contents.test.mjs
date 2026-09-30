import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { getTocItems, slugifyHeading } from '../content/formatters/base.js';
import { MarkdownFormatter } from '../content/formatters/markdown.js';
import { HtmlFormatter } from '../content/formatters/html.js';
import { DocFormatter } from '../content/formatters/doc.js';
import { ImageFormatter } from '../content/formatters/image.js';

const CONVERSATION = {
  title: 'ToC Test',
  messages: [
    { role: 'User', content: 'What is the capital of France?' },
    { role: 'ChatGPT', content: 'Paris.', timestamp: '2026-09-14T09:20:53.385Z' },
  ],
  metadata: { Source: 'ChatGPT' },
};

function ensureDom() {
  if (typeof globalThis.document === 'undefined') {
    const { document, window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
    globalThis.document = document;
    globalThis.window = window;
  }
}

test('getTocItems builds labels, numbers, snippets, and ISO dates', () => {
  const items = getTocItems(CONVERSATION.messages, {
    messageNumbering: 'per-message',
    includeTimestamps: true,
    platform: 'ChatGPT',
  });
  assert.deepEqual(
    items.map((i) => [i.label, i.number]),
    [
      ['User', 1],
      ['ChatGPT', 2],
    ],
  );
  assert.equal(items[0].snippet, 'What is the capital of France?');
  assert.equal(items[0].timestamp, null);
  assert.equal(items[1].timestamp, '2026-09-14T09:20:53.385Z');

  const off = getTocItems(CONVERSATION.messages, { platform: 'ChatGPT' });
  assert.equal(off[1].timestamp, null);
  assert.deepEqual(
    off.map((i) => i.number),
    [null, null],
  );
});

test('slugifyHeading matches heading anchors', () => {
  assert.equal(slugifyHeading('Prompt [1]'), 'prompt-1');
  assert.equal(
    slugifyHeading('Response [2] — 2026-09-14T09:20:53.385Z'),
    'response-2--2026-09-14t092053385z',
  );
});

test('MarkdownFormatter emits a linked ToC with dates when enabled', () => {
  const output = new MarkdownFormatter().format(CONVERSATION, {
    includeToc: true,
    includeTimestamps: true,
    messageNumbering: 'per-message',
  });
  assert.ok(output.includes('## Table of Contents'));
  assert.ok(output.includes('- [\\[1\\] User: What is the capital of France?](#prompt-1)'));
  assert.ok(
    output.includes(
      '- [\\[2\\] ChatGPT: Paris. — 2026-09-14T09:20:53.385Z](#response-2--2026-09-14t092053385z)',
    ),
  );
  // Every ToC anchor resolves to a slug of an emitted heading.
  const headingSlugs = new Set(
    Array.from(output.matchAll(/^## (.+):$/gm), (m) => slugifyHeading(m[1])),
  );
  const tocSection = output.split('## Table of Contents')[1].split('## Prompt')[0];
  for (const match of tocSection.matchAll(/\]\(#([^)]+)\)/g)) {
    assert.ok(headingSlugs.has(match[1]), `anchor #${match[1]} should match a heading`);
  }

  const plain = new MarkdownFormatter().format(CONVERSATION);
  assert.ok(!plain.includes('## Table of Contents'));

  const article = new MarkdownFormatter().format(
    { ...CONVERSATION, metadata: { Source: 'Web Article' } },
    { includeToc: true },
  );
  assert.ok(!article.includes('## Table of Contents'));
});

test('MarkdownFormatter deduplicates anchors with numbering off', () => {
  const multi = {
    title: 'Multi',
    messages: [
      { role: 'User', content: 'First?' },
      { role: 'ChatGPT', content: '## Prompt\n\nNot a real prompt heading.' },
      { role: 'User', content: 'Second?' },
      { role: 'ChatGPT', content: 'Done.' },
    ],
    metadata: { Source: 'ChatGPT' },
  };
  const output = new MarkdownFormatter().format(multi, { includeToc: true });
  const anchors = Array.from(output.matchAll(/\]\(#([^)]+)\)/g), (m) => m[1]);
  // Four message links, all unique, GitHub-style -1/-2 suffixes. The content
  // `## Prompt` consumes prompt-1 exactly as renderers number it, so the
  // third message correctly lands on prompt-2…
  assert.equal(anchors.length, 4);
  assert.equal(new Set(anchors).size, 4);
  assert.deepEqual(anchors, ['prompt', 'response', 'prompt-2', 'response-1']);
  // …and the content heading consumed its own slug without stealing a link.
  assert.ok(output.includes('## Prompt\n\nNot a real prompt heading.'));
});

test('MarkdownFormatter flattens links and escapes brackets in ToC text', () => {
  const tricky = {
    title: 'Tricky',
    messages: [
      {
        role: 'User',
        content: 'See [the docs](https://example.com) and ![pic](https://example.com/p.png)',
      },
      { role: 'ChatGPT', content: 'Use ] here\n\nSecond paragraph.' },
    ],
    metadata: { Source: 'ChatGPT' },
  };
  const output = new MarkdownFormatter().format(tricky, {
    includeToc: true,
    messageNumbering: 'per-message',
  });
  const tocSection = output.split('## Table of Contents')[1].split('## Prompt')[0];
  assert.ok(!tocSection.includes('](https://'), 'no raw URLs in ToC links');
  assert.ok(!tocSection.includes('!['), 'no image markup in ToC links');
  assert.ok(tocSection.includes('\\]'), 'stray brackets are escaped');
  assert.ok(!/\)\n[^-\s]/.test(tocSection), 'no bare newlines inside ToC links');
});

test('Article conversations skip the ToC however they are tagged', () => {
  const articleMsg = [{ role: 'Article', content: 'Body text.' }];
  for (const conversation of [
    { title: 'A', messages: articleMsg, metadata: { Source: 'Web Article' } },
    { title: 'A', messages: articleMsg, metadata: { Source: 'Example Blog' }, platform: 'Article' },
    {
      title: 'A',
      messages: articleMsg,
      metadata: { Source: 'Example Blog' },
      isDedicatedAi: false,
    },
  ]) {
    const md = new MarkdownFormatter().format(conversation, { includeToc: true });
    assert.ok(!md.includes('## Table of Contents'), JSON.stringify(conversation.platform));
    const doc = new DocFormatter().format(conversation, { includeToc: true });
    assert.ok(!doc.includes('Table of Contents'));
  }
});

test('HtmlFormatter ToC keeps dates via shared helper', async () => {
  const html = new HtmlFormatter().format(CONVERSATION, {
    includeToc: true,
    includeTimestamps: true,
    messageNumbering: 'per-message',
  });
  assert.ok(html.includes('toc-card'));
  assert.ok(html.includes('toc-date'));
  assert.ok(html.includes('2026-09-14T09:20:53.385Z'));

  const { document } = parseHTML(html);
  const items = Array.from(document.querySelectorAll('.toc-list li'));
  assert.equal(items.length, 2);
});

test('DocFormatter includes an anchored ToC when enabled', () => {
  const doc = new DocFormatter().format(CONVERSATION, {
    includeToc: true,
    includeTimestamps: true,
    messageNumbering: 'per-message',
  });
  assert.ok(doc.includes('Table of Contents'));
  assert.ok(doc.includes('href="#msg-card-1"'));
  assert.ok(doc.includes('id="msg-card-1"'));
  assert.ok(doc.includes('2026-09-14T09:20:53.385Z'));

  const plain = new DocFormatter().format(CONVERSATION);
  assert.ok(!plain.includes('Table of Contents'));
});

test('ImageFormatter includes a ToC block when enabled', () => {
  ensureDom();
  const formatter = new ImageFormatter();
  const withToc = formatter.createScreenshotContainer(CONVERSATION, {
    includeToc: true,
    includeTimestamps: true,
    messageNumbering: 'per-message',
  });
  assert.ok(withToc.innerHTML.includes('Table of Contents'));
  assert.ok(withToc.innerHTML.includes('2026-09-14T09:20:53.385Z'));

  const plain = formatter.createScreenshotContainer(CONVERSATION);
  assert.ok(!plain.innerHTML.includes('Table of Contents'));
});

test('MarkdownFormatter ignores headings inside fenced code blocks', () => {
  const fenced = {
    title: 'Fenced',
    messages: [
      { role: 'User', content: 'First?' },
      { role: 'ChatGPT', content: '```markdown\n## Prompt\n```\n~~~python\n## Response\n~~~' },
      { role: 'User', content: 'Second?' },
    ],
    metadata: { Source: 'ChatGPT' },
  };
  const output = new MarkdownFormatter().format(fenced, { includeToc: true });
  const anchors = Array.from(output.matchAll(/\]\(#([^)]+)\)/g), (m) => m[1]);
  // The fenced ## Prompt and ## Response must NOT steal slugs.
  // Second user message should get prompt-1, not prompt-2.
  assert.deepEqual(anchors, ['prompt', 'response', 'prompt-1']);
});

test('MarkdownFormatter accounts for indented ATX headings', () => {
  const indented = {
    title: 'Indented',
    messages: [
      { role: 'User', content: 'First?' },
      { role: 'ChatGPT', content: '   ## Prompt\n\nIndented prompt heading.' },
      { role: 'User', content: 'Second?' },
    ],
    metadata: { Source: 'ChatGPT' },
  };
  const output = new MarkdownFormatter().format(indented, { includeToc: true });
  const anchors = Array.from(output.matchAll(/\]\(#([^)]+)\)/g), (m) => m[1]);
  // The indented `   ## Prompt` is a valid CommonMark heading and consumes prompt-1.
  // The second user message therefore receives prompt-2.
  assert.deepEqual(anchors, ['prompt', 'response', 'prompt-2']);
});

test('getTocItems preserves code comparisons and unmatched angle brackets', () => {
  const compMessages = [
    { role: 'User', content: 'Compare 1 < 2 and 3 > 1 in python' },
    { role: 'ChatGPT', content: 'Check if x < pivot before continuing' },
    { role: 'User', content: 'Unmatched < bracket at end' },
    { role: 'ChatGPT', content: '<p>HTML tag <span class="badge">test</span></p>' },
  ];
  const items = getTocItems(compMessages);
  assert.equal(items[0].snippet, 'Compare 1 < 2 and 3 > 1 in python');
  assert.equal(items[1].snippet, 'Check if x < pivot before continuing');
  assert.equal(items[2].snippet, 'Unmatched < bracket at end');
  assert.equal(items[3].snippet, 'HTML tag test');
});
