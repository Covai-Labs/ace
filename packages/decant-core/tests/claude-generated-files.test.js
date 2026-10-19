import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { ClaudeParser } from "../ai/claude.js";

function setupApiDom() {
  const dom = parseHTML(
    "<html><head><title>Claude Chat</title></head><body></body></html>",
  );
  globalThis.document = dom.document;
  globalThis.window = Object.assign(dom.window, {
    location: {
      pathname: "/chat/12345678-1234-1234-1234-123456789abc",
      href: "https://claude.ai/chat/12345678-1234-1234-1234-123456789abc",
      origin: "https://claude.ai",
    },
  });
  globalThis.chrome = { runtime: { getURL: (p) => p } };
}

function mockFetch(conversationData) {
  globalThis.fetch = async (url) => {
    if (url.includes("/chat_conversations/")) {
      return { ok: true, json: async () => conversationData };
    }
    if (url.includes("/api/organizations")) {
      return {
        ok: true,
        json: async () => [{ uuid: "org-123", capabilities: ["chat"] }],
      };
    }
    return { ok: false, status: 404 };
  };
}

// Synthetic conversation shaped like the File Creation integration payload:
// a present_files tool_use block (input.filepaths) paired with a tool_result
// block carrying local_resource entries (display name + mime type).
function generatedFilesConversation() {
  return {
    name: "Agent scaffold",
    model: "claude-sonnet-5",
    current_leaf_message_uuid: "msg-2",
    chat_messages: [
      {
        uuid: "msg-1",
        sender: "human",
        parent_message_uuid: null,
        content: [{ type: "text", text: "Scaffold the agent repo" }],
      },
      {
        uuid: "msg-2",
        sender: "assistant",
        parent_message_uuid: "msg-1",
        content: [
          {
            type: "tool_use",
            id: "toolu-present-1",
            name: "present_files",
            input: {
              filepaths: [
                "/mnt/user-data/outputs/deadrat-agent.tar.gz",
                "/mnt/user-data/outputs/deadrat-agent/CLAUDE.md",
                "/mnt/user-data/outputs/deadrat-agent/docs/persona/style-rules.md",
              ],
            },
          },
          {
            type: "tool_result",
            tool_use_id: "toolu-present-1",
            name: "present_files",
            content: [
              {
                type: "local_resource",
                file_path: "/mnt/user-data/outputs/deadrat-agent.tar.gz",
                name: "deadrat-agent.tar",
                mime_type: "application/x-tar",
                uuid: "uuid-tar",
              },
              {
                type: "local_resource",
                file_path: "/mnt/user-data/outputs/deadrat-agent/CLAUDE.md",
                name: "CLAUDE",
                mime_type: "text/markdown",
                uuid: "uuid-claude",
              },
              {
                type: "local_resource",
                file_path:
                  "/mnt/user-data/outputs/deadrat-agent/docs/persona/style-rules.md",
                name: "style-rules",
                mime_type: "text/markdown",
                uuid: "uuid-style",
              },
              {
                type: "text",
                text: "The file cards appear at the end of your reply.",
                uuid: "uuid-helper",
              },
            ],
          },
          { type: "text", text: "Extract the tarball into your repo root." },
        ],
      },
    ],
  };
}

test("ClaudeParser API emits present_files generated files exactly once", async () => {
  setupApiDom();
  mockFetch(generatedFilesConversation());
  const result = await new ClaudeParser().parse({ parserMode: "api" });

  assert.equal(result.metadata.Method, "API");
  const assistantMsgs = result.messages.filter((m) => m.role === "Claude");
  assert.equal(assistantMsgs.length, 1);
  const content = assistantMsgs[0].content;

  // Assistant prose preserved.
  assert.ok(content.includes("Extract the tarball into your repo root."));
  // All three files listed (tarball + markdown docs).
  assert.ok(content.includes("Generated files:"));
  assert.ok(content.includes("deadrat-agent.tar"));
  assert.ok(content.includes("CLAUDE"));
  assert.ok(content.includes("style-rules"));
  // Binary archive flagged; helper text item not treated as a file.
  assert.ok(content.includes("binary archive"));
  assert.ok(!content.includes("The file cards appear at the end"));
  // Emitted once despite tool_use + tool_result both carrying the files.
  assert.equal(content.match(/Generated files:/g).length, 1);
  assert.equal(content.match(/^-\s+`deadrat-agent\.tar`/gm).length, 1);
});

test("ClaudeParser API merges input paths missing from partial results", async () => {
  setupApiDom();
  mockFetch({
    name: "Partial",
    model: "claude-sonnet-5",
    current_leaf_message_uuid: "msg-2",
    chat_messages: [
      {
        uuid: "msg-1",
        sender: "human",
        parent_message_uuid: null,
        content: [{ type: "text", text: "Build it" }],
      },
      {
        uuid: "msg-2",
        sender: "assistant",
        parent_message_uuid: "msg-1",
        content: [
          {
            type: "tool_use",
            id: "toolu-partial-1",
            name: "present_files",
            input: {
              filepaths: ["/out/a.md", "/out/b.md"],
            },
          },
          {
            type: "tool_result",
            tool_use_id: "toolu-partial-1",
            name: "present_files",
            content: [
              {
                type: "local_resource",
                file_path: "/out/a.md",
                name: "a",
                mime_type: "text/markdown",
                uuid: "uuid-a",
              },
            ],
          },
          { type: "text", text: "Done." },
        ],
      },
    ],
  });

  const result = await new ClaudeParser().parse({ parserMode: "api" });
  const content = result.messages.find((m) => m.role === "Claude").content;
  assert.ok(content.includes("a.md"));
  assert.ok(content.includes("b.md"));
});

