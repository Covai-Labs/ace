import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import { ClaudeParser } from "../ai/claude.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("ClaudeParser DOM fallback unrolls interactive carousel elements from fixture", async () => {
  const fixturePath = path.join(
    __dirname,
    "fixtures",
    "claude-carousel-sample.html",
  );
  const html = fs.readFileSync(fixturePath, "utf-8");

  const dom = parseHTML(html);
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.chrome = { runtime: { getURL: (p) => p } };

  const parser = new ClaudeParser();
  const result = await parser.parse({ parserMode: "prefer_dom" });

  assert.equal(result.metadata.Source, "Claude");
  assert.equal(result.metadata.Method, "DOM");
  assert.equal(result.messages.length, 4);

  // First message: User prompt
  const userMsg1 = result.messages[0];
  assert.equal(userMsg1.role, "User");

  // Last message: Claude response containing the 8 recommendations carousel
  const lastClaudeMsg = result.messages[result.messages.length - 1];
  assert.equal(lastClaudeMsg.role, "Claude");

  // Intro text preserved
  assert.ok(
    lastClaudeMsg.content.includes(
      "A few structural issues are holding it back",
    ),
    "Expected intro text to be preserved",
  );

  // All 8 recommendations unrolled as numbered markdown headings
  assert.ok(
    lastClaudeMsg.content.includes("### 1. Embed real screenshots") ||
      lastClaudeMsg.content.includes("### 1\\. Embed real screenshots"),
    "Slide 1 title missing",
  );
  assert.ok(
    lastClaudeMsg.content.includes(
      "Right now the only visual is a YouTube thumbnail link",
    ),
    "Slide 1 body missing",
  );

  assert.ok(
    lastClaudeMsg.content.includes("### 2. Add a visible star ask") ||
      lastClaudeMsg.content.includes("### 2\\. Add a visible star ask"),
    "Slide 2 title missing",
  );

  assert.ok(
    lastClaudeMsg.content.includes("### 3. Add a star-history chart") ||
      lastClaudeMsg.content.includes("### 3\\. Add a star-history chart"),
    "Slide 3 title missing",
  );

  assert.ok(
    lastClaudeMsg.content.includes("### 4. Add a permissions/trust section") ||
      lastClaudeMsg.content.includes(
        "### 4\\. Add a permissions/trust section",
      ),
    "Slide 4 title missing",
  );

  assert.ok(
    lastClaudeMsg.content.includes(
      "### 5. Add a short FAQ/Troubleshooting section",
    ) ||
      lastClaudeMsg.content.includes(
        "### 5\\. Add a short FAQ/Troubleshooting section",
      ),
    "Slide 5 title missing",
  );

  assert.ok(
    lastClaudeMsg.content.includes("### 6. Add CI and download-count badges") ||
      lastClaudeMsg.content.includes(
        "### 6\\. Add CI and download-count badges",
      ),
    "Slide 6 title missing",
  );

  assert.ok(
    lastClaudeMsg.content.includes("### 7. Add a table of contents") ||
      lastClaudeMsg.content.includes("### 7\\. Add a table of contents"),
    "Slide 7 title missing",
  );

  assert.ok(
    lastClaudeMsg.content.includes("### 8. Differentiate from alternatives") ||
      lastClaudeMsg.content.includes(
        "### 8\\. Differentiate from alternatives",
      ),
    "Slide 8 title missing",
  );
  assert.ok(
    lastClaudeMsg.content.includes("short 'Why this one' comparison"),
    "Slide 8 body missing",
  );

  // Outro text preserved
  assert.ok(
    lastClaudeMsg.content.includes(
      "Beyond the README itself: stars mostly come from",
    ),
    "Expected outro text to be preserved",
  );

  // No button step noise
  assert.ok(!lastClaudeMsg.content.includes("Go to step 1"));
  assert.ok(!lastClaudeMsg.content.includes("Go to step 8"));
});

