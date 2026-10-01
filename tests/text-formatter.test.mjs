import assert from 'node:assert/strict';
import test from 'node:test';
import { TextFormatter, markdownToPlainText } from '../content/formatters/text.js';

test('markdownToPlainText strips markdown formatting to clean plain text', () => {
  const md = `# Main Heading
## Sub Heading
This is **bold text** and *italic text* and ***both***.
Here is a [link to Google](https://google.com).
Inline \`const x = 10;\` code.

\`\`\`javascript
function add(a, b) {
  return a + b;
}
\`\`\`

> This is a blockquote.
> Second line of quote.

- Item 1
- Item 2
  - Subitem A

1. First
2. Second

| Header 1 | Header 2 |
| --- | --- |
| Cell 1 | Cell 2 |

---
~~strikethrough~~ text.
`;

  const plain = markdownToPlainText(md);

  assert.ok(!plain.includes('# Main Heading'));
  assert.ok(plain.includes('Main Heading'));
  assert.ok(!plain.includes('**bold text**'));
  assert.ok(plain.includes('bold text and italic text and both'));
  assert.ok(!plain.includes('[link to Google]'));
  assert.ok(plain.includes('link to Google (https://google.com)'));
  assert.ok(!plain.includes('```javascript'));
  assert.ok(plain.includes('function add(a, b)'));
  assert.ok(!plain.includes('> This is a blockquote'));
  assert.ok(plain.includes('This is a blockquote'));
  assert.ok(!plain.includes('~~strikethrough~~'));
  assert.ok(plain.includes('strikethrough text'));
  assert.ok(plain.includes('Item 1'));
  assert.ok(plain.includes('First'));
  assert.ok(plain.includes('Cell 1 | Cell 2'));
});

test('TextFormatter formats AI chat conversation with metadata and messages', () => {
  const formatter = new TextFormatter();

  const conversation = {
    title: 'Chat with Claude',
    messages: [
      { role: 'User', content: 'What is 2+2?' },
      { role: 'Assistant', content: '2+2 is **4**.' },
    ],
    metadata: {
      Source: 'Claude',
      Date: '10/1/2026 10:00:00',
      Link: 'https://claude.ai/chat/abc',
      Model: 'Claude 3.7 Sonnet',
      Method: 'DOM',
    },
  };

  const output = formatter.format(conversation);

  assert.ok(output.startsWith('Chat with Claude\n\n'));
  assert.ok(output.includes('Exported with: AI Chat Exporter (https://ace.covai.org)'));
  assert.ok(output.includes('Source: Claude'));
  assert.ok(output.includes('Date: 10/1/2026 10:00:00'));
  assert.ok(output.includes('Link: https://claude.ai/chat/abc'));
  assert.ok(output.includes('Model: Claude 3.7 Sonnet'));
  assert.ok(output.includes('Method: DOM'));
  assert.ok(output.includes('Prompt:'));
  assert.ok(output.includes('What is 2+2?'));
  assert.ok(output.includes('Response:'));
  assert.ok(output.includes('2+2 is 4.'));
});

test('TextFormatter omits attribution when includeAttribution is false', () => {
  const formatter = new TextFormatter();

  const conversation = {
    title: 'Private Export',
    messages: [{ role: 'User', content: 'Hello' }],
    metadata: {
      Source: 'ChatGPT',
      Date: '10/1/2026 10:00:00',
    },
  };

  const output = formatter.format(conversation, { includeAttribution: false });

  assert.ok(!output.includes('Exported with:'));
  assert.ok(output.includes('Source: ChatGPT'));
  assert.ok(output.includes('Hello'));
});

test('TextFormatter supports message numbering: per-message, per-turn, and off', () => {
  const formatter = new TextFormatter();

  const conversation = {
    title: 'Numbering Test',
    messages: [
      { role: 'User', content: 'Q1' },
      { role: 'Assistant', content: 'A1' },
      { role: 'User', content: 'Q2' },
      { role: 'Assistant', content: 'A2' },
    ],
    metadata: { Source: 'ChatGPT' },
  };

  const outputPerMessage = formatter.format(conversation, { messageNumbering: 'per-message' });
  assert.ok(outputPerMessage.includes('Prompt [1]:'));
  assert.ok(outputPerMessage.includes('Response [2]:'));
  assert.ok(outputPerMessage.includes('Prompt [3]:'));
  assert.ok(outputPerMessage.includes('Response [4]:'));

  const outputPerTurn = formatter.format(conversation, { messageNumbering: 'per-turn' });
  assert.ok(outputPerTurn.includes('Prompt [1]:'));
  assert.ok(outputPerTurn.includes('Response [1]:'));
  assert.ok(outputPerTurn.includes('Prompt [2]:'));
  assert.ok(outputPerTurn.includes('Response [2]:'));

  const outputOff = formatter.format(conversation, { messageNumbering: 'off' });
  assert.ok(outputOff.includes('Prompt:'));
  assert.ok(outputOff.includes('Response:'));
});

