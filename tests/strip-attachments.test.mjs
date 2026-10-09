import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PASTED_CONTENT_CHAR_LIMIT,
  stripAttachments,
  formatAttachmentHeadings,
  isUserMessage,
  applyAttachmentOption,
} from '../content/utils/strip-attachments.js';
import { stripImages } from '../content/utils/strip-images.js';
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

// One message with every kind of attachment.
const longPaste = 'line of a previous chat\n'.repeat(500);
const everything =
  'Look.' +
  textFile('page.html', '458.9 KB, text/html', '<html></html>') +
  pasted('4.7 KB', 'short paste') +
  pasted('11.7 KB', longPaste) +
  textFile('slides.key', '2048.0 KB, application/octet-stream') +
  pdf('notes.pdf', '/api/abc/files/1/document', 3) +
  image('photo.png', 'https://claude.ai/photo.png');

const nonEmptyLines = (text) => text.split('\n').filter((line) => line.trim());

test('stripAttachments replaces a file and keeps the message text', () => {
  const input =
    'Summarize this page.' +
    textFile('page.html', '458.9 KB, text/html', '<html>\n<body>huge</body>\n</html>');
  assert.equal(
    stripAttachments(input).trim(),
    'Summarize this page.\n\n***[File: page.html · 458.9 KB]***',
  );
});

test('stripAttachments keeps pasted content up to the character limit under a sub-heading', () => {
  const input = 'Fix the bug.' + pasted('1.0 KB', 'short log line\nanother line');
  assert.equal(
    stripAttachments(input).trim(),
    'Fix the bug.\n\n### Pasted content · 1.0 KB · 2 lines\n````\nshort log line\nanother line\n````',
  );
});

test('stripAttachments replaces long pasted content and reports its line count', () => {
  assert.ok(longPaste.length > PASTED_CONTENT_CHAR_LIMIT);
  const input = 'Continue from here.' + pasted('11.7 KB', longPaste);
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
  assert.match(
    stripAttachments(input, { pastedCharLimit: 12 }),
    /^### Pasted content · 1 line\n````\ntwelve chars\n````$/m,
  );
});

test('file types are dropped and large sizes are shown in MB', () => {
  const input =
    'See files.' +
    textFile('slides.key', '2048.0 KB, application/octet-stream') +
    textFile(
      'report.docx',
      '1229.0 KB, application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Report text',
    );
  const omitted = stripAttachments(input);
  assert.ok(omitted.includes('***[File: slides.key · 2.0 MB]***'));
  assert.ok(omitted.includes('***[File: report.docx · 1.2 MB]***'));
  assert.ok(!omitted.includes('application/'));

  const kept = formatAttachmentHeadings(input);
  assert.ok(kept.includes('### File: slides.key · 2.0 MB'));
  assert.ok(kept.includes('### File: report.docx · 1.2 MB\n````\nReport text\n````'));
  assert.ok(!kept.includes('application/'));
});

test('document cards become file notes or sub-headings, without their link', () => {
  const input =
    'Look.' +
    pdf('report.pdf', '/api/abc/files/1/document', 3) +
    pdf('scan.pdf', '/api/abc/files/2/document');
  assert.deepEqual(nonEmptyLines(stripAttachments(input)), [
    'Look.',
    '***[File: report.pdf · 3 pages]***',
    '***[File: scan.pdf]***',
  ]);
  assert.deepEqual(nonEmptyLines(formatAttachmentHeadings(input)), [
    'Look.',
    '### File: report.pdf · 3 pages',
    '### File: scan.pdf',
  ]);
});

test('images follow the "Include images" option in both modes', () => {
  const withPicture = 'Look.' + image('photo.png', 'https://claude.ai/photo.png');
  const kept = ['Look.', '### Image: photo.png', '![](https://claude.ai/photo.png)'];
  assert.deepEqual(nonEmptyLines(formatAttachmentHeadings(withPicture)), kept);
  assert.deepEqual(nonEmptyLines(stripAttachments(withPicture)), kept);

  const pictureRemoved = stripImages(withPicture);
  assert.equal(pictureRemoved, 'Look.\n\n**Attachment: photo.png**');
  for (const rewrite of [formatAttachmentHeadings, stripAttachments]) {
    assert.equal(rewrite(pictureRemoved), 'Look.\n\n***[Image: photo.png]***');
  }
});

