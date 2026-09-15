import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

async function importFormatter() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-chat-exporter-'));
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

  return import(path.join(tempDir, 'content', 'formatters', 'html.js'));
}

test('HTML formatter returns correct file extension and MIME type', async () => {
  const { HtmlFormatter } = await importFormatter();
  const formatter = new HtmlFormatter();

  assert.equal(formatter.getFileExtension(), 'html');
  assert.equal(formatter.getMimeType(), 'text/html');
});

test('HTML formatter converts parsed conversation into structured HTML document', async () => {
  const { HtmlFormatter } = await importFormatter();
  const formatter = new HtmlFormatter();

  const conversation = {
    title: 'Self-Consistency Test',
    messages: [
      { role: 'User', content: 'What is 2+2? Answer in code.\n\n```python\nprint(2+2)\n```' },
      {
        role: 'Assistant',
        content:
          'The answer is 4. Let us look at a table:\n\n| Expression | Value |\n|---|---|\n| 2+2 | 4 |\n\nAnd some math:\n$$x^2 + y^2 = z^2$$\n\nGood luck!',
      },
    ],
    metadata: {
      Source: 'ChatGPT',
      Model: 'GPT-4',
      Method: 'API',
    },
  };

  const output = formatter.format(conversation);

  // Check document header / metadata
  assert.ok(output.includes('<!DOCTYPE html>'));
  assert.ok(output.includes('<title>Self-Consistency Test</title>'));
  assert.ok(output.includes('<span class="badge">ChatGPT</span>'));
  assert.ok(output.includes('https://ai-chat-exporter.covai.org/'));
  assert.ok(output.includes('Model: GPT-4'));
  assert.ok(output.includes('Method: API'));
  assert.ok(output.includes('Self-Consistency Test</h1>'));
  assert.ok(output.includes('data-theme="modern-dark"'));
  assert.ok(output.includes('data-theme="nord"'));

  // Check message cards and styling
  assert.ok(output.includes('message-card role-user'));
  assert.ok(output.includes('message-card role-assistant'));

  // Check custom markdown block parsing (code blocks)
  assert.ok(output.includes('code-card'));
  assert.ok(output.includes('<span class="code-lang">python</span>'));
  assert.ok(output.includes('<code class="language-python">print(2+2)'));

  // Check custom table parsing
  assert.ok(output.includes('table-wrapper'));
  assert.ok(output.includes('<table>'));
  assert.ok(output.includes('<th style="text-align: left;">Expression</th>'));
  assert.ok(output.includes('<td style="text-align: left;">2+2</td>'));

  // Check math rendering wrapper
  assert.ok(output.includes('<span class="math-block">$$x^2 + y^2 = z^2$$</span>'));
});

test('HTML formatter unescapes backslash escapes inside headers and paragraphs', async () => {
  const { HtmlFormatter } = await importFormatter();
  const formatter = new HtmlFormatter();

  const conversation = {
    title: 'Escape Test',
    messages: [
      {
        role: 'User',
        content:
          '### 1\\. Heading\n\nThis contains \\*\\*bold\\*\\* and \\*italic\\* and \\[link\\](https://example.com) and 2\\. item.',
      },
    ],
  };

  const output = formatter.format(conversation);

  assert.ok(output.includes('<h3>1. Heading</h3>'));
  assert.ok(
    output.includes(
      '<p>This contains **bold** and *italic* and [link](https://example.com) and 2. item.</p>',
    ),
  );
});

test('HTML formatter renders markdown images as img tags', async () => {
  const { HtmlFormatter } = await importFormatter();
  const formatter = new HtmlFormatter();

  const conversation = {
    title: 'Image Test',
    messages: [
      {
        role: 'User',
        content:
          'Check out this image: ![Football Shoe](https://example.com/shoe.png) and another ![Chart](https://example.com/chart.jpg?param=1&val=2)',
      },
    ],
  };

  const output = formatter.format(conversation);

  assert.ok(output.includes('<img src="https://example.com/shoe.png" alt="Football Shoe"'));
  assert.ok(output.includes('<img src="https://example.com/chart.jpg?param=1&val=2" alt="Chart"'));
});