test('TextFormatter includes timestamps when enabled and present', () => {
  const formatter = new TextFormatter();

  const conversation = {
    title: 'Timestamp Test',
    messages: [
      { role: 'User', content: 'Hello', timestamp: '10:00 AM' },
      { role: 'Assistant', content: 'Hi', timestamp: '10:01 AM' },
    ],
    metadata: { Source: 'ChatGPT' },
  };

  const output = formatter.format(conversation, { includeTimestamps: true });
  assert.ok(output.includes('Prompt — 10:00 AM:'));
  assert.ok(output.includes('Response — 10:01 AM:'));
});

test('TextFormatter generates Table of Contents for AI chats and omits for articles', () => {
  const formatter = new TextFormatter();

  const chatConversation = {
    title: 'ToC Chat',
    messages: [
      { role: 'User', content: 'Explain quantum computing' },
      { role: 'Assistant', content: 'Quantum computing uses qubits...' },
    ],
    metadata: { Source: 'Claude' },
  };

  const chatOutput = formatter.format(chatConversation, { includeToc: true });
  assert.ok(chatOutput.includes('Table of Contents'));
  assert.ok(chatOutput.includes('User'));
  assert.ok(chatOutput.includes('Claude'));

  const articleConversation = {
    title: 'Sample Article',
    platform: 'WebArticle',
    messages: [
      { role: 'User', content: 'Saved web page' },
      { role: 'Assistant', content: 'Article body...' },
    ],
    metadata: { Source: 'WebArticle' },
  };

  const articleOutput = formatter.format(articleConversation, { includeToc: true });
  assert.ok(!articleOutput.includes('Table of Contents'));
});

test('TextFormatter replaces base64 encoded images with clean text placeholder', () => {
  const formatter = new TextFormatter();

  const conversation = {
    title: 'Image Test',
    messages: [
      {
        role: 'Assistant',
        content:
          'Check this out: ![Diagram](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=)',
      },
    ],
    metadata: { Source: 'ChatGPT' },
  };

  const output = formatter.format(conversation);
  assert.ok(!output.includes('data:image/png;base64'));
  assert.ok(output.includes('[Image: Diagram]'));
});

test('markdownToPlainText preserves tags inside inline code and literal formatting', () => {
  const input = 'Use `<div>**literal**</div>` and `List<T>` to configure.';
  const output = markdownToPlainText(input);
  assert.equal(output, 'Use <div>**literal**</div> and List<T> to configure.');
});

test('markdownToPlainText handles URLs with balanced and escaped parentheses', () => {
  const input =
    'See [Wiki Entry](https://en.wikipedia.org/wiki/Function_\\(mathematics\\)) for details.';
  const output = markdownToPlainText(input);
  assert.equal(
    output,
    'See Wiki Entry (https://en.wikipedia.org/wiki/Function_(mathematics)) for details.',
  );
});

test('markdownToPlainText handles bare base64 without eating subsequent prose', () => {
  const input =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=\n\nNext paragraph of prose.';
  const output = markdownToPlainText(input);
  assert.ok(output.includes('[Image Data]'));
  assert.ok(output.includes('Next paragraph of prose.'));
});

test('markdownToPlainText preserves CommonMark nested code blocks and indentation', () => {
  const input = `Explanation:

\`\`\`\`markdown
Here is an example with three backticks:
\`\`\`javascript
const marker = "\`\`\`";
\`\`\`
Done.
\`\`\`\`

Next section.`;

  const output = markdownToPlainText(input);
  assert.ok(output.includes('const marker = "```";'));
  assert.ok(output.includes('Next section.'));
});

test('TextFormatter recognizes decant rawArticle and skips chat headings', () => {
  const formatter = new TextFormatter();

  const articleConversation = {
    title: 'Decant Parsed Article',
    rawArticle: { content: 'Full text' },
    messages: [
      {
        role: 'Assistant',
        content: 'Article content from web page without prompt/response structure.',
      },
    ],
    metadata: { Source: 'New York Times' },
  };

  const output = formatter.format(articleConversation, { includeToc: true });
  assert.ok(!output.includes('Response:'));
  assert.ok(!output.includes('Prompt:'));
  assert.ok(!output.includes('Table of Contents'));
  assert.ok(output.includes('Article content from web page'));
});
