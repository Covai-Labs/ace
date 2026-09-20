# AI Chat Exporter Website & Guides (`ace.covai.org`)

Source code for the documentation and SEO guide site for AI Chat Exporter, built with [Astro](https://astro.build).

## Architecture

- **Custom SEO Guides**: Hand-crafted Astro pages for major platforms (ChatGPT, Claude, Gemini, Copilot, Perplexity, DeepSeek) and export formats (Markdown, PDF, Obsidian, JSON, PNG, LaTeX).
- **Dynamic Platform Routes (`src/pages/[slug].astro`)**: Automatically generates dedicated landing and guide pages for all remaining supported platforms using `getStaticPaths()` and metadata defined in [`src/data/platform-details.ts`](src/data/platform-details.ts).
- **Central Guides Directory (`src/data/guides.ts`)**: Feeds `/guides.html` with grouped links by format and by platform.
- **Output**: Builds static HTML, CSS, and sitemap files into [`../docs`](../docs) for hosting.

## Development

```bash
cd web
npm install
npm run dev
```

Runs the Astro dev server at `http://localhost:4321`.

## Building

```bash
npm run build
```

Generates all 39+ static pages and sitemaps into `../docs/` and formats them with Prettier.
