import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import {
  MetaParser,
  getMetaConversationId,
  extractMetaUserText,
  extractMetaAssistantText,
  extractMetaDocIdCandidates,
  getMetaScriptUrls,
  __resetMetaDocIdCache,
  formatMetaEdges,
} from "../ai/meta.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONVERSATION_ID = "2fe13421-efcc-4be0-811e-dfbec83d5dd6";
const PAGE_URL = `https://www.meta.ai/c/${CONVERSATION_ID}`;

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

function loadApiFixture() {
  return JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "fixtures", "meta-api-response.json"),
      "utf-8",
    ),
  );
}

test("MetaParser isAvailable matches meta.ai URLs", () => {
  const parser = new MetaParser();
  assert.equal(parser.isAvailable(PAGE_URL), true);
  assert.equal(parser.isAvailable("https://meta.ai/"), true);
  assert.equal(parser.isAvailable("https://claude.ai/chat/123"), false);
});

test("getMetaConversationId extracts UUID from /c/ and /chat/ URLs", () => {
  assert.equal(getMetaConversationId(PAGE_URL), CONVERSATION_ID);
  assert.equal(
    getMetaConversationId(`https://www.meta.ai/chat/${CONVERSATION_ID}`),
    CONVERSATION_ID,
  );
  assert.equal(
    getMetaConversationId(`https://www.meta.ai/prompt/${CONVERSATION_ID}`),
    CONVERSATION_ID,
  );
  assert.equal(getMetaConversationId("https://www.meta.ai/"), null);
});

test("formatMetaEdges maps merged pages to 14 alternating messages", () => {
  const data = loadApiFixture();
  assert.equal(data.edges.length, 14);
  const messages = formatMetaEdges(data.edges);
  assert.equal(messages.length, 14);
  messages.forEach((m, i) => {
    assert.equal(m.role, i % 2 === 0 ? "User" : "Meta AI");
  });
  assert.ok(messages[0].content.includes("extinct"));
  assert.ok(messages[1].content.includes("baiji"));
  // Later turns cover the RSS/Tamil-nationalist questions.
  assert.ok(messages.some((m) => m.content.includes("RSS")));
});

test("extractMetaAssistantText prefers message.content over primitives", () => {
  const data = loadApiFixture();
  const assistantNode = data.edges
    .map((e) => e.node)
    .find((n) => n.__typename === "AssistantMessage");
  const text = extractMetaAssistantText(assistantNode);
  assert.ok(text.length > 100);
  assert.ok(text.includes("RSS"));
});

test("extractMetaUserText reads userContent", () => {
  const data = loadApiFixture();
  const userNode = data.edges
    .map((e) => e.node)
    .find((n) => n.__typename === "UserMessage");
  assert.ok(extractMetaUserText(userNode).includes("RSS"));
});

test("MetaParser DOM extracts 14 alternating turns (thinking stub ignored)", async () => {
  setupDom("meta-chat.html", PAGE_URL);
  const result = await new MetaParser().parse({ parserMode: "prefer_dom" });
  assert.equal(result.metadata.Source, "Meta AI");
  assert.equal(result.metadata.Method, "DOM");
  assert.equal(result.title, "Recent extinctions due to humans");
  assert.equal(result.messages.length, 14);
  result.messages.forEach((m, i) => {
    assert.equal(m.role, i % 2 === 0 ? "User" : "Meta AI");
  });
  // Assistant answers must be the full article text, not the stub.
  assert.ok(result.messages[1].content.length > 500);
  assert.ok(result.messages[1].content.includes("baiji"));
  assert.ok(result.messages.some((m) => m.content.includes("RSS")));
});