test('the picture below an image sub-heading does not repeat the name', () => {
  const input = 'Look.' + image('photo.png', '/api/org/files/1/preview');
  const html = markdownToHtml(formatAttachmentHeadings(input));
  assert.match(html, /<h3[^>]*>Image: photo\.png<\/h3>/);
  assert.match(html, /<img src="\/api\/org\/files\/1\/preview" alt=""/);
  assert.equal(html.match(/photo\.png/g).length, 1);
});

test('several images keep their own pictures', () => {
  const input =
    'Compare.' +
    image('a.png', 'https://x/a.png') +
    image('b.png', 'https://x/b.png') +
    image('c.png', 'https://x/c.png');
  assert.deepEqual(nonEmptyLines(formatAttachmentHeadings(input)), [
    'Compare.',
    '### Image: a.png',
    '![](https://x/a.png)',
    '### Image: b.png',
    '![](https://x/b.png)',
    '### Image: c.png',
    '![](https://x/c.png)',
  ]);
  assert.deepEqual(nonEmptyLines(stripAttachments(stripImages(input))), [
    'Compare.',
    '***[Image: a.png]***',
    '***[Image: b.png]***',
    '***[Image: c.png]***',
  ]);
});

test('every kind of attachment, with files kept and with files omitted', () => {
  assert.deepEqual(nonEmptyLines(formatAttachmentHeadings(everything)), [
    'Look.',
    '### File: page.html · 458.9 KB',
    '````',
    '<html></html>',
    '````',
    '### Pasted content · 4.7 KB · 1 line',
    '````',
    'short paste',
    '````',
    '### Pasted content · 11.7 KB · 500 lines',
    '````',
    ...nonEmptyLines(longPaste),
    '````',
    '### File: slides.key · 2.0 MB',
    '### File: notes.pdf · 3 pages',
    '### Image: photo.png',
    '![](https://claude.ai/photo.png)',
  ]);
  assert.deepEqual(nonEmptyLines(stripAttachments(everything)), [
    'Look.',
    '***[File: page.html · 458.9 KB]***',
    '### Pasted content · 4.7 KB · 1 line',
    '````',
    'short paste',
    '````',
    '***[Pasted content · 11.7 KB · 500 lines]***',
    '***[File: slides.key · 2.0 MB]***',
    '***[File: notes.pdf · 3 pages]***',
    '### Image: photo.png',
    '![](https://claude.ai/photo.png)',
  ]);
});

test('inner fences in a file stay inside it', () => {
  const input =
    'Compare these.' +
    textFile('a.md', '1 KB, text/markdown', '# A\n````\nnested fence\n````\nend of A') +
    textFile('b.txt', '3 KB, text/plain', 'B body');
  const omitted = stripAttachments(input);
  assert.ok(omitted.includes('***[File: a.md · 1 KB]***'));
  assert.ok(omitted.includes('***[File: b.txt · 3 KB]***'));
  assert.ok(!omitted.includes('nested fence'));
  assert.ok(!omitted.includes('B body'));
  assert.ok(
    formatAttachmentHeadings(input).includes(
      '### File: a.md · 1 KB\n````\n# A\n````\nnested fence\n````\nend of A\n````',
    ),
  );
});

test('stripAttachments escapes asterisks so the bold italic note stays intact', () => {
  const input = 'X' + textFile('star*name.txt', '1 KB, text/plain', 'body');
  assert.ok(stripAttachments(input).includes('***[File: star\\*name.txt · 1 KB]***'));
});

test('notes render as bold italic and kept files as sub-headings in HTML', () => {
  const input = 'Look.' + textFile('a.txt', '1 KB', 'body');
  assert.match(markdownToHtml(stripAttachments(input)), /<strong><em>\[File: a\.txt · 1 KB\]/);
  assert.match(markdownToHtml(formatAttachmentHeadings(input)), /<h3[^>]*>File: a\.txt · 1 KB/);
});

