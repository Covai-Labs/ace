import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getOmittedAttachmentsSuffix } from '../content/formatters/base.js';
import { MarkdownFormatter } from '../content/formatters/markdown.js';
import { TextFormatter } from '../content/formatters/text.js';
import { stripAttachments } from '../content/utils/strip-attachments.js';

const userWithTwoOmitted = {
  role: 'User',
  content:
    'Compare these.\n\n' +
    '***[File: page.html · 458.9 KB]***\n\n' +
    '***[File: notes.pdf · 3 pages]***',
};
const conversation = {
  title: 'Test',
  messages: [userWithTwoOmitted, { role: 'Claude', content: 'Done.' }],
  metadata: {},
};

test('getOmittedAttachmentsSuffix counts omitted attachments in user messages', () => {
  assert.equal(getOmittedAttachmentsSuffix(userWithTwoOmitted), ' · 2 attachments omitted');
  assert.equal(
    getOmittedAttachmentsSuffix({
      role: 'User',
      content: 'Hi\n\n***[Pasted content · 14.8 KB · 800 lines]***',
    }),
    ' · 1 attachment omitted',
  );
  assert.equal(
    getOmittedAttachmentsSuffix({ role: 'User', content: 'Hi\n\n***[Image: photo.png]***' }),
    ' · 1 attachment omitted',
  );
});

test('getOmittedAttachmentsSuffix ignores kept pastes, plain messages and AI responses', () => {
  const keptPaste = stripAttachments('Hi\n\n### Pasted content _(1 KB)_\n````\nshort\n````\n');
  assert.equal(getOmittedAttachmentsSuffix({ role: 'User', content: keptPaste }), '');
  assert.equal(getOmittedAttachmentsSuffix({ role: 'User', content: 'No files here.' }), '');
  assert.equal(
    getOmittedAttachmentsSuffix({ role: 'Claude', content: userWithTwoOmitted.content }),
    '',
  );
  assert.equal(getOmittedAttachmentsSuffix(null), '');
});

test('Markdown and plain-text exports flag the message title', () => {
  const options = { includeAttribution: false, messageNumbering: 'off' };
  const markdown = new MarkdownFormatter().format(conversation, options);
  assert.match(markdown, /^## Prompt · 2 attachments omitted:$/m);
  assert.match(markdown, /^## Response:$/m);

  const text = String(new TextFormatter().format(conversation, options));
  assert.match(text, /^Prompt · 2 attachments omitted:$/m);
});

test('the flag sits next to the message number', () => {
  const markdown = new MarkdownFormatter().format(conversation, {
    includeAttribution: false,
    messageNumbering: 'per-message',
  });
  assert.match(markdown, /^## Prompt \[1\] · 2 attachments omitted:$/m);
});

test('HTML, Word and PNG exports add the flag to the message header', () => {
  for (const file of ['html.js', 'doc.js', 'image.js']) {
    const code = fs.readFileSync(`content/formatters/${file}`, 'utf8');
    assert.match(code, /getOmittedAttachmentsSuffix\(msg\)/, `${file} should flag the header`);
  }
});

test('the counter matches the notes written by the attachment filter', () => {
  const content = stripAttachments(
    'Q\n\n### Attachment: f.txt _(1 KB, text/plain)_\n````\nbody\n````\n\n' +
      '**Attachment: [notes.pdf](/api/x/files/1/document)** _(document · 3 pages)_\n\n' +
      '**Attachment: photo.png**\n\n![photo.png](https://x/p.png)\n\n',
  );
  // The picture is still included, so only the two files count.
  assert.equal(getOmittedAttachmentsSuffix({ role: 'User', content }), ' · 2 attachments omitted');
});
