import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const contentJs = fs.readFileSync('entrypoints/content.js', 'utf8');
const popupHtml = fs.readFileSync('entrypoints/popup/index.html', 'utf8');
const optionsHtml = fs.readFileSync('entrypoints/options/index.html', 'utf8');
const backgroundJs = fs.readFileSync('entrypoints/background.js', 'utf8');

test('content script registers the Open-WebUI formatter', () => {
  assert.match(
    contentJs,
    /import \{ OpenWebUIFormatter \} from '\.\.\/content\/formatters\/openwebui\.js';/,
  );
  assert.match(contentJs, /openwebui: new OpenWebUIFormatter\(/);
});

test('popup and options expose the Open-WebUI export format', () => {
  assert.match(popupHtml, /<option value="openwebui">.*Open-WebUI JSON \(\.json\)<\/option>/);
  assert.match(optionsHtml, /<option value="openwebui">Open-WebUI JSON \(\.json\)<\/option>/);
});

test('context menu labels the Open-WebUI download', () => {
  assert.match(backgroundJs, /openwebui: 'Download Open-WebUI JSON'/);
});
