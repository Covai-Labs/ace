import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PASTED_CONTENT_CHAR_LIMIT,
  stripAttachments,
  isUserMessage,
  applyAttachmentOption,
} from '../content/utils/strip-attachments.js';
import { markdownToHtml } from '../content/formatters/html.js';

// Builders mirroring the markdown decant-core's Claude parser emits for user attachments.
const textFile = (name, meta, body) =>
  `\n\n### Attachment: ${name}${meta ? ` _(${meta})_` : ''}\n` +
  (body !== undefined ? `\`\`\`\`\n${body}\n\`\`\`\`\n\n` : '');
const pasted = (meta, body) =>
  `\n\n### Pasted content${meta ? ` _(${meta})_` : ''}\n\`\`\`\`\n${body}\n\`\`\`\`\n\n`;
const image = (name, url) => `\n\n**Attachment: ${name}**\n\n![${name}](${url})\n\n`;
const pdf = (name, url, pages) =>
  `\n\n**Attachment: [${name}](${url})** _(document${pages ? ` · ${pages} pages` : ''})_\n\n`;

// A continuation paste that is itself an export with attachment headers.
const nestedExport =
  '## Prompt:\nOld question\n\n### Attachment: old.txt _(1 KB, text/plain)_\n' +
  '````\nold body\n````\n\n## Response:\nOld answer\n';

test('stripAttachments replaces a file and keeps the message text', () => {
  const input =
    'Summarize this page.' +
    textFile('page.html', '458.9 KB, text/html', '<html>\n<body>huge</body>\n</html>');
  assert.equal(
    stripAttachments(input).trim(),
    'Summarize this page.\n\n***[File: page.html · 458.9 KB]***',
  );
});

test('stripAttachments keeps pasted content up to the character limit', () => {
  const input = 'Fix the bug.' + pasted('1.0 KB', 'short log line\nanother line');
  assert.equal(stripAttachments(input), input);
});

test('stripAttachments replaces long pasted content and reports its line count', () => {
  const longText = 'line of a previous chat\n'.repeat(500);
  assert.ok(longText.length > PASTED_CONTENT_CHAR_LIMIT);
  const input = 'Continue from here.' + pasted('11.7 KB', longText);
  assert.equal(
    stripAttachments(input).trim(),
    'Continue from here.\n\n***[Pasted content · 11.7 KB · 500 lines]***',
  );
});

test('stripAttachments honours a custom pasted-content limit', () => {
  const input = 'Hi.' + pasted('', 'twelve chars');
  assert.match(
    stripAttachments(input, { pastedCharLimit: 5 }),
    /\*\*\*\[Pasted content · 1 line\]\*\*\*/,
  );
  assert.equal(stripAttachments(input, { pastedCharLimit: 12 }), input);
});

test('stripAttachments drops file types and shows large sizes in MB', () => {
  const input =
    'See files.' +
    textFile('slides.key', '2048.0 KB, application/octet-stream') +
    textFile(
      'report.docx',
      '1229.0 KB, application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Report text',
    );
  const output = stripAttachments(input);
  assert.ok(output.includes('***[File: slides.key · 2.0 MB]***'));
  assert.ok(output.includes('***[File: report.docx · 1.2 MB]***'));
  assert.ok(!output.includes('application/'));
});

test('stripAttachments turns document cards into file notes', () => {
  const input =
    'Look.' +
    pdf('report.pdf', '/api/abc/files/1/document', 3) +
    pdf('scan.pdf', '/api/abc/files/2/document');
  const lines = stripAttachments(input)
    .split('\n')
    .filter((line) => line.trim());
  assert.deepEqual(lines, [
    'Look.',
    '***[File: report.pdf · 3 pages]***',
    '***[File: scan.pdf]***',
  ]);
});

test('stripAttachments leaves images to the "Include images" option', () => {
  const withPicture = 'Look.' + image('photo.png', 'https://claude.ai/photo.png');
  assert.equal(stripAttachments(withPicture), withPicture);
  const pictureRemoved = 'Look.\n\n**Attachment: photo.png**';
  assert.equal(stripAttachments(pictureRemoved), pictureRemoved);
});

test('stripAttachments handles several attachments and inner fences', () => {
  const input =
    'Compare these.' +
    textFile('a.md', '1 KB, text/markdown', '# A\n````\nnested fence\n````\nend of A') +
    pasted('0.1 KB', 'kept paste') +
    textFile('b.txt', '3 KB, text/plain', 'B body') +
    pdf('c.pdf', '/api/c', 2) +
    image('d.png', 'https://claude.ai/d.png');
  const output = stripAttachments(input);
  assert.ok(output.includes('***[File: a.md · 1 KB]***'));
  assert.ok(output.includes('***[File: b.txt · 3 KB]***'));
  assert.ok(output.includes('***[File: c.pdf · 2 pages]***'));
  assert.ok(output.includes('### Pasted content _(0.1 KB)_\n````\nkept paste\n````'));
  assert.ok(output.includes('**Attachment: d.png**\n\n![d.png](https://claude.ai/d.png)'));
  assert.ok(!output.includes('nested fence'));
  assert.ok(!output.includes('B body'));
});

