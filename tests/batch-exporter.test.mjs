import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  isExtractableTab,
  deduplicateFilenames,
  formatCombinedMarkdown,
  generateZipArchive,
  buildBatchAiPrompt,
} from '../content/utils/batch-exporter.js';

test('isExtractableTab validates tabs correctly', () => {
  assert.equal(isExtractableTab({ url: 'https://chatgpt.com/' }), true);
  assert.equal(isExtractableTab({ url: 'https://claude.ai/new' }), true);
  assert.equal(isExtractableTab({ url: 'chrome://extensions' }), false);
  assert.equal(isExtractableTab({ url: 'about:blank' }), false);
  assert.equal(isExtractableTab(null), false);
});

test('deduplicateFilenames resolves colliding filenames', () => {
  const items = [
    { filename: 'chat.md', content: 'Chat 1' },
    { filename: 'chat.md', content: 'Chat 2' },
    { filename: 'chat-1.md', content: 'Chat 3' },
  ];
  const deduped = deduplicateFilenames(items);
  assert.equal(deduped[0].filename, 'chat.md');
  assert.equal(deduped[1].filename, 'chat-1.md');
  assert.equal(deduped[2].filename, 'chat-1-1.md');
});

test('formatCombinedMarkdown produces table of contents and sections with namespaced image references', () => {
  const chats = [
    {
      title: 'Chat One',
      content:
        '# First Chat\n\n![Image A][image-1]\n\n<!-- Image References -->\n\n[image-1]: data:image/png;base64,AAA',
    },
    {
      title: 'Chat Two',
      content:
        '# Second Chat\n\n![Image B][image-1]\n\n<!-- Image References -->\n\n[image-1]: data:image/png;base64,BBB',
    },
  ];
  const combined = formatCombinedMarkdown(chats, '2026-08-20');
  assert.match(combined, /title: Exported AI Chats \(2026-08-20\)/);
  assert.match(combined, /1\. \[Chat One\]\(#chat-1\)/);
  assert.match(combined, /<a id="chat-1"><\/a>/);
  assert.match(combined, /!\[Image A\]\[c1-image-1\]/);
  assert.match(combined, /\[c1-image-1\]: data:image\/png;base64,AAA/);
  assert.match(combined, /!\[Image B\]\[c2-image-1\]/);
  assert.match(combined, /\[c2-image-1\]: data:image\/png;base64,BBB/);
});

test('generateZipArchive builds valid zip containing files', async () => {
  const items = [
    { filename: 'c1.md', content: 'First' },
    { filename: 'c2.md', content: 'Second' },
  ];
  const zipResult = await generateZipArchive(items);
  let zip;
  if (typeof zipResult === 'string') {
    assert.ok(zipResult.startsWith('data:application/zip;base64,'));
    const base64 = zipResult.replace('data:application/zip;base64,', '');
    zip = await JSZip.loadAsync(base64, { base64: true });
  } else {
    assert.ok(zipResult instanceof Blob);
    const arrayBuffer = await zipResult.arrayBuffer();
    zip = await JSZip.loadAsync(arrayBuffer);
  }
  assert.equal(await zip.file('c1.md')?.async('string'), 'First');
  assert.equal(await zip.file('c2.md')?.async('string'), 'Second');
});

test('buildBatchAiPrompt aggregates chats into synthesis prompt', () => {
  const chats = [
    { title: 'Discussion 1', content: 'Argument A.' },
    { title: 'Discussion 2', content: 'Argument B.' },
  ];
  const prompt = buildBatchAiPrompt(chats);
  assert.match(prompt, /Please analyze and synthesize/);
  assert.match(prompt, /### Conversation 1: Discussion 1/);
  assert.match(prompt, /Argument A\./);
});
