import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('background scripts define getFormatDownloadTitle and getFormatCopyTitle', () => {
  const bgEntry = fs.readFileSync('entrypoints/background.js', 'utf8');
  const bgClassic = fs.readFileSync('background/background.js', 'utf8');

  for (const bg of [bgEntry, bgClassic]) {
    assert.match(bg, /getFormatDownloadTitle/);
    assert.match(bg, /getFormatCopyTitle/);
    assert.match(bg, /Download Plain Text/);
    assert.match(bg, /Download JSON/);
    assert.match(bg, /Download HTML/);
    assert.match(bg, /Download Word \(\.doc\)/);
    assert.match(bg, /Download PNG/);
    assert.match(bg, /Download PDF/);
  }
});

test('background scripts listen for defaultFormat changes and query defaultFormat during setup', () => {
  const bgEntry = fs.readFileSync('entrypoints/background.js', 'utf8');
  const bgClassic = fs.readFileSync('background/background.js', 'utf8');

  for (const bg of [bgEntry, bgClassic]) {
    assert.match(bg, /defaultFormat/);
    assert.match(bg, /chrome\.storage\.sync\.get\(['"]defaultFormat['"]\)/);
    assert.match(bg, /'defaultFormat' in changes/);
  }
});

test('background scripts handleCommand routes PDF and PNG to preview tab with autoPrint/autoDownloadPng', () => {
  const bgEntry = fs.readFileSync('entrypoints/background.js', 'utf8');
  const bgClassic = fs.readFileSync('background/background.js', 'utf8');

  for (const bg of [bgEntry, bgClassic]) {
    assert.match(bg, /autoPrint:\s*format === 'pdf'/);
    assert.match(bg, /autoDownloadPng:\s*format === 'png'/);
    assert.match(bg, /shortcutAction: command/);
  }
});

test('context menu click listener reads defaultFormat and delegates to handleCommand', () => {
  const bgEntry = fs.readFileSync('entrypoints/background.js', 'utf8');
  const bgClassic = fs.readFileSync('background/background.js', 'utf8');

  for (const bg of [bgEntry, bgClassic]) {
    assert.match(bg, /handleCommand\('copy_format',/);
    assert.match(bg, /handleCommand\('download_format',/);
  }
});

test('content scripts handle targetFormat in EXECUTE_SHORTCUT', () => {
  const contentEntry = fs.readFileSync('entrypoints/content.js', 'utf8');
  const contentClassic = fs.readFileSync('content/main.js', 'utf8');

  for (const content of [contentEntry, contentClassic]) {
    assert.match(content, /request\.format \|\| 'markdown'/);
    assert.match(content, /formatters\[targetFormat\]/);
    assert.match(content, /shortcut === 'copy_markdown' \|\| shortcut === 'copy_format'/);
    assert.match(content, /shortcut === 'download_markdown' \|\| shortcut === 'download_format'/);
  }
});

test('background scripts pass tab and clear previewFilename in handleCommand', () => {
  const bgEntry = fs.readFileSync('entrypoints/background.js', 'utf8');
  const bgClassic = fs.readFileSync('background/background.js', 'utf8');

  for (const bg of [bgEntry, bgClassic]) {
    assert.match(bg, /targetTab\s*=\s*null/);
    assert.match(bg, /targetTab\s*\|\|\s*\(await getActiveTab\(\)\)/);
    assert.match(bg, /previewFilename:\s*null/);
    assert.match(bg, /handleCommand\('copy_format',.*,\s*tab\)/);
    assert.match(bg, /handleCommand\('download_format',.*,\s*tab\)/);
    assert.match(bg, /handleCommand\('open_preview',.*,\s*tab\)/);
  }
});
