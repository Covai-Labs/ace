import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('QwenParser correctly parses chat content from fixture', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/qwen-chat.html'), 'utf8');
  const { window, document, HTMLElement, Node, DOMParser } = parseHTML(html);

  global.window = window;
  global.document = document;
  global.HTMLElement = HTMLElement;
  global.Node = Node;
  global.DOMParser = DOMParser;

  window.location = { href: 'https://chat.qwen.ai/' };

  const { QwenParser } = await import('decant-core');
  const parser = new QwenParser();

  const result = await parser.parse();

  assert.equal(result.title, 'Qwen Chat');
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].role, 'User');
  assert.match(result.messages[0].content, /Please write a short response/);
  assert.equal(result.messages[1].role, 'Qwen');
  assert.match(result.messages[1].content, /Formatting Demo.*Elixir/is);
});

test('QwenParser extracts full conversation via API (including thinking and attachments) and respects prefer_dom', async () => {
  const { window, document, HTMLElement, Node, DOMParser } = parseHTML(
    '<!DOCTYPE html><html><head><title>Qwen</title></head><body><div class="qwen-chat-message qwen-chat-message-user"><div class="user-message-content">DOM User</div></div><div class="qwen-chat-message"><div class="qwen-markdown">DOM Part 1</div><div class="qwen-markdown">DOM Part 2</div></div></body></html>',
  );
  global.window = window;
  global.document = document;
  global.HTMLElement = HTMLElement;
  global.Node = Node;
  global.DOMParser = DOMParser;
  window.location = { href: 'https://chat.qwen.ai/c/f0fb4580-9078-44be-84e6-2a456b751d68' };

  const { QwenParser } = await import('decant-core');
  const parser = new QwenParser();
  parser.fetchChatData = async () => ({
    success: true,
    data: {
      title: "India's Identity Politics",
      models: ['qwen3-max'],
      chat: {
        history: {
          currentId: 'm2',
          messages: {
            m1: {
              id: 'm1',
              role: 'user',
              parentId: null,
              content: 'Explain structural issue',
              files: [{ name: 'notes.md', size: '2 KB' }],
            },
            m2: {
              id: 'm2',
              role: 'assistant',
              parentId: 'm1',
              modelName: 'qwen3-max',
              content: '',
              content_list: [
                { phase: 'think', content: 'Analyze core premise.' },
                { phase: 'answer', content: 'Here is the structural breakdown.' },
              ],
            },
          },
        },
      },
    },
  });

  const apiRes = await parser.parse();
  assert.equal(apiRes.title, "India's Identity Politics");
  assert.equal(apiRes.metadata.Method, 'API');
  assert.equal(apiRes.metadata.Model, 'qwen3-max');
  assert.equal(apiRes.messages.length, 2);
  assert.equal(apiRes.messages[0].role, 'User');
  assert.match(apiRes.messages[0].content, /Explain structural issue/);
  assert.match(apiRes.messages[0].content, /\*\*notes\.md\*\* \(2 KB\)/);
  assert.equal(apiRes.messages[1].role, 'Qwen');
  assert.equal(apiRes.messages[1].thinking, 'Analyze core premise.');
  assert.equal(
    apiRes.messages[1].content,
    '<think>\nAnalyze core premise.\n</think>\n\nHere is the structural breakdown.',
  );

  // prefer_dom uses DOM and joins multiple .qwen-markdown blocks
  const domRes = await parser.parse({ parserMode: 'prefer_dom' });
  assert.equal(domRes.metadata.Method, 'DOM');
  assert.equal(domRes.messages.length, 2);
  assert.equal(domRes.messages[1].content, 'DOM Part 1\n\nDOM Part 2');

  // Falls back to DOM if API throws
  parser.fetchChatData = async () => {
    throw new Error('401');
  };
  const fallbackRes = await parser.parse();
  assert.equal(fallbackRes.metadata.Method, 'DOM');
  assert.equal(fallbackRes.messages.length, 2);
});
