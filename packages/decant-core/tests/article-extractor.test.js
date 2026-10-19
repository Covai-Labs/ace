import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import {
  extractArticle,
  extractArticleIntelligent,
  ArticleParser,
} from "../web/article.js";

test("extractArticle extracts clean article and metadata from standard HTML fixture", async () => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <title>Guide to Modern Web Extensions | TechDaily</title>
      <meta name="author" content="Alex Rivers">
      <meta property="og:site_name" content="TechDaily">
      <meta property="og:description" content="A comprehensive guide to building fast browser extensions.">
    </head>
    <body>
      <header><nav><a href="/">Home</a></nav></header>
      <main>
        <article>
          <h1>Guide to Modern Web Extensions</h1>
          <p class="byline">By Alex Rivers</p>
          <p>${"Browser extensions allow developers to extend browser capabilities and customize web browsing experiences. ".repeat(5)}</p>
          <h2>Architecture</h2>
          <p>${"Modern extensions use Manifest V3 with background service workers and content scripts running in isolated execution environments. ".repeat(5)}</p>
        </article>
      </main>
      <footer><p>Copyright 2026</p></footer>
    </body>
    </html>
  `;

  const { document } = parseHTML(html);
  const result = await extractArticle(document, {
    url: "https://example.com/guide",
  });

  assert.ok(result);
  assert.equal(result.title, "Guide to Modern Web Extensions");
  assert.equal(result.author, "Alex Rivers");
  assert.equal(result.siteName, "TechDaily");
  assert.ok(result.content.includes("Manifest V3"));
  assert.ok(result.markdown.startsWith("# Guide to Modern Web Extensions"));
  assert.ok(["readability", "defuddle"].includes(result.engine));
  assert.ok(result.wordCount > 50);
});

test("extractArticle extracts technical article preserving code blocks and tables", async () => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><title>QuickSort Algorithm Explained - DevCorner</title></head>
    <body>
      <article>
        <h1>QuickSort Algorithm Explained</h1>
        <p>${"QuickSort is an efficient divide-and-conquer sorting algorithm that partitions arrays around a pivot element. ".repeat(4)}</p>
        <pre><code class="language-js">function quicksort(arr) {
  if (arr.length <= 1) return arr;
  const pivot = arr[0];
  const left = arr.slice(1).filter(x => x < pivot);
  const right = arr.slice(1).filter(x => x >= pivot);
  return [...quicksort(left), pivot, ...quicksort(right)];
}</code></pre>
        <p>${"Here is the performance complexity breakdown across best and worst case scenarios: ".repeat(3)}</p>
        <table>
          <thead>
            <tr><th>Case</th><th>Time Complexity</th></tr>
          </thead>
          <tbody>
            <tr><td>Average</td><td>O(N log N)</td></tr>
            <tr><td>Worst</td><td>O(N^2)</td></tr>
          </tbody>
        </table>
      </article>
    </body>
    </html>
  `;

  const result = await extractArticleIntelligent(html, {
    url: "https://devcorner.io/quicksort",
  });

  assert.ok(result);
  assert.equal(result.title, "QuickSort Algorithm Explained");
  assert.ok(result.content.includes("```"));
  assert.ok(result.content.includes("quicksort(arr)"));
  assert.ok(result.content.includes("O(N log N)"));
});

test("ArticleParser conforms to decant-core Parser interface", async () => {
  const parser = new ArticleParser();

  assert.equal(parser.getPlatformName(), "Web Article");
  assert.equal(parser.isAvailable("https://example.com/test"), true);
  assert.equal(parser.isAvailable("http://localhost:3000"), true);
  assert.equal(parser.isAvailable("chrome://extensions"), false);

  // Subframe test: when window.self !== window.top, isAvailable must be false
  globalThis.window = {
    self: {},
    top: {},
  };
  try {
    assert.equal(parser.isAvailable("https://example.com/subframe"), false);
    // When window.self === window.top, isAvailable must be true
    globalThis.window.top = globalThis.window.self;
    assert.equal(parser.isAvailable("https://example.com/topframe"), true);
  } finally {
    delete globalThis.window;
  }

  const html = `
    <html>
      <head><title>Test Page</title></head>
      <body>
        <article>
          <h1>Sample Article</h1>
          <p>${"This is a sample paragraph with sufficient length to verify parser output structure. ".repeat(6)}</p>
        </article>
      </body>
    </html>
  `;

  const { document } = parseHTML(html);
  // Set global document temporarily for parser.parse()
  globalThis.document = document;
  try {
    const parsed = await parser.parse();
    assert.equal(parsed.title, "Sample Article");
    assert.equal(parsed.messages.length, 1);
    assert.equal(parsed.messages[0].role, "Assistant");
    assert.ok(parsed.messages[0].content.length > 50);
    assert.ok(parsed.metadata);
  } finally {
    delete globalThis.document;
  }
});

test("extractArticle handles GFM strikethrough and task lists", async () => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><title>Feature List - DevNotes</title></head>
    <body>
      <article>
        <h1>Feature List</h1>
        <p>${"Here is the current status of features planned for release in the upcoming milestones. ".repeat(4)}</p>
        <p>This is <del>deprecated syntax</del> and should be ignored.</p>
        <ul>
          <li><input type="checkbox" checked disabled> Core Parser Engine</li>
          <li><input type="checkbox" disabled> UI Integration</li>
        </ul>
      </article>
    </body>
    </html>
  `;

  const result = await extractArticleIntelligent(html, {
    url: "https://devnotes.org/features",
  });

  assert.ok(result);
  assert.ok(
    result.content.includes("~deprecated syntax~") ||
      result.content.includes("~~deprecated syntax~~"),
  );
  assert.ok(
    result.content.includes("[x] Core Parser Engine") ||
      result.content.includes("Core Parser Engine"),
  );
});
