import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import {
  DeepSeekParser,
  extractDeepSeekMessageContent,
  formatFileSize,
  formatDeepSeekFileAttachment,
  buildDeepSeekFileUrl,
} from '../ai/deepseek.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_ID = '7fed8292-d7a0-49f0-b7e9-c2c0da396b59';
const PAGE_URL = `https://chat.deepseek.com/a/chat/s/${SESSION_ID}`;

function setupDom(fixtureFile, url) {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', fixtureFile), 'utf-8');
  const dom = parseHTML(html);
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = { href: url };
}

test('DeepSeekParser isAvailable matches chat.deepseek.com URLs', () => {
  const parser = new DeepSeekParser();
  assert.equal(parser.isAvailable(PAGE_URL), true);
  assert.equal(parser.isAvailable('https://claude.ai/chat/123'), false);
});

test('extractDeepSeekMessageContent reads REQUEST/RESPONSE fragments', () => {
  const data = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'deepseek-api-response.json'), 'utf-8'),
  );
  const messages = data.data.biz_data.chat_messages;
  assert.equal(messages.length, 16);
  const user = messages.find((m) => m.role === 'USER');
  const assistant = messages.find((m) => m.role === 'ASSISTANT');
  const userText = extractDeepSeekMessageContent(user);
  assert.ok(userText.includes('species that went extinct'));
  // THINK/TOOL_* fragments must not leak into the answer.
  const answerText = extractDeepSeekMessageContent(assistant);
  assert.ok(answerText.includes('extinction'));
  assert.ok(!answerText.includes('Found 16 web pages'));
  // Legacy top-level shape still works.
  assert.equal(extractDeepSeekMessageContent({ role: 'USER', content: '  hi  ' }), 'hi');
  assert.equal(extractDeepSeekMessageContent(null), '');
});

test('DeepSeekParser DOM extracts 16 turns, thinking blocks standardized', async () => {
  setupDom('deepseek-chat.html', PAGE_URL);
  globalThis.localStorage = { getItem: () => null };
  const result = await new DeepSeekParser().parse({ parserMode: 'prefer_dom' });
  // DOM snapshot holds the same 8-turn conversation as the API fixture.
  assert.equal(result.metadata.Method, 'DOM');
  assert.equal(result.messages.length, 16);
  result.messages.forEach((m, i) => {
    assert.equal(m.role, i % 2 === 0 ? 'User' : 'DeepSeek');
  });
  assert.ok(result.messages[0].content.includes('species that went extinct'));
  assert.equal(result.messages[0].thinking, undefined);
  assert.ok(!result.messages[0].content.includes('<think>'));
  assert.equal(result.messages[13].role, 'DeepSeek');
  assert.ok(result.messages[13].thinking);
  assert.ok(result.messages[13].content.includes('<think>'));
  assert.ok(result.messages[13].content.includes('</think>'));
});

