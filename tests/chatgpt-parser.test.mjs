import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Set up Linkedom DOM context for Turndown at top-level
const { window, document, HTMLElement, Node, DOMParser } = parseHTML('<div></div>');
global.window = window;
global.document = document;
global.HTMLElement = HTMLElement;
global.Node = Node;
global.DOMParser = DOMParser;

// Import ChatGPTParser after globals are set so Turndown loads correctly
const { ChatGPTParser } = await import('decant-core');

test('extractMessage combines multiple assistant blocks in one ChatGPT turn', () => {
  const parser = new ChatGPTParser();
  parser.convertContentElement = (element) => element.textContent;

  const { document: testDoc } = parseHTML(`
    <div data-testid="conversation-turn-22">
      <div data-message-author-role="assistant">
        <div class="markdown">I will inspect the provided documents first.</div>
      </div>
      <div data-message-author-role="assistant">
        <div class="markdown">Final answer content after thinking mode.</div>
      </div>
    </div>
  `);

  const turn = testDoc.querySelector('[data-testid="conversation-turn-22"]');
  const message = parser.extractMessage(turn);

  assert.equal(message.role, 'ChatGPT');
  assert.equal(
    message.content,
    'I will inspect the provided documents first.\n\n' +
      'Final answer content after thinking mode.',
  );
});

test('ChatGPTParser correctly parses chat content from real HTML fixture', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/chatgpt-chat.html'), 'utf8');
  const { window: chatWindow, document: chatDocument } = parseHTML(html);

  // Backup global window/document context
  const oldWindow = global.window;
  const oldDocument = global.document;

  // Switch to the fixture context
  global.window = chatWindow;
  global.document = chatDocument;

  chatWindow.location = { href: 'https://chatgpt.com/c/123' };
  chatWindow.HTMLElement.prototype.scrollIntoView = function () {};

  try {
    const parser = new ChatGPTParser();
    const result = await parser.parse();

    assert.equal(result.title, 'ChatGPT Session');
    assert.equal(result.messages.length, 2);
    assert.equal(result.messages[0].role, 'User');
    assert.match(result.messages[0].content, /Please write a short response/);

    assert.equal(result.messages[1].role, 'ChatGPT');
    assert.match(result.messages[1].content, /Here is a short example response/);
    assert.match(result.messages[1].content, /defmodule Hello do/); // elixir code block
    assert.match(result.messages[1].content, /\| Country \| Median Monthly Wage/); // GFM table
    assert.equal(result.metadata.Method, 'DOM');
  } finally {
    // Restore original context
    global.window = oldWindow;
    global.document = oldDocument;
  }
});

test('ChatGPTParser correctly extracts image carousel images from assistant message turn', () => {
  const parser = new ChatGPTParser();

  const { window: testWin, document: testDoc } = parseHTML(`
    <article data-testid="conversation-turn-5">
      <div data-message-author-role="assistant">
        <div class="markdown prose">
          <div class="no-scrollbar flex overflow-auto">
            <div class="group/search-image">
              <button type="button" aria-label="Open image details for Bonobo social behavior">
                <div>
                  <img alt="https://images.openai.com/static-rsc-4/fullsize_bonobo.png?purpose=fullsize" src="https://images.openai.com/static-rsc-4/inline_bonobo.png?purpose=inline" />
                </div>
              </button>
            </div>
          </div>
          <p>Bonobos are often described as being peaceful.</p>
        </div>
      </div>
    </article>
  `);

  const oldWindow = global.window;
  const oldDocument = global.document;

  global.window = testWin;
  global.document = testDoc;

  try {
    const turn = testDoc.querySelector('article');
    const message = parser.extractMessage(turn);

    assert.equal(message.role, 'ChatGPT');
    assert.match(
      message.content,
      /!\[Bonobo social behavior\]\(https:\/\/images\.openai\.com\/static-rsc-4\/fullsize_bonobo\.png\?purpose=fullsize\)/,
    );
    assert.match(message.content, /Bonobos are often described as being peaceful\./);
  } finally {
    global.window = oldWindow;
    global.document = oldDocument;
  }
});

