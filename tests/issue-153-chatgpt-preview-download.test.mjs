import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Set up DOM globals for parsers
const { window, document, HTMLElement, Node, DOMParser } = parseHTML('<div></div>');
global.window = window;
global.document = document;
global.HTMLElement = HTMLElement;
global.Node = Node;
global.DOMParser = DOMParser;

const { ChatGPTParser } = await import('../packages/decant-core/ai/chatgpt.js');
const { AI_CHAT_DOMAINS } = await import('../packages/decant-core/detection/domains.js');

test('Issue #153: ChatGPTParser.isAvailable recognizes chatgpt.com and chat.openai.com', () => {
  const parser = new ChatGPTParser();
  assert.equal(parser.isAvailable('https://chatgpt.com/c/6710-abcd'), true);
  assert.equal(parser.isAvailable('https://chat.openai.com/c/6710-abcd'), true);
  assert.equal(parser.isAvailable('https://claude.ai/chat/123'), false);

  assert.ok(AI_CHAT_DOMAINS.includes('chatgpt.com'));
  assert.ok(AI_CHAT_DOMAINS.includes('chat.openai.com'));
});

test('Issue #153: ChatGPTParser helper timeout is configured to 5000ms', () => {
  const parserSrc = fs.readFileSync(
    path.join(__dirname, '../packages/decant-core/ai/chatgpt.js'),
    'utf8',
  );

  // Verify fetchConversation timer is 5000ms rather than 45000ms
  assert.ok(parserSrc.includes('}, 5000);'));
  assert.ok(!parserSrc.includes('}, 45000);'));
});

test('Issue #153: ChatGPTParser helper respects replyOrigin from chat.openai.com', async () => {
  // Read helper file directly to test the message event handler logic
  const helperSrc = fs.readFileSync(
    path.join(__dirname, '../packages/decant-core/ai/chatgpt_helper.js'),
    'utf8',
  );

  // Helper should check for chat.openai.com
  assert.ok(helperSrc.includes('chat.openai.com'));
  assert.ok(helperSrc.includes('replyOrigin'));
});

test('Issue #153: Content and preview scripts defer URL.revokeObjectURL to avoid Firefox .part files', () => {
  const contentSrc = fs.readFileSync(path.join(__dirname, '../entrypoints/content.js'), 'utf8');
  const previewSrc = fs.readFileSync(
    path.join(__dirname, '../entrypoints/preview/preview.js'),
    'utf8',
  );
  const mainContentSrc = fs.readFileSync(path.join(__dirname, '../content/main.js'), 'utf8');
  const popupPreviewSrc = fs.readFileSync(path.join(__dirname, '../popup/preview.js'), 'utf8');

  // Verify that immediate URL.revokeObjectURL(url) is NOT called right after click/removeChild
  const immediatePattern = /document\.body\.removeChild\([^)]+\);\s*URL\.revokeObjectURL\(/;
  assert.ok(
    !immediatePattern.test(contentSrc),
    'entrypoints/content.js should not immediately revoke ObjectURL',
  );
  assert.ok(
    !immediatePattern.test(previewSrc),
    'entrypoints/preview/preview.js should not immediately revoke ObjectURL',
  );
  assert.ok(
    !immediatePattern.test(mainContentSrc),
    'content/main.js should not immediately revoke ObjectURL',
  );
  assert.ok(
    !immediatePattern.test(popupPreviewSrc),
    'popup/preview.js should not immediately revoke ObjectURL',
  );

  // Verify deferred timeout pattern is present
  assert.ok(contentSrc.includes('URL.revokeObjectURL(url);'));
  assert.ok(contentSrc.includes('60000'));
  assert.ok(previewSrc.includes('URL.revokeObjectURL(url);'));
  assert.ok(previewSrc.includes('60000'));
});
