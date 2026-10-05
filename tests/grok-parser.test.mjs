import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('GrokParser correctly matches URLs (including projects) and extracts conversation', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/grok-chat.html'), 'utf8');
  const { window, document, HTMLElement, Node, DOMParser } = parseHTML(html);

  // Expose browser globals
  global.window = window;
  global.document = document;
  global.HTMLElement = HTMLElement;
  global.Node = Node;
  global.DOMParser = DOMParser;
  window.location = { href: 'https://grok.com/c/4285ab4c-cc97-40a9-a4ce-f34774e41b0e' };

  const { GrokParser } = await import('decant-core');
  const parser = new GrokParser();

  assert.equal(parser.isAvailable('https://grok.com/c/4285ab4c-cc97-40a9-a4ce-f34774e41b0e'), true);
  assert.equal(
    parser.isAvailable(
      'https://grok.com/project/cbfc80b1-9471-4b6a-9db1-02c268e80260?chat=ac404bb9-0569-4111-903a-1fbb55035de6',
    ),
    true,
  );
  assert.equal(parser.isAvailable('https://chatgpt.com/'), false);

  const result = await parser.parse({ parserMode: 'prefer_dom' });
  assert.equal(result.title, 'Recent Human-Caused Extinctions');
  assert.equal(result.metadata.Source, 'Grok');
  assert.equal(result.metadata.Method, 'DOM');
  assert.equal(result.messages.length, 14);

  assert.equal(result.messages[0].role, 'User');
  assert.match(result.messages[0].content, /species that went extinct/);

  assert.equal(result.messages[1].role, 'Grok');
  assert.match(result.messages[1].content, /Baiji/);
});

test('content scripts import and register GrokParser', () => {
  const contentScriptPaths = ['../entrypoints/content.js', '../content/main.js'];

  for (const contentScriptPath of contentScriptPaths) {
    const contentCode = fs.readFileSync(path.join(__dirname, contentScriptPath), 'utf8');
    assert.match(
      contentCode,
      /\bGrokParser\b/,
      `${contentScriptPath} must import GrokParser from decant-core`,
    );
    assert.match(
      contentCode,
      /new\s+GrokParser\(\)/,
      `${contentScriptPath} must instantiate GrokParser in parsers array`,
    );
  }
});
