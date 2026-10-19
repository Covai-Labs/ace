# decant-core

**A shared extraction layer for the modern web — including AI conversations.**

[![npm version](https://img.shields.io/npm/v/decant-core?logo=npm&logoColor=white&label=npm&color=cb3837)](https://www.npmjs.com/package/decant-core)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-red.svg)](LICENSE)
[![GitHub](https://img.shields.io/github/stars/Covai-Labs/decant?logo=github&logoColor=white&color=yellow&label=Stars)](https://github.com/Covai-Labs/decant/stargazers)

Every AI chat exporter ends up solving the same problem: extracting conversations from ChatGPT, Claude, Gemini, Perplexity, DeepSeek and other constantly changing AI interfaces.

And every time one of those platforms changes its UI, seriously re-renders a message, or ships a new feature, **somebody's parser breaks**.

`decant-core` provides reusable parsers, platform detection, and web article extraction so developers don't have to build and maintain the same fragile parsing layer over and over again.

### Origin & Purpose

Existing chat exporters often suffer from two major flaws: they break whenever platform DOMs update, and many route user conversations through third-party servers.

`decant-core` was created to solve both at the foundation. Originally built to power local-first extensions like [AI Chat Exporter](https://ace.covai.org/) and [Decant](https://decant.covai.org/), it decouples fragile platform parsing from presentation. By sharing this engine under AGPL-3.0, any browser extension, web clipper, archiver, or research tool can rely on a maintained, local-first extraction layer instead of reverse-engineering AI platforms in isolation.

```bash
npm install decant-core
```

Use it as the parsing layer underneath your own:

- chat exporters
- browser extensions
- web clippers
- research & data-extraction tools
- content archivers
- knowledge-management and PKM applications

**Fix platform parsing once, and let the ecosystem benefit from the fix.**

---

## Why decant-core?

AI platforms don't expose stable public APIs for reading conversation history. No matter what you build, to extract a ChatGPT thread you need to walk the DOM, read internal RPC payloads, or traverse React component trees — and redo it when the frontend changes.

Maintaining that per-platform logic in every exporter is wasteful and fragile. `decant-core` centralizes it:

- ✅ **19 AI chat platform parsers** with normalized output — you get structured messages, models, metadata and Markdown, not DOM soup.
- ✅ **Web article extraction** — Mozilla Readability, Defuddle, and Article-Extractor run in parallel and arbitrate by content-quality scoring.
- ✅ **Detection utilities** — tell an "AI chat page" apart from a "regular web page" before you decide which parser to run.
- ✅ **Math & Markdown handling** — LaTeX normalization plus GFM tables/code fencing that survive round-trips into Obsidian, Logseq and Notion.

The payoff is maintenance: **when a platform changes, the fix happens once, in one place**, instead of being independently reimplemented across dozens of projects.

---

## Quickstart

### 1. Extract an AI conversation

```js
import { detectPlatform, isAiChatUrl } from "decant-core";

if (isAiChatUrl(window.location.href)) {
  const match = detectPlatform(window.location.href);

  if (match?.parser && match.parser.isAvailable(window.location.href)) {
    const result = await match.parser.parse();
    // result.title
    // result.messages  -> [{ role: 'User' | 'Assistant', content, ... }]
    // result.model
    // result.metadata  -> platform-specific extras
  }
}
```

### 2. Extract a regular web article

```js
import { extractArticle } from "decant-core";

const article = await extractArticle(document /* or an HTML string */, {
  url: window.location.href,
});

// article.title, article.author, article.published
// article.markdown       -> clean, ready-to-use Markdown
// article.content        -> the body without the title prefix
// article.engine         -> 'readability' | 'defuddle' | 'raw'
```

### 3. Detection

```js
import { detectPlatform, isAiChatUrl, AI_CHAT_DOMAINS } from "decant-core";

isAiChatUrl("https://chatgpt.com/c/abc-123"); // -> true
const detected = detectPlatform(url); // -> { type: 'ai-chat', platform: 'ChatGPT', parser }
```

### Subpath imports

```js
// Individual parsers (tree-shake the rest)
import { ChatGPTParser } from "decant-core/ai/chatgpt";
import { ClaudeParser } from "decant-core/ai/claude";
import { GeminiParser } from "decant-core/ai/gemini";

// Web & article extraction
import { extractArticle, ArticleParser, scoreContent } from "decant-core";

// Detection
import { detectPlatform, isAiChatUrl, parsers } from "decant-core";

// Utilities
import { convertToMarkdown, cleanMarkdown } from "decant-core";
import { normalizeLatexMath } from "decant-core";
```

---

## Supported Platforms

19 AI chat platform parsers plus generic web article extraction:

| Platform                            | Parser                    | Extraction strategy                        |
| :---------------------------------- | :------------------------ | :----------------------------------------- |
| **ChatGPT**                         | `ChatGPTParser`           | DOM + internal API                         |
| **Claude**                          | `ClaudeParser`            | DOM + internal API + React fiber           |
| **Google Gemini**                   | `GeminiParser`            | DOM + batchexecute RPC                     |
| **Microsoft Copilot**               | `CopilotParser`           | DOM                                        |
| **Perplexity**                      | `PerplexityParser`        | Internal API + DOM                         |
| **DeepSeek**                        | `DeepSeekParser`          | DOM + internal API                         |
| **Qwen**                            | `QwenParser`              | DOM                                        |
| **Meta AI**                         | `MetaParser`              | Internal API + DOM                         |
| **Mistral / Le Chat**               | `MistralParser`           | DOM                                        |
| **Proton Lumo**                     | `LumoParser`              | DOM                                        |
| **Z.ai**                            | `ZAiParser`               | Internal API + DOM                         |
| **Grok**                            | `GrokParser`              | Internal API + DOM                         |
| **Google AI Studio**                | `GoogleAIStudioParser`    | DOM                                        |
| **NotebookLM**                      | `NotebookLMParser`        | DOM                                        |
| **Google Search AI (AI Overviews)** | `GoogleSearchAIParser`    | DOM                                        |
| **Gemini Cloud Assist**             | `GeminiCloudAssistParser` | DOM                                        |
| **Joyland**                         | `JoylandParser`           | DOM                                        |
| **Chub**                            | `ChubParser`              | DOM                                        |
| **Duck.ai (DuckDuckGo AI)**         | `DuckAIParser`            | DOM                                        |
| **Generic Web Article**             | `ArticleParser`           | Readability + Defuddle + Article-Extractor |

All parsers extend the base [`ChatParser`](ai/base.js) interface — a consistent `isAvailable(url)` +
normalized `parse()` contract. For the full extraction-strategy breakdown and maintenance model, see
[SUPPORTED_PLATFORMS.md](SUPPORTED_PLATFORMS.md), also published as the
[platform matrix](https://covai-labs.github.io/decant/platforms/) on the developer docs site.

---

## License

`decant-core` is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0-only)** with a **FOSS Linking Exception**, alongside a **Commercial License** option.

### FOSS Linking Exception (Open Source)

Permission is granted to link, import, or bundle `decant-core` into projects distributed under any OSI-approved open source license (including **MPL-2.0**, **MIT**, **Apache-2.0**, and **BSD**) and distribute the resulting work under that project's license, without requiring the enclosing project to be licensed under AGPLv3. Any modifications directly made to `decant-core` source files remain subject to AGPLv3.

### Commercial License

If you wish to use `decant-core` in closed-source, proprietary, or commercial software that cannot comply with the AGPLv3, a commercial license is available. Please contact `office@covai.org` for licensing terms.

### Third-Party Test Fixtures Notice

Sample test fixtures located in [`tests/fixtures/`](tests/fixtures/) consist of third-party DOM snapshots and API response excerpts retained solely for automated regression testing and platform interoperability under fair use principles. They are excluded from the project's AGPL-3.0 license. See [`tests/fixtures/README.md`](tests/fixtures/README.md) for details.

---

## Used by

- [AI Chat Exporter](https://github.com/Covai-Labs/ai-chat-exporter) — export, archive and transfer AI conversations between platforms.
- [Decant](https://github.com/Covai-Labs/decant-browser-extension) — the distraction-free web clipper and research batcher.

These products are demonstrations of the library, not its purpose. Yours can be next — see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Development

Building, testing, and extending the library is covered in [DEVELOPMENT.md](DEVELOPMENT.md);
platform contributions follow the parser pattern and CLA in [CONTRIBUTING.md](CONTRIBUTING.md).
