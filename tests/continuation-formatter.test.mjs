import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContinuationFormatter } from '../content/formatters/continuation.js';

test('ContinuationFormatter formats conversation with metadata and instructions', () => {
  const formatter = new ContinuationFormatter();
  const conversation = {
    title: 'Building a Node.js App',
    metadata: { Source: 'ChatGPT' },
    messages: [
      { role: 'User', content: 'How do I start an Express server?' },
      { role: 'Assistant', content: 'Use const app = express(); app.listen(3000);' },
    ],
  };

  const output = formatter.format(conversation, 'Explain error handling next.');

  assert.match(output, /previous conversation on ChatGPT/);
  assert.match(output, /Building a Node\.js App/);
  assert.match(output, /\[User\]: How do I start an Express server\?/);
  assert.match(output, /\[Assistant\]: Use const app = express\(\);/);
  assert.match(output, /Explain error handling next\./);
  assert.equal(formatter.getFileExtension(), 'txt');
  assert.equal(formatter.getMimeType(), 'text/plain');
});

test('ContinuationFormatter formats selected text with default template and instruction', () => {
  const formatter = new ContinuationFormatter();
  const selectedText = 'The quick brown fox jumps over the lazy dog.';
  const output = formatter.formatSelection(selectedText, {
    title: 'Pangram Article',
    source: 'example.com',
  });

  assert.match(output, /Here is an excerpt from Pangram Article \(example\.com\):/);
  assert.match(output, /The quick brown fox jumps over the lazy dog\./);
  assert.match(output, /--- Instruction ---/);
  assert.match(output, /Please explain or analyze the excerpt above\./);
});

test('ContinuationFormatter formats selected text with custom instruction and fallback source', () => {
  const formatter = new ContinuationFormatter();
  const output = formatter.formatSelection('Important code excerpt', {
    source: 'github.com',
    instruction: 'Translate this to Python.',
  });

  assert.match(output, /Here is an excerpt from Web Page \(github\.com\):/);
  assert.match(output, /Important code excerpt/);
  assert.match(output, /Translate this to Python\./);
});

test('ContinuationFormatter strips base64 data URIs from selected text', () => {
  const formatter = new ContinuationFormatter();
  const selectedWithImage =
    'Snippet with image: ![screenshot](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=) and more text.';
  const output = formatter.formatSelection(selectedWithImage, {
    title: 'Doc Page',
  });

  assert.ok(!output.includes('data:image/png;base64'));
  assert.match(output, /\[screenshot\]/);
  assert.match(output, /Snippet with image:/);
});

test('ContinuationFormatter supports custom selection template', () => {
  const formatter = new ContinuationFormatter();
  const customTemplate = 'EXCERPT: {history}\nSOURCE: {source}\nDO: {instruction}';
  const output = formatter.formatSelection('Hello world', {
    source: 'mysite.org',
    instruction: 'Summarize',
    template: customTemplate,
  });

  assert.equal(output, 'EXCERPT: Hello world\nSOURCE: mysite.org\nDO: Summarize');
});
