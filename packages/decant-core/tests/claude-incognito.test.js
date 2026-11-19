import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
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
  globalThis.window.location = {
    href: url,
    pathname: new URL(url).pathname,
    origin: "https://claude.ai",
  };
  globalThis.chrome = { runtime: { getURL: (p) => p } };
  return dom;
}

test("ClaudeParser DOM extracts all 12 turns from incognito chat fixture", async () => {
  setupDom(
    "claude-incognito-chat-2026-11.html",
    "https://claude.ai/new?incognito",
  );
  const parser = new ClaudeParser();
  assert.equal(parser.isAvailable("https://claude.ai/new?incognito"), true);

  const result = await parser.parse({ parserMode: "prefer_dom" });
  assert.equal(result.metadata.Source, "Claude");
  assert.equal(result.metadata.Method, "DOM");
  assert.equal(result.messages.length, 12);

  // Alternating User and Claude turns
  for (let i = 0; i < result.messages.length; i++) {
    const expectedRole = i % 2 === 0 ? "User" : "Claude";
    assert.equal(result.messages[i].role, expectedRole);
  }

  // First turn checks
  assert.ok(result.messages[0].content.includes("species that went extinct"));
  assert.ok(result.messages[1].content.includes("| Species |"));
  assert.ok(result.messages[1].thinking);
  assert.ok(!result.messages[1].thinking.includes("<think>"));
  assert.ok(result.messages[1].content.startsWith("<think>\n"));

  // Math delimiter check in last turn ($$...$$)
  const lastClaudeTurn = result.messages[11];
  assert.ok(lastClaudeTurn.content.includes("$$e^{i\\pi} + 1 = 0$$"));
});

test("ClaudeParser falls back to DOM when API returns temporary chat (is_temporary: true)", async () => {
  setupDom(
    "claude-incognito-chat-2026-11.html",
    "https://claude.ai/chat/5066fbd3-233e-41b8-a64b-577e7e153781",
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes("/api/organizations/org-1/chat_conversations")) {
      return {
        ok: true,
        json: async () => ({
          uuid: "5066fbd3-233e-41b8-a64b-577e7e153781",
          is_temporary: true,
          current_leaf_message_uuid: "leaf-uuid",
          chat_messages: [
            {
              uuid: "root-uuid",
              sender: "human",
              text: "Hello",
              parent_message_uuid: "00000000-0000-0000-0000-000000000000",
            },
            {
              uuid: "leaf-uuid",
              sender: "assistant",
              text: "Hi there",
              parent_message_uuid: "root-uuid",
            },
          ],
        }),
      };
    }
    if (url.includes("/api/organizations")) {
      return { ok: true, json: async () => [{ uuid: "org-1" }] };
    }
    throw new Error("Unexpected url: " + url);
  };

  try {
    const parser = new ClaudeParser();
    const result = await parser.parse({ parserMode: "auto" });

    // Should detect is_temporary and fall through to DOM parsing, getting all 12 turns
    assert.equal(result.metadata.Method, "DOM");
    assert.equal(result.messages.length, 12);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
