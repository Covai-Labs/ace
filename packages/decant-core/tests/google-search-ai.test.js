import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseHTML } from "linkedom";
import {
  GoogleSearchAIParser,
  sanitizeResponseContainer,
  cleanMarkdownSpacing,
} from "../ai/google_search_ai.js";
import { convertToMarkdown } from "../utils/html-to-markdown.js";

test("GoogleSearchAIParser isAvailable matches google search URLs", () => {
  const parser = new GoogleSearchAIParser();
  assert.equal(
    parser.isAvailable("https://www.google.com/search?q=test"),
    true,
  );
  assert.equal(
    parser.isAvailable("https://www.google.co.uk/search?udm=50&q=ai"),
    true,
  );
  assert.equal(parser.isAvailable("https://chatgpt.com/"), false);
});

test("sanitizeResponseContainer strips script, style, and noscript elements", () => {
  const { document } = parseHTML(
    "<div><p>Real text content</p><script>sn._setImageSrc('img1', 'data:...');</script><style>.hidden{display:none;}</style><noscript>Enable JS</noscript></div>",
  );
  const container = document.querySelector("div");
  const clean = sanitizeResponseContainer(container);

  assert.equal(clean.querySelector("script"), null);
  assert.equal(clean.querySelector("style"), null);
  assert.equal(clean.querySelector("noscript"), null);
  assert.match(clean.textContent, /Real text content/);
  assert.doesNotMatch(clean.textContent, /sn\._setImageSrc/);
});

test("sanitizeResponseContainer removes data:image base64 images while preserving normal images", () => {
  const { document } = parseHTML(
    '<div><p>Images</p><img src="data:image/jpeg;base64,ABCDEF123456" alt="Preview"><img src="https://example.com/valid-image.png" alt="Valid Web Image"></div>',
  );
  const container = document.querySelector("div");
  const clean = sanitizeResponseContainer(container);

  const images = clean.querySelectorAll("img");
  assert.equal(images.length, 1);
  assert.equal(
    images[0].getAttribute("src"),
    "https://example.com/valid-image.png",
  );
  assert.equal(images[0].getAttribute("alt"), "Valid Web Image");
});

test("sanitizeResponseContainer preserves math LaTeX images marked with data-xpm-latex", () => {
  const { document } = parseHTML(
    '<div><img src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==" data-xpm-latex="e^{i\\pi}+1=0"><img src="data:image/png;base64,ABCDEF" alt="Normal base64"></div>',
  );
  const container = document.querySelector("div");
  const clean = sanitizeResponseContainer(container);

  const images = clean.querySelectorAll("img");
  assert.equal(images.length, 1);
  assert.equal(images[0].getAttribute("data-xpm-latex"), "e^{i\\pi}+1=0");
});

test("sanitizeResponseContainer unwraps /goto and /url tracking redirects to direct target URLs", () => {
  const { document } = parseHTML(
    '<div><a href="/goto?url=https%3A%2F%2Fexample.com%2Fdocs%2Farticle">Doc Article</a><a href="/url?q=https%3A%2F%2Fwikipedia.org%2Fwiki%2FTest">Wiki Source</a><a href="https://direct.com/page">Direct Link</a></div>',
  );
  const container = document.querySelector("div");
  const clean = sanitizeResponseContainer(container);

  const links = clean.querySelectorAll("a");
  assert.equal(
    links[0].getAttribute("href"),
    "https://example.com/docs/article",
  );
  assert.equal(
    links[1].getAttribute("href"),
    "https://wikipedia.org/wiki/Test",
  );
  assert.equal(links[2].getAttribute("href"), "https://direct.com/page");
});

test("cleanMarkdownSpacing normalizes trailing spaces and collapses multi-line gaps", () => {
  const raw = "Line 1   \n\n\n\nLine 2  \n\n\nLine 3";
  const cleaned = cleanMarkdownSpacing(raw);
  assert.equal(cleaned, "Line 1\n\nLine 2\n\nLine 3");
});

test("cleanMarkdownSpacing purges leaked sn._setImageSrc and base64 image data", () => {
  const raw =
    "Some text before [](https://example.com)sn.\\_setImageSrc('img-123','data:image\\/png;base64,iVBORw0KGgoAAAANSUhEUgAA=='); some text after";
  const cleaned = cleanMarkdownSpacing(raw);
  assert.equal(
    cleaned,
    "Some text before [](https://example.com) some text after",
  );
  assert.doesNotMatch(cleaned, /_setImageSrc/);
  assert.doesNotMatch(cleaned, /data:image/);
});