test("ClaudeParser API falls back to input.filepaths without tool_result metadata", async () => {
  setupApiDom();
  mockFetch({
    name: "Paths only",
    model: "claude-sonnet-5",
    current_leaf_message_uuid: "msg-2",
    chat_messages: [
      {
        uuid: "msg-1",
        sender: "human",
        parent_message_uuid: null,
        content: [{ type: "text", text: "Build it" }],
      },
      {
        uuid: "msg-2",
        sender: "assistant",
        parent_message_uuid: "msg-1",
        content: [
          {
            type: "tool_use",
            id: "toolu-present-9",
            name: "present_files",
            input: {
              filepaths: ["/mnt/user-data/outputs/notes/helper.md"],
            },
          },
          { type: "text", text: "Done." },
        ],
      },
    ],
  });

  const result = await new ClaudeParser().parse({ parserMode: "api" });
  const content = result.messages.find((m) => m.role === "Claude").content;
  assert.ok(content.includes("Generated file:"));
  assert.ok(content.includes("helper.md"));
});

test("ClaudeParser API standardises user attachment headers", async () => {
  setupApiDom();
  mockFetch({
    name: "Attachments",
    model: "claude-sonnet-5",
    current_leaf_message_uuid: "msg-1",
    chat_messages: [
      {
        uuid: "msg-1",
        sender: "human",
        parent_message_uuid: null,
        content: [{ type: "text", text: "Overhaul these." }],
        attachments: [
          {
            id: "a1",
            file_name: "AGENTS.md",
            file_size: 1557,
            file_type: "text/markdown",
            extracted_content: "# Rules",
          },
          {
            id: "a2",
            file_name: "",
            file_size: 20868,
            file_type: "txt",
            extracted_content: "Pasted research notes",
          },
        ],
      },
    ],
  });

  const result = await new ClaudeParser().parse({ parserMode: "api" });
  const content = result.messages.find((m) => m.role === "User").content;
  assert.ok(
    content.includes("### Attachment: AGENTS.md _(1.5 KB, text/markdown)_"),
  );
  assert.ok(content.includes("### Pasted content _(20.4 KB)_"));
});

test("ClaudeParser DOM fallback extracts file cards as generated files", async () => {
  const dom = parseHTML(
    `<html><head><title>Claude Chat</title></head><body>
      <div class="font-claude-response">
        <p>Extract the tarball into your repo root.</p>
        <div class="pb-2 pl-5">
          <button type="button" data-testid="file-card-open" aria-label="View Deadrat agent.tar"></button>
          <div class="truncate">Deadrat agent.tar</div><div>GZ</div>
        </div>
        <div class="pb-2 pl-5">
          <button type="button" data-testid="file-card-open" aria-label="View Style rules"></button>
          <div class="truncate">Style rules</div><div>MD</div>
        </div>
        <div class="pb-2 pl-5">
          <button type="button" data-testid="file-card-open" aria-label="View Style rules"></button>
          <div class="truncate">Style rules</div><div>MD</div>
        </div>
      </div>
    </body></html>`,
  );
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = { href: "https://claude.ai/chat/abc" };
  globalThis.chrome = { runtime: { getURL: (p) => p } };

  const result = await new ClaudeParser().parse({ parserMode: "prefer_dom" });
  assert.equal(result.metadata.Method, "DOM");
  const assistantMsgs = result.messages.filter((m) => m.role === "Claude");
  assert.equal(assistantMsgs.length, 1);
  const content = assistantMsgs[0].content;
  assert.ok(content.includes("Extract the tarball into your repo root."));
  assert.ok(content.includes("Generated files:"));
  assert.ok(content.includes("Deadrat agent.tar"));
  assert.ok(content.includes("Style rules"));
  // Same-named cards in different directories are both kept.
  assert.equal(content.match(/^-\s+`Style rules`/gm).length, 2);
});

test("ClaudeParser DOM keeps prose when cards share a parent", async () => {
  const dom = parseHTML(
    `<html><head><title>Claude Chat</title></head><body>
      <div class="font-claude-response">
        <p>Extract the tarball into your repo root.</p>
        <div class="shared-files">
          <button type="button" data-testid="file-card-open" aria-label="View a.md"></button>
          <span>a.md</span>
          <button type="button" data-testid="file-card-open" aria-label="View b.md"></button>
          <span>b.md</span>
        </div>
      </div>
    </body></html>`,
  );
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = { href: "https://claude.ai/chat/abc" };
  globalThis.chrome = { runtime: { getURL: (p) => p } };

  const result = await new ClaudeParser().parse({ parserMode: "prefer_dom" });
  const content = result.messages.find((m) => m.role === "Claude").content;
  assert.ok(content.includes("Extract the tarball into your repo root."));
  assert.ok(content.includes("a.md"));
  assert.ok(content.includes("b.md"));
});
