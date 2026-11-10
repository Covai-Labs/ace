import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('entrypoints/popup/index.html includes reparse button and status structure', () => {
  const indexHtml = fs.readFileSync('entrypoints/popup/index.html', 'utf8');

  assert.match(indexHtml, /id="reparse-btn"/, 'Must contain reparse button');
  assert.match(indexHtml, /data-i18n-title="reparseChat"/, 'Must have reparseChat i18n title');
  assert.match(indexHtml, /class="status-indicator/, 'Must have status indicator');
  assert.match(indexHtml, /class="status-text"/, 'Must have status text');
});

test('entrypoints/popup/popup.css contains status states, pulse animation, and spin keyframes', () => {
  const entryCss = fs.readFileSync('entrypoints/popup/popup.css', 'utf8');

  assert.match(entryCss, /@keyframes pulse-dot/);
  assert.match(entryCss, /@keyframes spin-btn/);
  assert.match(entryCss, /\.status\.status-connecting/);
  assert.match(entryCss, /\.status\.status-scanning/);
  assert.match(entryCss, /\.status\.status-ready/);
  assert.match(entryCss, /\.sidepanel-icon-btn\.spin/);
});

test('entrypoints/popup/popup.js wires reparse-btn and establishes tab session port', () => {
  const entryPopupJs = fs.readFileSync('entrypoints/popup/popup.js', 'utf8');

  assert.match(entryPopupJs, /getElementById\(['"]reparse-btn['"]\)/);
  assert.match(entryPopupJs, /reparseBtn\.addEventListener\(['"]click['"]/);
  assert.match(entryPopupJs, /checkAvailability\(\{\s*force:\s*true\s*\}\)/);
  assert.match(entryPopupJs, /popup-tab-session/);
  assert.match(entryPopupJs, /setStatus\(/);
});

test('content script implements 90s parse cache, DOM mutation observer, and toast notification', () => {
  const entryContentJs = fs.readFileSync('entrypoints/content.js', 'utf8');

  assert.match(entryContentJs, /PARSE_CACHE_TTL_MS\s*=\s*90\s*\*\s*1000/);
  assert.match(entryContentJs, /isCacheValid/);
  assert.match(entryContentJs, /setupDomObserver/);
  assert.match(entryContentJs, /MutationObserver/);
  assert.match(entryContentJs, /popup-tab-session/);
  assert.match(entryContentJs, /showExporterToast/);
  assert.match(entryContentJs, /request\.action === ['"]CLEAR_CACHE['"]/);
  assert.match(entryContentJs, /request\.action === ['"]SHOW_TOAST['"]/);
});

test('parse cache logic behaves correctly with TTL, dirty flag, and force bypass', () => {
  const PARSE_CACHE_TTL_MS = 90 * 1000;
  let parseCache = null;

  function isCacheValid(url, mode, force = false) {
    if (force || !parseCache || parseCache.dirty || !parseCache.report) return false;
    if (parseCache.url !== url) return false;
    if (mode && parseCache.parserMode && parseCache.parserMode !== mode) return false;
    return Date.now() - parseCache.timestamp < PARSE_CACHE_TTL_MS;
  }

  const url = 'https://chatgpt.com/c/test-chat-id';

  // 1. Initial state: cache is invalid
  assert.equal(isCacheValid(url, 'auto'), false);

  // 2. Populate cache
  parseCache = {
    url,
    timestamp: Date.now(),
    parserMode: 'auto',
    report: { available: true, platform: 'ChatGPT', count: 10 },
    dirty: false,
  };

  // 3. Cache hit
  assert.equal(isCacheValid(url, 'auto'), true);

  // 4. Force bypass
  assert.equal(isCacheValid(url, 'auto', true), false);

  // 5. URL mismatch
  assert.equal(isCacheValid('https://chatgpt.com/c/different-chat', 'auto'), false);

  // 6. Mode mismatch
  assert.equal(isCacheValid(url, 'dom'), false);

  // 7. DOM mutation marked dirty
  parseCache.dirty = true;
  assert.equal(isCacheValid(url, 'auto'), false);

  // 8. Expired TTL
  parseCache.dirty = false;
  parseCache.timestamp = Date.now() - 95000;
  assert.equal(isCacheValid(url, 'auto'), false);
});
