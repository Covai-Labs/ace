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

test("GeminiParser API resolves <Image> tags and YouTube media placeholders in candidate text", () => {
  const parser = new GeminiParser();

  const allItems = [];
  for (const raw of [fixture.page1_raw, fixture.page2_raw]) {
    const parsedBatch = parser.parseBatchExecuteLines(raw);
    const rpcEntry = parser.findRpcEntry(parsedBatch.arrays, "hNvQHb");
    const payload = JSON.parse(rpcEntry[2]);
    const items = Array.isArray(payload[0]) ? payload[0] : [];
    if (items.length > 0) {
      allItems.unshift(...items.slice().reverse());
    }
  }

  const result = parser.formatApiResult(
    allItems,
    `https://gemini.google.com/app/${fixture.convoId}`,
  );

  // Check Euler's identity turn (turn 11 -> message index 22 User, 23 Model)
  const eulerModelMsg = result.messages.find(
    (m) =>
      m.role === "Model" &&
      m.content.includes("Euler's identity is an equation"),
  );
  assert.ok(eulerModelMsg, "Euler model response found");
  assert.match(
    eulerModelMsg.content,
    /!\[.*?\]\(https:\/\/encrypted-tbn2\.gstatic\.com\/licensed-image\?[^)]+\)/,
    "Resolved <Image> XML tag to standard Markdown image with licensed image URL",
  );
  assert.doesNotMatch(
    eulerModelMsg.content,
    /<Image\b/,
    "Unresolved raw <Image> tag should not remain",
  );

  // Check turn with YouTube media placeholder
  const ytModelMsg = result.messages.find(
    (m) =>
      m.role === "Model" &&
      m.content.includes("Focus Tamil Nadu"),
  );
  assert.ok(ytModelMsg, "YouTube media turn found");
  assert.match(
    ytModelMsg.content,
    /\[Is the three language formula actually working\? \| Focus Tamil Nadu\]\(https:\/\/www\.youtube\.com\/watch\?v=vPTY8pRAPkA\)/,
    "Resolved YouTube media placeholder to markdown link",
  );
});

test("GeminiParser DOM preserves citation chips, links inside buttons, images, and .sources-list", () => {
  const { document } = parseHTML(`
    <html><body>
      <div class="conversation-container">
        <user-query><div class="query-text">What is the latest research?</div></user-query>
        <model-response><message-content><div class="markdown">
          <p>According to study<button aria-label="View source: Nature Genetics"><span class="citation-chip__title">Nature Genetics</span></button>, alleles vary widely.</p>
          <p>Read the full paper <button><a href="https://doi.org/10.1038/example">DOI Link</a></button>.</p>
          <image-container>
            <img src="https://lh3.googleusercontent.com/diagram.png" alt="Phylogenetic Tree">
          </image-container>
          <div class="sources-list">
            <a href="https://nature.com/articles/ng123">Nature Article 123</a>
          </div>
        </div></message-content></model-response>
      </div>
    </body></html>
  `);

  globalThis.document = document;
  const parser = new GeminiParser();
  const result = parser.parseFromDom("https://gemini.google.com/app/test");
  const messages = result.messages;

  assert.equal(messages.length, 2);
  const modelContent = messages[1].content;

  assert.match(modelContent, /Nature Genetics/, "Citation chip text preserved");
  assert.match(
    modelContent,
    /\[DOI Link\]\(https:\/\/doi\.org\/10\.1038\/example\)/,
    "Link inside button preserved",
  );
  assert.match(
    modelContent,
    /!\[Phylogenetic Tree\]\(https:\/\/lh3\.googleusercontent\.com\/diagram\.png\)/,
    "Image inside image-container preserved",
  );
  assert.match(
    modelContent,
    /\*\*Sources consulted:\*\*/,
    "Sources header created",
  );
  assert.match(
    modelContent,
    /\[Nature Article 123\]\(https:\/\/nature\.com\/articles\/ng123\)/,
    "Source link from .sources-list preserved",
  );
});

