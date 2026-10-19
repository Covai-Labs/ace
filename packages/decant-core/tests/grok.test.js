import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import {
  GrokParser,
  getGrokConversationId,
  orderGrokNodes,
  formatGrokResponses,
} from "../ai/grok.js";
import { detectPlatform } from "../detection/detect-platform.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONVERSATION_ID = "4285ab4c-cc97-40a9-a4ce-f34774e41b0e";
const PAGE_URL = `https://grok.com/chat/${CONVERSATION_ID}`;

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

test("GrokParser isAvailable matches grok URLs", () => {
  const parser = new GrokParser();
  assert.equal(parser.isAvailable(PAGE_URL), true);
  assert.equal(parser.isAvailable("https://grok.com/"), true);
  assert.equal(parser.isAvailable("https://claude.ai/chat/123"), false);
});

test("getGrokConversationId extracts UUID from chat/c/conversation URLs", () => {
  assert.equal(
    getGrokConversationId(`https://grok.com/chat/${CONVERSATION_ID}`),
    CONVERSATION_ID,
  );
  assert.equal(
    getGrokConversationId(`https://grok.com/c/${CONVERSATION_ID}`),
    CONVERSATION_ID,
  );
  assert.equal(
    getGrokConversationId(
      `https://grok.com/project/cbfc80b1-9471-4b6a-9db1-02c268e80260?chat=${CONVERSATION_ID}`,
    ),
    CONVERSATION_ID,
  );
  assert.equal(
    getGrokConversationId(
      `https://grok.com/chat/${CONVERSATION_ID}?chat=invalid-non-uuid`,
    ),
    CONVERSATION_ID,
  );
  assert.equal(
    getGrokConversationId(
      `https://grok.com/chat/${CONVERSATION_ID}?chat=00000000-0000-0000-0000-000000000000`,
    ),
    CONVERSATION_ID,
  );
  assert.equal(
    getGrokConversationId(
      `https://grok.com/other-path?chat=00000000-0000-0000-0000-000000000000`,
    ),
    null,
  );
  assert.equal(
    getGrokConversationId(
      `https://example.com/project/cbfc80b1-9471-4b6a-9db1-02c268e80260?chat=${CONVERSATION_ID}`,
    ),
    null,
  );
  assert.equal(
    getGrokConversationId(
      `https://www.grok.com/project/cbfc80b1-9471-4b6a-9db1-02c268e80260?chat=${CONVERSATION_ID}`,
    ),
    CONVERSATION_ID,
  );
  assert.equal(getGrokConversationId("https://grok.com/"), null);
  assert.equal(getGrokConversationId(null), null);
});

test("detectPlatform routes grok.com to GrokParser", () => {
  const detected = detectPlatform(PAGE_URL);
  assert.ok(detected);
  assert.equal(detected.type, "ai-chat");
  assert.equal(detected.parser.getPlatformName(), "Grok");
});

test("orderGrokNodes rebuilds the parent-linked branch in order", () => {
  const data = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "fixtures", "grok-api-response.json"),
      "utf-8",
    ),
  );
  const ordered = orderGrokNodes(data.responseNodes);
  assert.equal(ordered.length, 14);
  // Chain integrity: every non-root node follows its parent.
  const indexById = new Map(ordered.map((n, i) => [n.responseId, i]));
  for (const node of ordered) {
    if (node.parentResponseId && indexById.has(node.parentResponseId)) {
      assert.ok(
        indexById.get(node.parentResponseId) < indexById.get(node.responseId),
      );
    }
  }
  // Alternates human/assistant starting with the user prompt.
  assert.equal(ordered[0].sender, "human");
  assert.equal(ordered[1].sender, "assistant");
});

test("formatGrokResponses maps 14 nodes to alternating User/Grok messages", () => {
  const data = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "fixtures", "grok-api-response.json"),
      "utf-8",
    ),
  );
  const orderedIds = orderGrokNodes(data.responseNodes).map(
    (n) => n.responseId,
  );
  const { messages } = formatGrokResponses(data.responses, orderedIds, "t");
  assert.equal(messages.length, 14);
  assert.equal(messages[0].role, "User");
  assert.ok(messages[0].content.includes("species that went extinct"));
  assert.equal(messages[1].role, "Grok");
  assert.ok(messages[1].content.includes("Baiji"));
  assert.ok(messages[0].timestamp);
});

test("GrokParser DOM extracts 14 alternating turns from Sept fixture", async () => {
  setupDom("grok-chat.html", PAGE_URL);
  const parser = new GrokParser();
  const result = await parser.parse({ parserMode: "prefer_dom" });
  assert.equal(result.metadata.Source, "Grok");
  assert.equal(result.metadata.Method, "DOM");
  assert.equal(result.title, "Recent Human-Caused Extinctions");
  assert.equal(result.messages.length, 14);
  result.messages.forEach((m, i) => {
    assert.equal(m.role, i % 2 === 0 ? "User" : "Grok");
  });
  assert.ok(result.messages[0].content.includes("species that went extinct"));
});

test("GrokParser prefer_dom never calls fetch", async () => {
  setupDom("grok-chat.html", PAGE_URL);
  const parser = new GrokParser();
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("must not be called");
  };
  try {
    const result = await parser.parse({ parserMode: "prefer_dom" });
    assert.equal(fetchCalled, false);
    assert.equal(result.metadata.Method, "DOM");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GrokParser API path uses response-node + load-responses (mocked)", async () => {
  setupDom("grok-chat.html", PAGE_URL);
  const data = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "fixtures", "grok-api-response.json"),
      "utf-8",
    ),
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (url.includes("/conversations_v2/")) {
      return {
        ok: true,
        json: async () => ({ conversation: data.conversation }),
      };
    }
    if (url.includes("/response-node")) {
      return {
        ok: true,
        json: async () => ({ responseNodes: data.responseNodes }),
      };
    }
    if (url.includes("/load-responses")) {
      const wanted = new Set(JSON.parse(options.body).responseIds);
      return {
        ok: true,
        json: async () => ({
          responses: data.responses.filter((r) => wanted.has(r.responseId)),
        }),
      };
    }
    return { ok: false, status: 404 };
  };
  try {
    const parser = new GrokParser();
    const result = await parser.parse();
    assert.equal(result.metadata.Method, "API");
    assert.equal(result.title, "Recent Human-Caused Extinctions");
    assert.equal(result.messages.length, 14);
    assert.equal(result.messages[0].role, "User");
    assert.equal(result.messages[1].role, "Grok");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GrokParser falls back to DOM when API fails", async () => {
  setupDom("grok-chat.html", PAGE_URL);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 401 });
  try {
    const parser = new GrokParser();
    const result = await parser.parse();
    assert.equal(result.metadata.Method, "DOM");
    assert.equal(result.messages.length, 14);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
