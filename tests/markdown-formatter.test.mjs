import assert from 'node:assert/strict';
import test from 'node:test';
import { MarkdownFormatter } from '../content/formatters/markdown.js';

test('MarkdownFormatter includes top site link, platform source, hyperlinked URL, and omits missing fields', () => {
  const formatter = new MarkdownFormatter();

  const conversation = {
    title: 'Test Conversation',
    messages: [
      { role: 'User', content: 'Hello' },
      { role: 'Assistant', content: 'Hi there!' },
    ],
    metadata: {
      Source: 'Claude',
      Date: '8/6/2026 12:00:00',
      Link: 'https://claude.ai/chat/123',
      Model: 'Claude 3.5 Sonnet',
      Method: 'API',
    },
  };

  const output = formatter.format(conversation);

  assert.ok(output.includes('# Test Conversation'));
  assert.ok(output.includes('**Exported with:** [AI Chat Exporter](https://ace.covai.org)'));
  assert.ok(output.includes('**Source:** Claude'));
  assert.ok(output.includes('**Date:** 8/6/2026 12:00:00'));
  assert.ok(output.includes('**Link:** [https://claude.ai/chat/123](https://claude.ai/chat/123)'));
  assert.ok(output.includes('**Model:** Claude 3.5 Sonnet'));
  assert.ok(output.includes('**Method:** API'));
});

test('MarkdownFormatter omits Exported with credit when includeAttribution is false', () => {
  const formatter = new MarkdownFormatter();

  const conversation = {
    title: 'No Credit Test',
    messages: [{ role: 'User', content: 'Hello' }],
    metadata: {
      Source: 'Claude',
      Date: '8/6/2026 12:00:00',
    },
  };

  const output = formatter.format(conversation, { includeAttribution: false });

  assert.ok(!output.includes('**Exported with:**'));
  assert.ok(output.includes('**Source:** Claude'));
  assert.ok(output.includes('**Date:** 8/6/2026 12:00:00'));
});

test('MarkdownFormatter omits Model and Link when missing', () => {
  const formatter = new MarkdownFormatter();

  const conversation = {
    title: 'Minimal Metadata Chat',
    messages: [{ role: 'User', content: 'Hello' }],
    metadata: {
      Source: 'Gemini',
      Date: '8/6/2026 12:00:00',
    },
  };

  const output = formatter.format(conversation);

  assert.ok(output.includes('**Source:** Gemini'));
  assert.ok(!output.includes('**Link:**'));
  assert.ok(!output.includes('**Model:**'));
});

test('MarkdownFormatter normalizes bracket LaTeX math delimiters to $ and $$ while preserving code', () => {
  const formatter = new MarkdownFormatter();

  const conversation = {
    title: 'LaTeX Test',
    messages: [
      {
        role: 'Assistant',
        content: `Here is inline \\( e^{i\\pi} + 1 = 0 \\) and display math:
\\[
E = mc^2
\\]
Also escaped inline \\\\( a^2 + b^2 = c^2 \\\\) and display:
\\\\[
\\int_0^1 x dx = \\frac{1}{2}
\\\\]

Here is code that must NOT be modified:
\`\`\`python
# Code with brackets
arr = [1, 2, 3]
def func(x):
    return [x]
\`\`\`
And inline \`item[0]\` code.`,
      },
    ],
  };

  const output = formatter.format(conversation);

  // Check inline math converted to $...$
  assert.ok(output.includes('$e^{i\\pi} + 1 = 0$'));
  assert.ok(output.includes('$a^2 + b^2 = c^2$'));

  // Check display math converted to $$...$$
  assert.ok(output.includes('$$E = mc^2$$'));
  assert.ok(output.includes('$$\\int_0^1 x dx = \\frac{1}{2}$$'));

  // Check code blocks remain unchanged
  assert.ok(output.includes('arr = [1, 2, 3]'));
  assert.ok(output.includes('return [x]'));
  assert.ok(output.includes('`item[0]`'));
});

