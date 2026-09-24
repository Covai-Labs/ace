import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('ClaudeParser extracts standard messages and Claude Artifacts via DOM fallback', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/claude-chat.html'), 'utf8');
  const { window, document, HTMLElement, Node, DOMParser } = parseHTML(html);

  // Expose browser globals
  global.window = window;
  global.document = document;
  global.HTMLElement = HTMLElement;
  global.Node = Node;
  global.DOMParser = DOMParser;

  // Mock chrome extension global
  global.chrome = {
    runtime: {
      getURL: (path) => path,
    },
  };

  // Mock fetch to reject, forcing DOM fallback
  global.fetch = async () => {
    return { ok: false, status: 404 };
  };

  // Mock window.location
  window.location = {
    origin: 'https://claude.ai',
    href: 'https://claude.ai/chat/123',
    pathname: '/chat/123',
  };

  // Mock window.postMessage using linkedom's built-in dispatchEvent system
  window.postMessage = (msg) => {
    if (msg && msg.type === 'ReqAtftInfo') {
      setTimeout(() => {
        const event = new window.Event('message');
        event.data = {
          type: 'RspAtftInfo',
          idx: msg.idx,
          atftInfo: {
            title: 'hello-world.js',
            content: 'console.log("Hello, World!");',
            language: 'javascript',
          },
        };
        window.dispatchEvent(event);
      }, 5);
    }
  };

  // Append a mock artifact element to test artifact extraction next to response
  const responseEl = document.querySelector('.font-claude-response');
  const artifactEl = document.createElement('div');
  artifactEl.className = 'artifact-block-cell';
  responseEl.parentNode.appendChild(artifactEl);

  const { ClaudeParser } = await import('decant-core');
  const parser = new ClaudeParser();

  const result = await parser.parse();

  assert.equal(result.messages.length, 3);
  assert.equal(result.messages[0].role, 'User');
  assert.match(result.messages[0].content, /Please write a short response/);

  assert.equal(result.messages[1].role, 'Claude');
  assert.match(result.messages[1].content, /Here is a short response/);

  assert.equal(result.messages[2].role, 'Claude Artifact');
  assert.match(result.messages[2].content, /Artifact: hello-world.js/);
  assert.match(result.messages[2].content, /console.log/);
  assert.equal(result.metadata.Method, 'DOM');
});