test('ChatGPTParser correctly extracts API image carousels from content_references', async () => {
  const puaMatch = '\uE200image_group\uE202{"layout":"carousel","query":["bonobo grooming"]}\uE201';
  const sampleMapping = {
    root: { id: 'root', children: ['msg1'] },
    msg1: {
      id: 'msg1',
      children: [],
      message: {
        author: { role: 'assistant' },
        content: { parts: [puaMatch + '\n\nBonobos are social primates.'] },
        metadata: {
          content_references: [
            {
              type: 'image_group',
              matched_text: puaMatch,
              images: [
                {
                  image_result: {
                    title: 'Bonobo Grooming Behavior',
                    content_url:
                      'https://images.openai.com/static-rsc-4/bonobo.jpg?purpose=fullsize',
                  },
                },
              ],
            },
          ],
        },
      },
    },
  };

  const parser = new ChatGPTParser();
  // Mock fetchConversation and token checks
  parser.lastFetch = {
    convId: 'test-123',
    includeImages: true,
    timestamp: Date.now(),
    result: { data: { mapping: sampleMapping, title: 'API Test' }, images: {} },
  };

  // We can pass options with fake token context by mocking or testing cleanMarkdownFromApi indirectly via parse
  // Simple test by invoking parse when lastFetch is set
  global.document = parseHTML(
    '<html><head></head><body><div id="client-bootstrap">{"session":{"accessToken":"fake"}}</div></body></html>',
  ).document;
  global.window = parseHTML('<div></div>').window;
  global.window.location = { pathname: '/c/test-123', href: 'https://chatgpt.com/c/test-123' };

  const result = await parser.parse({ parserMode: 'prefer_api' });

  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].role, 'ChatGPT');
  assert.match(
    result.messages[0].content,
    /!\[Bonobo Grooming Behavior\]\(https:\/\/images\.openai\.com\/static-rsc-4\/bonobo\.jpg\?purpose=fullsize\)/,
  );
  assert.match(result.messages[0].content, /Bonobos are social primates\./);
});

test('linearize selects active branch based on currentNodeId over longer branches', async () => {
  const { linearize } = await import('decant-core/ai/chatgpt');

  const mapping = {
    root: { id: 'root', parent: null, children: ['user1'] },
    user1: {
      id: 'user1',
      parent: 'root',
      children: ['assistant_v1', 'assistant_v2'],
      message: {
        author: { role: 'user' },
        content: { parts: ['Hello'] },
      },
    },
    // Branch 1 (longer branch with 2 assistant turns)
    assistant_v1: {
      id: 'assistant_v1',
      parent: 'user1',
      children: ['user2_v1'],
      message: {
        author: { role: 'assistant' },
        content: { parts: ['Response Version 1'] },
      },
    },
    user2_v1: {
      id: 'user2_v1',
      parent: 'assistant_v1',
      children: [],
      message: {
        author: { role: 'user' },
        content: { parts: ['Follow-up on V1'] },
      },
    },
    // Branch 2 (active branch chosen by user, shorter)
    assistant_v2: {
      id: 'assistant_v2',
      parent: 'user1',
      children: [],
      message: {
        author: { role: 'assistant' },
        content: { parts: ['Response Version 2 (Active)'] },
      },
    },
  };

  // When currentNodeId points to assistant_v2, linearize must return user1 -> assistant_v2
  const activeMessages = linearize(mapping, false, 'assistant_v2');
  assert.equal(activeMessages.length, 2);
  assert.equal(activeMessages[0].segments[0].content, 'Hello');
  assert.equal(activeMessages[1].segments[0].content, 'Response Version 2 (Active)');
});

test('linearize extracts o1/o3 reasoning thoughts and Deep Research reports', async () => {
  const { linearize } = await import('decant-core/ai/chatgpt');

  const mapping = {
    root: { id: 'root', parent: null, children: ['user1'] },
    user1: {
      id: 'user1',
      parent: 'root',
      children: ['assistant_reasoning'],
      message: {
        author: { role: 'user' },
        content: {
          content_type: 'multimodal_text',
          parts: [{ content_type: 'audio_transcription', text: 'Voice prompt question' }],
        },
        metadata: {
          attachments: [{ name: 'financial_report.pdf' }],
        },
      },
    },
    assistant_reasoning: {
      id: 'assistant_reasoning',
      parent: 'user1',
      children: ['assistant_deep_research'],
      message: {
        author: { role: 'assistant' },
        content: {
          content_type: 'thoughts',
          thoughts: [
            { summary: 'Step 1 Analysis', content: 'Inspecting user audio transcription' },
            { summary: 'Step 2 Verification', content: 'Checking attachment records' },
          ],
        },
      },
    },
    assistant_deep_research: {
      id: 'assistant_deep_research',
      parent: 'assistant_reasoning',
      children: [],
      message: {
        author: { role: 'assistant' },
        content: { parts: ['Final summarized answer.'] },
        metadata: {
          chatgpt_sdk: {
            widget_state: JSON.stringify({
              status: 'completed',
              report_message: {
                content: {
                  parts: ['# Comprehensive Deep Research Report\n\nAll findings detailed here.'],
                },
              },
            }),
          },
        },
      },
    },
  };

  const msgs = linearize(mapping, false, 'assistant_deep_research');
  assert.equal(msgs.length, 2); // User turn and assistant turn (thoughts merged into assistant)

  // User turn has audio transcription and attachment
  const userTurn = msgs[0];
  assert.equal(userTurn.role, 'User');
  assert.equal(userTurn.segments[0].content, 'Voice prompt question');
  assert.equal(userTurn.segments[1].content, '[Attached: financial_report.pdf]');

  // Assistant turn has thought steps, deep research report, and final message parts
  const assistantTurn = msgs[1];
  assert.equal(assistantTurn.role, 'ChatGPT');
  const thoughtSeg = assistantTurn.segments.find((s) => s.type === 'thought');
  assert.ok(thoughtSeg);
  assert.match(thoughtSeg.content, /Step 1 Analysis/);
  assert.match(thoughtSeg.content, /Step 2 Verification/);

  const textSegs = assistantTurn.segments.filter((s) => s.type === 'text');
  const allAssistantText = textSegs.map((s) => s.content).join('\n');
  assert.match(allAssistantText, /Comprehensive Deep Research Report/);
  assert.match(allAssistantText, /Final summarized answer\./);
});