test('DeepSeekParser API path follows current_message_id branch (mocked)', async () => {
  setupDom('deepseek-chat.html', PAGE_URL);
  const data = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'deepseek-api-response.json'), 'utf-8'),
  );
  globalThis.localStorage = { getItem: () => JSON.stringify({ value: 'tok' }) };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.ok(url.includes(`/chat/history_messages?chat_session_id=${SESSION_ID}`));
    return { ok: true, json: async () => data };
  };
  try {
    const result = await new DeepSeekParser().parse();
    assert.equal(result.metadata.Method, 'API');
    assert.equal(result.messages.length, 16);
    assert.equal(result.messages[0].role, 'User');
    assert.ok(result.messages[0].content.includes('species that went extinct'));
    assert.equal(result.messages[0].thinking, undefined);
    assert.equal(result.messages[1].role, 'DeepSeek');
    assert.ok(result.messages[13].thinking);
    assert.ok(result.messages[13].content.includes('<think>'));
    assert.ok(result.messages[13].content.includes('</think>'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('DeepSeekParser DOM fallback selector extracts thinking without mutating live DOM', async () => {
  const dom = parseHTML(`
    <html>
      <head><title>Fallback Chat</title></head>
      <body>
        <div class="ds-message-row ds-user-message"><p>Hello DeepSeek</p></div>
        <div class="ds-message-row">
          <div class="ds-think-content"><p>Thinking about greeting</p></div>
          <p>Hello human!</p>
        </div>
      </body>
    </html>
  `);
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = { href: PAGE_URL };
  globalThis.localStorage = { getItem: () => null };

  const parser = new DeepSeekParser();
  const result1 = await parser.parse({ parserMode: 'prefer_dom' });
  assert.equal(result1.messages.length, 2);
  assert.equal(result1.messages[1].role, 'DeepSeek');
  assert.equal(result1.messages[1].thinking, 'Thinking about greeting');
  assert.ok(result1.messages[1].content.includes('<think>\nThinking about greeting\n</think>'));
  assert.ok(result1.messages[1].content.includes('Hello human!'));

  // Verify DOM was not mutated: .ds-think-content still exists in document
  const thinkNodes = globalThis.document.querySelectorAll('.ds-think-content');
  assert.equal(thinkNodes.length, 1);

  // A second parse extracts identical thinking
  const result2 = await parser.parse({ parserMode: 'prefer_dom' });
  assert.equal(result2.messages[1].thinking, 'Thinking about greeting');
});

test('formatFileSize formats bytes, KB, and MB accurately', () => {
  assert.equal(formatFileSize(0), '0 B');
  assert.equal(formatFileSize(500), '500 B');
  assert.equal(formatFileSize(1024), '1.0 KB');
  assert.equal(formatFileSize(9247), '9.0 KB');
  assert.equal(formatFileSize(1048576), '1.0 MB');
  assert.equal(formatFileSize(-1), '');
  assert.equal(formatFileSize(NaN), '');
});

test('buildDeepSeekFileUrl normalizes relative and absolute URLs with ty parameter', () => {
  assert.equal(buildDeepSeekFileUrl(''), '');
  assert.equal(
    buildDeepSeekFileUrl('/file?file_id=123', 'p'),
    'https://files.deepseeksvc.com/api/file?file_id=123&ty=p',
  );
  assert.equal(
    buildDeepSeekFileUrl('/file?file_id=123&ty=r', 'p'),
    'https://files.deepseeksvc.com/api/file?file_id=123&ty=r',
  );
  assert.equal(
    buildDeepSeekFileUrl('https://files.deepseeksvc.com/api/file?file_id=123', 'r'),
    'https://files.deepseeksvc.com/api/file?file_id=123&ty=r',
  );
});

test('formatDeepSeekFileAttachment formats image and text attachment cards', () => {
  const imgFile = {
    file_name: 'diagram [final].png',
    is_image: true,
    file_size: 2048,
    signed_path: '/file?file_id=img1&state=abc',
  };
  const imgOutput = formatDeepSeekFileAttachment(imgFile);
  assert.ok(imgOutput.includes('**Attachment: diagram \\[final\\].png**'));
  assert.ok(
    imgOutput.includes(
      '![diagram \\[final\\].png](https://files.deepseeksvc.com/api/file?file_id=img1&state=abc&ty=p)',
    ),
  );

  const txtFileWithContent = {
    file_name: 'notes.txt',
    is_image: false,
    file_size: 1024,
    extracted_content: 'Hello world!',
  };
  const txtOutput = formatDeepSeekFileAttachment(txtFileWithContent);
  assert.ok(txtOutput.includes('### Attachment: notes.txt _(1.0 KB)_'));
  assert.ok(txtOutput.includes('````\nHello world!\n````'));

  const docFallback = {
    file_name: 'spec [v1].pdf',
    is_image: false,
    file_size: 2048,
    signed_path: '/file?file_id=doc1&state=def',
  };
  const docOutput = formatDeepSeekFileAttachment(docFallback);
  assert.ok(
    docOutput.includes(
      '**Attachment: [spec \\[v1\\].pdf](https://files.deepseeksvc.com/api/file?file_id=doc1&state=def&ty=r)** _(document · 2.0 KB)_',
    ),
  );
});

test('extractDeepSeekMessageContent orders prompt before attachments', () => {
  const msg = {
    role: 'USER',
    fragments: [
      {
        type: 'FILE',
        files: [
          {
            file_name: 'data.txt',
            file_size: 1024,
            is_image: false,
            extracted_content: 'sample file content',
          },
        ],
      },
      {
        type: 'REQUEST',
        content: 'What do you think of this data?',
      },
    ],
  };

  const output = extractDeepSeekMessageContent(msg);
  assert.ok(output.startsWith('What do you think of this data?'));
  assert.ok(output.includes('### Attachment: data.txt _(1.0 KB)_'));
  assert.ok(output.includes('````\nsample file content\n````'));
  assert.ok(output.indexOf('What do you think') < output.indexOf('### Attachment: data.txt'));
});

test('DeepSeekParser API path downloads and inlines text attachments', async () => {
  const attachmentData = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, 'fixtures', 'deepseek-attachment-api-response.json'),
      'utf-8',
    ),
  );
  const fileContent = fs.readFileSync(
    path.join(__dirname, 'fixtures', 'deepseek-attachment-file.txt'),
    'utf-8',
  );

  const sessionId = '0b638a82-c91f-43c7-8a8a-67cf93e94799';
  const url = `https://chat.deepseek.com/a/chat/s/${sessionId}`;
  setupDom('deepseek-chat.html', url);
  globalThis.localStorage = {
    getItem: () => JSON.stringify({ value: 'test-token' }),
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (fetchUrl) => {
    if (fetchUrl.includes('/chat/history_messages')) {
      return { ok: true, json: async () => attachmentData };
    }
    if (fetchUrl.includes('files.deepseeksvc.com/api/file')) {
      return { ok: true, text: async () => fileContent };
    }
    throw new Error(`Unexpected fetch URL: ${fetchUrl}`);
  };

  try {
    const parser = new DeepSeekParser();
    const result = await parser.parse();
    assert.equal(result.metadata.Method, 'API');
    assert.equal(result.messages.length, 10);

    // Message 5 (index 4) has the file attachment
    const userMsgWithFile = result.messages[4];
    assert.equal(userMsgWithFile.role, 'User');
    assert.ok(userMsgWithFile.content.includes('Your thought on pasted content. ?'));
    assert.ok(
      userMsgWithFile.content.includes(
        "### Attachment: # Exploring Ilaiyaraaja's How to Name It.txt _(9.0 KB)_",
      ),
    );
    assert.ok(userMsgWithFile.content.includes('How to Name It?'));
    assert.ok(userMsgWithFile.content.includes('An absolute masterpiece.'));
    // Ensure prompt comes before the attachment block
    assert.ok(
      userMsgWithFile.content.indexOf('Your thought on pasted content') <
        userMsgWithFile.content.indexOf(
          "### Attachment: # Exploring Ilaiyaraaja's How to Name It.txt",
        ),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('DeepSeekParser API path degrades gracefully if file download fails', async () => {
  const attachmentData = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, 'fixtures', 'deepseek-attachment-api-response.json'),
      'utf-8',
    ),
  );

  const sessionId = '0b638a82-c91f-43c7-8a8a-67cf93e94799';
  const url = `https://chat.deepseek.com/a/chat/s/${sessionId}`;
  setupDom('deepseek-chat.html', url);
  globalThis.localStorage = {
    getItem: () => JSON.stringify({ value: 'test-token' }),
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (fetchUrl) => {
    if (fetchUrl.includes('/chat/history_messages')) {
      return { ok: true, json: async () => attachmentData };
    }
    if (fetchUrl.includes('files.deepseeksvc.com/api/file')) {
      return { ok: false, status: 500 };
    }
    throw new Error(`Unexpected fetch URL: ${fetchUrl}`);
  };

  try {
    const parser = new DeepSeekParser();
    const result = await parser.parse();
    assert.equal(result.metadata.Method, 'API');
    assert.equal(result.messages.length, 10);

    const userMsgWithFile = result.messages[4];
    assert.equal(userMsgWithFile.role, 'User');
    assert.ok(userMsgWithFile.content.includes('Your thought on pasted content. ?'));
    // Degrades to document link card instead of crashing
    assert.ok(
      userMsgWithFile.content.includes(
        "**Attachment: [# Exploring Ilaiyaraaja's How to Name It.txt]",
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('DeepSeekParser API path skips downloading binary files as text', async () => {
  const binaryAttachmentData = {
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
                    id: 'pdf-123',
                    file_name: 'document.pdf',
                    file_size: 50000,
                    signed_path: '/file?file_id=pdf123',
                    is_image: false,
                  },
                ],
              },
              {
                id: 2,
                type: 'REQUEST',
                content: 'Summarize this PDF.',
              },
            ],
          },
          {
            message_id: 2,
            parent_id: 1,
            role: 'ASSISTANT',
            fragments: [
              {
                id: 3,
                type: 'RESPONSE',
                content: 'PDF summary.',
              },
            ],
          },
        ],
      },
    },
  };

  const sessionId = '0b638a82-c91f-43c7-8a8a-67cf93e94799';
  const url = `https://chat.deepseek.com/a/chat/s/${sessionId}`;
  setupDom('deepseek-chat.html', url);
  globalThis.localStorage = {
    getItem: () => JSON.stringify({ value: 'test-token' }),
  };

  let fileFetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (fetchUrl) => {
    if (fetchUrl.includes('/chat/history_messages')) {
      return { ok: true, json: async () => binaryAttachmentData };
    }
    if (fetchUrl.includes('files.deepseeksvc.com/api/file')) {
      fileFetchCalled = true;
      return { ok: true, text: async () => '%PDF-1.4 raw binary' };
    }
    throw new Error(`Unexpected fetch URL: ${fetchUrl}`);
  };

  try {
    const parser = new DeepSeekParser();
    const result = await parser.parse();
    assert.equal(fileFetchCalled, false, 'Should not attempt to fetch binary file as text');
    const userMsg = result.messages[0];
    assert.ok(
      userMsg.content.includes(
        '**Attachment: [document.pdf](https://files.deepseeksvc.com/api/file?file_id=pdf123&ty=r)** _(document · 48.8 KB)_',
      ),
    );
    assert.ok(!userMsg.content.includes('%PDF-1.4'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
