import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import { ClaudeParser } from "../ai/claude.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FIXTURES = {
  incognito: path.join(
    __dirname,
    "fixtures",
    "claude-incognito-chat-2026-11.html",
  ),
  regular: path.join(__dirname, "fixtures", "claude-chat-2026-11.html"),
  api: path.join(__dirname, "fixtures", "claude-conversation-2026-11.json"),
};

function setupDom(fixtureKey, url) {
  const fixturePath = FIXTURES[fixtureKey];
  if (!fixturePath) {
    throw new Error(`Unknown fixture key: ${fixtureKey}`);
  }
  const html = fs.readFileSync(fixturePath, "utf-8");
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

test("ClaudeParser - Incognito and Modern Selectors", async (t) => {
  await t.test(
    "ClaudeParser DOM extracts all 12 turns from incognito chat fixture",
    async () => {
      setupDom("incognito", "https://claude.ai/new?incognito");
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
        // Toolbar text and timestamps should not pollute exported content
        assert.ok(!result.messages[i].content.includes("2 minutes ago"));
        assert.ok(!result.messages[i].content.includes("just now"));
      }

      // First turn checks
      assert.ok(
        result.messages[0].content.includes("species that went extinct"),
      );
      assert.ok(result.messages[1].content.includes("| Species |"));
      assert.ok(result.messages[1].thinking);
      assert.ok(!result.messages[1].thinking.includes("<think>"));
      assert.ok(result.messages[1].content.startsWith("<think>\n"));

      // Math delimiter check in last turn ($$...$$)
      const lastClaudeTurn = result.messages[11];
      assert.ok(lastClaudeTurn.content.includes("$$e^{i\\pi} + 1 = 0$$"));
    },
  );

  await t.test(
    "ClaudeParser falls back to DOM when API returns temporary chat (is_temporary: true)",
    async () => {
      setupDom(
        "incognito",
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
    },
  );

  await t.test(
    "ClaudeParser returns API fallback result if DOM extraction finds 0 messages on temporary chat",
    async () => {
      // Empty DOM (e.g. unmounted transcript)
      const dom = parseHTML("<html><head></head><body></body></html>");
      globalThis.document = dom.document;
      globalThis.window = dom.window;
      globalThis.window.location = {
        href: "https://claude.ai/chat/5066fbd3-233e-41b8-a64b-577e7e153781",
        pathname: "/chat/5066fbd3-233e-41b8-a64b-577e7e153781",
        origin: "https://claude.ai",
      };
      globalThis.chrome = { runtime: { getURL: (p) => p } };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url) => {
        if (url.includes("/api/organizations/org-1/chat_conversations")) {
          return {
            ok: true,
            json: async () => ({
              uuid: "5066fbd3-233e-41b8-a64b-577e7e153781",
              name: "Temporary Chat",
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

        // Since DOM yielded 0 messages, it should safely preserve the API result
        assert.equal(result.metadata.Method, "API");
        assert.equal(result.messages.length, 2);
        assert.equal(result.messages[0].content, "Hello");
        assert.equal(result.messages[1].content, "Hi there");
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );

  await t.test(
    "ClaudeParser DOM extracts all 14 turns from regular chat fixture (November 2026)",
    async () => {
      setupDom(
        "regular",
        "https://claude.ai/chat/779c258d-43f2-45be-a67b-0fce7f65ec79",
      );
      const parser = new ClaudeParser();
      const result = await parser.parse({ parserMode: "prefer_dom" });

      assert.equal(result.metadata.Source, "Claude");
      assert.equal(result.metadata.Method, "DOM");
      assert.equal(result.messages.length, 14);

      for (let i = 0; i < result.messages.length; i++) {
        const expectedRole = i % 2 === 0 ? "User" : "Claude";
        assert.equal(result.messages[i].role, expectedRole);
        // Toolbar text and timestamps should not pollute exported content
        assert.ok(!result.messages[i].content.includes("2 minutes ago"));
        assert.ok(!result.messages[i].content.includes("just now"));
      }

      assert.ok(
        result.messages[0].content.includes("species that went extinct"),
      );
      assert.ok(result.messages[1].content.includes("| Species |"));
    },
  );

  await t.test(
    "ClaudeParser API extracts all 14 branch turns from regular conversation fixture (November 2026)",
    async () => {
      const apiData = JSON.parse(fs.readFileSync(FIXTURES.api, "utf-8"));

      setupDom("regular", "https://claude.ai/chat/" + apiData.uuid);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url) => {
        if (url.includes("/api/organizations/org-1/chat_conversations")) {
          return { ok: true, json: async () => apiData };
        }
        if (url.includes("/api/organizations")) {
          return { ok: true, json: async () => [{ uuid: "org-1" }] };
        }
        throw new Error("Unexpected url: " + url);
      };

      try {
        const parser = new ClaudeParser();
        const result = await parser.parse({ parserMode: "auto" });

        assert.equal(result.metadata.Method, "API");
        assert.equal(
          result.title,
          "Recent species extinctions caused by humans",
        );
        assert.equal(result.messages.length, 14);
        assert.equal(result.messages[0].role, "User");
        assert.equal(result.messages[1].role, "Claude");
        assert.ok(
          result.messages[0].content.includes("species that went extinct"),
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
});
