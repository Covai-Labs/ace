import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import { ChatGPTParser, linearize } from "../ai/chatgpt.js";
import { ClaudeParser } from "../ai/claude.js";
import { DeepSeekParser } from "../ai/deepseek.js";
import { orderZaiHistory, formatZaiMessage } from "../ai/z_ai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("ChatGPT parser standardizes thinking output to <think> tag and msg.thinking", () => {
  const fixturePath = path.join(
    __dirname,
    "fixtures",
    "chatgpt-thoughts-api-response.json",
  );
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
  const apiMessages = linearize(fixture.mapping, false, fixture.current_node);
  const parser = new ChatGPTParser();
  const res = parser.formatApiResult(
    fixture,
    apiMessages,
    "Test Title",
    "https://chatgpt.com/c/6ab55ff4-fc78-83e8-9f43-11e5e657d457",
  );

  assert.equal(res.messages.length, 2);
  const [userMsg, assistantMsg] = res.messages;

  // User message has no thinking
  assert.equal(userMsg.role, "User");
  assert.equal(userMsg.thinking, undefined);
  assert.ok(!userMsg.content.includes("<think>"));

  // Assistant message has standardized thinking
  assert.equal(assistantMsg.role, "ChatGPT");
  assert.ok(assistantMsg.thinking);
  assert.ok(!assistantMsg.thinking.includes("<think>"));
  assert.ok(!assistantMsg.thinking.includes("</think>"));
  assert.ok(
    assistantMsg.thinking.includes("Distinguishing ideological overlap"),
  );

  // Content starts with <think> block and continues with response text
  assert.ok(assistantMsg.content.startsWith("<think>\n"));
  assert.ok(assistantMsg.content.includes("</think>\n\n"));
  assert.ok(
    assistantMsg.content.includes(
      "Tamil Nadu politics has several different axes",
    ),
  );
});

test("Claude parser standardizes thinking output to <think> tag and msg.thinking", async () => {
  const fixturePath = path.join(
    __dirname,
    "fixtures",
    "claude-thinking-api-response.json",
  );
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

  const dom = parseHTML(
    "<html><head><title>Test</title></head><body></body></html>",
  );
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = {
    href: "https://claude.ai/chat/" + fixture.uuid,
    pathname: "/chat/" + fixture.uuid,
  };
  globalThis.chrome = { runtime: { getURL: (p) => p } };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes("/api/organizations/org-1/chat_conversations")) {
      return { ok: true, json: async () => fixture };
    }
    if (url.includes("/api/organizations")) {
      return { ok: true, json: async () => [{ uuid: "org-1" }] };
    }
    throw new Error("Unexpected url: " + url);
  };

  try {
    const parser = new ClaudeParser();
    const res = await parser.parse();

    assert.equal(res.metadata.Method, "API");
    assert.equal(res.messages.length, 2);
    const [userMsg, assistantMsg] = res.messages;

    // User message
    assert.equal(userMsg.role, "User");
    assert.equal(userMsg.thinking, undefined);
    assert.ok(!userMsg.content.includes("<think>"));

    // Assistant message with thinking summaries
    assert.equal(assistantMsg.role, "Claude");
    assert.ok(assistantMsg.thinking);
    assert.ok(!assistantMsg.thinking.includes("<think>"));
    assert.ok(!assistantMsg.thinking.includes("</think>"));
    assert.ok(
      assistantMsg.thinking.includes(
        "Exploring political ties between regional and national parties.",
      ),
    );
    assert.ok(assistantMsg.content.startsWith("<think>\n"));
    assert.ok(assistantMsg.content.includes("</think>\n\n"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("DeepSeek DOM and API parsers standardize thinking output", async () => {
  const pageUrl =
    "https://chat.deepseek.com/a/chat/s/7fed8292-d7a0-49f0-b7e9-c2c0da396b59";
  const html = fs.readFileSync(
    path.join(__dirname, "fixtures", "deepseek-chat.html"),
    "utf-8",
  );
  const dom = parseHTML(html);
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = { href: pageUrl };
  globalThis.localStorage = { getItem: () => null };

  const domResult = await new DeepSeekParser().parse({
    parserMode: "prefer_dom",
  });
  assert.equal(domResult.metadata.Method, "DOM");
  assert.equal(domResult.messages.length, 16);

  // Turn 0 (user) has no thinking
  assert.equal(domResult.messages[0].role, "User");
  assert.equal(domResult.messages[0].thinking, undefined);
  assert.ok(!domResult.messages[0].content.includes("<think>"));

  // Turn 1 (standard assistant response) has no thinking
  assert.equal(domResult.messages[1].role, "DeepSeek");
  assert.equal(domResult.messages[1].thinking, undefined);
  assert.ok(!domResult.messages[1].content.includes("<think>"));

  // Turn 13 has thinking block
  assert.equal(domResult.messages[13].role, "DeepSeek");
  assert.ok(domResult.messages[13].thinking);
  assert.ok(!domResult.messages[13].thinking.includes("<think>"));
  assert.ok(domResult.messages[13].content.startsWith("<think>\n"));
  assert.ok(domResult.messages[13].content.includes("</think>\n\n"));
  assert.ok(
    domResult.messages[13].thinking.includes(
      'The user asks about "XXXX\'s (XXXX.in/)" life',
    ),
  );

  // Test API extraction as well
  const apiData = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "fixtures", "deepseek-api-response.json"),
      "utf-8",
    ),
  );
  globalThis.localStorage = {
    getItem: () => JSON.stringify({ value: "tok" }),
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => apiData });
  try {
    const apiResult = await new DeepSeekParser().parse();
    assert.equal(apiResult.metadata.Method, "API");
    assert.equal(apiResult.messages.length, 16);
    assert.ok(apiResult.messages[13].thinking);
    assert.ok(apiResult.messages[13].content.startsWith("<think>\n"));
    assert.ok(apiResult.messages[13].content.includes("</think>\n\n"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Z.ai parser standardizes reasoning output to <think> tag and msg.thinking", () => {
  const fixturePath = path.join(__dirname, "fixtures", "zai-api-response.json");
  const data = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
  const history = data.chat.chat.history;
  const ordered = orderZaiHistory(history.messages, history.currentId);
  const messages = ordered.map((id) => formatZaiMessage(data.messages[id]));

  assert.equal(messages.length, 14);

  // Turn 0 (user) has no thinking
  assert.equal(messages[0].role, "User");
  assert.equal(messages[0].thinking, undefined);
  assert.ok(!messages[0].content.includes("<think>"));

  // Turn 13 has reasoning
  assert.equal(messages[13].role, "Z.ai");
  assert.ok(messages[13].thinking);
  assert.ok(!messages[13].thinking.includes("<think>"));
  assert.ok(!messages[13].thinking.includes("</think>"));
  assert.ok(messages[13].thinking.includes("XXXX.in"));
  assert.ok(messages[13].content.startsWith("<think>\n"));
  assert.ok(messages[13].content.includes("</think>\n\n"));
});