test('stripAttachments escapes asterisks so the bold italic note stays intact', () => {
  const input = 'X' + textFile('star*name.txt', '1 KB, text/plain', 'body');
  assert.ok(stripAttachments(input).includes('***[File: star\\*name.txt · 1 KB]***'));
});

test('the note renders as bold italic in the HTML converter', () => {
  const html = markdownToHtml(stripAttachments('Look.' + textFile('a.txt', '1 KB', 'body')));
  assert.match(html, /<strong><em>\[File: a\.txt · 1 KB\]/);
});

test('stripAttachments never touches ordinary message formatting', () => {
  const input =
    'Here is code:\n\n```js\nconst a = 1;\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n$$x^2$$\n\n> quote\n\n- item\n\n**Attachments:**\n- report.pdf';
  assert.equal(stripAttachments(input), input);
});

test('stripAttachments leaves a message unchanged when nested headers make it ambiguous', () => {
  const input = 'Continue this chat.' + pasted('40 KB', nestedExport.repeat(60));
  assert.equal(stripAttachments(input), input);
});

test('stripAttachments also detects a paste that closes on a nested fence', () => {
  const body = 'intro\n````\ncode\n````\n\n' + nestedExport.repeat(60);
  const input = 'Continue.' + pasted('40 KB', body);
  assert.equal(stripAttachments(input), input);
});

test('stripAttachments does not rewrite card-like lines inside a kept paste', () => {
  const input = 'See.' + pasted('0.1 KB', '**Attachment: [x.pdf](/api/x)** _(document)_\nshort');
  assert.equal(stripAttachments(input), input);
});

test('stripAttachments keeps card-like lines the user wrote inside the message', () => {
  const card = '**Attachment: [x.pdf](/api/x)** _(document)_';
  const input = `Why does my export show this line?\n\n${card}\n\nIt has no link.`;
  assert.equal(stripAttachments(input), input);
  const withFile = input + textFile('f.txt', '1 KB, text/plain', 'body');
  assert.equal(stripAttachments(withFile).trim(), input + '\n\n***[File: f.txt · 1 KB]***');
});

test('applying the option twice gives the same result as applying it once', () => {
  const raw =
    'Look.' +
    textFile('page.html', '458.9 KB, text/html', '<html></html>') +
    pasted('4.7 KB', 'short paste') +
    pasted('11.7 KB', 'line of a previous chat\n'.repeat(500)) +
    pdf('notes.pdf', '/api/abc/files/1/document', 3) +
    image('photo.png', 'https://claude.ai/photo.png');
  const once = stripAttachments(raw);
  assert.equal(stripAttachments(once), once);
});

test('isUserMessage recognises user roles only', () => {
  assert.equal(isUserMessage({ role: 'User' }), true);
  assert.equal(isUserMessage({ role: 'user' }), true);
  assert.equal(isUserMessage({ role: 'Claude' }), false);
  assert.equal(isUserMessage({ role: 'Claude Artifact' }), false);
  assert.equal(isUserMessage(null), false);
});

test('applyAttachmentOption only changes user messages, and only when the option is off', () => {
  const body = 'Q' + textFile('f.txt', '1 KB, text/plain', 'BODY');
  const off = { includeAttachments: false };
  assert.equal(
    applyAttachmentOption({ role: 'User', content: body }, off).trim(),
    'Q\n\n***[File: f.txt · 1 KB]***',
  );
  assert.equal(applyAttachmentOption({ role: 'Claude', content: body }, off), body);
  assert.equal(applyAttachmentOption({ role: 'User', content: body }), body);
  assert.equal(
    applyAttachmentOption({ role: 'User', content: body }, { includeAttachments: true }),
    body,
  );
});

test('strip helpers handle empty or invalid inputs', () => {
  assert.equal(stripAttachments(''), '');
  assert.equal(stripAttachments(null), '');
  assert.equal(applyAttachmentOption(null, { includeAttachments: false }), '');
  assert.equal(applyAttachmentOption({ role: 'User' }, { includeAttachments: false }), '');
});

test('content scripts apply the option on export, copy and shortcut paths', () => {
  for (const path of ['entrypoints/content.js', 'content/main.js']) {
    const code = fs.readFileSync(path, 'utf8');
    assert.match(code, /import \{ applyAttachmentOption \} from '[^']*strip-attachments\.js'/);
    const uses = code.match(/applyAttachmentOption\(msg, \w+\)/g) || [];
    assert.equal(uses.length, 3, `${path} should filter on export, copy and shortcut`);
  }
});
