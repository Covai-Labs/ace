import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('background script defines getFormatDownloadTitle and getFormatCopyTitle', () => {
  const bgEntry = fs.readFileSync('entrypoints/background.js', 'utf8');

  assert.match(bgEntry, /getFormatDownloadTitle/);
  assert.match(bgEntry, /getFormatCopyTitle/);
  assert.match(bgEntry, /Download Plain Text/);
  assert.match(bgEntry, /Download JSON/);
  assert.match(bgEntry, /Download HTML/);
  assert.match(bgEntry, /Download Word \(\.doc\)/);
  assert.match(bgEntry, /Download PNG/);
  assert.match(bgEntry, /Download PDF/);
});

test('background script listens for defaultFormat changes and queries defaultFormat during setup', () => {
  const bgEntry = fs.readFileSync('entrypoints/background.js', 'utf8');

  assert.match(bgEntry, /defaultFormat/);
  assert.match(bgEntry, /chrome\.storage\.sync\.get\(['"]defaultFormat['"]\)/);
  assert.match(bgEntry, /'defaultFormat' in changes/);
});

test('background script handleCommand routes PDF and PNG to preview tab with autoPrint/autoDownloadPng', () => {
  const bgEntry = fs.readFileSync('entrypoints/background.js', 'utf8');

  assert.match(bgEntry, /autoPrint:\s*format === 'pdf'/);
  assert.match(bgEntry, /autoDownloadPng:\s*format === 'png'/);
  assert.match(bgEntry, /shortcutAction: command/);
});

test('context menu click listener reads defaultFormat and delegates to handleCommand', () => {
  const bgEntry = fs.readFileSync('entrypoints/background.js', 'utf8');

  assert.match(bgEntry, /handleCommand\('copy_format',/);
  assert.match(bgEntry, /handleCommand\('download_format',/);
});

test('content script handles targetFormat in EXECUTE_SHORTCUT', () => {
  const contentEntry = fs.readFileSync('entrypoints/content.js', 'utf8');

  assert.match(contentEntry, /request\.format \|\| 'markdown'/);
  assert.match(contentEntry, /formatters\[targetFormat\]/);
  assert.match(contentEntry, /shortcut === 'copy_markdown' \|\| shortcut === 'copy_format'/);
  assert.match(
    contentEntry,
    /shortcut === 'download_markdown' \|\| shortcut === 'download_format'/,
  );
});

test('background script passes tab and clears previewFilename in handleCommand', () => {
  const bgEntry = fs.readFileSync('entrypoints/background.js', 'utf8');

  assert.match(bgEntry, /targetTab\s*=\s*null/);
  assert.match(bgEntry, /targetTab\s*\|\|\s*\(await getActiveTab\(\)\)/);
  assert.match(bgEntry, /previewFilename:\s*null/);
  assert.match(bgEntry, /handleCommand\('copy_format',.*,\s*tab\)/);
  assert.match(bgEntry, /handleCommand\('download_format',.*,\s*tab\)/);
  assert.match(bgEntry, /handleCommand\('open_preview',.*,\s*tab\)/);
});
