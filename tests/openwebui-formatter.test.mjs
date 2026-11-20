import assert from 'node:assert/strict';
import test from 'node:test';

import { OpenWebUIFormatter } from '../content/formatters/openwebui.js';

function sequentialIds() {
  let next = 0;
  return () => `id-${++next}`;
}

test('Open-WebUI formatter emits a linear message tree', () => {
  const formatter = new OpenWebUIFormatter({ generateId: sequentialIds() });

  const output = JSON.parse(
    formatter.format(
      {
        title: 'Self-hosting notes',
        messages: [
          {
            role: 'User',
            content: 'How do I import this?',
            timestamp: '2026-11-15T10:00:00.000Z',
          },
          {
            role: 'ChatGPT',
            content: 'Use Data Controls → Import Chats.',
            timestamp: '2026-11-15T10:00:05.000Z',
          },
          {
            role: 'Claude Artifact',
            content: 'Artifact body',
            timestamp: 1763200810000,
          },
          {
            role: 'System',
            content: 'Keep this system note.',
          },
        ],
        metadata: {
          Source: 'ChatGPT',
          Model: 'gpt-5',
        },
      },
      { includeTimestamps: true },
    ),
  );

  assert.equal(output.length, 1);
  const entry = output[0];
  assert.equal(entry.chat.title, 'Self-hosting notes');
  assert.deepEqual(entry.chat.models, ['ChatGPT']);
  assert.equal(entry.chat.history.currentId, 'id-4');
  assert.deepEqual(entry.meta, { tags: ['imported-chatgpt'] });
  assert.equal(entry.pinned, false);
  assert.equal(entry.folder_id, null);

  // User messages must NOT carry done: true (matches official Open-WebUI schema)
  assert.deepEqual(entry.chat.history.messages['id-1'], {
    id: 'id-1',
    parentId: null,
    childrenIds: ['id-2'],
    role: 'user',
    content: 'How do I import this?',
    timestamp: Math.floor(Date.parse('2026-11-15T10:00:00.000Z') / 1000),
  });
  assert.equal(entry.chat.history.messages['id-2'].parentId, 'id-1');
  assert.deepEqual(entry.chat.history.messages['id-2'].childrenIds, ['id-3']);
  assert.equal(entry.chat.history.messages['id-2'].role, 'assistant');
  assert.equal(entry.chat.history.messages['id-2'].done, true);
  assert.equal(entry.chat.history.messages['id-2'].model, 'gpt-5');
  assert.equal(entry.chat.history.messages['id-3'].role, 'assistant');
  assert.equal(entry.chat.history.messages['id-3'].done, true);
  assert.equal(entry.chat.history.messages['id-4'].role, 'assistant');
  assert.equal(entry.chat.history.messages['id-4'].done, true);
  assert.equal(entry.chat.history.messages['id-4'].content, 'Keep this system note.');
  assert.deepEqual(entry.chat.history.messages['id-4'].childrenIds, []);
  assert.equal(entry.chat.history.messages['id-4'].timestamp, undefined);

  const timestamps = [
    Date.parse('2026-11-15T10:00:00.000Z'),
    Date.parse('2026-11-15T10:00:05.000Z'),
    1763200810000,
  ].map((value) => Math.floor(value / 1000));
  assert.equal(entry.created_at, Math.min(...timestamps));
  assert.equal(entry.updated_at, Math.max(...timestamps));

  assert.equal(formatter.getFileExtension(), 'json');
  assert.equal(formatter.getMimeType(), 'application/json');
});

test('Open-WebUI formatter falls back to platform metadata', () => {
  const formatter = new OpenWebUIFormatter({
    platform: 'Gemini',
    generateId: sequentialIds(),
  });

  const [entry] = JSON.parse(
    formatter.format({
      messages: [
        { role: 'User', content: 'Hi' },
        { role: 'Model', content: 'Hello' },
      ],
    }),
  );

  assert.equal(entry.chat.title, 'AI Chat Export');
  assert.deepEqual(entry.chat.models, ['Gemini']);
  assert.equal(entry.chat.history.messages['id-2'].model, 'Gemini');
  assert.deepEqual(entry.meta.tags, ['imported-gemini']);
  assert.equal(entry.pinned, false);
  assert.equal(entry.folder_id, null);
  assert.equal(entry.created_at, null);
  assert.equal(entry.updated_at, null);
});

