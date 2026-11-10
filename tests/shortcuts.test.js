import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parseHTML } from 'linkedom';

test('wxt.config.ts defines commands configuration matching extension shortcuts', () => {
  const wxtConfig = fs.readFileSync('wxt.config.ts', 'utf8');

  assert.match(wxtConfig, /commands:\s*{/);
  assert.match(wxtConfig, /copy_markdown:/);
  assert.match(wxtConfig, /download_markdown:/);
  assert.match(wxtConfig, /open_preview:/);
  assert.match(wxtConfig, /Alt\+Shift\+C/);
  assert.match(wxtConfig, /Alt\+Shift\+D/);
  assert.match(wxtConfig, /Alt\+Shift\+P/);
  assert.match(wxtConfig, /__MSG_commandCopyMarkdown__/);
  assert.match(wxtConfig, /__MSG_commandDownloadMarkdown__/);
  assert.match(wxtConfig, /__MSG_commandOpenPreview__/);
});

test('options UI includes Keyboard Shortcuts section and elements', () => {
  const html = fs.readFileSync('entrypoints/options/index.html', 'utf8');
  const { document } = parseHTML(html);

  const shortcutsSection = document.getElementById('shortcuts-section');
  assert.ok(shortcutsSection, 'shortcuts-section should exist in options page');

  const configBtn = document.getElementById('configure-shortcuts-btn');
  assert.ok(configBtn, 'configure-shortcuts-btn should exist');

  const copyAboutAddonsBtn = document.getElementById('copy-about-addons-btn');
  assert.ok(copyAboutAddonsBtn, 'copy-about-addons-btn should exist');

  const keys = Array.from(document.querySelectorAll('.key')).map((k) => k.textContent.trim());
  assert.ok(keys.includes('Alt'));
  assert.ok(keys.includes('Shift'));
  assert.ok(keys.includes('C'));
  assert.ok(keys.includes('D'));
  assert.ok(keys.includes('P'));
});

test('entrypoints/background.js contains chrome.commands listener and handler', () => {
  const entryBgContent = fs.readFileSync('entrypoints/background.js', 'utf8');

  assert.match(entryBgContent, /chrome\.commands\.onCommand\.addListener/);
  assert.match(entryBgContent, /handleCommand/);
  assert.match(entryBgContent, /copy_markdown/);
  assert.match(entryBgContent, /download_markdown/);
  assert.match(entryBgContent, /open_preview/);
});

test('entrypoints/content.js handles EXECUTE_SHORTCUT and shows toast feedback', () => {
  const entryContentScript = fs.readFileSync('entrypoints/content.js', 'utf8');

  assert.match(entryContentScript, /EXECUTE_SHORTCUT/);
  assert.match(entryContentScript, /showExporterToast/);
  assert.match(entryContentScript, /copyToClipboard/);
  assert.match(entryContentScript, /copy_markdown/);
  assert.match(entryContentScript, /download_markdown/);
});