test('ordinary message formatting is never touched', () => {
  const input =
    'Here is code:\n\n```js\nconst a = 1;\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n$$x^2$$\n\n> quote\n\n- item\n\n### A heading of my own\n\n**Attachments:**\n- report.pdf';
  assert.equal(stripAttachments(input), input);
  assert.equal(formatAttachmentHeadings(input), input);
});

test('a message is left unchanged when nested headers make it ambiguous', () => {
  const input = 'Continue this chat.' + pasted('40 KB', nestedExport.repeat(60));
  assert.equal(stripAttachments(input), input);
  assert.equal(formatAttachmentHeadings(input), input);
});

test('a paste that closes on a nested fence is detected too', () => {
  const body = 'intro\n````\ncode\n````\n\n' + nestedExport.repeat(60);
  const input = 'Continue.' + pasted('40 KB', body);
  assert.equal(stripAttachments(input), input);
  assert.equal(formatAttachmentHeadings(input), input);
});

test('card-like lines inside a kept paste are not rewritten', () => {
  const card = '**Attachment: [x.pdf](/api/x)** _(document)_';
  const input = 'See.' + pasted('0.1 KB', `${card}\nshort`);
  for (const rewrite of [formatAttachmentHeadings, stripAttachments]) {
    assert.equal(
      rewrite(input).trim(),
      `See.\n\n### Pasted content · 0.1 KB · 2 lines\n\`\`\`\`\n${card}\nshort\n\`\`\`\``,
    );
  }
});

test('card-like lines the user wrote inside the message are kept', () => {
  const card = '**Attachment: [x.pdf](/api/x)** _(document)_';
  const input = `Why does my export show this line?\n\n${card}\n\nIt has no link.`;
  assert.equal(stripAttachments(input), input);
  assert.equal(formatAttachmentHeadings(input), input);
  const withFile = input + textFile('f.txt', '1 KB, text/plain', 'body');
  assert.equal(stripAttachments(withFile).trim(), input + '\n\n***[File: f.txt · 1 KB]***');
});

test('re-applying the option in any order gives the same result', () => {
  const on = formatAttachmentHeadings;
  const off = stripAttachments;
  assert.equal(on(on(everything)), on(everything));
  assert.equal(off(off(everything)), off(everything));
  // The preview receives files kept and then applies its own toggle.
  assert.equal(off(on(everything)), off(everything));
  assert.equal(on(off(everything)), off(everything));
});

test('the preview gives the same result when it removes the pictures itself', () => {
  for (const rewrite of [formatAttachmentHeadings, stripAttachments]) {
    const exported = rewrite(stripImages(everything));
    const previewed = rewrite(stripImages(formatAttachmentHeadings(everything)));
    assert.equal(previewed, exported);
    assert.ok(exported.includes('***[Image: photo.png]***'));
  }
});

test('isUserMessage recognises user roles only', () => {
  assert.equal(isUserMessage({ role: 'User' }), true);
  assert.equal(isUserMessage({ role: 'user' }), true);
  assert.equal(isUserMessage({ role: 'Claude' }), false);
  assert.equal(isUserMessage({ role: 'Claude Artifact' }), false);
  assert.equal(isUserMessage(null), false);
});

test('applyAttachmentOption only changes user messages', () => {
  const body = 'Q' + textFile('f.txt', '1 KB, text/plain', 'BODY');
  const off = { includeAttachments: false };
  assert.equal(
    applyAttachmentOption({ role: 'User', content: body }, off).trim(),
    'Q\n\n***[File: f.txt · 1 KB]***',
  );
  const kept = 'Q\n\n### File: f.txt · 1 KB\n````\nBODY\n````';
  assert.equal(applyAttachmentOption({ role: 'User', content: body }).trim(), kept);
  assert.equal(
    applyAttachmentOption({ role: 'User', content: body }, { includeAttachments: true }).trim(),
    kept,
  );
  assert.equal(applyAttachmentOption({ role: 'Claude', content: body }, off), body);
  assert.equal(applyAttachmentOption({ role: 'Claude', content: body }), body);
});

test('strip helpers handle empty or invalid inputs', () => {
  assert.equal(stripAttachments(''), '');
  assert.equal(stripAttachments(null), '');
  assert.equal(formatAttachmentHeadings(undefined), '');
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
