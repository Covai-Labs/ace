import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyAttachmentOption } from '../content/utils/strip-attachments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('DeepSeekParser falls back to DOM parsing when API fetch fails or token is missing', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/deepseek-chat.html'), 'utf8');
  const { window, document, HTMLElement, Node, DOMParser } = parseHTML(html);

  // Expose browser globals
  global.window = window;
  global.document = document;
  global.HTMLElement = HTMLElement;
  global.Node = Node;
  global.DOMParser = DOMParser;
  global.localStorage = { getItem: () => null };
  global.fetch = async () => ({ ok: false, status: 401 });

  const { DeepSeekParser } = await import('decant-core');
  const parser = new DeepSeekParser();

  const result = await parser.parse();
  assert.equal(result.title, 'DeepSeek Chat');
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].role, 'User');
  assert.match(result.messages[0].content, /Please write a short response/);
  assert.equal(result.messages[1].role, 'DeepSeek');
  assert.match(result.messages[1].content, /curiosity.*remarkable.*deadrat\.in/);
  assert.equal(result.metadata.Method, 'DOM');
});

test('DeepSeekParser extracts conversation via API when token and session ID are present', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/deepseek-chat.html'), 'utf8');
  const { window, document, HTMLElement, Node, DOMParser } = parseHTML(html);

  global.window = window;
  global.document = document;
  global.HTMLElement = HTMLElement;
  global.Node = Node;
  global.DOMParser = DOMParser;

  window.location = {
    href: 'https://chat.deepseek.com/a/chat/s/12345678-abcd-1234-abcd-1234567890ab',
    pathname: '/a/chat/s/12345678-abcd-1234-abcd-1234567890ab',
  };

  global.localStorage = {
    getItem: (key) => (key === 'userToken' ? JSON.stringify({ value: 'mock-bearer-token' }) : null),
  };

  global.fetch = async (url, options) => {
    assert.match(url, /chat_session_id=12345678-abcd-1234-abcd-1234567890ab/);
    assert.equal(options.headers.Authorization, 'Bearer mock-bearer-token');
    return {
      ok: true,
      json: async () => ({
        data: {
          biz_data: {
            chat_session: { current_message_id: 2 },
            chat_messages: [
              { message_id: 1, parent_id: null, role: 'USER', content: 'What is DeepSeek?' },
              {
                message_id: 2,
                parent_id: 1,
                role: 'ASSISTANT',
                content: 'DeepSeek is an AI assistant.',
              },
            ],
          },
        },
      }),
    };
  };

  const { DeepSeekParser } = await import('decant-core');
  const parser = new DeepSeekParser();

  const result = await parser.parse();
  assert.equal(result.title, 'DeepSeek Chat');
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].role, 'User');
  assert.equal(result.messages[0].content, 'What is DeepSeek?');
  assert.equal(result.messages[1].role, 'DeepSeek');
  assert.equal(result.messages[1].content, 'DeepSeek is an AI assistant.');
  assert.equal(result.metadata.Method, 'API');
});

test('DeepSeekParser extracts attachment content and works with applyAttachmentOption', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/deepseek-chat.html'), 'utf8');
  const { window, document, HTMLElement, Node, DOMParser } = parseHTML(html);

  global.window = window;
  global.document = document;
  global.HTMLElement = HTMLElement;
  global.Node = Node;
  global.DOMParser = DOMParser;

  window.location = {
    href: 'https://chat.deepseek.com/a/chat/s/12345678-abcd-1234-abcd-1234567890ab',
    pathname: '/a/chat/s/12345678-abcd-1234-abcd-1234567890ab',
  };

  global.localStorage = {
    getItem: (key) => (key === 'userToken' ? JSON.stringify({ value: 'mock-bearer-token' }) : null),
  };

  const filePayload =
    '# Exploring Ilaiyaraaja\x27s How to Name It?\n\nExported with AI Chat Exporter';

  global.fetch = async (url) => {
    if (url.includes('/chat/history_messages')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            biz_data: {
              chat_session: { current_message_id: 2 },
              chat_messages: [
                {
                  message_id: 1,
                  parent_id: null,
                  role: 'USER',
                  fragments: [
                    {
                      id: 1,
                      type: 'FILE',
                      files: [
                        {
                          id: 'file-123',
                          file_name: '# Exploring Ilaiyaraaja\x27s How to Name It.txt',
                          file_size: 9247,
                          signed_path: '/file?file_id=123&state=xyz',
                          is_image: false,
                        },
                      ],
                    },
                    {
                      id: 2,
                      type: 'REQUEST',
                      content: 'Your thought on pasted content. ?',
                    },
                  ],
                },
                {
                  message_id: 2,
                  parent_id: 1,
                  role: 'ASSISTANT',
                  fragments: [
                    {
                      id: 1,
                      type: 'RESPONSE',
                      content: 'It is a thoughtful discussion.',
                    },
                  ],
                },
              ],
            },
          },
        }),
      };
    }
    if (url.includes('files.deepseeksvc.com/api/file')) {
      return {
        ok: true,
        text: async () => filePayload,
      };
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const { DeepSeekParser } = await import('decant-core');
  const parser = new DeepSeekParser();

  const result = await parser.parse();
  assert.equal(result.messages.length, 2);
  const userMsg = result.messages[0];
  assert.equal(userMsg.role, 'User');
  assert.ok(userMsg.content.includes('Your thought on pasted content. ?'));
  assert.ok(
    userMsg.content.includes(
      '### Attachment: # Exploring Ilaiyaraaja\x27s How to Name It.txt _(9.0 KB)_',
    ),
  );
  assert.ok(userMsg.content.includes('Exported with AI Chat Exporter'));

  // Test applyAttachmentOption with includeAttachments: true
  const on = applyAttachmentOption(userMsg, { includeAttachments: true });
  assert.ok(on.includes('Your thought on pasted content. ?'));
  assert.ok(on.includes('### File: # Exploring Ilaiyaraaja\x27s How to Name It.txt · 9.0 KB'));
  assert.ok(on.includes('Exported with AI Chat Exporter'));
  assert.ok(on.includes('# Exploring Ilaiyaraaja\x27s How to Name It?'));

  // Test applyAttachmentOption with includeAttachments: false
  const off = applyAttachmentOption(userMsg, { includeAttachments: false });
  assert.ok(off.includes('Your thought on pasted content. ?'));
  assert.ok(off.includes('***[File: # Exploring Ilaiyaraaja\x27s How to Name It.txt · 9.0 KB]***'));
  assert.ok(!off.includes('Exported with AI Chat Exporter'));
  assert.ok(!off.includes('# Exploring Ilaiyaraaja\x27s How to Name It?'));
});
