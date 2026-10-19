import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseHTML } from "linkedom";
import { GeminiParser } from "../ai/gemini.js";

const fixture = JSON.parse(
  fs.readFileSync(
    new URL("./fixtures/gemini-api-response.json", import.meta.url),
    "utf8",
  ),
);

test("GeminiParser isAvailable matches gemini and bard domains", () => {
  const parser = new GeminiParser();
  assert.equal(
    parser.isAvailable("https://gemini.google.com/app/e87b6c6ac16404a5"),
    true,
  );
  assert.equal(
    parser.isAvailable("https://bard.google.com/app/e87b6c6ac16404a5"),
    true,
  );
  assert.equal(parser.isAvailable("https://chatgpt.com"), false);
  assert.equal(parser.isAvailable(""), false);
});

test("GeminiParser getConversationId parses conversation ID from URL paths", () => {
  const parser = new GeminiParser();
  assert.equal(
    parser.getConversationId("https://gemini.google.com/app/e87b6c6ac16404a5"),
    "e87b6c6ac16404a5",
  );
  assert.equal(
    parser.getConversationId(
      "https://gemini.google.com/share/e87b6c6ac16404a5?hl=en",
    ),
    "e87b6c6ac16404a5",
  );
  assert.equal(parser.getConversationId("https://gemini.google.com/app"), null);
});

test("GeminiParser extracts and reconstructs all 15 turns (30 messages) in chronological order from paginated RPC responses", () => {
  const parser = new GeminiParser();

  const allItems = [];
  for (const raw of [fixture.page1_raw, fixture.page2_raw]) {
    const parsedBatch = parser.parseBatchExecuteLines(raw);
    const rpcEntry = parser.findRpcEntry(parsedBatch.arrays, "hNvQHb");
    assert.ok(rpcEntry, "Found hNvQHb RPC entry");
    const payload = JSON.parse(rpcEntry[2]);
    const items = Array.isArray(payload[0]) ? payload[0] : [];
    if (items.length > 0) {
      allItems.unshift(...items.slice().reverse());
    }
  }

  assert.equal(allItems.length, 15, "Total turns should be 15");

  const result = parser.formatApiResult(
    allItems,
    `https://gemini.google.com/app/${fixture.convoId}`,
  );
  assert.ok(result, "Result should be created");
  assert.equal(result.metadata.Method, "API");
  assert.equal(result.metadata.Source, "Gemini");
  assert.equal(result.url, "https://gemini.google.com/app/e87b6c6ac16404a5");

  // 15 user prompts + 15 model responses = 30 messages
  assert.equal(result.messages.length, 30);

  // Check turn 1 (oldest turn in conversation)
  assert.equal(result.messages[0].role, "User");
  assert.match(result.messages[0].content, /You cannot evolve out of a clade/);
  assert.equal(result.messages[1].role, "Model");
  assert.match(
    result.messages[1].content,
    /## The Cladistics of Being a Simian/,
  );

  // Check turn 5 (Orcas prompt)
  const orcaUserMsg = result.messages.find(
    (m) => m.role === "User" && m.content.includes("Orcas have language"),
  );
  assert.ok(orcaUserMsg, "Should include Orcas prompt");

  // Check turn 15 (last prompt in conversation with table)
  assert.equal(result.messages[28].role, "User");
  assert.match(
    result.messages[28].content,
    /Give a table with some of the species/,
  );
  assert.equal(result.messages[29].role, "Model");
  assert.match(
    result.messages[29].content,
    /\| Species \| Declared Extinct \|/,
  );

  // Assert internal turnId is deleted on all returned messages
  for (const m of result.messages) {
    assert.equal(
      "turnId" in m,
      false,
      "Message should not leak internal turnId",
    );
  }
});

