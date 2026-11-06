import { parseHTML } from 'linkedom';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Set up Linkedom DOM context
const { window, document, HTMLElement, Node, DOMParser } = parseHTML(`
  <!DOCTYPE html>
  <html>
    <head>
      <title>Sample Tech Article - Covai Blog</title>
      <meta name="author" content="Jane Doe" />
      <meta property="og:site_name" content="Covai Tech Blog" />
    </head>
    <body>
      <main>
        <h1>Sample Tech Article</h1>
        <p>This is a tech blog post about web browser extension development and decant-core parser architecture.</p>
        <p>It contains multiple paragraphs explaining how Readability, Defuddle, and Article-Extractor work together seamlessly.</p>
      </main>
    </body>
  </html>
`);

global.window = window;
global.document = document;
global.HTMLElement = HTMLElement;
global.Node = Node;
global.DOMParser = DOMParser;

const { ArticleParser } = await import('decant-core');

test('ArticleParser is available for standard http/https URLs', () => {
  const parser = new ArticleParser();
  assert.equal(parser.isAvailable('https://example.com/blog/article'), true);
  assert.equal(parser.isAvailable('http://news.ycombinator.com'), true);
  assert.equal(parser.isAvailable('file:///local/document.html'), true);
  assert.equal(parser.isAvailable('invalid-url'), false);
});

test('ArticleParser extracts web page title, metadata, and body content', async () => {
  const parser = new ArticleParser();
  window.location = { href: 'https://covai.org/blog/sample-tech-article' };

  const conversation = await parser.parse();

  assert.equal(conversation.title, 'Sample Tech Article');
  assert.equal(conversation.messages.length, 1);
  assert.equal(conversation.messages[0].role, 'Assistant');
  assert.ok(conversation.messages[0].content.includes('tech blog post'));
  assert.equal(conversation.metadata.Source, 'Covai Tech Blog');
  assert.equal(conversation.metadata.Author, 'Jane Doe');
});

test('ArticleParser respects articleEngine option', async () => {
  const parser = new ArticleParser();
  window.location = { href: 'https://covai.org/blog/sample-tech-article' };

  const resReadability = await parser.parse({ articleEngine: 'readability' });
  assert.equal(resReadability.metadata.Engine, 'readability');

  const resDefuddle = await parser.parse({ articleEngine: 'defuddle' });
  assert.equal(resDefuddle.metadata.Engine, 'defuddle');
});