test('extractSharedConversationFromDom extracts mapping from embedded SSR script tags', async () => {
  const { extractSharedConversationFromDom } = await import('decant-core/ai/chatgpt');

  const fakeHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <script type="application/json" id="__NEXT_DATA__">
          {
            "props": {
              "pageProps": {
                "serverResponse": {
                  "data": {
                    "title": "Shared Chat Title",
                    "current_node": "node2",
                    "mapping": {
                      "root": { "id": "root", "children": ["node1"] },
                      "node1": { "id": "node1", "parent": "root", "children": ["node2"], "message": { "author": { "role": "user" }, "content": { "parts": ["Shared user question"] } } },
                      "node2": { "id": "node2", "parent": "node1", "children": [], "message": { "author": { "role": "assistant" }, "content": { "parts": ["Shared assistant reply"] } } }
                    }
                  }
                }
              }
            }
          }
        </script>
      </head>
      <body></body>
    </html>
  `;

  const { document: sharedDoc } = parseHTML(fakeHtml);
  const convo = extractSharedConversationFromDom(sharedDoc);

  assert.ok(convo);
  assert.equal(convo.title, 'Shared Chat Title');
  assert.equal(convo.current_node, 'node2');
  assert.ok(convo.mapping.node1);
});

test('ChatGPTParser parses signed-out / anonymous session from real HTML fixture', async () => {
  const html = fs.readFileSync(
    path.join(__dirname, 'fixtures/chatgpt-anonymous-octane.html'),
    'utf8',
  );
  const { window: chatWindow, document: chatDocument } = parseHTML(html);

  const oldWindow = global.window;
  const oldDocument = global.document;

  global.window = chatWindow;
  global.document = chatDocument;

  chatWindow.location = { href: 'https://chatgpt.com/' };
  chatWindow.HTMLElement.prototype.scrollIntoView = function () {};

  try {
    const parser = new ChatGPTParser();
    const result = await parser.parse();

    assert.equal(result.messages.length, 10, 'Should extract all 10 turns');
    assert.equal(result.messages[0].role, 'User');
    assert.ok(result.messages[0].content.includes('Which of these has any potential'));
    assert.doesNotMatch(result.messages[0].content, /You said:/);

    assert.equal(result.messages[1].role, 'ChatGPT');
    assert.match(result.messages[1].content, /Decant/);
    assert.doesNotMatch(result.messages[1].content, /ChatGPT said:/);

    assert.equal(result.messages[2].role, 'User');
    assert.ok(result.messages[2].content.includes('decant-core'));
    assert.doesNotMatch(result.messages[2].content, /You said:/);

    assert.equal(result.messages[3].role, 'ChatGPT');
    assert.doesNotMatch(result.messages[3].content, /ChatGPT said:/);

    assert.equal(result.messages[4].role, 'User');
    assert.match(result.messages[4].content, /!\[.*?\]\(blob:https:\/\/chatgpt\.com\/.*?\)/);
    assert.ok(result.messages[4].content.includes('**Attachments & Images:**'));

    assert.equal(result.messages[9].role, 'ChatGPT');
    assert.doesNotMatch(result.messages[9].content, /ChatGPT said:/);
  } finally {
    global.window = oldWindow;
    global.document = oldDocument;
  }
});
