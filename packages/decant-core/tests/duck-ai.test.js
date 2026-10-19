import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import { DuckAIParser } from "../ai/duck_ai.js";
import { detectPlatform, isAiChatUrl } from "../detection/detect-platform.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function setupDom(fixtureFile, url) {
  const html = fs.readFileSync(
    path.join(__dirname, "fixtures", fixtureFile),
    "utf-8",
  );
  const dom = parseHTML(html);
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = { href: url };
  return dom;
}

test("DuckAIParser isAvailable matches duck.ai and duckduckgo chat URLs", () => {
  const parser = new DuckAIParser();
  assert.equal(parser.isAvailable("https://duck.ai/"), true);
  assert.equal(parser.isAvailable("https://duck.ai"), true);
  assert.equal(
    parser.isAvailable("https://duckduckgo.com/?q=DuckDuckGo+AI+Chat&ia=chat"),
    true,
  );
  assert.equal(parser.isAvailable("https://duckduckgo.com/chat"), true);

  assert.equal(parser.isAvailable("https://duckduckgo.com/?q=test"), false);
  assert.equal(parser.isAvailable("https://google.com"), false);
  assert.equal(
    parser.isAvailable("https://example.com/?target=https://duck.ai"),
    false,
  );
  assert.equal(parser.isAvailable("https://notduck.ai/"), false);
  assert.equal(parser.isAvailable("https://duckduckgo.com.evil.com/"), false);
  assert.equal(parser.isAvailable(""), false);
  assert.equal(parser.isAvailable(null), false);
});

test("detectPlatform and isAiChatUrl recognise duck.ai and duckduckgo chat", () => {
  assert.equal(isAiChatUrl("https://duck.ai/"), true);
  assert.equal(
    isAiChatUrl("https://duckduckgo.com/?q=DuckDuckGo+AI+Chat&ia=chat"),
    true,
  );
  assert.equal(isAiChatUrl("https://duckduckgo.com/?q=search+term"), false);

  const detectedDuck = detectPlatform("https://duck.ai/");
  assert.ok(detectedDuck);
  assert.equal(detectedDuck.platform, "Duck.ai");
  assert.equal(detectedDuck.parser instanceof DuckAIParser, true);

  const detectedDdg = detectPlatform(
    "https://duckduckgo.com/?q=DuckDuckGo+AI+Chat&ia=chat",
  );
  assert.ok(detectedDdg);
  assert.equal(detectedDdg.platform, "Duck.ai");
});

test("DuckAIParser parses 14 turns from Sept fixture with KaTeX, tables, citations and models", async () => {
  setupDom("duck-ai-chat.html", "https://duck.ai/");
  const parser = new DuckAIParser();
  const result = await parser.parse();

  // Metadata checks
  assert.equal(result.metadata.Source, "Duck.ai");
  assert.equal(result.metadata.Method, "DOM");
  assert.equal(result.metadata.Model, "gpt-oss 120B");
  assert.equal(result.url, "https://duck.ai/");

  // Title check
  assert.equal(
    result.title,
    "what do u think of https://github.com/Covai-Labs/ai-chat-exporter",
  );

  // Message turn count & alternation
  assert.equal(result.messages.length, 14);
  result.messages.forEach((m, i) => {
    assert.equal(m.role, i % 2 === 0 ? "User" : "Duck.ai");
  });

  // Turn 0: User prompt with link (favicons sanitized)
  assert.ok(
    result.messages[0].content.includes(
      "[github.com/Covai-Labs/ai-chat-exporter](https://github.com/Covai-Labs/ai-chat-exporter)",
    ),
  );
  assert.equal(result.messages[0].content.includes("![](//"), false);

  // Turn 1: Assistant response under Gemma 4 31B
  assert.equal(result.messages[1].model, "Gemma 4 31B");
  assert.ok(
    result.messages[1].content.includes(
      'Since I cannot "think" or have personal opinions',
    ),
  );

  // Turn 3: Assistant response under gpt-oss 120B with table and citations
  assert.equal(result.messages[3].model, "gpt-oss 120B");
  assert.ok(result.messages[3].content.includes("| Species (common name) |"));
  assert.ok(result.messages[3].content.includes("#### Read More"));
  assert.ok(
    result.messages[3].content.includes(
      "[22 Animals That Went Extinct in the US in 2021 (globalcitizen.org)](https://www.globalcitizen.org/en/content/animal-extinct-biodiversity-2021/)",
    ),
  );
  assert.equal(result.messages[3].content.includes("![](//"), false);

  // Turn 13: Assistant response with KaTeX math equation
  assert.ok(result.messages[13].content.includes("$e^{i\\pi}+1=0$"));
  assert.ok(result.messages[13].content.includes("$e$"));
  assert.ok(result.messages[13].content.includes("$\\pi$"));
});

test("DuckAIParser falls back gracefully on minimal or empty DOM", async () => {
  const dom = parseHTML(
    "<html><head><title>DuckDuckGo AI Chat</title></head><body></body></html>",
  );
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = { href: "https://duck.ai/" };

  const parser = new DuckAIParser();
  const result = await parser.parse();

  assert.equal(result.title, "Duck.ai Conversation");
  assert.equal(result.messages.length, 0);
  assert.equal(result.metadata.Source, "Duck.ai");
  assert.equal(result.metadata.Method, "DOM");
});
