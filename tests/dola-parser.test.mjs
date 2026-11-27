import fs from 'node:fs';
import { parseHTML } from 'linkedom';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('DolaParser correctly matches URL and extracts conversation', async () => {
  const html = fs.readFileSync(new URL('./fixtures/dola-chat.html', import.meta.url), 'utf8');
  const { window, document, HTMLElement, Node, DOMParser } = parseHTML(html);

  global.window = window;
  global.document = document;
  global.HTMLElement = HTMLElement;
  global.Node = Node;
  global.DOMParser = DOMParser;

  const { DolaParser } = await import('decant-core');
  const parser = new DolaParser();

  assert.equal(parser.isAvailable('https://www.dola.com/chat/38418651360310289'), true);
  assert.equal(parser.isAvailable('https://chatgpt.com'), false);

  const result = await parser.parse();
  assert.equal(result.title, 'Gig Workers and Political Identity in India');
  assert.equal(result.messages.length, 6);
  assert.equal(result.messages[0].role, 'Dola');
  assert.doesNotMatch(result.messages[0].content, /Searched for 4 keywords · 24 sources/);
  assert.equal(result.messages[3].role, 'User');
  assert.equal(
    result.messages[3].content,
    "[Attachment: Qwen - India's Identity Politics and Charisma - 2026-11-27_13-58.md]",
  );
  assert.equal(result.messages[4].role, 'User');
  assert.equal(result.messages[4].content, 'what u think of this ?');
});