test("ClaudeParser API handles interactive widget, questionnaire tool use, and artifact updates", async () => {
  const parser = new ClaudeParser();

  const mockApiData = {
    name: "Interactive Claude Chat",
    model: "claude-3-7-sonnet",
    current_leaf_message_uuid: "msg-4",
    chat_messages: [
      {
        uuid: "msg-1",
        sender: "human",
        parent_message_uuid: null,
        content: [{ type: "text", text: "Design a dashboard" }],
      },
      {
        uuid: "msg-2",
        sender: "assistant",
        parent_message_uuid: "msg-1",
        content: [
          {
            type: "tool_use",
            id: "tool-ask-1",
            name: "AskUserQuestion",
            input: {
              questions: [
                { question: "What is the primary color scheme?" },
                { question: "Include dark mode support?" },
              ],
            },
          },
          {
            type: "tool_use",
            id: "tool-widget-1",
            name: "visualize:show_widget",
            input: {
              title: "Interactive Metrics Dashboard",
              widget_code:
                "export default function Widget() { return <div>Metrics</div>; }",
            },
          },
          {
            type: "tool_use",
            id: "tool-art-1",
            name: "artifacts",
            input: {
              id: "art-1",
              title: "Dashboard Implementation",
              type: "application/vnd.ant.code",
              language: "typescript",
              command: "create",
              content: "const a = 1;",
            },
          },
        ],
      },
      {
        uuid: "msg-3",
        sender: "human",
        parent_message_uuid: "msg-2",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool-ask-1",
            content: JSON.stringify({
              answers: {
                "What is the primary color scheme?": "Indigo and Amber",
                "Include dark mode support?": "Yes, mandatory",
              },
            }),
          },
        ],
      },
      {
        uuid: "msg-4",
        sender: "assistant",
        parent_message_uuid: "msg-3",
        content: [
          {
            type: "tool_use",
            id: "tool-art-2",
            name: "artifacts",
            input: {
              id: "art-1",
              command: "update",
              old_str: "const a = 1;",
              new_str: "const a = 1;\nconst b = 2;",
            },
          },
          {
            type: "text",
            text: "Updated dashboard code with the requested changes.",
          },
        ],
      },
    ],
  };

  // Mock global window/fetch/location
  const dom = parseHTML(
    "<html><head><title>Test</title></head><body></body></html>",
  );
  globalThis.document = dom.document;
  globalThis.window = Object.assign(dom.window, {
    location: {
      pathname: "/chat/12345678-1234-1234-1234-123456789abc",
      href: "https://claude.ai/chat/12345678-1234-1234-1234-123456789abc",
      origin: "https://claude.ai",
    },
  });

  globalThis.fetch = async (url) => {
    if (url.includes("/chat_conversations/")) {
      return {
        ok: true,
        json: async () => mockApiData,
      };
    }
    if (url.includes("/api/organizations")) {
      return {
        ok: true,
        json: async () => [{ uuid: "org-123", capabilities: ["chat"] }],
      };
    }
    return { ok: false, status: 404 };
  };

  const result = await parser.parse({ parserMode: "api" });

  assert.equal(result.metadata.Method, "API");
  assert.equal(result.metadata.Model, "claude-3-7-sonnet");

  // Check AskUserQuestion tool paired with tool_result answers
  const claudeMsg1 = result.messages.find(
    (m) => m.role === "Claude" && m.content.includes("Asked 2 questions:"),
  );
  assert.ok(claudeMsg1, "Expected AskUserQuestion content in Claude message");
  assert.ok(
    claudeMsg1.content.includes(
      "What is the primary color scheme?** — Indigo and Amber",
    ),
  );
  assert.ok(
    claudeMsg1.content.includes(
      "Include dark mode support?** — Yes, mandatory",
    ),
  );

  // Check widget inlining
  assert.ok(
    claudeMsg1.content.includes(
      "> **Interactive Widget: Interactive Metrics Dashboard**",
    ),
  );
  assert.ok(claudeMsg1.content.includes("export default function Widget()"));

  // Check folded artifact update emitted exactly once at its final state (no duplicate on create)
  const artifactMessages = result.messages.filter(
    (m) => m.role === "Claude Artifact",
  );
  assert.equal(
    artifactMessages.length,
    1,
    "Artifact must be emitted exactly once at its final state",
  );
  assert.ok(
    artifactMessages[0].content.includes("const a = 1;\nconst b = 2;"),
    "Expected folded artifact update",
  );
});

test("ClaudeParser API handles unmatched update diff safely without corrupting artifact", async () => {
  const parser = new ClaudeParser();

  const mockApiData = {
    name: "Unmatched Diff Chat",
    model: "claude-3-7-sonnet",
    current_leaf_message_uuid: "msg-2",
    chat_messages: [
      {
        uuid: "msg-1",
        sender: "assistant",
        parent_message_uuid: null,
        content: [
          {
            type: "tool_use",
            id: "tool-art-1",
            name: "artifacts",
            input: {
              id: "art-safe",
              title: "Safe Artifact",
              type: "application/vnd.ant.code",
              language: "javascript",
              command: "create",
              content: "function hello() { return 'world'; }",
            },
          },
        ],
      },
      {
        uuid: "msg-2",
        sender: "assistant",
        parent_message_uuid: "msg-1",
        content: [
          {
            type: "tool_use",
            id: "tool-art-2",
            name: "artifacts",
            input: {
              id: "art-safe",
              command: "update",
              old_str: "NON_EXISTENT_STRING",
              new_str: "CORRUPTED_CODE",
            },
          },
        ],
      },
    ],
  };

  const dom = parseHTML(
    "<html><head><title>Test</title></head><body></body></html>",
  );
  globalThis.document = dom.document;
  globalThis.window = Object.assign(dom.window, {
    location: {
      pathname: "/chat/12345678-1234-1234-1234-123456789abc",
      href: "https://claude.ai/chat/12345678-1234-1234-1234-123456789abc",
      origin: "https://claude.ai",
    },
  });

  globalThis.fetch = async (url) => {
    if (url.includes("/chat_conversations/")) {
      return { ok: true, json: async () => mockApiData };
    }
    if (url.includes("/api/organizations")) {
      return {
        ok: true,
        json: async () => [{ uuid: "org-123", capabilities: ["chat"] }],
      };
    }
    return { ok: false, status: 404 };
  };

  const result = await parser.parse({ parserMode: "api" });
  const art = result.messages.find((m) => m.role === "Claude Artifact");
  assert.ok(art);
  assert.ok(art.content.includes("function hello() { return 'world'; }"));
  assert.ok(
    !art.content.includes("CORRUPTED_CODE"),
    "Unmatched diff must not be appended",
  );
});