test('Open-WebUI formatter includes timestamps when opt-in is enabled', () => {
  const formatter = new OpenWebUIFormatter({ platform: 'Claude', generateId: sequentialIds() });
  const conversation = {
    messages: [
      { role: 'User', content: 'Hi', timestamp: '2026-09-30T08:48:07.000Z' },
      { role: 'Claude', content: 'Hello', timestamp: 'not a date' },
    ],
  };

  const [entry] = JSON.parse(formatter.format(conversation, { includeTimestamps: true }));
  assert.equal(
    entry.chat.history.messages['id-1'].timestamp,
    Math.floor(Date.parse('2026-09-30T08:48:07.000Z') / 1000),
  );
  assert.equal(entry.chat.history.messages['id-2'].timestamp, undefined);
  assert.equal(entry.created_at, Math.floor(Date.parse('2026-09-30T08:48:07.000Z') / 1000));
  assert.equal(entry.updated_at, Math.floor(Date.parse('2026-09-30T08:48:07.000Z') / 1000));
});

test('Open-WebUI formatter omits timestamps by default', () => {
  const formatter = new OpenWebUIFormatter({ platform: 'Claude', generateId: sequentialIds() });
  const conversation = {
    messages: [
      { role: 'User', content: 'Hi', timestamp: '2026-09-30T08:48:07.000Z' },
      { role: 'Claude', content: 'Hello', timestamp: '2026-09-30T08:48:10.000Z' },
    ],
  };

  const [entry] = JSON.parse(formatter.format(conversation));
  assert.equal(entry.chat.history.messages['id-1'].timestamp, undefined);
  assert.equal(entry.chat.history.messages['id-2'].timestamp, undefined);
  assert.equal(entry.created_at, null);
  assert.equal(entry.updated_at, null);
});

test('Open-WebUI formatter parses non-en-US locale timestamps', () => {
  const formatter = new OpenWebUIFormatter({ platform: 'ChatGPT', generateId: sequentialIds() });
  const [entry] = JSON.parse(
    formatter.format(
      {
        messages: [
          { role: 'User', content: 'Hallo', timestamp: '15.11.2026, 10:00:00' },
          { role: 'ChatGPT', content: 'Hi', timestamp: '15/11/2026, 10:00:05' },
        ],
      },
      { includeTimestamps: true },
    ),
  );

  const expected = Math.floor(new Date(2026, 10, 15, 10, 0, 0).getTime() / 1000);
  assert.equal(entry.chat.history.messages['id-1'].timestamp, expected);
  assert.equal(entry.chat.history.messages['id-2'].timestamp, expected + 5);
  assert.equal(entry.created_at, expected);
  assert.equal(entry.updated_at, expected + 5);
});

test('Open-WebUI formatter handles conversations without messages', () => {
  const formatter = new OpenWebUIFormatter({ platform: 'Mistral' });

  const [entry] = JSON.parse(formatter.format({ title: 'Empty' }));

  assert.equal(entry.chat.title, 'Empty');
  assert.deepEqual(entry.chat.models, ['Mistral']);
  assert.equal(entry.chat.history.currentId, '');
  assert.deepEqual(entry.chat.history.messages, {});
  assert.equal(entry.pinned, false);
  assert.equal(entry.folder_id, null);
  assert.equal(entry.created_at, null);
  assert.equal(entry.updated_at, null);
});

test('Open-WebUI formatter maps tool-role messages to assistant', () => {
  const formatter = new OpenWebUIFormatter({ platform: 'ChatGPT', generateId: sequentialIds() });

  const [entry] = JSON.parse(
    formatter.format({
      messages: [
        { role: 'User', content: 'Run this tool' },
        { role: 'Tool Result', content: 'Tool output here' },
        { role: 'ChatGPT', content: 'Done.' },
      ],
    }),
  );

  // All non-user roles must map to 'assistant' — including 'tool'
  assert.equal(entry.chat.history.messages['id-1'].role, 'user');
  assert.equal(entry.chat.history.messages['id-2'].role, 'assistant');
  assert.equal(entry.chat.history.messages['id-2'].done, true);
  assert.equal(entry.chat.history.messages['id-3'].role, 'assistant');
  assert.equal(entry.chat.history.messages['id-3'].done, true);
  // User messages must not carry done
  assert.equal(entry.chat.history.messages['id-1'].done, undefined);
});
