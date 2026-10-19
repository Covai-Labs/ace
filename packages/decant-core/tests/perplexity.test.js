import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import {
  PerplexityParser,
  getThreadSlug,
  formatApiResult,
  getPerplexityAccount,
} from "../ai/perplexity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("PerplexityParser isAvailable matches perplexity URLs", () => {
  const parser = new PerplexityParser();
  assert.equal(
    parser.isAvailable("https://www.perplexity.ai/search/123"),
    true,
  );
  assert.equal(parser.isAvailable("https://perplexity.ai/"), true);
  assert.equal(parser.isAvailable("https://claude.ai/chat/123"), false);
});

test("getThreadSlug correctly extracts slug from perplexity search and page URLs", () => {
  assert.equal(
    getThreadSlug(
      "https://www.perplexity.ai/search/4d672318-e7ae-4fd7-80f7-3c21f0ff4646",
    ),
    "4d672318-e7ae-4fd7-80f7-3c21f0ff4646",
  );
  assert.equal(
    getThreadSlug(
      "https://www.perplexity.ai/search/custom-thread_123?source=default",
    ),
    "custom-thread_123",
  );
  assert.equal(
    getThreadSlug("https://www.perplexity.ai/page/some-page-slug"),
    "some-page-slug",
  );
  assert.equal(getThreadSlug("https://www.perplexity.ai/"), null);
});

test("formatApiResult extracts all 14 turns (including Orcas prompt), normalizes math, and sets Method: API", () => {
  const fixturePath = path.join(
    __dirname,
    "fixtures",
    "perplexity-api-response.json",
  );
  const data = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

  const currentUrl =
    "https://www.perplexity.ai/search/4d672318-e7ae-4fd7-80f7-3c21f0ff4646";
  const result = formatApiResult(data, currentUrl, "Fallback Title");

  assert.equal(result.metadata.Source, "Perplexity");
  assert.equal(result.metadata.Method, "API");
  assert.equal(result.title, "Tell me why open source software matters.");
  assert.equal(result.messages.length, 28);

  const userMessages = result.messages.filter((m) => m.role === "User");
  const assistantMessages = result.messages.filter(
    (m) => m.role === "Perplexity",
  );
  assert.equal(userMessages.length, 14);
  assert.equal(assistantMessages.length, 14);

  // Turn 1 (Open source)
  assert.ok(
    userMessages[0].content.includes(
      "Tell me why open source software matters",
    ),
  );
  assert.ok(
    assistantMessages[0].content.includes(
      "control, choice, and the ability to build together",
    ),
  );
  assert.equal(userMessages[0].timestamp, "2026-09-12T05:38:57.460670+00:00");

  // Turn 4 (Orca - previously unmounted in DOM!)
  const orcaUser = userMessages[3];
  const orcaAssistant = assistantMessages[3];
  assert.equal(
    orcaUser.content,
    "If Orcas have language, can LLMs be trained on it so that it can have conversation with orca ?",
  );
  assert.ok(
    orcaAssistant.content.includes(
      "Possibly—but not in the straightforward “train an LLM on whale audio and chat with an orca” sense.",
    ),
  );
  assert.ok(orcaAssistant.content.includes("## What we know about orcas"));

  // Turn 11 (Euler's identity LaTeX math normalized to $$)
  const eulerAssistant = assistantMessages[10];
  assert.ok(eulerAssistant.content.includes("$$e^{i\\pi}+1=0.$$"));

  // Turn 14 (Extinct species table)
  const tableAssistant = assistantMessages[13];
  assert.ok(tableAssistant.content.includes("Thylacine"));
});

test("PerplexityParser parse() uses API when prefer_api and slug is present", async () => {
  const fixturePath = path.join(
    __dirname,
    "fixtures",
    "perplexity-api-response.json",
  );
  const data = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

  const dom = parseHTML(
    "<html><head><title>Page Title</title></head><body></body></html>",
  );
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = {
    href: "https://www.perplexity.ai/search/4d672318-e7ae-4fd7-80f7-3c21f0ff4646",
  };

  const parser = new PerplexityParser();
  parser.fetchThread = async (slug) => {
    assert.equal(slug, "4d672318-e7ae-4fd7-80f7-3c21f0ff4646");
    return data;
  };

  const result = await parser.parse({ parserMode: "prefer_api" });
  assert.equal(result.metadata.Method, "API");
  assert.equal(result.messages.length, 28);
});