test("cleanMarkdownSpacing purges google._setImageSrc and standalone escaped data URI", () => {
  const rawHelper =
    "Prefix google._setImageSrc('img-456', 'data:image/jpeg;base64,abcdef123456'); Suffix";
  const cleanedHelper = cleanMarkdownSpacing(rawHelper);
  assert.equal(cleanedHelper, "Prefix  Suffix");
  assert.doesNotMatch(cleanedHelper, /google\._setImageSrc/);

  const rawEscapedUri =
    "Stand-alone escaped URI data:image\\/png;base64,iVBORw0KGgoAAA== remains clean.";
  const cleanedEscaped = cleanMarkdownSpacing(rawEscapedUri);
  assert.equal(cleanedEscaped, "Stand-alone escaped URI  remains clean.");
  assert.doesNotMatch(cleanedEscaped, /data:image/);
});

test("cleanMarkdownSpacing does not greedily strip response text when _setImageSrc appears in prose", () => {
  const rawProse =
    "Discussion of _setImageSrc( in JavaScript documentation.\n\nHere is an explanation of parameters (id and src) that should not be deleted.";
  const cleanedProse = cleanMarkdownSpacing(rawProse);
  assert.match(cleanedProse, /Discussion of _setImageSrc\(/);
  assert.match(cleanedProse, /Here is an explanation of parameters/);
});

test("sanitizeResponseContainer purges empty <a> tags left behind by stripped base64 images", () => {
  const { document } = parseHTML(
    '<div><a href="/goto?url=https%3A%2F%2Fexample.com"><img src="data:image/png;base64,ABCDEF"></a><a href="https://example.com/keep"><img src="https://example.com/pic.png">Valid</a></div>',
  );
  const container = document.querySelector("div");
  const clean = sanitizeResponseContainer(container);

  const links = clean.querySelectorAll("a");
  assert.equal(links.length, 1);
  assert.equal(links[0].getAttribute("href"), "https://example.com/keep");
  assert.match(links[0].textContent, /Valid/);
});

test("GoogleSearchAIParser parse() extracts and cleans AI Overview queries and responses", async () => {
  const html = [
    "<html><head><title>Quantum Computing - Google Search</title></head><body>",
    '<div class="sUKAcb"><div class="iMqumd">You said:</div>Explain quantum superposition</div>',
    '<div data-scope-id="turn">',
    '  <div data-container-id="main-col">',
    "    <p>Quantum superposition is a fundamental principle.</p>",
    "    <script>sn._setImageSrc('thumb', 'data:...');</script>",
    '    <img src="data:image/png;base64,ABCDEF123456" alt="Icon">',
    '    <p>Read more at <a href="/goto?url=https%3A%2F%2Fquantum.gov%2Foverview">Quantum.gov</a>.</p>',
    "  </div>",
    "</div>",
    "</body></html>",
  ].join("");
  const { document, window } = parseHTML(html);
  globalThis.document = document;
  globalThis.window = window;

  const parser = new GoogleSearchAIParser();
  const result = await parser.parse();

  assert.equal(result.title, "Quantum Computing - Google Search");
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].role, "User");
  assert.equal(result.messages[0].content, "Explain quantum superposition");
  assert.equal(result.messages[1].role, "Model");
  assert.match(
    result.messages[1].content,
    /Quantum superposition is a fundamental principle/,
  );
  assert.match(
    result.messages[1].content,
    /\[Quantum\.gov\]\(https:\/\/quantum\.gov\/overview\)/,
  );
  assert.doesNotMatch(result.messages[1].content, /sn\._setImageSrc/);
  assert.doesNotMatch(result.messages[1].content, /data:image/);
  assert.equal(result.metadata.Source, "Google Search AI");
  assert.equal(result.metadata.Method, "DOM");
});

