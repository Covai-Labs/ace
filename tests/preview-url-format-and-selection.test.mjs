import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const previewHtml = fs.readFileSync('entrypoints/preview/index.html', 'utf8');
const previewJs = fs.readFileSync('entrypoints/preview/preview.js', 'utf8');
const previewCss = fs.readFileSync('entrypoints/preview/preview.css', 'utf8');
const messagesJson = JSON.parse(fs.readFileSync('public/_locales/en/messages.json', 'utf8'));

test('preview html includes explicit favicon link tags for webextension tab rendering', () => {
  assert.match(
    previewHtml,
    /<link rel="icon" type="image\/png" sizes="32x32" href="\/icons\/favicon-32x32\.png"/,
  );
  assert.match(
    previewHtml,
    /<link rel="icon" type="image\/png" sizes="16x16" href="\/icons\/favicon-16x16\.png"/,
  );
  assert.match(previewHtml, /<link rel="shortcut icon" href="\/icons\/favicon\.ico"/);
});

test('preview drawer includes All, Prompts, Responses, and None selection buttons', () => {
  assert.match(previewHtml, /id="turn-select-all-btn"/);
  assert.match(previewHtml, /id="turn-select-prompts-btn"/);
  assert.match(previewHtml, /id="turn-select-responses-btn"/);
  assert.match(previewHtml, /id="turn-deselect-all-btn"/);

  assert.equal(messagesJson.selectAll.message, 'All');
  assert.equal(messagesJson.selectPrompts.message, 'Prompts');
  assert.equal(messagesJson.selectResponses.message, 'Responses');
  assert.equal(messagesJson.deselectAll.message, 'None');
});

test('preview script implements Prompts and Responses filtering logic', () => {
  assert.match(previewJs, /turnSelectPromptsBtn/);
  assert.match(previewJs, /turnSelectResponsesBtn/);
  assert.match(previewJs, /msg\.role === 'User'/);
  assert.match(previewJs, /msg\.role !== 'User'/);
});

test('preview layout configures side-by-side flex row layout with min-width 0', () => {
  assert.match(previewCss, /\.preview-main\s*\{[^}]*flex-direction:\s*row;/);
  assert.match(previewCss, /\.code-wrapper\s*\{[^}]*min-width:\s*0;/);
  assert.match(previewCss, /\.render-wrapper\s*\{[^}]*min-width:\s*0;/);
});

test('preview script parses URL export_format parameter and synchronizes on tab switch', () => {
  assert.match(previewJs, /mapTabToFormatParam/);
  assert.match(previewJs, /mapFormatParamToTab/);
  assert.match(previewJs, /syncUrlFormat/);
  assert.match(previewJs, /searchParams\.get\(['"]export_format['"]\)/);
  assert.match(previewJs, /history\.replaceState/);
});

test('preview HTML and scripts wire plain text tab and format mappings', () => {
  assert.match(previewHtml, /data-tab="text"/);
  assert.match(previewJs, /case 'text':\s*return 'text';/);
  assert.match(previewJs, /p === 'txt' \|\| p === 'text'/);
  assert.equal(messagesJson.textTab.message, '📄 Plain Text');
  assert.equal(messagesJson.downloadPlainText.message, 'Download Plain Text');
  assert.equal(messagesJson.formatText.message, '📄 Plain Text (.txt)');
});
