import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import { CopilotParser } from "../ai/copilot.js";
import { detectPlatform, isAiChatUrl } from "../detection/detect-platform.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function setupDom(fixtureFile, url = "https://m365.cloud.microsoft/chat") {
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

test("CopilotParser isAvailable matches standard and M365 cloud.microsoft URLs", () => {
  const parser = new CopilotParser();

  const validUrls = [
    "https://copilot.microsoft.com/",
    "https://copilot.com/",
    "https://copilot.cloud.microsoft/",
    "https://m365.cloud.microsoft/chat",
    "https://m365.microsoft.com/chat",
    "https://onenote.cloud.microsoft/chat",
    "https://word.cloud.microsoft/chat",
    "https://excel.cloud.microsoft/chat",
    "https://powerpoint.cloud.microsoft/chat",
    "https://outlook.cloud.microsoft/chat",
    "https://teams.cloud.microsoft/chat",
    "https://loop.cloud.microsoft/chat",
    "https://www.bing.com/chat",
    "https://www.bing.com/chat/",
    "https://www.bing.com/chat/conversation/123",
    "https://www.bing.com/copilot",
    "https://www.bing.com/copilot/",
    "https://www.bing.com/copilotsearch",
    "https://www.bing.com/copilotsearch/",
    "https://edgeservices.bing.com/",
  ];

  for (const url of validUrls) {
    assert.equal(
      parser.isAvailable(url),
      true,
      `Expected isAvailable to be true for ${url}`,
    );
    assert.equal(
      isAiChatUrl(url),
      true,
      `Expected isAiChatUrl to be true for ${url}`,
    );
    const detected = detectPlatform(url);
    assert.ok(detected, `Expected detectPlatform for ${url}`);
    assert.equal(detected.platform, "Copilot");
  }

  const invalidUrls = [
    "https://chatgpt.com/",
    "https://claude.ai/",
    "https://example.com/onenote",
    "https://example.test/?next=https://onenote.cloud.microsoft/chat",
    "https://word.cloud.microsoft/",
    "https://word.cloud.microsoft/document.docx",
    "https://onenote.cloud.microsoft/notebook",
    "https://microsoft.com/en-us",
    "https://www.bing.com/search?q=copilot",
    "https://www.bing.com/chatting",
  ];

  for (const url of invalidUrls) {
    assert.equal(
      parser.isAvailable(url),
      false,
      `Expected isAvailable to be false for ${url}`,
    );
  }
});

test("CopilotParser DOM extracts 4 turns with cleaned title and citations", async () => {
  setupDom("copilot-chat.html", "https://m365.cloud.microsoft/chat");
  const parser = new CopilotParser();

  const result = await parser.parse();
  assert.equal(result.metadata.Source, "Copilot");
  assert.equal(result.metadata.Method, "DOM");
  assert.equal(result.title, "What are five cool things Copilot can do?");
  assert.equal(result.messages.length, 4);

  // Alternating user / assistant turns
  assert.equal(result.messages[0].role, "User");
  assert.equal(
    result.messages[0].content,
    "What are five cool things Copilot can do?",
  );

  assert.equal(result.messages[1].role, "Copilot");
  assert.ok(
    result.messages[1].content.includes(
      "five genuinely cool things Microsoft 365 Copilot can do",
    ),
  );

  assert.equal(result.messages[2].role, "User");
  assert.ok(
    result.messages[2].content.includes("Please review this FOSS project"),
  );

  assert.equal(result.messages[3].role, "Copilot");
  assert.ok(result.messages[3].content.includes("Executive Summary"));
  // Bebop citation buttons converted to markdown links
  assert.match(
    result.messages[3].content,
    /\[github\.com\]\(https:\/\/github\.com\/Covai-Labs\/ace\)/,
    "Expected citation links to be preserved",
  );
});

test("CopilotParser sanitizes pipe and hyphen brand title suffixes", async () => {
  const dom = parseHTML(
    "<html><head><title>Notebooks | Microsoft Copilot</title></head><body></body></html>",
  );
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = {
    href: "https://m365.cloud.microsoft/projects",
  };

  const parser = new CopilotParser();
  const result = await parser.parse();
  assert.equal(result.title, "Notebooks");

  dom.document.title = "Architecture - Copilot";
  const result2 = await parser.parse();
  assert.equal(result2.title, "Architecture");

  dom.document.title = "Microsoft Copilot: Fast Search";
  const result3 = await parser.parse();
  assert.equal(result3.title, "Fast Search");
});

