import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

async function importFormatter() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-chat-exporter-doc-'));
  await fs.mkdir(path.join(tempDir, 'content', 'formatters'), { recursive: true });
  await fs.mkdir(path.join(tempDir, 'content', 'utils'), { recursive: true });
  await fs.mkdir(path.join(tempDir, 'content', 'lib'), { recursive: true });
  await fs.writeFile(path.join(tempDir, 'package.json'), '{"type":"module"}');
  await fs.copyFile(
    path.resolve('content/formatters/base.js'),
    path.join(tempDir, 'content', 'formatters', 'base.js'),
  );
  await fs.copyFile(
    path.resolve('content/utils/sanitizer.js'),
    path.join(tempDir, 'content', 'utils', 'sanitizer.js'),
  );
  await fs.copyFile(
    path.resolve('content/lib/purify.es.js'),
    path.join(tempDir, 'content', 'lib', 'purify.es.js'),
  );
  await fs.copyFile(
    path.resolve('content/lib/assets.js'),
    path.join(tempDir, 'content', 'lib', 'assets.js'),
  );
  await fs.copyFile(
    path.resolve('content/formatters/html.js'),
    path.join(tempDir, 'content', 'formatters', 'html.js'),
  );
  await fs.copyFile(
    path.resolve('content/formatters/doc.js'),
    path.join(tempDir, 'content', 'formatters', 'doc.js'),
  );

  return import(path.join(tempDir, 'content', 'formatters', 'doc.js'));
}

test('DocFormatter returns correct file extension (.doc) and MIME type (application/msword)', async () => {
  const { DocFormatter } = await importFormatter();
  const formatter = new DocFormatter();

  assert.equal(formatter.getFileExtension(), 'doc');
  assert.equal(formatter.getMimeType(), 'application/msword');
});

test('DocFormatter omits AI Chat Exporter credit when includeAttribution is false', async () => {
  const { DocFormatter } = await importFormatter();
  const formatter = new DocFormatter();

  const conversation = {
    title: 'No Credit Test',
    messages: [{ role: 'User', content: 'Hello' }],
    metadata: { Source: 'Claude' },
  };

  const withCredit = formatter.format(conversation);
  assert.ok(withCredit.includes('https://ace.covai.org'));

  const withoutCredit = formatter.format(conversation, { includeAttribution: false });
  assert.ok(!withoutCredit.includes('https://ace.covai.org'));
  assert.ok(withoutCredit.includes('Exported from Claude'));
});

test('DocFormatter generates Word-compliant HTML document with MSO XML headers', async () => {
  const { DocFormatter } = await importFormatter();
  const formatter = new DocFormatter();

  const conversation = {
    title: 'Word Export Test',
    messages: [
      {
        role: 'User',
        content: 'Explain **Gravity** in python:\n\n```python\nprint("Gravity")\n```',
      },
      {
        role: 'Assistant',
        content:
          'Gravity is a fundamental force:\n\n| Force | Formula |\n|---|---|\n| Gravity | F = G(m1m2)/r^2 |\n\n> Quote about physics.',
      },
    ],
    metadata: {
      Source: 'ChatGPT',
      Method: 'DOM',
    },
  };

  const output = formatter.format(conversation);

  assert.ok(output.includes("xmlns:w='urn:schemas-microsoft-com:office:word'"));
  assert.ok(output.includes('application/msword') || output.includes('<w:WordDocument>'));
  assert.ok(output.includes('<title>Word Export Test</title>'));
  assert.ok(output.includes('Exported from ChatGPT'));
  assert.ok(output.includes('Method: DOM'));
  assert.ok(output.includes('<strong>Gravity</strong>'));
  assert.ok(output.includes('<pre><code class="language-python">'));
  assert.ok(output.includes('<table>'));
  assert.ok(output.includes('<blockquote>'));
  assert.ok(output.includes('.copy-code-btn'));
  assert.ok(output.includes('display: none !important'));
  assert.ok(output.includes('.code-card'));
  assert.ok(output.includes('.thinking-block'));
  assert.equal(output.includes('<button'), false);
  assert.equal(output.includes('<svg'), false);
});
