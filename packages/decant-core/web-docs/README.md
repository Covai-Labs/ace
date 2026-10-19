# decant-core Developer Documentation Site

This directory contains the source code for [decant.js.org](https://decant.js.org), built with [Astro](https://astro.build).

## Features

- **Automated Platform Matrix**: Supported platforms, parsers, and extraction strategies are generated directly from [`data/platforms.json`](../data/platforms.json) via a `prebuild` hook.
- **Static Output**: Builds static HTML, CSS, and sitemap directly into [`../docs`](../docs) for hosting via GitHub Pages.

## Development

```bash
cd web-docs
npm install
npm run dev
```

Starts the local Astro development server with hot-module reloading at `http://localhost:4321`.

## Building

```bash
npm run build
```

This triggers:
1. `prebuild`: Executes `node ../scripts/sync-platforms.js` to ensure Markdown files and `src/data/platforms.ts` are in sync with `data/platforms.json`.
2. `astro build`: Compiles all pages and sitemaps into `../docs`.
3. `prettier --write ../docs`: Formats the generated output for consistent code style.