test("MetaParser API path paginates and returns Method:API (mocked)", async () => {
  setupDom("meta-chat.html", PAGE_URL);
  const data = loadApiFixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.ok(url.includes("/api/graphql"));
    const body = JSON.parse(options.body);
    if (!body.variables.before) {
      // First page: latest 10 edges.
      return {
        ok: true,
        json: async () => ({
          data: {
            conversation: {
              displayTitle: "Recent extinctions due to humans",
              id: data.conversationId,
              messages: {
                edges: data.edges.slice(-10),
                pageInfo: { hasPreviousPage: true, startCursor: "cursor-10" },
              },
            },
          },
        }),
      };
    }
    // Second page: remaining 4 edges, no more history.
    return {
      ok: true,
      json: async () => ({
        data: {
          conversation: {
            id: data.conversationId,
            messages: {
              edges: data.edges.slice(0, 4),
              pageInfo: { hasPreviousPage: false, startCursor: null },
            },
          },
        },
      }),
    };
  };
  try {
    const result = await new MetaParser().parse();
    assert.equal(result.metadata.Method, "API");
    assert.equal(result.title, "Recent extinctions due to humans");
    assert.equal(result.messages.length, 14);
    assert.equal(result.messages[0].role, "User");
    assert.equal(result.messages[13].role, "Meta AI");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MetaParser falls back to DOM when GraphQL doc_ids rotate", async () => {
  setupDom("meta-chat.html", PAGE_URL);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ data: { conversation: null } }),
  });
  try {
    const result = await new MetaParser().parse();
    assert.equal(result.metadata.Method, "DOM");
    assert.equal(result.messages.length, 14);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("extractMetaDocIdCandidates only trusts marker-bearing chunks", () => {
  const fresh = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const withMarker = `relay({"id":"${fresh}","operationKind":"query"});latestBranchPath`;
  assert.deepEqual(extractMetaDocIdCandidates(withMarker), [fresh]);
  // No marker -> ignored, even with a valid-looking id.
  assert.deepEqual(
    extractMetaDocIdCandidates(`{"id":"${fresh}","operationKind":"query"}`),
    [],
  );
  assert.deepEqual(extractMetaDocIdCandidates(null), []);
  // doc_id:"..." spelling is also recognized.
  const alt = `latestBranchPath;doc_id:"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"`;
  assert.deepEqual(extractMetaDocIdCandidates(alt), [
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  ]);
});

test("getMetaScriptUrls resolves absolute URLs and skips inline/data scripts", () => {
  const dom = parseHTML(
    `<html><head>
      <script>var x = 1;</script>
      <script src="/assets/app.123.js"></script>
      <script src="https://static.xx.fbcdn.net/assets/vendor.js"></script>
      <script src="data:text/javascript,alert(1)"></script>
    </head><body></body></html>`,
  );
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = { href: PAGE_URL };
  assert.deepEqual(getMetaScriptUrls(), [
    "https://www.meta.ai/assets/app.123.js",
    "https://static.xx.fbcdn.net/assets/vendor.js",
  ]);
});

test("MetaParser resolves fresh doc_ids when pinned ones rotate (mocked)", async () => {
  setupDom("meta-chat.html", PAGE_URL);
  __resetMetaDocIdCache();
  // Inject a page chunk reference for the resolver to follow.
  const script = document.createElement("script");
  script.setAttribute("src", "/assets/conversation.999.js");
  document.head.appendChild(script);

  const FRESH_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const data = loadApiFixture();
  const twoEdges = data.edges.slice(0, 2);
  let chunkFetches = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith(".js")) {
      chunkFetches += 1;
      return {
        ok: true,
        text: async () =>
          `/**/relay({"id":"${FRESH_ID}","operationKind":"query"});latestBranchPath;GenAIMarkdownTextUXPrimitive`,
      };
    }
    const body = JSON.parse(options.body);
    if (body.doc_id !== FRESH_ID) {
      return { ok: false, status: 400 }; // pinned IDs are retired
    }
    return {
      ok: true,
      json: async () => ({
        data: {
          conversation: {
            displayTitle: "Resolved conversation",
            id: data.conversationId,
            messages: {
              edges: twoEdges,
              pageInfo: { hasPreviousPage: false, startCursor: null },
            },
          },
        },
      }),
    };
  };
  try {
    const parser = new MetaParser();
    const first = await parser.parse();
    assert.equal(first.metadata.Method, "API");
    assert.equal(first.title, "Resolved conversation");
    assert.equal(first.messages.length, 2);
    assert.equal(first.messages[0].role, "User");
    // Second parse reuses the cached resolution: no more chunk fetches.
    const second = await parser.parse();
    assert.equal(second.metadata.Method, "API");
    assert.equal(chunkFetches, 1);
  } finally {
    globalThis.fetch = originalFetch;
    __resetMetaDocIdCache();
  }
});

test("MetaParser falls back to DOM when chunks yield no usable doc_id", async () => {
  setupDom("meta-chat.html", PAGE_URL);
  __resetMetaDocIdCache();
  const script = document.createElement("script");
  script.setAttribute("src", "/assets/vendor.111.js");
  document.head.appendChild(script);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.endsWith(".js")) {
      return { ok: true, text: async () => "/* vendor bundle, no queries */" };
    }
    return { ok: false, status: 400 };
  };
  try {
    const result = await new MetaParser().parse();
    assert.equal(result.metadata.Method, "DOM");
    assert.equal(result.messages.length, 14);
  } finally {
    globalThis.fetch = originalFetch;
    __resetMetaDocIdCache();
  }
});