test("CopilotParser falls back to first prompt when title is generic or absent", async () => {
  const dom = parseHTML(`
    <html>
      <head><title>Microsoft Copilot</title></head>
      <body>
        <div class="fai-UserMessage" data-testid="chatQuestion">
          <div data-testid="chatOutput">Tell me a joke about programming</div>
        </div>
        <div class="fai-CopilotMessage" data-testid="copilot-message-div">
          <div class="fai-CopilotMessage__content">Why do programmers prefer dark mode? Because light attracts bugs.</div>
        </div>
      </body>
    </html>
  `);
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = { href: "https://onenote.cloud.microsoft/chat" };

  const parser = new CopilotParser();
  const result = await parser.parse();
  assert.equal(result.title, "Tell me a joke about programming");
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].role, "User");
  assert.equal(result.messages[0].content, "Tell me a joke about programming");
  assert.equal(result.messages[1].role, "Copilot");
  assert.ok(result.messages[1].content.includes("dark mode"));
});

test("CopilotParser transforms relative and protocol-relative data-url spans to anchors", async () => {
  const dom = parseHTML(`
    <html>
      <head><title>Copilot</title></head>
      <body>
        <div class="fai-UserMessage" data-testid="chatQuestion">
          <div data-testid="chatOutput">Where are the docs?</div>
        </div>
        <div class="fai-CopilotMessage" data-testid="copilot-message-div">
          <div class="fai-CopilotMessage__content">
            Check <span data-url="/docs/guide">Documentation</span> and <span data-url="//example.com/api">API Reference</span>.
          </div>
        </div>
      </body>
    </html>
  `);
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = { href: "https://copilot.microsoft.com/chat" };

  const parser = new CopilotParser();
  const result = await parser.parse();
  assert.equal(result.messages.length, 2);
  assert.match(
    result.messages[1].content,
    /\[Documentation\]\(https:\/\/copilot\.microsoft\.com\/docs\/guide\)/,
  );
  assert.match(
    result.messages[1].content,
    /\[API Reference\]\(https:\/\/example\.com\/api\)/,
  );
});

test("CopilotParser preserves visible text when Bebop citation metadata is missing or invalid", async () => {
  const dom = parseHTML(`
    <html>
      <head><title>Copilot</title></head>
      <body>
        <div class="fai-UserMessage" data-testid="chatQuestion">
          <div data-testid="chatOutput">Tell me a fact</div>
        </div>
        <div class="fai-CopilotMessage" data-testid="copilot-message-div">
          <div class="fai-CopilotMessage__content">
            Earth orbits the Sun <button class="fai-BebopCitation">NASA</button> and <button class="fai-BebopCitation" data-grouped-citations="invalid-json">ESA</button>.
          </div>
        </div>
      </body>
    </html>
  `);
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = { href: "https://copilot.microsoft.com/chat" };

  const parser = new CopilotParser();
  const result = await parser.parse();
  assert.equal(result.messages.length, 2);
  assert.ok(result.messages[1].content.includes("NASA"));
  assert.ok(result.messages[1].content.includes("ESA"));
});

test("CopilotParser preserves absolute data-url without unwanted trailing slash", async () => {
  const dom = parseHTML(`
    <html>
      <head><title>Copilot</title></head>
      <body>
        <div class="fai-UserMessage" data-testid="chatQuestion">
          <div data-testid="chatOutput">Check this website</div>
        </div>
        <div class="fai-CopilotMessage" data-testid="copilot-message-div">
          <div class="fai-CopilotMessage__content">
            Visit <span data-url="https://deadrat.in">deadrat.in</span>.
          </div>
        </div>
      </body>
    </html>
  `);
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = { href: "https://copilot.microsoft.com/chat" };

  const parser = new CopilotParser();
  const result = await parser.parse();
  assert.equal(result.messages.length, 2);
  assert.ok(
    result.messages[1].content.includes("[deadrat.in](https://deadrat.in)"),
    "Expected exact bare-domain markdown link without trailing slash",
  );
});