test("GeminiParser parse() executes API flow when convoId and globalData are present", async () => {
  const { document, window } = parseHTML(
    `<html><head><title>The Cladistics of Being Human</title></head><body>
      <script>window.WIZ_global_data = {"SNlM0e": "test_at_token", "FdrFJe": "test_fsid", "cfb2h": "test_bl"};</script>
    </body></html>`,
  );
  globalThis.document = document;
  globalThis.window = window;
  window.location = new URL(`https://gemini.google.com/app/${fixture.convoId}`);

  const parser = new GeminiParser();

  let callCount = 0;
  globalThis.fetch = async (url) => {
    callCount++;
    assert.match(String(url), /batchexecute/);
    return {
      ok: true,
      text: async () =>
        callCount === 1 ? fixture.page1_raw : fixture.page2_raw,
    };
  };

  const result = await parser.parse();
  assert.equal(result.metadata.Method, "API");
  assert.equal(result.messages.length, 30);
  assert.equal(callCount, 2, "Should paginate through 2 pages");
});

test("GeminiParser parse() falls back to DOM when API fetch throws", async () => {
  const { document, window } = parseHTML(
    `<html><head><title>Fallback Title</title></head><body>
      <script>window.WIZ_global_data = {"SNlM0e": "test_at", "FdrFJe": "test_fsid"};</script>
      <div class="conversation-container">
        <user-query><div class="query-text">What is 2+2?</div></user-query>
        <model-response><message-content><div class="markdown">It is 4.</div></message-content></model-response>
      </div>
    </body></html>`,
  );
  globalThis.document = document;
  globalThis.window = window;
  window.location = new URL("https://gemini.google.com/app/test_convo_id");

  const parser = new GeminiParser();
  globalThis.fetch = async () => {
    throw new Error("Network error 500");
  };

  const result = await parser.parse();
  assert.equal(result.metadata.Method, "DOM");
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].content, "What is 2+2?");
  assert.equal(result.messages[1].content, "It is 4.");
});

test("GeminiParser parse() respects parserMode: 'dom'", async () => {
  const { document, window } = parseHTML(
    `<html><head><title>DOM Mode Title</title></head><body>
      <script>window.WIZ_global_data = {"SNlM0e": "test_at", "FdrFJe": "test_fsid"};</script>
      <div class="conversation-container">
        <user-query><div class="query-text">Hello DOM</div></user-query>
        <model-response><message-content><div class="markdown">Hello from DOM</div></message-content></model-response>
      </div>
    </body></html>`,
  );
  globalThis.document = document;
  globalThis.window = window;
  window.location = new URL("https://gemini.google.com/app/test_convo_id");

  const parser = new GeminiParser();
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("Should not be called");
  };

  const result = await parser.parse({ parserMode: "dom" });
  assert.equal(fetchCalled, false);
  assert.equal(result.metadata.Method, "DOM");
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].content, "Hello DOM");
});

test("GeminiParser merges live DOM attachment metadata into API result", async () => {
  const { document, window } = parseHTML(
    `<html><head><title>Attachment Test</title></head><body>
      <script>window.WIZ_global_data = {"SNlM0e": "test_at_token", "FdrFJe": "test_fsid"};</script>
      <div class="conversation-container" id="c70b0f912110c79a">
        <user-query>
          <div class="query-text">You cannot evolve out of a clade. But some cunts get offended</div>
          <user-query-file-preview>phylogeny_tree.pdf</user-query-file-preview>
          <user-query-file-preview>genetic_markers.csv</user-query-file-preview>
        </user-query>
      </div>
    </body></html>`,
  );
  globalThis.document = document;
  globalThis.window = window;
  window.location = new URL(`https://gemini.google.com/app/${fixture.convoId}`);

  const parser = new GeminiParser();
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => fixture.page2_raw,
  });

  const result = await parser.parse();
  assert.equal(result.metadata.Method, "API");
  const firstUser = result.messages.find((m) => m.role === "User");
  assert.ok(firstUser, "First user message exists");
  assert.match(firstUser.content, /\*\*Attachments:\*\*/);
  assert.match(firstUser.content, /- phylogeny_tree\.pdf/);
  assert.match(firstUser.content, /- genetic_markers\.csv/);
});
