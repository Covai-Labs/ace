import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Sitemap is generated at build time via @astrojs/sitemap.
export default defineConfig({
  site: 'https://ai-chat-exporter.covai.org',
  integrations: [sitemap()],
  outDir: '../docs',
  build: {
    format: 'file',
    inlineStylesheets: 'always',
    emptyOutDir: true,
  },
});