test("PerplexityParser parse() gracefully falls back to DOM when API fetch throws", async () => {
  const fixturePath = path.join(__dirname, "fixtures", "perplexity-chat.html");
  const html = fs.readFileSync(fixturePath, "utf-8");

  const dom = parseHTML(html);
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = {
    href: "https://www.perplexity.ai/search/4d672318-e7ae-4fd7-80f7-3c21f0ff4646",
  };

  const parser = new PerplexityParser();
  parser.fetchThread = async () => {
    throw new Error("Network error or 403 Forbidden");
  };

  const result = await parser.parse({ parserMode: "prefer_api" });
  assert.equal(result.metadata.Method, "DOM");
  assert.equal(result.messages.length, 17);
});

test("PerplexityParser parse() extracts DOM directly when parserMode is prefer_dom", async () => {
  const fixturePath = path.join(__dirname, "fixtures", "perplexity-chat.html");
  const html = fs.readFileSync(fixturePath, "utf-8");

  const dom = parseHTML(html);
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = {
    href: "https://www.perplexity.ai/search/4d672318-e7ae-4fd7-80f7-3c21f0ff4646",
  };

  const parser = new PerplexityParser();
  let fetchCalled = false;
  parser.fetchThread = async () => {
    fetchCalled = true;
    return {};
  };

  const result = await parser.parse({ parserMode: "prefer_dom" });
  assert.equal(
    fetchCalled,
    false,
    "API fetch should not be called in prefer_dom mode",
  );
  assert.equal(result.metadata.Method, "DOM");
  assert.equal(result.messages.length, 17);
});

test("PerplexityParser backward compatibility with legacy .group/query selector", async () => {
  const legacyHtml = `
    <html>
      <head><title>Legacy Perplexity</title></head>
      <body>
        <div class="max-w-threadContentWidth">
          <h1 class="group/query">What is quantum computing?</h1>
          <div class="prose">Quantum computing is a field of computer science.</div>
        </div>
      </body>
    </html>
  `;
  const dom = parseHTML(legacyHtml);
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = { href: "https://www.perplexity.ai/" };

  const parser = new PerplexityParser();
  const result = await parser.parse({ parserMode: "prefer_dom" });

  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].role, "User");
  assert.equal(result.messages[0].content, "What is quantum computing?");
  assert.equal(result.messages[0].timestamp, undefined);
  assert.equal(result.messages[1].role, "Perplexity");
  assert.equal(
    result.messages[1].content,
    "Quantum computing is a field of computer science.",
  );
});

test("getPerplexityAccount retrieves account ID from sessionStorage", async () => {
  const dom = parseHTML("<html><body></body></html>");
  globalThis.window = dom.window;
  const storage = new Map();
  globalThis.window.sessionStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, v),
  };
  globalThis.window.localStorage = {
    getItem: () => null,
  };
  storage.set("pplx-active-account", "b053465f-463f-48e5-8298-bfc0469fcae7");

  const acc = await getPerplexityAccount();
  assert.equal(acc, "b053465f-463f-48e5-8298-bfc0469fcae7");
});

test("getPerplexityAccount retrieves account ID from localStorage", async () => {
  const dom = parseHTML("<html><body></body></html>");
  globalThis.window = dom.window;
  globalThis.window.sessionStorage = {
    getItem: () => null,
  };
  const storage = new Map();
  globalThis.window.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, v),
  };
  storage.set(
    "pplx-last-active-account",
    "a1234567-89ab-cdef-0123-456789abcdef",
  );

  const acc = await getPerplexityAccount();
  assert.equal(acc, "a1234567-89ab-cdef-0123-456789abcdef");
});

test("getPerplexityAccount falls back to linked-accounts API endpoint", async () => {
  const dom = parseHTML("<html><body></body></html>");
  globalThis.window = dom.window;
  globalThis.window.sessionStorage = { getItem: () => null };
  globalThis.window.localStorage = { getItem: () => null };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes("/api/auth/linked-accounts")) {
      return {
        ok: true,
        json: async () => ({
          accounts: [
            {
              user_id: "c9876543-21ba-fedc-ba98-7654321fedcb",
            },
          ],
        }),
      };
    }
    return { ok: false };
  };

  try {
    const acc = await getPerplexityAccount();
    assert.equal(acc, "c9876543-21ba-fedc-ba98-7654321fedcb");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