test('HTML formatter renders task list checkboxes, collapsible thinking blocks, per-message copy, syntax highlighting, and footer link', async () => {
  const { HtmlFormatter } = await importFormatter();
  const formatter = new HtmlFormatter();

  const conversation = {
    title: 'Advanced Features Test',
    messages: [
      {
        role: 'User',
        content: '- [ ] Pending task\n- [x] Completed task',
      },
      {
        role: 'Assistant',
        content: '<think>Analyzing the user query...</think>\n\nHere is your solution.',
      },
    ],
  };

  const output = formatter.format(conversation);

  // Check task checkboxes
  assert.ok(output.includes('class="task-list"'));
  assert.ok(output.includes('<input type="checkbox" class="task-checkbox" disabled>'));
  assert.ok(output.includes('<input type="checkbox" class="task-checkbox" disabled checked>'));

  // Check collapsible thinking block
  assert.ok(output.includes('<details class="thinking-block">'));
  assert.ok(output.includes('Thinking Process</summary>'));
  assert.ok(output.includes('class="thinking-content"'));
  assert.ok(output.includes('Analyzing the user query...'));

  // Check per-message copy button
  assert.ok(output.includes('copy-msg-btn'));

  // Check Prism syntax highlighting script & offline tokens
  assert.ok(output.includes('prism') || output.includes('Prism'));
  assert.ok(output.includes('.token.keyword'));

  // Check export footer branding link
  assert.ok(output.includes('<footer class="export-footer">'));
  assert.ok(
    output.includes('href="https://ai-chat-exporter.org/"') ||
      output.includes('href="https://ai-chat-exporter.covai.org/"'),
  );
});

test('HTML formatter omits export footer when includeAttribution is false', async () => {
  const { HtmlFormatter } = await importFormatter();
  const formatter = new HtmlFormatter();

  const conversation = {
    title: 'No Footer Test',
    messages: [{ role: 'User', content: 'Hello' }],
    metadata: { Source: 'Claude' },
  };

  const withFooter = formatter.format(conversation);
  assert.ok(withFooter.includes('<footer class="export-footer">'));

  const withoutFooter = formatter.format(conversation, { includeAttribution: false });
  assert.ok(!withoutFooter.includes('<footer class="export-footer">'));
  assert.ok(!withoutFooter.includes('href="https://ai-chat-exporter.covai.org/"'));
  assert.ok(withoutFooter.includes('<title>No Footer Test</title>'));
});

test('HTML formatter formats LaTeX math equations with bracket and dollar delimiters', async () => {
  const { HtmlFormatter } = await importFormatter();
  const formatter = new HtmlFormatter();

  const conversation = {
    title: 'LaTeX Math Test',
    messages: [
      {
        role: 'Assistant',
        content:
          "Euler's identity is \\[ e^{i\\pi} + 1 = 0 \\] and inline equation is \\( e^{ix} = \\cos x + i\\sin x \\).",
      },
    ],
  };

  const output = formatter.format(conversation);

  assert.ok(output.includes('<span class="math-block">$$ e^{i\\pi} + 1 = 0 $$</span>'));
  assert.ok(output.includes('<span class="math-inline">$ e^{ix} = \\cos x + i\\sin x $</span>'));
});

test('HTML formatter formats multi-line LaTeX math blocks without stripping slashes or injecting line breaks', async () => {
  const { HtmlFormatter } = await importFormatter();
  const formatter = new HtmlFormatter();

  const conversation = {
    title: 'Multi-line Math Test',
    messages: [
      {
        role: 'Assistant',
        content:
          '### Average Treatment Effect (ATE)\n\n' +
          '\\[\n\\boxed{\\operatorname{ATE}=\\mathbb{E}[Y(1)-Y(0)]}\n\\]\n\n' +
          'Multi-line dollar math:\n\n' +
          '$$\n\\tau = \\mathbb{E}[Y(1)] - \\mathbb{E}[Y(0)]\n$$\n\n' +
          'where $Y(1)$ is treated.',
      },
    ],
  };

  const output = formatter.format(conversation);

  assert.ok(
    output.includes(
      '<span class="math-block">$$\\boxed{\\operatorname{ATE}=\\mathbb{E}[Y(1)-Y(0)]}$$</span>',
    ),
  );
  assert.ok(
    output.includes(
      '<span class="math-block">$$\\tau = \\mathbb{E}[Y(1)] - \\mathbb{E}[Y(0)]$$</span>',
    ),
  );
  assert.ok(output.includes('<span class="math-inline">$Y(1)$</span>'));
  // Ensure square brackets are NOT stripped to literal unescaped [ or ]
  assert.ok(!output.includes('<p>[<br>'));
  assert.ok(!output.includes('<br>]<br>'));
});

