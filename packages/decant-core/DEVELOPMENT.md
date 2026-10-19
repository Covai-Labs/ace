# decant-core — Development Guide

Guide to building, testing, and extending `decant-core`. For contribution etiquette (PR guidelines,
CLA), see [CONTRIBUTING.md](CONTRIBUTING.md). For the platform matrix, see
[SUPPORTED_PLATFORMS.md](SUPPORTED_PLATFORMS.md).

## Prerequisites

- **Node.js 26+** with npm

## Setup

```bash
git clone https://github.com/Covai-Labs/decant.git
cd decant-core
npm install
```

## Commands

```bash
npm run test           # node --test (parser tests, fixture-based)
npm run lint           # ESLint
npm run format:check   # Prettier
npm run format         # Prettier (write)
npm run sync:platforms # Sync data/platforms.json -> README.md, SUPPORTED_PLATFORMS.md, web-docs
npm run sync:check     # Verify documentation tables match data/platforms.json (runs in CI)
```

Lint, code formatting, and platform synchronization checks run in CI on pull requests.

## Project Layout

```
├── ai/                 # AI chat platform parsers (one module per platform)
├── article/            # Web article extraction (Readability + Defuddle + Article-Extractor)
├── data/               # data/platforms.json (Single source of truth for platform metadata)
├── detection/          # detectPlatform(), isAiChatUrl(), parser/domain registry
├── docs/               # Built static site for decant.js.org (GitHub Pages root)
├── scripts/            # scripts/sync-platforms.js (Doc and data automation)
├── web/                # Web-scraping helpers and extraction utilities
├── tests/fixtures/     # Captured DOM snapshots the parsers are tested against
└── web-docs/           # Developer docs site (Astro, builds into docs/)
```

## Architecture

- **Parsers** live in `ai/`, one module per platform, each exporting a class that extends the base
  [`ChatParser`](ai/base.js). The base contract is `isAvailable(url)` returning a boolean and an
  async `parse()` returning a normalized result (title, model, messages, metadata).
- **Registration** is centralized in two places — `detection/detect-platform.js` for URL/domain
  detection and the `ai/index.js` barrel for named exports. A new platform must be registered in
  both (plus the shared `AI_CHAT_DOMAINS` list if it has its own domain).
- **Tests** are fixture-based: a captured HTML snapshot in `tests/fixtures/` plus a
  `tests/<platform>.test.mjs` that runs the parser against it. Runtime mocking is preferred over
  hand-written DOM strings so a platform's real markup is what the parser learns from.
- **Markdown/LaTeX helpers** (`convertToMarkdown`, `normalizeLatexMath`, `cleanMarkdown`) are
  deliberately platform-agnostic and keep math and GFM tables intact for Obsidian/Logseq round-trips.

## Documentation & Website Architecture

- **Single Source of Truth**: [`data/platforms.json`](data/platforms.json) defines all supported
  platforms, parser classes, export paths, strategies, and notes.
- **Automated Sync**: Running `npm run sync:platforms` reads `data/platforms.json` and updates:
  - The platform table in [`SUPPORTED_PLATFORMS.md`](SUPPORTED_PLATFORMS.md)
  - The supported platforms section and parser count badge in [`README.md`](README.md)
  - The typed data file [`web-docs/src/data/platforms.ts`](web-docs/src/data/platforms.ts)
- **CI Validation**: `npm run sync:check` fails if any markdown table or Astro data file is out of
  sync with `data/platforms.json`.
- **Docs Website (`decant.js.org`)**: Built with Astro inside `web-docs/`. The `prebuild` hook
  automatically runs `sync-platforms.js` before `astro build`, generating the static site into
  [`docs/`](docs/) which is published via GitHub Pages.

## Adding or repairing a parser

This is the most common contribution. When an AI interface updates its DOM or you want to add a new
platform:

1. Capture a fresh DOM snapshot and save it to `tests/fixtures/`.
2. Add (or update) the parser in `ai/`, keeping the `isAvailable(url)` / `parse()` contract.
3. Register it in `detection/detect-platform.js`, `ai/index.js`, and (if applicable) the domain list.
4. Add entry to [`data/platforms.json`](data/platforms.json) and run `npm run sync:platforms`.
5. Add a matching parser test in `tests/`.
6. Run `npm test && npm run lint && npm run format:check && npm run sync:check` before committing.

Follow the PR and CLA guidance in [CONTRIBUTING.md](CONTRIBUTING.md).
