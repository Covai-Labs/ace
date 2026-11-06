import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('DuckAIParser correctly matches URLs and extracts conversation from fixture', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/duck-ai-chat.html'), 'utf8');
  const { window, document, HTMLElement, Node, DOMParser } = parseHTML(html);

  // Expose browser globals
  global.window = window;
  global.document = document;
  global.HTMLElement = HTMLElement;
  global.Node = Node;
  global.DOMParser = DOMParser;
  window.location = { href: 'https://duck.ai/?chatID=df6b2313-8a03-44bd-aef9-b941e3f6f38a' };

  const { DuckAIParser } = await import('decant-core');
  const parser = new DuckAIParser();

  assert.equal(parser.isAvailable('https://duck.ai/'), true);
  assert.equal(
    parser.isAvailable('https://duck.ai/?chatID=df6b2313-8a03-44bd-aef9-b941e3f6f38a'),
    true,
  );
  assert.equal(parser.isAvailable('https://duckduckgo.com/?q=DuckDuckGo+AI+Chat&ia=chat'), true);
  assert.equal(parser.isAvailable('https://duckduckgo.com/chat'), true);
  assert.equal(parser.isAvailable('https://chatgpt.com/'), false);

  const result = await parser.parse();
  assert.equal(result.metadata.Source, 'Duck.ai');
  assert.equal(result.metadata.Method, 'DOM');
  assert.equal(result.metadata.Model, 'gpt-oss 120B');
  assert.equal(result.title, 'what do u think of https://github.com/Covai-Labs/ai-chat-exporter');
  assert.equal(result.messages.length, 14);

  assert.equal(result.messages[0].role, 'User');
  assert.match(result.messages[0].content, /github\.com\/Covai-Labs\/ai-chat-exporter/);

  assert.equal(result.messages[1].role, 'Duck.ai');
  assert.equal(result.messages[1].model, 'Gemma 4 31B');
  assert.match(result.messages[1].content, /Since I cannot "think"/);
});

test('entrypoints/content.js imports and registers DuckAIParser', () => {
  const contentCode = fs.readFileSync(path.join(__dirname, '../entrypoints/content.js'), 'utf8');
  assert.match(
    contentCode,
    /\bDuckAIParser\b/,
    'content.js must import DuckAIParser from decant-core',
  );
  assert.match(
    contentCode,
    /const\s+parsers\s*=\s*\[[\s\S]*?new\s+DuckAIParser\(\)[\s\S]*?\]/,
    'content.js must instantiate DuckAIParser in parsers array',
  );
});

test('content/main.js imports and registers DuckAIParser', () => {
  const mainCode = fs.readFileSync(path.join(__dirname, '../content/main.js'), 'utf8');
  assert.match(
    mainCode,
    /\bDuckAIParser\b/,
    'content/main.js must import DuckAIParser from decant-core',
  );
  assert.match(
    mainCode,
    /const\s+parsers\s*=\s*\[[\s\S]*?new\s+DuckAIParser\(\)[\s\S]*?\]/,
    'content/main.js must instantiate DuckAIParser in parsers array',
  );
});
