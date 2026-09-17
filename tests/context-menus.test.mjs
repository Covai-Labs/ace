import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('wxt.config.ts configures contextMenus permission', () => {
  const wxtConfig = fs.readFileSync('wxt.config.ts', 'utf8');
  assert.match(wxtConfig, /'contextMenus'/);
});

test('locales define all context menu messages across all catalogs', () => {
  const localesDir = '_locales';
  const dirs = fs.readdirSync(localesDir);

  for (const dir of dirs) {
    const filePath = `${localesDir}/${dir}/messages.json`;
    if (fs.existsSync(filePath)) {
      const messages = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.ok(messages.contextMenuParent?.message, `Missing contextMenuParent in ${dir}`);
      assert.ok(
        messages.contextMenuCopyMarkdown?.message,
        `Missing contextMenuCopyMarkdown in ${dir}`,
      );
      assert.ok(
        messages.contextMenuDownloadMarkdown?.message,
        `Missing contextMenuDownloadMarkdown in ${dir}`,
      );
      assert.ok(
        messages.contextMenuOpenPreview?.message,
        `Missing contextMenuOpenPreview in ${dir}`,
      );
      assert.ok(messages.contextMenuSendToAI?.message, `Missing contextMenuSendToAI in ${dir}`);
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

test('background scripts query GET_CURRENT_SELECTION fallback and support COPY_TO_CLIPBOARD', () => {
  const bgEntry = fs.readFileSync('entrypoints/background.js', 'utf8');
  const bgClassic = fs.readFileSync('background/background.js', 'utf8');

  for (const bg of [bgEntry, bgClassic]) {
    assert.match(bg, /GET_CURRENT_SELECTION/);
    assert.match(bg, /COPY_TO_CLIPBOARD/);
    assert.match(bg, /transferCopyToClipboard/);
  }
});

test('content scripts handle GET_CURRENT_SELECTION and COPY_TO_CLIPBOARD', () => {
  const contentEntry = fs.readFileSync('entrypoints/content.js', 'utf8');
  const contentClassic = fs.readFileSync('content/main.js', 'utf8');

  for (const content of [contentEntry, contentClassic]) {
    assert.match(content, /request\.action === 'GET_CURRENT_SELECTION'/);
    assert.match(content, /request\.action === 'COPY_TO_CLIPBOARD'/);
  }
});