test("convertToMarkdown formats Google Search AI inline math without newline breaks in lists or bold tags", () => {
  const html = `<ul>
    <li><strong><span class="mTEjhd"><span class="dteT0b"><div data-xpm-copy-root="" data-xpm-math-type="block" style="position: relative; direction: ltr;display: inline-block;"><img data-xpm-latex="e" src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="></div></span></span> (Euler's Number):</strong> The base of natural logarithms (<span class="mTEjhd"><span class="dteT0b"><div data-xpm-copy-root="" data-xpm-math-type="block" style="position: relative; direction: ltr;display: inline-block;"><img data-xpm-latex="\\approx 2.718" src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="></div></span></span>), deeply tied to calculus.</li>
  </ul>`;

  const { document } = parseHTML(`<div>${html}</div>`);
  const container = document.querySelector("div");
  const md = convertToMarkdown(container);

  assert.equal(
    md,
    "*   **$e$ (Euler's Number):** The base of natural logarithms ($\\approx 2.718$), deeply tied to calculus.",
  );
  assert.doesNotMatch(md, /\$\$/);
  assert.doesNotMatch(md, /\n{2,}\$e\$/);
});

test("convertToMarkdown preserves display math blocks wrapped in .cPGBZb", () => {
  const html = `<div>
    <p>Euler's identity:</p>
    <span class="cPGBZb"><span class="dteT0b"><div data-xpm-copy-root="" data-xpm-math-type="block" style="position: relative; direction: ltr;display: inline-flex;"><img data-xpm-latex="e^{i\\pi}+1=0" src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="></div></span></span>
  </div>`;

  const { document } = parseHTML(html);
  const container = document.querySelector("div");
  const md = convertToMarkdown(container);

  assert.match(md, /\$\$e\^\{i\\pi\}\+1=0\$\$/);
});

test("GoogleSearchAIParser parse() extracts multi-turn conversation and clean math formulas from fixture", async () => {
  const fixtureUrl = new URL(
    "./fixtures/google-search-ai-chat.html",
    import.meta.url,
  );
  const rawHtml = fs.readFileSync(fixtureUrl, "utf-8");
  const { document, window } = parseHTML(rawHtml);
  globalThis.document = document;
  globalThis.window = window;

  const parser = new GoogleSearchAIParser();
  const result = await parser.parse();

  assert.equal(result.messages.length, 10);
  assert.equal(result.messages[0].role, "User");
  assert.match(result.messages[0].content, /species that went extinct/);
  assert.equal(result.messages[2].role, "User");
  assert.equal(result.messages[2].content, "Tell me about Euler's identity.");

  // Check Euler turn math content
  const eulerReply = result.messages[3].content;
  assert.equal(result.messages[3].role, "Model");
  assert.match(eulerReply, /\$\$e\^\{i\\pi \}\+1=0\$\$/);
  assert.match(
    eulerReply,
    /\*\s+\*\*\$e\$ \(Euler's Number\):\*\*\s+The base of natural logarithms \(\$\\approx 2\.718\$\)/,
  );
  assert.match(
    eulerReply,
    /for \$e\^\{x\}\$, \$\\cos\(x\)\$, and \$\\sin\(x\)\$:/,
  );
  // Ensure no stray multi-newline breaks before or after inline $e$
  assert.doesNotMatch(eulerReply, /\*\s+\*\*\s*\n+\$\$e\$\$/);
});

test("convertToMarkdown handles Google Search AI math with data-xpm-copy-text or alt fallbacks", () => {
  const htmlWithCopyText = `<div>
    <p>Value is <span class="mTEjhd"><div data-xpm-copy-root="" data-xpm-copy-text="e^{i\\pi}+1=0" style="display: inline-block;"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="></div></span> in Euler.</p>
  </div>`;
  const { document: doc1 } = parseHTML(htmlWithCopyText);
  const md1 = convertToMarkdown(doc1.querySelector("div"));
  assert.equal(md1, "Value is $e^{i\\pi}+1=0$ in Euler.");

  const htmlWithAlt = `<div>
    <p>Formula is <span class="mTEjhd"><div data-xpm-copy-root="" style="display: inline-block;"><img alt="\\sqrt{x^2+y^2}" src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="></div></span> here.</p>
  </div>`;
  const { document: doc2 } = parseHTML(htmlWithAlt);
  const md2 = convertToMarkdown(doc2.querySelector("div"));
  assert.equal(md2, "Formula is $\\sqrt{x^2+y^2}$ here.");
});
