import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const html = fs.readFileSync(path.join(__dirname, 'fixtures/copilot.html'), 'utf8');
const { window, document, HTMLElement, Node, DOMParser } = parseHTML(html);

global.window = window;
global.document = document;
global.HTMLElement = HTMLElement;
global.Node = Node;
global.DOMParser = DOMParser;

test('CopilotParser detects copilot.microsoft.com, copilot.com, copilot.cloud.microsoft, m365.cloud.microsoft, cloud app subdomains, bing.com, and edgeservices.bing.com URLs', async () => {
  const { CopilotParser } = await import('decant-core');
  const parser = new CopilotParser();

  assert.equal(parser.isAvailable('https://copilot.microsoft.com/'), true);
  assert.equal(parser.isAvailable('https://copilot.microsoft.com/chats/12345'), true);
  assert.equal(
    parser.isAvailable(
      'https://copilot.com/chat?fromcode=cmmj8t0ivkm&sessionId=d0e6eaba-da1e-c759-44d9-b9da8d3c41f7',
    ),
    true,
  );
  assert.equal(parser.isAvailable('https://www.copilot.com/chat'), true);
  assert.equal(parser.isAvailable('https://copilot.cloud.microsoft/chats'), true);
  assert.equal(parser.isAvailable('https://m365.cloud.microsoft/chat'), true);
  assert.equal(parser.isAvailable('https://m365.microsoft.com/chat'), true);
  assert.equal(parser.isAvailable('https://onenote.cloud.microsoft/chat'), true);
  assert.equal(parser.isAvailable('https://word.cloud.microsoft/copilot'), true);
  assert.equal(parser.isAvailable('https://excel.cloud.microsoft/projects'), true);
  assert.equal(parser.isAvailable('https://teams.cloud.microsoft/chat'), true);
  assert.equal(parser.isAvailable('https://word.cloud.microsoft/document'), false);
  assert.equal(parser.isAvailable('https://www.bing.com/chat'), true);
  assert.equal(parser.isAvailable('https://www.bing.com/copilot'), true);
  assert.equal(parser.isAvailable('https://www.bing.com/copilotsearch?q=test'), true);
  assert.equal(parser.isAvailable('https://edgeservices.bing.com/edgediscover/query'), true);
  assert.equal(parser.isAvailable('https://chatgpt.com/'), false);
});

test('CopilotParser correctly parses chat content from fixture', async () => {
  window.location = { href: 'https://copilot.microsoft.com/chats/fixture' };

  const { CopilotParser } = await import('decant-core');
  const parser = new CopilotParser();

  const result = await parser.parse();

  assert.equal(result.title, 'Global Work and Wage Comparison');
  assert.equal(result.messages.length, 2);

  // User message check
  assert.equal(result.messages[0].role, 'User');
  assert.ok(result.messages[0].content.includes('comparing Denmark, Sweden, and USA work hours'));

  // Copilot message check
  assert.equal(result.messages[1].role, 'Copilot');
  assert.ok(result.messages[1].content.includes('**bold findings**'));
  assert.ok(result.messages[1].content.includes('*key details*'));
  assert.ok(result.messages[1].content.includes('[deadrat.in](https://deadrat.in)'));

  // Code block check
  assert.ok(result.messages[1].content.includes('```elixir'));
  assert.ok(result.messages[1].content.includes('IO.puts "Hello, world!"'));

  // Table check
  assert.ok(result.messages[1].content.includes('| Country | Median Wages |'));
  assert.ok(result.messages[1].content.includes('| Denmark | ~$3,500 | 37 |'));

  // Noise check: ensure button text like "Copy" or "Like" is stripped
  assert.equal(result.messages[1].content.includes('Copy'), false);
  assert.equal(result.messages[1].content.includes('Like'), false);
});

test('CopilotParser correctly parses M365 / Bebop Copilot layout from fixture', async () => {
  const m365Html = fs.readFileSync(path.join(__dirname, 'fixtures/copilot-m365.html'), 'utf8');
  const dom = parseHTML(m365Html);
  global.window = dom.window;
  global.document = dom.document;
  global.HTMLElement = dom.HTMLElement;
  global.Node = dom.Node;
  global.DOMParser = dom.DOMParser;
  dom.window.location = { href: 'https://copilot.com/chat/conversation/12345' };

  const { CopilotParser } = await import('decant-core');
  const parser = new CopilotParser();

  const result = await parser.parse();

  assert.ok(result.title.includes('Recommend a book'));
  assert.equal(result.messages.length, 2);

  // User message check
  assert.equal(result.messages[0].role, 'User');
  assert.ok(result.messages[0].content.includes('Recommend a book for me about [topic or mood]'));

  // Copilot message check
  assert.equal(result.messages[1].role, 'Copilot');
  assert.ok(result.messages[1].content.includes('A Gentleman in Moscow'));
  assert.ok(result.messages[1].content.includes('The Thursday Murder Club'));

  // Noise stripping check
  assert.equal(result.messages[1].content.includes('Copy'), false);
  assert.equal(result.messages[1].content.includes('Like'), false);
  assert.equal(result.messages[1].content.includes('Suggest another'), false);
});

test('CopilotParser correctly parses modern Copilot layout using data-message-author-role and chat-turn testids', async () => {
  const modernHtml = `
    <!DOCTYPE html>
    <html>
      <head><title>Explain Quantum Computing - Copilot</title></head>
      <body>
        <main>
          <div data-testid="chat-history">
            <div data-testid="chat-turn-user" data-message-author-role="user">
              <div data-testid="user-message-content">Explain quantum computing in simple terms.</div>
            </div>
            <div data-testid="chat-turn-assistant" data-message-author-role="assistant">
              <div data-testid="copilot-message-content">
                <p>Quantum computing uses <strong>qubits</strong> instead of classical bits.</p>
                <div data-testid="message-item-reactions"><button>Like</button></div>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  `;
  const dom = parseHTML(modernHtml);
  global.window = dom.window;
  global.document = dom.document;
  global.HTMLElement = dom.HTMLElement;
  global.Node = dom.Node;
  global.DOMParser = dom.DOMParser;
  dom.window.location = { href: 'https://copilot.microsoft.com/chats/u1yRSJwM2me3A96y5VL2y' };

  const { CopilotParser } = await import('decant-core');
  const parser = new CopilotParser();

  const result = await parser.parse();

  assert.equal(result.title, 'Explain Quantum Computing');
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].role, 'User');
  assert.equal(result.messages[0].content, 'Explain quantum computing in simple terms.');
  assert.equal(result.messages[1].role, 'Copilot');
  assert.ok(result.messages[1].content.includes('**qubits**'));
  assert.equal(result.messages[1].content.includes('Like'), false);
});
