import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import {
  ZAiParser,
  getZaiChatId,
  orderZaiHistory,
  formatZaiMessage,
} from "../ai/z_ai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHAT_ID = "433091ef-0fd8-4684-aaf5-e04b3dceca21";
const PAGE_URL = `https://chat.z.ai/c/${CHAT_ID}`;

function setupDom(fixtureFile, url) {
  const html = fs.readFileSync(
    path.join(__dirname, "fixtures", fixtureFile),
    "utf-8",
  );
  const dom = parseHTML(html);
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = { href: url };
}

test("ZAiParser isAvailable matches chat.z.ai URLs", () => {
  const parser = new ZAiParser();
  assert.equal(parser.isAvailable(PAGE_URL), true);
  assert.equal(parser.isAvailable("https://chat.z.ai/"), true);
  assert.equal(parser.isAvailable("https://claude.ai/chat/123"), false);
});

test("getZaiChatId extracts chat UUID from /c/ URLs", () => {
  assert.equal(getZaiChatId(PAGE_URL), CHAT_ID);
  assert.equal(getZaiChatId("https://chat.z.ai/"), null);
});

test("orderZaiHistory walks parentId chain from currentId", () => {
  const data = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "fixtures", "zai-api-response.json"),
      "utf-8",
    ),
  );
  const history = data.chat.chat.history;
  const ordered = orderZaiHistory(history.messages, history.currentId);
  assert.equal(ordered.length, 14);
  // Every child follows its parent in the ordered list.
  const indexById = new Map(ordered.map((id, i) => [id, i]));
  for (const id of ordered) {
    const parent = history.messages[id]?.parentId;
    if (parent && indexById.has(parent)) {
      assert.ok(indexById.get(parent) < indexById.get(id));
    }
  }
});

test("formatZaiMessage maps user content and assistant text blocks", () => {
  const data = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "fixtures", "zai-api-response.json"),
      "utf-8",
    ),
  );
  const history = data.chat.chat.history;
  const ordered = orderZaiHistory(history.messages, history.currentId);
  const messages = ordered.map((id) => formatZaiMessage(data.messages[id]));
  assert.ok(messages.every(Boolean));
  assert.equal(messages.length, 14);
  assert.equal(messages[0].role, "User");
  assert.ok(messages[0].content.includes("species that went extinct"));
  assert.equal(messages[1].role, "Z.ai");
  assert.ok(messages[1].content.includes("Recently Extinct Species"));
  // Reasoning blocks are preserved in standardized <think> block and on msg.thinking.
  assert.ok(messages[13].content.includes("<think>"));
  assert.ok(messages[13].content.includes("</think>"));
  assert.ok(messages[13].thinking);
  assert.ok(messages[13].thinking.includes("XXXX.in"));
});

test("ZAiParser DOM extracts 14 alternating turns from Sept fixture", async () => {
  setupDom("zai-chat.html", PAGE_URL);
  const result = await new ZAiParser().parse({ parserMode: "prefer_dom" });
  assert.equal(result.metadata.Source, "Z.ai");
  assert.equal(result.metadata.Method, "DOM");
  assert.equal(result.messages.length, 14);
  result.messages.forEach((m, i) => {
    assert.equal(m.role, i % 2 === 0 ? "User" : "Z.ai");
  });
});

test("ZAiParser API path returns skeleton-ordered messages (mocked)", async () => {
  setupDom("zai-chat.html", PAGE_URL);
  const data = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "fixtures", "zai-api-response.json"),
      "utf-8",
    ),
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith(`/api/v1/chats/${CHAT_ID}`)) {
      return { ok: true, json: async () => data.chat };
    }
    if (url.includes("/messages/batch")) {
      const wanted = new Set(JSON.parse(options.body).ids);
      const out = {};
      for (const [id, msg] of Object.entries(data.messages)) {
        if (wanted.has(id)) out[id] = msg;
      }
      return { ok: true, json: async () => ({ data: out }) };
    }
    return { ok: false, status: 404 };
  };
  try {
    const result = await new ZAiParser().parse();
    assert.equal(result.metadata.Method, "API");
    assert.equal(result.title, "Recent Extinct Species & Causes");
    assert.equal(result.messages.length, 14);
    assert.equal(result.messages[0].role, "User");
    assert.equal(result.messages[1].role, "Z.ai");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ZAiParser falls back to DOM when API fails", async () => {
  setupDom("zai-chat.html", PAGE_URL);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 401 });
  try {
    const result = await new ZAiParser().parse();
    assert.equal(result.metadata.Method, "DOM");
    assert.equal(result.messages.length, 14);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
