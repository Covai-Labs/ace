import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const popupHtml = fs.readFileSync('popup/popup.html', 'utf8');
const popupJs = fs.readFileSync('popup/popup.js', 'utf8');

test('popup includes a copy button next to export', () => {
  assert.match(popupHtml, /id="copy-btn"/);
  assert.match(popupHtml, /Copy/);
});

test('popup sends a COPY_CHAT message for clipboard actions', () => {
  assert.match(popupJs, /action:\s*["']COPY_CHAT["']/);
});

test('copy button is enabled for markdown and json formats only', () => {
  const copyableFormatsMatch = popupJs.match(/copyableFormats\s*=\s*new Set\(\[([\s\S]*?)\]\)/);

  assert.ok(copyableFormatsMatch, 'copyableFormats Set should be defined');

  const copyableFormatsSource = copyableFormatsMatch[1];
  assert.match(copyableFormatsSource, /["']markdown["']/);
  assert.match(copyableFormatsSource, /["']json["']/);
  assert.doesNotMatch(copyableFormatsSource, /["']pdf["']/);
});

test('popup includes an open in tab button', () => {
  assert.match(popupHtml, /id="preview-btn"/);
  assert.match(popupHtml, /Open in Tab/);
});

test('preview button triggers local storage and opens preview.html tab', () => {
  assert.match(popupJs, /chrome\.storage\.local\.set/);
  assert.match(popupJs, /url:\s*chrome\.runtime\.getURL\(\s*["']popup\/preview\.html["']\s*\)/);
});

test('popup includes a custom filename input field', () => {
  assert.match(popupHtml, /id="filename-input"/);
  assert.match(popupHtml, /Filename/);
  assert.match(popupJs, /customFilename:\s*customFilename/);
});

test('popup supports dual-MIME Smart Copy using ClipboardItem', () => {
  assert.match(popupJs, /ClipboardItem/);
  assert.match(popupJs, /['"]text\/html['"]/);
  assert.match(popupJs, /['"]text\/plain['"]/);
});

test('popup places open in tab as primary button and export chat as secondary', () => {
  assert.match(
    popupHtml,
    /<div class="primary-row">\s*<button id="preview-btn" class="primary-btn"/,
  );
  assert.match(
    popupHtml,
    /<div class="secondary-row">\s*<button id="export-btn" class="secondary-btn"/,
  );
});
