import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('wxt.config.ts configures contextMenus permission', () => {
  const wxtConfig = fs.readFileSync('wxt.config.ts', 'utf8');
  assert.match(wxtConfig, /'contextMenus'/);
});

test('locales define all context menu messages across all catalogs', () => {
  const localesDir = 'public/_locales';
  const dirs = fs.readdirSync(localesDir);

  for (const dir of dirs) {
    const filePath = `${localesDir}/${dir}/messages.json`;
    if (fs.existsSync(filePath)) {
      const messages = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.ok(
        messages.contextMenuParent?.message,
        `Missing contextMenuParent in ${localesDir}/${dir}`,
      );
      assert.ok(
        messages.contextMenuCopyMarkdown?.message,
        `Missing contextMenuCopyMarkdown in ${localesDir}/${dir}`,
      );
      assert.ok(
        messages.contextMenuDownloadMarkdown?.message,
        `Missing contextMenuDownloadMarkdown in ${localesDir}/${dir}`,
      );
      assert.ok(
        messages.contextMenuOpenPreview?.message,
        `Missing contextMenuOpenPreview in ${localesDir}/${dir}`,
      );
      assert.ok(
        messages.contextMenuSendToAI?.message,
        `Missing contextMenuSendToAI in ${localesDir}/${dir}`,
      );
      assert.ok(
        messages.showContextMenuLabel?.message,
        `Missing showContextMenuLabel in ${localesDir}/${dir}`,
      );
      assert.ok(
        messages.showContextMenuHelp?.message,
        `Missing showContextMenuHelp in ${localesDir}/${dir}`,
      );
    }
  }
});

test('entrypoints/background.js sets up context menus with documentUrlPatterns and click listener', () => {
  const bg = fs.readFileSync('entrypoints/background.js', 'utf8');

  assert.match(bg, /setupContextMenus/);
  assert.match(bg, /SUPPORTED_DOCUMENT_URL_PATTERNS/);
  assert.match(bg, /ai-exporter-root/);
  assert.match(bg, /ai-exporter-copy-markdown/);
  assert.match(bg, /ai-exporter-download-markdown/);
  assert.match(bg, /ai-exporter-open-preview/);
  assert.match(bg, /ai-exporter-transfer-root/);
  assert.match(bg, /ai-exporter-transfer-\$\{target\.id\}/);
  assert.match(bg, /handleTransferContextMenu/);
  assert.match(bg, /chrome\.contextMenus\.onClicked\.addListener/);
});

test('background script queries GET_CURRENT_SELECTION fallback and supports COPY_TO_CLIPBOARD', () => {
  const bgEntry = fs.readFileSync('entrypoints/background.js', 'utf8');

  assert.match(bgEntry, /GET_CURRENT_SELECTION/);
  assert.match(bgEntry, /COPY_TO_CLIPBOARD/);
  assert.match(bgEntry, /transferCopyToClipboard/);
});

test('content script handles GET_CURRENT_SELECTION and COPY_TO_CLIPBOARD', () => {
  const contentEntry = fs.readFileSync('entrypoints/content.js', 'utf8');

  assert.match(contentEntry, /request\.action === 'GET_CURRENT_SELECTION'/);
  assert.match(contentEntry, /request\.action === 'COPY_TO_CLIPBOARD'/);
});

test('background script checks showContextMenu preference and listens for storage changes', () => {
  const bgEntry = fs.readFileSync('entrypoints/background.js', 'utf8');

  assert.match(bgEntry, /showContextMenu/);
  assert.match(bgEntry, /chrome\.storage\.sync\.get\(['"]showContextMenu['"]\)/);
  assert.match(bgEntry, /chrome\.storage\.onChanged\.addListener/);
});