test('HTML formatter formats inline math without fragmenting list items or injecting extra lines (Issue #58)', async () => {
  const { HtmlFormatter } = await importFormatter();
  const formatter = new HtmlFormatter();

  const conversation = {
    title: 'Inline Math List Test',
    messages: [
      {
        role: 'Assistant',
        content:
          "* Initial Symmetrical Short-Circuit Current ($$I''_k$$): The foundational RMS value used to size the breaking capacity of protective devices. It is calculated using the formula $$I''_k = c \\cdot U_n / (\\sqrt{3} \\cdot Z_k)$$, where c is a voltage factor,\n\n" +
          'Standalone formula should still be on its own line:\n\n' +
          '$$E = mc^2$$\n\n' +
          'Concluding note.',
      },
    ],
  };

  const output = formatter.format(conversation);

  // The bullet item must remain a single, intact list item with inline math
  assert.ok(
    output.includes(
      '<li>Initial Symmetrical Short-Circuit Current (<span class="math-inline">$I\'\'_k$</span>): The foundational RMS value used to size the breaking capacity of protective devices. It is calculated using the formula <span class="math-inline">$I\'\'_k = c \\cdot U_n / (\\sqrt{3} \\cdot Z_k)$</span>, where c is a voltage factor,</li>',
    ),
  );

  // Standalone math block must still be isolated on its own line in a math-block
  assert.ok(output.includes('<p><span class="math-block">$$E = mc^2$$</span></p>'));
  assert.ok(output.includes('<p>Standalone formula should still be on its own line:</p>'));
  assert.ok(output.includes('<p>Concluding note.</p>'));
});

test('HTML formatter escapes malicious codeLang tags and untrusted details tags', async () => {
  const { HtmlFormatter } = await importFormatter();
  const formatter = new HtmlFormatter();

  const conversation = {
    title: 'Security Sanity Test',
    messages: [
      {
        role: 'User',
        content:
          '```html"><script>alert(1)</script>\nconsole.log("XSS");\n```\n\n<details><script>alert(2)</script></details>',
      },
    ],
  };

  const output = formatter.format(conversation);

  // Assert codeLang is HTML-escaped
  assert.ok(!output.includes('<span class="code-lang">html"><script>alert(1)</script></span>'));
  assert.ok(output.includes('html&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;'));

  // Assert untrusted details/script tags are HTML-escaped
  assert.ok(!output.includes('<details><script>alert(2)</script></details>'));
  assert.ok(
    output.includes('&lt;details&gt;&lt;script&gt;alert(2)&lt;/script&gt;&lt;/details&gt;'),
  );
});

test('HTML formatter preserves multi-line user inputs and paragraph line breaks with br tags', async () => {
  const { HtmlFormatter } = await importFormatter();
  const formatter = new HtmlFormatter();

  const conversation = {
    title: 'Multi-line Prompt Test',
    messages: [
      {
        role: 'User',
        content: 'this\nis\na\nsentence\n\nSecond paragraph line 1\nSecond paragraph line 2',
      },
    ],
  };

  const output = formatter.format(conversation);

  assert.ok(output.includes('<p>this<br>\nis<br>\na<br>\nsentence</p>'));
  assert.ok(output.includes('<p>Second paragraph line 1<br>\nSecond paragraph line 2</p>'));
});

test('HTML formatter resolves reference-style images with bottom definitions', async () => {
  const { HtmlFormatter } = await importFormatter();
  const formatter = new HtmlFormatter();

  const conversation = {
    title: 'Reference Images Test',
    messages: [
      {
        role: 'Assistant',
        content:
          'Here is a diagram:\n\n![my diagram][image-1]\n\n<!-- Image References -->\n\n[image-1]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      },
    ],
  };
  const output = formatter.format(conversation);

  assert.ok(
    output.includes(
      '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="my diagram"',
    ),
  );
  // Definition lines should not appear as raw text
  assert.ok(!output.includes('[image-1]: data:image'));
});

test('HTML formatter sanitizes and escapes malicious reference URLs to prevent attribute injection', async () => {
  const { HtmlFormatter, sanitizeUrl } = await importFormatter();
  const formatter = new HtmlFormatter();

  // Test sanitizeUrl unit logic
  assert.equal(sanitizeUrl('javascript:alert(1)', false), '');
  assert.equal(sanitizeUrl('javascript:alert(1)', true), '');
  assert.equal(sanitizeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', true), '');
  assert.equal(
    sanitizeUrl('https://example.com/img.png" onerror="alert(1)', true),
    'https://example.com/img.png&quot; onerror=&quot;alert(1)',
  );

  const conversation = {
    title: 'Security Injection Test',
    messages: [
      {
        role: 'Assistant',
        content: [
          '[Click me][xss-link]',
          '',
          '![Image XSS][xss-img]',
          '',
          '[xss-link]: javascript:alert(document.domain)',
          '[xss-img]: https://example.com/pic.png"onerror="alert(1)',
        ].join('\n'),
      },
    ],
  };

  const output = formatter.format(conversation);

  // javascript: link must not be rendered as an active href link
  assert.ok(!output.includes('href="javascript:'));
  // attribute injection quotes must be escaped as &quot;
  assert.ok(!output.includes('onerror="alert(1)"'));
  assert.ok(output.includes('&quot;onerror=&quot;'));
});