test('MarkdownFormatter preserves math formulas with brackets and does not split into extra $$', () => {
  const formatter = new MarkdownFormatter();

  const conversation = {
    title: 'Statistics Math Test',
    messages: [
      {
        role: 'Model',
        content:
          'Formula with brackets:\n' +
          '$$\\text{ATE} = \\mathbb{E}[Y \\vert \\text{do}(X=1)] - \\mathbb{E}[Y \\vert \\text{do}(X=0)]$$\n\n' +
          'Formula with sizing brackets:\n' +
          '$$\\left[ \\frac{a}{b} \\right] = 1$$\n\n' +
          'Formula with previously escaped backslashes and underscores:\n' +
          '$$\\\\text{Cov}(R\\_a, R\\_m) = \\\\rho \\\\cdot \\\\sigma\\_a \\\\cdot \\\\sigma\\_m$$\n\n' +
          'Inline formula in table text: $\\\\beta = \\\\rho \\\\cdot \\\\frac{\\\\sigma\\_a}{\\\\sigma\\_m}$',
      },
    ],
  };

  const output = formatter.format(conversation);

  // Verifies formula with brackets is not split into extra $$
  assert.ok(
    output.includes(
      '$$\\text{ATE} = \\mathbb{E}[Y \\vert \\text{do}(X=1)] - \\mathbb{E}[Y \\vert \\text{do}(X=0)]$$',
    ),
  );
  assert.ok(!output.includes('$$\\text{ATE} = \\mathbb{E}$$'));

  // Verifies sizing brackets are intact
  assert.ok(output.includes('$$\\left[ \\frac{a}{b} \\right] = 1$$'));
  assert.ok(!output.includes('\\left$$'));

  // Verifies double backslashes and escaped underscores are cleaned
  assert.ok(output.includes('$$\\text{Cov}(R_a, R_m) = \\rho \\cdot \\sigma_a \\cdot \\sigma_m$$'));
  assert.ok(!output.includes('\\\\text{Cov}'));
  assert.ok(!output.includes('R\\_a'));

  // Verifies inline math is cleaned
  assert.ok(output.includes('$\\beta = \\rho \\cdot \\frac{\\sigma_a}{\\sigma_m}$'));
  assert.ok(!output.includes('\\\\beta'));
});

test('MarkdownFormatter converts inline base64 images to reference definitions at the bottom while keeping web URLs inline', () => {
  const formatter = new MarkdownFormatter();

  const conversation = {
    title: 'Image Reference Test',
    messages: [
      {
        role: 'User',
        content:
          'Check this diagram:\n![diagram](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==)\nand this web link:\n![web logo](https://example.com/logo.png)',
      },
      {
        role: 'Assistant',
        content:
          'Here is another one:\n![chart](data:image\\/jpeg;base64,\\/9j\\/4AAQSkZJRgABAQEASABIAAD)',
      },
    ],
  };

  const output = formatter.format(conversation);

  // Markdown body should contain reference links
  assert.ok(output.includes('![diagram][image-1]'));
  assert.ok(output.includes('![chart][image-2]'));
  // Web image should remain inline
  assert.ok(output.includes('![web logo](https://example.com/logo.png)'));
  // Base64 definitions should be at the bottom under <!-- Image References -->
  assert.ok(output.includes('<!-- Image References -->'));
  assert.ok(
    output.includes(
      '[image-1]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    ),
  );
  assert.ok(output.includes('[image-2]: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD'));
});

test('MarkdownFormatter avoids colliding with pre-existing reference labels in conversation', () => {
  const formatter = new MarkdownFormatter();

  const conversation = {
    title: 'Reference Collision Test',
    messages: [
      {
        role: 'User',
        content:
          'Existing ref: [image-1]: https://example.com/existing.png\n\n![existing][image-1]\n\nNow an inline base64:\n![new](data:image/png;base64,ABCDEF123456)',
      },
    ],
  };

  const output = formatter.format(conversation);

  // Since [image-1] was already defined in the conversation, the new base64 image should get [image-2]
  assert.ok(output.includes('![new][image-2]'));
  assert.ok(output.includes('[image-2]: data:image/png;base64,ABCDEF123456'));
  assert.ok(output.includes('[image-1]: https://example.com/existing.png'));
});