test("GeminiParser resolveImageTags preserves code blocks containing <Image> tags", () => {
  const parser = new GeminiParser();
  const cand = [
    "c_1",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    [
      null,
      [
        [
          [["https://example.com/resolved.png"]],
          null,
          null,
          null,
          null,
          null,
          null,
          ["image_agent_tag_1"],
        ],
      ],
    ],
  ];

  const input = [
    'Here is an image: <Image src="image_agent_tag_1" alt="Test Diagram" />',
    "",
    "```jsx",
    'import Image from "next/image";',
    'export default function Hero() { return <Image src="/hero.png" alt="Hero" />; }',
    "```",
    "",
    'And inline: `<Image src="foo" />` should remain as code.',
  ].join("\n");

  const resolved = parser.resolveImageTags(input, cand);

  assert.match(
    resolved,
    /!\[Test Diagram\]\(https:\/\/example\.com\/resolved\.png\)/,
    "Regular <Image> tag resolved",
  );
  assert.match(
    resolved,
    /```jsx[\s\S]*?<Image src="\/hero\.png" alt="Hero" \/>[\s\S]*?```/,
    "JSX code block <Image> tag preserved verbatim",
  );
  assert.match(
    resolved,
    /`<Image src="foo" \/>`/,
    "Inline code <Image> tag preserved verbatim",
  );

  // Test paired tag with closing </Image>
  const pairedInput = 'Diagram: <Image src="image_agent_tag_1" alt="Paired [V1]"></Image>';
  const pairedResolved = parser.resolveImageTags(pairedInput, cand);
  assert.equal(
    pairedResolved,
    "Diagram: ![Paired \\[V1\\]](https://example.com/resolved.png)",
  );
});

test("GeminiParser resolveMediaPlaceholders avoids partial matching on numbered placeholders", () => {
  const parser = new GeminiParser();
  const cand = [
    "c_1",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    [
      null,
      null,
      null,
      null,
      [
        [
          ["http://googleusercontent.com/youtube_content/1"],
          null,
          null,
          null,
          [[["Video 1", null, "https://youtube.com/watch?v=1"]]],
        ],
        [
          ["http://googleusercontent.com/youtube_content/10"],
          null,
          null,
          null,
          [[["Video 10", null, "https://youtube.com/watch?v=10"]]],
        ],
      ],
    ],
  ];

  const text =
    "Watch http://googleusercontent.com/youtube_content/10 and http://googleusercontent.com/youtube_content/1 now.";
  const resolved = parser.resolveMediaPlaceholders(text, cand);

  assert.match(
    resolved,
    /\[Video 10\]\(https:\/\/youtube\.com\/watch\?v=10\)/,
    "Placeholder /10 matched correctly without being corrupted by /1",
  );
  assert.match(
    resolved,
    /\[Video 1\]\(https:\/\/youtube\.com\/watch\?v=1\)/,
    "Placeholder /1 matched correctly",
  );
});

test("GeminiParser extractActivitySources does not leak citations from alternate drafts", () => {
  const parser = new GeminiParser();
  // Turn item with 2 candidates:
  // Candidate 0: active candidate with text and citation A
  // Candidate 1: alternate draft with text and citation B
  const item = [
    "turn_1",
    null,
    null,
    [
      [
        [
          "cand_0",
          ["Visible answer text"],
          [
            [
              [
                null,
                null,
                ["https://active-source.org/paper", "Active Source", null],
              ],
            ],
          ],
        ],
        [
          "cand_1",
          ["Draft 2 alternate text"],
          [
            [
              [
                null,
                null,
                ["https://inactive-draft.org/paper", "Inactive Draft", null],
              ],
            ],
          ],
        ],
      ],
    ],
  ];

  const sources = parser.extractActivitySources(item);
  assert.equal(sources.length, 1);
  assert.ok(
    sources[0].includes("https://active-source.org/paper"),
    "Sources list contains the active candidate paper URL",
  );
  assert.ok(
    !sources.some((s) => s.includes("inactive-draft")),
    "Citations from inactive draft 1 should not leak into sources",
  );
});

