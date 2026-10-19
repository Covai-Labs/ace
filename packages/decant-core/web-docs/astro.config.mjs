import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Developer documentation site for decant-core (repo Covai-Labs/decant).
// Hosted on GitHub Pages at https://decant.js.org by building into ../docs.
export default defineConfig({
  site: 'https://decant.js.org',
  base: '/',
  integrations: [sitemap()],
  outDir: '../docs',
  build: {
    format: 'file',
    inlineStylesheets: 'always',
    emptyOutDir: true,
  },
});
