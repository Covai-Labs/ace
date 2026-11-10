import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const popupHtml = fs.readFileSync('entrypoints/popup/index.html', 'utf8');
const popupJs = fs.readFileSync('entrypoints/popup/popup.js', 'utf8');
const backgroundJs = fs.readFileSync('entrypoints/background.js', 'utf8');

test('popup includes transfer section and continue button', () => {
  assert.match(popupHtml, /id="continue-target-select"/);
  assert.match(popupHtml, /id="transfer-btn"/);
  assert.match(popupJs, /GET_CONTINUATION_PAYLOAD/);
  assert.match(popupJs, /TRANSFER_CHAT/);
});

test('background handles TRANSFER_CHAT and target platform URLs', () => {
  assert.match(backgroundJs, /TRANSFER_CHAT/);
  assert.match(backgroundJs, /pendingContinuation/);
  assert.match(backgroundJs, /https:\/\/claude\.ai\/new/);
  assert.match(backgroundJs, /https:\/\/chat\.deepseek\.com\//);
});
