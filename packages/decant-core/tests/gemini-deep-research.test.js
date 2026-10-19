import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { GeminiParser } from "../ai/gemini.js";

// Synthetic deep-research turn shaped like the live hNvQHb payload:
// candidate [1] carries the short summary + chip placeholder, [12] the
// research-plan annotation, [30] the immersive report document with a
// citation map, and item[3][4] the browsed-sources activity trail.
function deepResearchTurn() {
  const candidate = [];
  candidate[0] = "rc_test123";
  candidate[1] = [
    "I've completed your research.\n\nhttp://googleusercontent.com/immersive_entry_chip/0",
  ];
  candidate[8] = [2];
  candidate[12] = [
    {
      56: [
        "Humanizing Text",
        [
          [1, "Research Websites", "(1) Survey tropes.\n(2) Survey shifts."],
          [2, "Analyze Results"],
        ],
      ],
    },
  ];
  candidate[30] = [
    [
      "im_test123",
      null,
      "Humanizing Text",
      "agency-placeholder-task-id",
      "# Report Title\n\nFindings here [cite: 1, 2] and more [cite: 3]. Additional analysis with enough substance to pass the minimum length guard for real documents.",
      [
        {
          44: [
            [
              [" [cite: 1, 2]"],
              [
                [
                  null,
                  null,
                  null,
                  [["fav", "https://a.example/x", "Source A"], 1],
                ],
                [
                  null,
                  null,
                  null,
                  [["fav", "https://b.example/y", "Source B"], 2],
                ],
              ],
            ],
            [
              [[" [cite: 3]"]],
              [
                [
                  null,
                  null,
                  null,
                  [["fav", "https://c.example/z", "Source C"], 3],
                ],
              ],
            ],
          ],
        },
      ],
    ],
  ];
  return [
    ["c_test", "r_test"],
    null,
    [["Research AI tells"]],
    [
      [candidate],
      null,
      null,
      null,
      [
        [
          null,
          [],
          null,
          null,
          [1, null, ["fav", "https://d.example/w", "Source D", null, []]],
        ],
      ],
    ],
  ];
}

test("GeminiParser API inlines deep-research report, plan, and cites", () => {
  const parser = new GeminiParser();
  const messages = parser.convertApiItemsToMessages([deepResearchTurn()], {});

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "User");
  assert.equal(messages[1].role, "Model");
  const content = messages[1].content;

  // Summary kept, placeholder chip link stripped
  assert.ok(content.includes("I've completed your research."));
  assert.ok(!content.includes("googleusercontent"));
  // Research plan steps inlined
  assert.ok(content.includes("research plan"));
  assert.ok(content.includes("Research Websites"));
  assert.ok(content.includes("Analyze Results"));
  // Full report inlined with resolved citation links
  assert.ok(content.includes("# Report Title"));
  assert.ok(content.includes("[[1]](https://a.example/x)"));
  assert.ok(content.includes("[[2]](https://b.example/y)"));
  assert.ok(content.includes("[[3]](https://c.example/z)"));
  assert.ok(!content.includes("[cite:"));
  // Browsed-sources trail appended
  assert.ok(content.includes("Sources consulted:"));
  assert.ok(content.includes("[Source D](https://d.example/w)"));
});

test("GeminiParser preserves real links while stripping chip placeholders", () => {
  const parser = new GeminiParser();
  const text = parser.stripChipPlaceholders(
    [
      "See the report.",
      "http://googleusercontent.com/immersive_entry_chip/0",
      "Photo: [img](https://lh3.googleusercontent.com/abc) and [doc](https://example.com/x).",
      "http://googleusercontent.com/deep_research_confirmation_content/0 trailing",
    ].join("\n"),
  );
  assert.ok(!text.includes("immersive_entry_chip"));
  assert.ok(!text.includes("deep_research_confirmation_content"));
  assert.ok(text.includes("[img](https://lh3.googleusercontent.com/abc)"));
  assert.ok(text.includes("[doc](https://example.com/x)"));
});

test("GeminiParser API leaves regular turns untouched", () => {
  const parser = new GeminiParser();
  const item = [
    ["c_test", "r_plain"],
    null,
    [["What is the capital of France?"]],
    [[["rc_plain", ["Paris is the capital of France."], null]]],
  ];
  const messages = parser.convertApiItemsToMessages([item], {});

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "User");
  assert.ok(messages[0].content.includes("capital of France?"));
  assert.equal(messages[1].role, "Model");
  assert.ok(messages[1].content.includes("Paris is the capital"));
  assert.ok(!messages[1].content.includes("research plan"));
});