test('ClaudeParser extracts conversation from Claude API when available', async () => {
  const { window, document, HTMLElement, Node, DOMParser } = parseHTML(
    '<html><head></head><body></body></html>',
  );

  global.window = window;
  global.document = document;
  global.HTMLElement = HTMLElement;
  global.Node = Node;
  global.DOMParser = DOMParser;

  window.location = {
    origin: 'https://claude.ai',
    href: 'https://claude.ai/chat/conv-456',
    pathname: '/chat/conv-456',
  };

  const mockOrganizations = [
    {
      uuid: 'org-123',
      name: 'My Org',
      capabilities: ['chat'],
    },
  ];

  const mockConversation = {
    uuid: 'conv-456',
    name: 'Test Claude API Title',
    model: 'claude-3-7-sonnet-20250219',
    current_leaf_message_uuid: 'msg-3',
    chat_messages: [
      {
        uuid: 'msg-1',
        parent_message_uuid: null,
        sender: 'human',
        content: [
          {
            type: 'text',
            text: 'Hello, explain this file.',
          },
        ],
        attachments: [
          {
            file_name: 'test.js',
            file_size: 2048,
            file_type: 'application/javascript',
            extracted_content: 'console.log("hello test");',
          },
        ],
      },
      {
        uuid: 'msg-2',
        parent_message_uuid: 'msg-1',
        sender: 'assistant',
        content: [
          {
            type: 'thinking',
            thinking: 'Need to analyze the provided JavaScript file.',
          },
          {
            type: 'text',
            text: 'Here is the response. I also created a helper function.',
          },
          {
            type: 'tool_use',
            name: 'create_file',
            display_content: {
              type: 'code_block',
              language: 'javascript',
              filename: 'helpers/utils.js',
              code: 'function add(a, b) { return a + b; }',
            },
          },
        ],
      },
      {
        uuid: 'msg-3',
        parent_message_uuid: 'msg-2',
        sender: 'human',
        content: [
          {
            type: 'text',
            text: 'Thank you!',
          },
        ],
      },
    ],
  };

  // Mock global fetch
  global.fetch = async (url) => {
    if (url === 'https://claude.ai/api/organizations') {
      return {
        ok: true,
        json: async () => mockOrganizations,
      };
    }
    if (
      url ===
      'https://claude.ai/api/organizations/org-123/chat_conversations/conv-456?tree=True&rendering_mode=messages&render_all_tools=true'
    ) {
      return {
        ok: true,
        json: async () => mockConversation,
      };
    }
    return { ok: false, status: 404 };
  };

  const { ClaudeParser } = await import('decant-core');
  const parser = new ClaudeParser();

  const result = await parser.parse();

  // Assertions
  assert.equal(result.title, 'Test Claude API Title');
  assert.equal(result.metadata.Model, 'claude-3-7-sonnet-20250219');
  assert.equal(result.metadata.Source, 'Claude');
  assert.equal(result.metadata.Method, 'API');

  assert.equal(result.messages.length, 4);

  // Message 1: User message with text and attachment metadata
  assert.equal(result.messages[0].role, 'User');
  assert.match(result.messages[0].content, /Hello, explain this file\./);
  assert.match(result.messages[0].content, /Attachment: test\.js/);
  assert.match(result.messages[0].content, /2\.0 KB/);
  assert.match(result.messages[0].content, /console\.log\("hello test"\)/);

  // Message 2: Claude response with thinking process and text content
  assert.equal(result.messages[1].role, 'Claude');
  assert.match(result.messages[1].content, /Thinking Process:|<think>/);
  assert.match(result.messages[1].content, /Need to analyze the provided/);
  assert.match(result.messages[1].content, /Here is the response\./);

  // Message 3: Claude Artifact generated from the assistant message tool_use
  assert.equal(result.messages[2].role, 'Claude Artifact');
  assert.match(result.messages[2].content, /Artifact: utils/);
  assert.match(result.messages[2].content, /```javascript/);
  assert.match(result.messages[2].content, /function add\(a, b\)/);

  // Message 4: User final message
  assert.equal(result.messages[3].role, 'User');
  assert.match(result.messages[3].content, /Thank you!/);
});

test('ClaudeParser unrolls interactive carousel elements in ai-chat-exporter', async () => {
  const html = `
    <html>
      <head><title>Claude Interactive Chat</title></head>
      <body>
        <div class="font-claude-response">
          <p>Here are recommendations:</p>
          <div class="@container bg-surface-2">
            <button aria-label="Go to step 1">1</button>
            <button aria-label="Go to step 2">2</button>
            <div>
              <span class="text-title">First Recommendation</span>
              <span class="text-body">Details for step 1</span>
            </div>
            <div class="invisible">
              <span class="text-title">Second Recommendation</span>
              <span class="text-body">Details for step 2</span>
            </div>
          </div>
          <p>Conclusion text</p>
        </div>
      </body>
    </html>
  `;
  const { window, document, HTMLElement, Node, DOMParser } = parseHTML(html);
  global.window = window;
  global.document = document;
  global.HTMLElement = HTMLElement;
  global.Node = Node;
  global.DOMParser = DOMParser;
  global.chrome = { runtime: { getURL: (path) => path } };
  global.fetch = async () => ({ ok: false, status: 404 });

  const { ClaudeParser } = await import('decant-core');
  const parser = new ClaudeParser();
  const result = await parser.parse({ parserMode: 'prefer_dom' });

  assert.equal(result.messages.length, 1);
  const msg = result.messages[0];
  assert.equal(msg.role, 'Claude');
  assert.match(msg.content, /Here are recommendations/);
  assert.match(msg.content, /1(\\\.)?\.? First Recommendation/);
  assert.match(msg.content, /Details for step 1/);
  assert.match(msg.content, /2(\\\.)?\.? Second Recommendation/);
  assert.match(msg.content, /Details for step 2/);
  assert.match(msg.content, /Conclusion text/);
  assert.doesNotMatch(msg.content, /Go to step 1/);
});
