import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Setup global DOM for linkedom environment
const { window, document, HTMLElement, Node, DOMParser } =
  parseHTML("<div></div>");
global.window = window;
global.document = document;
global.HTMLElement = HTMLElement;
global.Node = Node;
global.DOMParser = DOMParser;

const { convertToMarkdown } = await import("../utils/html-to-markdown.js");
const { ChatGPTParser } = await import("../ai/chatgpt.js");

test("ChatGPT data-math-source extracts block display math without backslash loss", () => {
  const el = document.createElement("div");
  el.innerHTML = `
    <span role="math" aria-label="\\boxed{\\operatorname{ATE} = \\mathbb{E}[Y(1)]-\\mathbb{E}[Y(0)]}" data-math-source="\\boxed{\\operatorname{ATE} = \\mathbb{E}[Y(1)]-\\mathbb{E}[Y(0)]}" style="display: block;">
      <span class="katex-display"><span class="katex"><span class="katex-html">ATE rendered</span></span></span>
    </span>
  `;

  const md = convertToMarkdown(el);
  assert.equal(
    md,
    "$$\\boxed{\\operatorname{ATE} = \\mathbb{E}[Y(1)]-\\mathbb{E}[Y(0)]}$$",
  );
});

test("ChatGPT data-math-source extracts inline math with single dollar signs", () => {
  const el = document.createElement("div");
  el.innerHTML = `
    <p>Outcome is <span role="math" aria-label="Y(1)" data-math-source="Y(1)"><span class="katex">Y(1)</span></span> for treated.</p>
  `;

  const md = convertToMarkdown(el);
  assert.equal(md, "Outcome is $Y(1)$ for treated.");
});

test("ChatGPT interactive learning block converts cleanly without slider or control clutter", () => {
  const elementHtmlPath = path.resolve(
    "/home/anu/Workspace/Public/Add-ons/ai-chat-exporter/Scratch/chatgpt-interactive/element.html",
  );
  if (!fs.existsSync(elementHtmlPath)) {
    return;
  }

  const rawHtml = fs.readFileSync(elementHtmlPath, "utf-8");
  const { document: doc } = parseHTML(
    `<body><div class="test-container">${rawHtml}</div></body>`,
  );
  const container = doc.querySelector(".test-container");

  const parser = new ChatGPTParser();
  // Simulate message container with assistant role
  const msgContainer = doc.createElement("div");
  msgContainer.setAttribute("data-message-author-role", "assistant");
  const markdownDiv = doc.createElement("div");
  markdownDiv.className = "markdown";
  markdownDiv.appendChild(container);
  msgContainer.appendChild(markdownDiv);

  const extracted = parser.extractMessage(msgContainer);
  assert.ok(extracted, "Should extract assistant message");
  assert.equal(extracted.role, "ChatGPT");

  // Primary formula should be preserved as LaTeX block
  assert.ok(
    extracted.content.includes("$$e^{i\\pi}+1=0$$"),
    "Must preserve primary math block",
  );

  // Caption lines should be preserved
  assert.ok(
    extracted.content.includes("e^{i\\text{115}^\\circ}"),
    "Must preserve dynamic formula caption",
  );
  assert.ok(
    extracted.content.includes("\\theta=\\text{115}^\\circ"),
    "Must preserve angle caption",
  );
  assert.ok(
    extracted.content.includes(
      "The point is (cos θ, sin θ) = (-0.42, 0.91) on the unit circle.",
    ),
    "Must preserve textual explanation",
  );

  // Stray control artifacts must be stripped
  assert.ok(
    !extracted.content.includes("115.0°"),
    "Should strip slider text input",
  );
  assert.ok(
    !extracted.content.includes("Give feedback"),
    "Should strip feedback button",
  );
});

test("ChatGPT DOM parser extracts modern conversation-turn sections and cleans citation pills", async () => {
  const fixturePath = path.join(__dirname, "fixtures", "chatgpt-chat.html");
  if (!fs.existsSync(fixturePath)) return;

  const html = fs.readFileSync(fixturePath, "utf-8");
  const { document: doc, window: win } = parseHTML(html);

  const prevDoc = global.document;
  const prevWin = global.window;
  global.document = doc;
  global.window = win;
  global.window.location = {
    href: "https://chatgpt.com/c/6aa5084e-8044-83ee-afae-30b5e40b0e06",
  };

  try {
    const parser = new ChatGPTParser();
    const result = await parser.parse({ parserMode: "prefer_dom" });

    assert.equal(result.metadata.Method, "DOM");
    assert.equal(result.messages.length, 5);

    // Turn 27 (first user turn in fixture)
    assert.equal(result.messages[1].role, "User");
    assert.ok(
      result.messages[1].content.includes(
        "Give a table with some of the species that went extinct recently",
      ),
    );

    // Turn 28 (table assistant turn)
    const tableMsg = result.messages[2];
    assert.equal(tableMsg.role, "ChatGPT");
    assert.ok(tableMsg.content.includes("| Species | Extinct |"));
    assert.ok(tableMsg.content.includes("Steller's sea cow"));

    // Citation pill should be a clean markdown link without favicon images or "+1"
    assert.ok(
      tableMsg.content.includes(
        "[Natural History Museum](https://www.nhm.ac.uk/discover/stellers-sea-cow-first-historical-extinction-of-marine-mammal-at-human-hands.html?utm_source=chatgpt.com)",
      ),
      "Citation pill must render as clean [Natural History Museum](url) without favicon or +1 badge",
    );
    assert.ok(
      !tableMsg.content.includes("favicons?domain"),
      "Favicon image URLs must be stripped from citation pills",
    );
    assert.ok(
      !tableMsg.content.includes("Natural History Museum+1"),
      "Counter badges (+1) must not be attached to site name",
    );
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
  }
});
