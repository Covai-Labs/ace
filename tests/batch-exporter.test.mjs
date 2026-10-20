import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  isExtractableTab,
  deduplicateFilenames,
  formatCombinedMarkdown,
  generateZipArchive,
  buildBatchAiPrompt,
  downloadFile,
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
  assert.match(prompt, /Please analyze and synthesize the web pages \/ discussions/);
  assert.match(prompt, /### Conversation 1: Discussion 1/);
  assert.match(prompt, /Argument A\./);
});

test('downloadFile uses chrome.downloads when available', async () => {
  const originalChrome = globalThis.chrome;
  let downloadedOptions = null;
  globalThis.chrome = {
    downloads: {
      download: async (opts) => {
        downloadedOptions = opts;
        return 42;
      },
    },
  };
  try {
    const id = await downloadFile('Hello world', 'test.md', 'text/markdown');
    assert.equal(id, 42);
    assert.equal(downloadedOptions.filename, 'test.md');
    assert.equal(downloadedOptions.saveAs, false);
    assert.ok(downloadedOptions.url.length > 0);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test('downloadFile falls back to DOM anchor click when chrome.downloads is unavailable', async () => {
  const originalChrome = globalThis.chrome;
  const originalDocument = globalThis.document;
  delete globalThis.chrome;

  let clicked = false;
  let anchorAttrs = {};
  globalThis.document = {
    body: {
      appendChild: () => {},
    },
    createElement: (tag) => {
      if (tag === 'a') {
        return {
          style: {},
          set href(val) {
            anchorAttrs.href = val;
          },
          get href() {
            return anchorAttrs.href;
          },
          set download(val) {
            anchorAttrs.download = val;
          },
          get download() {
            return anchorAttrs.download;
          },
          click: () => {
            clicked = true;
          },
          remove: () => {},
        };
      }
      return {};
    },
  };

  try {
    const id = await downloadFile('# Title', 'doc.md', 'text/markdown');
    assert.equal(id, null);
    assert.equal(clicked, true);
    assert.equal(anchorAttrs.download, 'doc.md');
    assert.ok(anchorAttrs.href.length > 0);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.document = originalDocument;
  }
});