test("GeminiParser DOM extracts open immersive report panel", async () => {
  const dom = parseHTML(
    `<html><head><title>Gemini</title></head><body>
      <div class="conversation-container">
        <user-query><div class="query-text"><p>Research AI tells</p></div></user-query>
        <model-response><message-content><div class="markdown markdown-main-panel">
          <p>I've completed your research.</p>
        </div></message-content></model-response>
      </div>
      <immersive-panel>
        <deep-research-immersive-panel>
          <toolbar><div class="toolbar"><h2 class="title-text">Humanizing Text</h2>
            <button>Share and export</button>
          </div></toolbar>
          <div data-test-id="scroll-container"><response-container>
            <structured-content-container data-test-id="message-content">
              <div class="container"><message-content>
                <div class="markdown markdown-main-panel">
                  <h1>Report Title</h1>
                  <p>Findings here<span><response-element class="no-md"><source-footnote><sup data-turn-source-index="1"></sup></source-footnote></response-element></span> with enough surrounding analysis text to pass the minimum body length guard for real report documents.</p>
                </div>
              </message-content></div>
            </structured-content-container>
          </response-container></div>
        </deep-research-immersive-panel>
      </immersive-panel>
    </body></html>`,
  );
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = { href: "https://gemini.google.com/app/abc" };

  const result = await new GeminiParser().parse({ parserMode: "dom" });
  const panelMsg = result.messages.find((m) =>
    m.content.includes("Report Title"),
  );
  assert.ok(panelMsg, "expected immersive panel message");
  assert.equal(panelMsg.role, "Model");
  assert.ok(panelMsg.content.includes("## Humanizing Text"));
  assert.ok(panelMsg.content.includes("[1]"));
  assert.ok(!panelMsg.content.includes("Share and export"));
});

test("GeminiParser DOM skips panel report already rendered in chat", async () => {
  const reportBody =
    "Findings here with enough surrounding analysis text to pass the minimum body length guard for real report documents.";
  const dom = parseHTML(
    `<html><head><title>Gemini</title></head><body>
      <div class="conversation-container">
        <user-query><div class="query-text"><p>Research AI tells</p></div></user-query>
        <model-response><message-content><div class="markdown markdown-main-panel">
          <h1>Report Title</h1><p>${reportBody}</p>
        </div></message-content></model-response>
      </div>
      <immersive-panel>
        <deep-research-immersive-panel>
          <toolbar><div class="toolbar"><h2 class="title-text">Humanizing Text</h2></div></toolbar>
          <div data-test-id="scroll-container"><response-container>
            <structured-content-container data-test-id="message-content">
              <div class="container"><message-content>
                <div class="markdown markdown-main-panel">
                  <h1>Report Title</h1><p>${reportBody}</p>
                </div>
              </message-content></div>
            </structured-content-container>
          </response-container></div>
        </deep-research-immersive-panel>
      </immersive-panel>
    </body></html>`,
  );
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = { href: "https://gemini.google.com/app/abc" };

  const result = await new GeminiParser().parse({ parserMode: "dom" });
  const hits = result.messages.filter((m) =>
    m.content.includes("Report Title"),
  );
  assert.equal(hits.length, 1);
});

test("GeminiParser DOM keeps deep-research plan widget text", async () => {
  const dom = parseHTML(
    `<html><head><title>Gemini</title></head><body>
      <div class="conversation-container">
        <user-query><div class="query-text"><p>Research AI tells</p></div></user-query>
        <model-response><message-content><div class="markdown markdown-main-panel">
          <p>I've put together a research plan.</p>
          <follow-up><div class="follow-up-container hide-from-message-actions">
            <div class="follow-up-text">Want a closer look?</div>
            <div class="follow-up-button-container"><button>Yes</button></div>
          </div></follow-up>
          <div class="attachment-container unknown"><response-element class="no-md">
            <deep-research-confirmation-widget>
              <div hide-from-message-actions="" class="container lm-enabled hide-from-message-actions">
                <div role="heading">Humanizing Text</div>
                <div class="research-step-title"><div>Research Websites</div></div>
                <div class="research-step-description"><span>Survey tropes and shifts.</span></div>
                <button>Start research</button>
              </div>
            </deep-research-confirmation-widget>
          </response-element></div>
        </div></message-content></model-response>
      </div>
    </body></html>`,
  );
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.window.location = { href: "https://gemini.google.com/app/abc" };

  const result = await new GeminiParser().parse({ parserMode: "dom" });
  assert.equal(result.metadata.Method, "DOM");
  const modelMsg = result.messages.find((m) => m.role === "Model");
  assert.ok(modelMsg);
  assert.ok(modelMsg.content.includes("research plan"));
  assert.ok(modelMsg.content.includes("Humanizing Text"));
  assert.ok(modelMsg.content.includes("Research Websites"));
  assert.ok(modelMsg.content.includes("Survey tropes and shifts."));
  assert.ok(!modelMsg.content.includes("Start research"));
  assert.ok(!modelMsg.content.includes("Want a closer look?"));
});
