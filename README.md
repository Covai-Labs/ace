<div align="center">

# AI Chat Exporter

**Export, back up, and transfer AI conversations to Markdown, JSON, HTML, Word (.doc), and PNG — 100% locally.**

[![Website](https://img.shields.io/badge/Website-ace.covai.org-blueviolet)](https://ace.covai.org/)
[![License: MPL 2.0](https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg)](LICENSE)

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/cgakhbhkplndjjknhgegfcipffflcaoj?logo=google-chrome&logoColor=white&label=Chrome%20Web%20Store&color=blue)](https://chromewebstore.google.com/detail/ai-chat-exporter-free-pri/cgakhbhkplndjjknhgegfcipffflcaoj)
[![Firefox Add-ons](https://img.shields.io/amo/v/ai-chat-export?logo=firefox-browser&logoColor=white&label=Firefox%20Add-ons&color=orange)](https://addons.mozilla.org/en-US/firefox/addon/ai-chat-export/)
[![Microsoft Edge](https://img.shields.io/badge/Microsoft%20Edge-Add--on-0078D7?logo=microsoft-edge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/ai-chat-exporter-free-/hbgckjgfhnaedlihmkogenclfcnobicg)

[![Chrome Users](https://img.shields.io/chrome-web-store/users/cgakhbhkplndjjknhgegfcipffflcaoj?logo=google-chrome&logoColor=white&label=Chrome%20Users&color=blue)](https://chromewebstore.google.com/detail/ai-chat-exporter-free-pri/cgakhbhkplndjjknhgegfcipffflcaoj)
[![Firefox Users](https://img.shields.io/amo/users/ai-chat-export?logo=firefox-browser&logoColor=white&label=Firefox%20Users&color=orange)](https://addons.mozilla.org/en-US/firefox/addon/ai-chat-export/)
[![GitHub Stars](https://img.shields.io/github/stars/Covai-Labs/ace?logo=github&logoColor=white&color=yellow&label=Stars)](https://github.com/Covai-Labs/ace/stargazers)

[Quick Install](#quick-install) • [Supported Platforms](#supported-platforms) • [Features](#key-features) • [Chat Continuation](#cross-model-chat-continuation)

---

[![Watch Demo Video](https://img.youtube.com/vi/5V2EZqDkUnU/maxresdefault.jpg)](https://www.youtube.com/watch?v=5V2EZqDkUnU)

<sub>▶️ **Click to watch:** 1-minute walkthrough of chat continuation, selective export, preview themes, and PNG downloads.</sub>

</div>

---

## Why AI Chat Exporter? (Privacy First)

Most AI exporters and extensions send your chat history or API calls to third-party backend servers for conversion.

**AI Chat Exporter is 100% local:**

- **Zero Remote Processing:** All DOM extraction, markdown generation, LaTeX parsing, and image rendering occur entirely inside your local browser.
- **Zero Telemetry / Zero Tracking:** No analytics, no trackers, no external logging, and no remote dependencies.
- **Your Data Remains Yours:** Chat threads, custom instructions, and exported files never leave your machine.

**Verifiable by design.** The extension runs 100% client-side with zero remote code execution:

| Permission                        | Why it's needed                                                                       |
| :-------------------------------- | :------------------------------------------------------------------------------------ |
| `activeTab` / `tabs`              | Read the active conversation and coordinate continuation tabs                         |
| `storage`                         | Persist local preferences (theme, format defaults)                                    |
| `sidePanel`                       | Power the Chromium side panel UI                                                      |
| `host_permissions` (`<all_urls>`) | Extract web articles and detect embedded chat frames (e.g., Copilot in Microsoft 365) |

Zero external analytics endpoints. Zero remote dependencies. Zero outbound network fetches. Audit it yourself: [`wxt.config.ts`](wxt.config.ts).

---

## Key Features

- **📝 Clean Markdown with Math & Code:**
  - Preserves syntax highlighting, code languages, tables, and nested lists.
  - Standardizes LaTeX math formatting (`$$...$$` block and `$...$` inline) without broken backslashes. Ready for **Obsidian**, **Logseq**, and **Notion**.
- **🔄 Cross-Model Chat Continuation:**
  - Hand off active conversations between platforms in a single click (e.g., take a ChatGPT conversation and continue it directly in Claude or Gemini).
  - See [Chat Continuation](#cross-model-chat-continuation) below for details.
- **📓 Direct PKM App Transfer:**
  - Export straight into **Obsidian** via `obsidian://new` URIs, or trigger URL schemes for **Logseq**, **Bear**, **Drafts**, and **NotePlan**.
- **🗂️ Standardized JSON Schema:**
  - Emits structured, normalized chat objects adhering to [Export Schema v1](schemas/export-v1.schema.json) for archiving, backups, and programmatic AI workflows.
- **📸 Built-in Live Preview & Themes:**
  - Interactive preview window supporting Dark, Light, and Solarized themes before downloading.
  - Export high-resolution PNG snapshots of conversations or selective turns.
- **📋 Smart Dual-MIME Copy:**
  - One-click copy that places both clean Markdown and rich HTML on your clipboard simultaneously for seamless pasting into emails, Google Docs, or Word.
- **📄 Word (.doc) & PDF Support:**
  - Export formatted Word-compatible documents or print-ready PDF files with complete math rendering.
- **⚡ Chromium Side Panel Support:**
  - View exports, preview documents, and trigger continuation straight from the native browser side panel without leaving your active tab.

---

## Supported Platforms

AI Chat Exporter extracts full conversation threads from all major AI chat platforms and AI search overviews. Context continuation lets you hand off conversations directly to leading LLMs and PKM note-taking apps.

| Platform                                                      | Markdown | JSON | HTML / Doc / PNG |    Continuation Target     |
| :------------------------------------------------------------ | :------: | :--: | :--------------: | :------------------------: |
| **[ChatGPT](https://chatgpt.com)**                            |    ✅    |  ✅  |        ✅        |             ✅             |
| **[Claude](https://claude.ai)**                               |    ✅    |  ✅  |        ✅        |             ✅             |
| **[Google Gemini](https://gemini.google.com)**                |    ✅    |  ✅  |        ✅        |             ✅             |
| **[DeepSeek](https://chat.deepseek.com)**                     |    ✅    |  ✅  |        ✅        |             ✅             |
| **[Microsoft Copilot](https://copilot.microsoft.com)**        |    ✅    |  ✅  |        ✅        |     — _(Export only)_      |
| **[Perplexity](https://www.perplexity.ai)**                   |    ✅    |  ✅  |        ✅        |             ✅             |
| **[Qwen](https://chat.qwenlm.ai)**                            |    ✅    |  ✅  |        ✅        |             ✅             |
| **[Mistral / Le Chat](https://chat.mistral.ai)**              |    ✅    |  ✅  |        ✅        |             ✅             |
| **[Google Search AI (AI Overviews)](https://www.google.com)** |    ✅    |  ✅  |        ✅        |     — _(Export only)_      |
| **[Google AI Studio](https://aistudio.google.com)**           |    ✅    |  ✅  |        ✅        |     — _(Export only)_      |
| **[Google Cloud Assist](https://console.cloud.google.com)**   |    ✅    |  ✅  |        ✅        |     — _(Export only)_      |
| **[NotebookLM](https://notebooklm.google.com)**               |    ✅    |  ✅  |        ✅        | — _(Export audio & notes)_ |
| **[Meta AI](https://www.meta.ai)**                            |    ✅    |  ✅  |        ✅        |     — _(Export only)_      |
| **[Proton Lumo](https://lumo.proton.me)**                     |    ✅    |  ✅  |        ✅        |             ✅             |
| **[Z.ai](https://z.ai)**                                      |    ✅    |  ✅  |        ✅        |     — _(Export only)_      |
| **[Joyland](https://www.joyland.ai)**                         |    ✅    |  ✅  |        ✅        |     — _(Export only)_      |
| **[Chub AI](https://chub.ai)**                                |    ✅    |  ✅  |        ✅        |     — _(Export only)_      |
| **Generic Web Articles** _(single-page convenience)_          |    ✅    |  ✅  |        ✅        |     — _(Export only)_      |

> **Continuation Targets:** Seamless prompt injection is supported for general-purpose chat models (ChatGPT, Claude, Gemini, DeepSeek, Proton Lumo, Perplexity, Qwen, Mistral) and PKM note-taking apps (**Obsidian**, **Logseq**, **Bear**, **NotePlan**, **Drafts**). Platforms requiring character selection (Joyland, Chub AI) or workspace setup (NotebookLM) are supported for clean export only.

---

## Cross-Model Chat Continuation

Chat Continuation is the feature that sets AI Chat Exporter apart from every other exporter — it lets you hand off a live conversation from one AI to another in a single click, with full context preserved.

```
ChatGPT  ──►  [ Export + Inject ]  ──►  Claude
Claude   ──►  [ Export + Inject ]  ──►  Gemini
Gemini   ──►  [ Export + Inject ]  ──►  DeepSeek  (or any supported target)
```

**How it works:**

1. **Extract** — Click the extension on any supported platform. The full conversation thread is parsed locally.
2. **Format** — The thread is wrapped into a structured handoff prompt that preserves roles (user / assistant), turn order, and any code or math blocks.
3. **Inject** — The formatted context is placed directly into the input field of your chosen target platform. You resume the conversation immediately — no copy-pasting, no reformatting.

**Also works with PKM apps:** Send the conversation directly into **Obsidian** (via `obsidian://new`), **Logseq**, **Bear**, **NotePlan**, or **Drafts** with frontmatter metadata (`title`, `date`, `model`, `source`) pre-populated.

---

## Quick Install

### Official Stores

- 🦊 **Firefox**: [Install from Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/ai-chat-export/)
- 🌐 **Chrome / Brave**: [Install from Chrome Web Store](https://chromewebstore.google.com/detail/ai-chat-exporter-free-pri/cgakhbhkplndjjknhgegfcipffflcaoj)
- 🌊 **Microsoft Edge**: [Install from Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/ai-chat-exporter-free-/hbgckjgfhnaedlihmkogenclfcnobicg)

> [!NOTE]
> Chrome Web Store updates may occasionally lag behind Firefox and GitHub releases due to store review queues.

<details>
<summary><b>📦 Manual / Unpacked Installation</b></summary>

#### Chrome / Edge / Brave / Chromium

1. Download the latest `ai-chat-exporter-chromium.zip` from the [Releases page](https://github.com/Covai-Labs/ace/releases).
2. Extract the zip file to a folder on your computer.
3. Open your browser and navigate to `chrome://extensions/` (or `edge://extensions/`).
4. Enable **Developer mode** using the toggle switch in the top-right corner.
5. Click **Load unpacked** and select the extracted folder.

#### Firefox

1. Download the latest `ai-chat-exporter-firefox.zip` from the [Releases page](https://github.com/Covai-Labs/ace/releases).
2. Extract the zip file to a folder on your computer.
3. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
4. Click **Load Temporary Add-on...**
5. Select `manifest.json` inside the extracted folder.

</details>

### Choosing Between AI Chat Exporter and Decant

AI Chat Exporter and [Decant](https://github.com/Covai-Labs/decant-browser-extension) share an extraction engine ([decant-core](https://github.com/Covai-Labs/decant)) but solve different jobs:

| Your goal                                                                                               | Use                  |
| :------------------------------------------------------------------------------------------------------ | :------------------- |
| Export, back up, or **continue a conversation** between AI platforms                                    | **AI Chat Exporter** |
| Trim generic AI search overviews (and single pages) into Markdown                                       | **AI Chat Exporter** |
| **Clip arbitrary web pages** — batch whole tabs into a research ZIP, or hand one page to your PKM vault | **Decant**           |

As a convenience, AI Chat Exporter's single-page export walks any web article through the same local pipeline — handy for saving one page next to a chat. For serious web clipping — multi-tab batches, frontmatter-driven note hand-off, and reading view — use **Decant**.

---

## Contributing

Contributions are welcome! If an AI chat interface updates its DOM or you want to add support for
a new platform, see the [Development Guide](DEVELOPMENT.md) for build steps, parser guidelines, and
the test harness.

Platform web layouts evolve frequently. If an exporter encounters issues on a modified layout:

1. Check existing [Issues](https://github.com/Covai-Labs/ace/issues) or open a new one with the platform name and DOM context.
2. Submit a Pull Request following our [Contribution Guidelines](CONTRIBUTING.md).

---

## License

This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. See [LICENSE](LICENSE) for the full license text.

### Third-Party Test Fixtures Notice

Sample test fixtures located in [`tests/fixtures/`](tests/fixtures/) consist of third-party DOM snapshots and API response excerpts retained solely for automated regression testing and platform interoperability under fair use principles. They are excluded from the project's MPL-2.0 license. See [`tests/fixtures/README.md`](tests/fixtures/README.md) for details.

---

## Acknowledgments

- [decant-core](https://github.com/Covai-Labs/decant) — Shared parser engine and intelligent article extraction.
- [Turndown.js](https://github.com/mixmark-io/turndown) — HTML to Markdown conversion.
- [DOMPurify](https://github.com/cure53/DOMPurify) — HTML sanitization.
- [html2canvas](https://github.com/niklasvh/html2canvas) — Client-side PNG rendering.
- [KaTeX](https://github.com/KaTeX/KaTeX) — Math and LaTeX equation rendering.
- [Prism.js](https://github.com/PrismJS/prism) — Code block syntax highlighting.
- [WXT](https://wxt.dev/) — Extension development framework.
