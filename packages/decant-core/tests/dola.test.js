import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseHTML } from "linkedom";
import { DolaParser } from "../ai/dola.js";
import { detectPlatform, isAiChatUrl } from "../detection/detect-platform.js";

function setupDom(url) {
  const html = fs.readFileSync(
    new URL("./fixtures/dola-chat.html", import.meta.url),
    "utf-8",
  );
  const dom = parseHTML(html);
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = { href: url };
  return dom;
}

test("DolaParser isAvailable matches dola.com URLs only", () => {
  const parser = new DolaParser();
  assert.equal(
    parser.isAvailable("https://www.dola.com/chat/38418651360310289"),
    true,
  );
  assert.equal(parser.isAvailable("https://dola.com/"), true);

  assert.equal(parser.isAvailable("https://notdola.com/"), false);
  assert.equal(parser.isAvailable("https://dola.com.evil.com/"), false);
  assert.equal(
    parser.isAvailable("https://example.com/?target=https://www.dola.com"),
    false,
  );
  assert.equal(parser.isAvailable(""), false);
  assert.equal(parser.isAvailable(null), false);
});

test("detectPlatform and isAiChatUrl recognise dola.com", () => {
  assert.equal(
    isAiChatUrl("https://www.dola.com/chat/38418651360310289"),
    true,
  );
  const detected = detectPlatform(
    "https://www.dola.com/chat/38418651360310289",
  );
  assert.ok(detected);
  assert.equal(detected.platform, "Dola");
  assert.equal(detected.parser instanceof DolaParser, true);
});

test("DolaParser extracts title, messages, tables, attachments, and strips data-copy-ignore", async () => {
  const url = "https://www.dola.com/chat/38418651360310289";
  setupDom(url);

  const parser = new DolaParser();
  const result = await parser.parse();

  assert.equal(result.title, "Gig Workers and Political Identity in India");
  assert.equal(result.url, url);
  assert.equal(result.metadata.Source, "Dola");
  assert.equal(result.metadata.Method, "DOM");
  assert.equal(result.messages.length, 6);

  assert.equal(result.messages[0].role, "Dola");
  assert.doesNotMatch(
    result.messages[0].content,
    /Searched for 4 keywords · 24 sources/,
  );
  assert.match(result.messages[0].content, /\|/);

  assert.equal(result.messages[1].role, "User");
  assert.match(
    result.messages[1].content,
    /NEP does not legally force states to adopt Hindi/,
  );

  assert.equal(result.messages[2].role, "Dola");
  assert.match(
    result.messages[2].content,
    /I hear that frustration so clearly/,
  );

  assert.equal(result.messages[3].role, "User");
  assert.equal(
    result.messages[3].content,
    "[Attachment: Qwen - India's Identity Politics and Charisma - 2026-11-27_13-58.md]",
  );

  assert.equal(result.messages[4].role, "User");
  assert.equal(result.messages[4].content, "what u think of this ?");

  assert.equal(result.messages[5].role, "Dola");
  assert.match(
    result.messages[5].content,
    /This is an incredibly honest, sharp, and deeply felt conversation/,
  );
});
