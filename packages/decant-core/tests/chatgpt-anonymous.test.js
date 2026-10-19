import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("ChatGPTParser extracts messages from signed-out/anonymous session DOM fixture", async () => {
  const fixturePath = path.join(
    __dirname,
    "fixtures/chatgpt-anonymous-octane.html",
  );
  if (!fs.existsSync(fixturePath)) {
    return;
  }

  const rawHtml = fs.readFileSync(fixturePath, "utf-8");
  const { window, document, HTMLElement, Node, DOMParser } = parseHTML(rawHtml);
  global.window = window;
  global.document = document;
  global.HTMLElement = HTMLElement;
  global.Node = Node;
  global.DOMParser = DOMParser;

  const { ChatGPTParser } = await import("../ai/chatgpt.js");
  const parser = new ChatGPTParser();

  // Signed out session has no access token, so it uses DOM parsing
  const messages = parser.extractMountedMessages();
  assert.equal(messages.length, 10, "Should extract all 10 conversation turns");

  assert.equal(messages[0].role, "User");
  assert.ok(messages[0].content.includes("Which of these has any potential"));
  assert.doesNotMatch(messages[0].content, /You said:/);

  assert.equal(messages[1].role, "ChatGPT");
  assert.ok(messages[1].content.includes("Decant"));
  assert.doesNotMatch(messages[1].content, /ChatGPT said:/);

  assert.equal(messages[2].role, "User");
  assert.ok(messages[2].content.includes("decant-core"));
  assert.doesNotMatch(messages[2].content, /You said:/);

  assert.equal(messages[3].role, "ChatGPT");
  assert.doesNotMatch(messages[3].content, /ChatGPT said:/);

  assert.equal(messages[4].role, "User");
  assert.match(
    messages[4].content,
    /!\[.*?\]\(blob:https:\/\/chatgpt\.com\/.*?\)/,
  );
  assert.ok(messages[4].content.includes("**Attachments & Images:**"));

  assert.equal(messages[9].role, "ChatGPT");
  assert.doesNotMatch(messages[9].content, /ChatGPT said:/);
});

test("ChatGPTParser ignores Octane conversation recovery placeholder elements", async () => {
  const { window, document, HTMLElement, Node, DOMParser } = parseHTML(`
    <ol data-conversation-transcript="">
      <li data-message-role="user"><div data-user-message-bubble="">Hello</div></li>
      <li data-message-role="assistant" data-conversation-recovery="">
        <h4>ChatGPT said:</h4>
        <div data-conversation-recovery-status="failed">
          <span>Unable to connect</span>
        </div>
      </li>
      <li data-message-role="assistant">
        <div data-assistant-markdown-root="">
          <p>Real response</p>
        </div>
      </li>
    </ol>
  `);
  global.window = window;
  global.document = document;
  global.HTMLElement = HTMLElement;
  global.Node = Node;
  global.DOMParser = DOMParser;

  const { ChatGPTParser } = await import("../ai/chatgpt.js");
  const parser = new ChatGPTParser();

  const messages = parser.extractMountedMessages();
  assert.equal(
    messages.length,
    2,
    "Should only extract the 2 real messages, ignoring recovery placeholder",
  );
  assert.equal(messages[0].role, "User");
  assert.equal(messages[0].content, "Hello");
  assert.equal(messages[1].role, "ChatGPT");
  assert.equal(messages[1].content, "Real response");
});
