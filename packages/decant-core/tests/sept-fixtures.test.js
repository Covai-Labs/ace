import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import { MistralParser } from "../ai/mistral.js";
import { QwenParser } from "../ai/qwen.js";
import { LumoParser } from "../ai/lumo.js";
import { ClaudeParser } from "../ai/claude.js";

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

test("MistralParser DOM extracts 14 turns with correct title (Sept fixture)", async () => {
  setupDom(
    "mistral-chat.html",
    "https://chat.mistral.ai/chat/2efb3914-a573-40ac-a400-a56fdbf180f7",
  );
  const parser = new MistralParser();
  assert.equal(parser.isAvailable("https://chat.mistral.ai/chat/abc"), true);
  const result = await parser.parse();
  assert.equal(result.metadata.Method, "DOM");
  // Title comes from document.title, not the "Upgrade to Pro" sidebar pill.
  assert.equal(result.title, "Human-caused recent extinctions");
  assert.equal(result.messages.length, 14);
  result.messages.forEach((m, i) => {
    assert.equal(m.role, i % 2 === 0 ? "User" : "Mistral");
  });
  assert.ok(result.messages[0].content.includes("species that went extinct"));
  assert.ok(result.messages[1].content.length > 100);
});

test("QwenParser DOM extracts 14 turns with sidebar title (Sept fixture)", async () => {
  setupDom(
    "qwen-chat.html",
    "https://chat.qwen.ai/c/6b9eb34b-843a-4e52-9715-3faa8804ef80",
  );
  const parser = new QwenParser();
  assert.equal(parser.isAvailable("https://chat.qwen.ai/c/abc"), true);
  const result = await parser.parse();
  assert.equal(result.metadata.Method, "DOM");
  assert.equal(result.title, "Human-Caused Extinctions and Accountability");
  assert.equal(result.messages.length, 14);
  result.messages.forEach((m, i) => {
    assert.equal(m.role, i % 2 === 0 ? "User" : "Qwen");
  });
});

test("QwenParser fallback handles bare content blocks without wrappers", async () => {
  const dom = parseHTML(
    `<html><head><title>Qwen Studio</title></head><body>
      <div class="user-message-content"><p>Hello</p></div>
      <div class="qwen-markdown"><p>Hi there</p></div>
    </body></html>`,
  );
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = { href: "https://chat.qwen.ai/c/abc" };
  const result = await new QwenParser().parse();
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].role, "User");
  assert.equal(result.messages[0].content, "Hello");
  assert.equal(result.messages[1].role, "Qwen");
});

test("LumoParser DOM extracts 14 turns (Sept fixture, E2EE API untouched)", async () => {
  setupDom(
    "lumo-chat.html",
    "https://lumo.proton.me/u/2/c/ee55fb95-650b-4d32-ae2f-1122ce0a2812",
  );
  const parser = new LumoParser();
  assert.equal(parser.isAvailable("https://lumo.proton.me/u/2"), true);
  const result = await parser.parse();
  assert.equal(result.metadata.Method, "DOM");
  assert.equal(result.messages.length, 14);
  result.messages.forEach((m, i) => {
    assert.equal(m.role, i % 2 === 0 ? "User" : "Lumo");
  });
  assert.ok(result.messages[0].content.includes("species that went extinct"));
});

test("ClaudeParser DOM regression on Sept fixture (API shape covered by API test)", async () => {
  const dom = setupDom(
    "claude-chat-2026-09.html",
    "https://claude.ai/chat/779c258d-43f2-45be-a67b-0fce7f65ec79",
  );
  globalThis.chrome = { runtime: { getURL: (p) => p } };
  const parser = new ClaudeParser();
  assert.equal(parser.isAvailable("https://claude.ai/chat/779c258d"), true);
  const result = await parser.parse({ parserMode: "prefer_dom" });
  assert.equal(result.metadata.Source, "Claude");
  assert.equal(result.metadata.Method, "DOM");
  assert.ok(result.messages.length >= 8);
  assert.equal(result.messages[0].role, "User");
  assert.ok(result.messages[0].content.includes("species that went extinct"));
  // Alternation holds for the rendered transcript rows.
  for (let i = 0; i + 1 < result.messages.length; i += 2) {
    assert.equal(result.messages[i].role, "User");
  }
  void dom;
});

test("ClaudeParser API fixture branch-walks current_leaf_message_uuid", async () => {
  const data = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "fixtures", "claude-conversation-2026-09.json"),
      "utf-8",
    ),
  );
  assert.equal(data.chat_messages.length, 16);
  assert.ok(data.current_leaf_message_uuid);
  // Replicate the parser's branch walk: leaf -> root via parent_message_uuid.
  // The walk yields the 14 current-branch messages; the Euler Q&A pair sits
  // on a superseded (edited) branch and is correctly excluded.
  const byUuid = new Map(data.chat_messages.map((m) => [m.uuid, m]));
  const branch = [];
  let current = data.current_leaf_message_uuid;
  const seen = new Set();
  while (current && byUuid.has(current) && !seen.has(current)) {
    seen.add(current);
    branch.unshift(byUuid.get(current));
    current = byUuid.get(current).parent_message_uuid;
    if (!byUuid.has(current)) break;
  }
  assert.equal(branch.length, 14);
  assert.equal(branch[0].sender, "human");
  assert.ok(branch[0].content[0].text.includes("species that went extinct"));
  const lastAssistant = branch.filter((m) => m.sender === "assistant").pop();
  const textBlocks = lastAssistant.content.filter((b) => b.type === "text");
  assert.ok(textBlocks.length > 0);
  assert.ok(textBlocks[0].text.length > 100);
});
