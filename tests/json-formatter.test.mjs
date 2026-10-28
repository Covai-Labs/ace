import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const schemaPath = path.resolve('schemas/export-v1.schema.json');

async function importFormatter() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-chat-exporter-'));
  await fs.mkdir(path.join(tempDir, 'content', 'formatters'), {
    recursive: true,
  });
  await fs.writeFile(path.join(tempDir, 'package.json'), '{"type":"module"}');
  await fs.copyFile(
    path.resolve('content/formatters/base.js'),
    path.join(tempDir, 'content', 'formatters', 'base.js'),
  );
  await fs.copyFile(
    path.resolve('content/formatters/json.js'),
    path.join(tempDir, 'content', 'formatters', 'json.js'),
  );

  return import(path.join(tempDir, 'content', 'formatters', 'json.js'));
}

test('export v1 schema defines the chat export contract', async () => {
  const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.$ref, '#/$defs/ChatExport');
  assert.equal(schema.$defs.ChatExport.additionalProperties, false);
  assert.deepEqual(schema.$defs.ChatExport.required, [
    '$schema',
    'schemaVersion',
    'exportedAt',
    'source',
    'messages',
    'metadata',
  ]);
  assert.deepEqual(schema.$defs.NormalizedRole.enum, [
    'user',
    'assistant',
    'system',
    'tool',
    'artifact',
    'unknown',
  ]);
});
test('JSON formatter emits normalized schema v1 exports', async () => {
  const { JsonFormatter } = await importFormatter();
  const formatter = new JsonFormatter({
    platform: 'ChatGPT',
    url: 'https://chatgpt.com/c/example',
    exportedAt: '2026-05-20T00:00:00.000Z',
  });

  const output = JSON.parse(
    formatter.format({
      title: 'Startup Runway Planning',
      messages: [
        { role: 'User', content: 'How much runway do we have?' },
        { role: 'ChatGPT', content: 'About 8 months.' },
        { role: 'Claude Artifact', content: 'Artifact body' },
      ],
      metadata: {
        Source: 'ChatGPT',
        Model: 'GPT',
        Method: 'API',
      },
    }),
  );

  assert.equal(output.$schema, './schemas/export-v1.schema.json');
  assert.equal(output.schemaVersion, 1);
  assert.equal(output.exportedAt, '2026-05-20T00:00:00.000Z');
  assert.deepEqual(output.source, {
    platform: 'ChatGPT',
    url: 'https://chatgpt.com/c/example',
    title: 'Startup Runway Planning',
  });
  assert.deepEqual(output.messages, [
    {
      index: 0,
      role: 'user',
      displayRole: 'User',
      content: 'How much runway do we have?',
    },
    {
      index: 1,
      role: 'assistant',
      displayRole: 'ChatGPT',
      content: 'About 8 months.',
    },
    {
      index: 2,
      role: 'artifact',
      displayRole: 'Claude Artifact',
      content: 'Artifact body',
    },
  ]);
  assert.deepEqual(output.metadata, {
    Source: 'ChatGPT',
    Model: 'GPT',
    Method: 'API',
  });
  assert.equal(formatter.getFileExtension(), 'json');
  assert.equal(formatter.getMimeType(), 'application/json');
});

test('JSON formatter respects includeTimestamps option', async () => {
  const { JsonFormatter } = await importFormatter();
  const formatter = new JsonFormatter({
    platform: 'ChatGPT',
    exportedAt: '2026-05-20T00:00:00.000Z',
  });

  const conversation = {
    title: 'Test Timestamps',
    messages: [
      { role: 'User', content: 'Hi', timestamp: '2026-09-30T08:48:07.000Z' },
      { role: 'ChatGPT', content: 'Hello', timestamp: 1710000000000 },
    ],
  };

  const defaultOutput = JSON.parse(formatter.format(conversation));
  assert.equal(defaultOutput.messages[0].timestamp, undefined);
  assert.equal(defaultOutput.messages[1].timestamp, undefined);

  const disabledOutput = JSON.parse(formatter.format(conversation, { includeTimestamps: false }));
  assert.equal(disabledOutput.messages[0].timestamp, undefined);
  assert.equal(disabledOutput.messages[1].timestamp, undefined);

  const enabledOutput = JSON.parse(formatter.format(conversation, { includeTimestamps: true }));
  assert.equal(enabledOutput.messages[0].timestamp, '2026-09-30T08:48:07.000Z');
  assert.equal(enabledOutput.messages[1].timestamp, '2024-03-09T16:00:00.000Z');
});
