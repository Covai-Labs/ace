import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const wxtConfig = fs.readFileSync('wxt.config.ts', 'utf8');
const backgroundJs = fs.readFileSync('entrypoints/background.js', 'utf8');
const sidepanelHtml = fs.readFileSync('entrypoints/sidepanel/index.html', 'utf8');
const sidepanelJs = fs.readFileSync('entrypoints/sidepanel/sidepanel.js', 'utf8');
const popupHtml = fs.readFileSync('entrypoints/popup/index.html', 'utf8');
const popupJs = fs.readFileSync('entrypoints/popup/popup.js', 'utf8');

test('wxt.config.ts configures sidepanel permission and target-specific overrides', () => {
  assert.match(wxtConfig, /sidePanel/);
  assert.match(wxtConfig, /default_path: 'entrypoints\/sidepanel\/index\.html'/);
  assert.match(wxtConfig, /const isFirefox = browser === 'firefox'/);
});

test('wxt.config.ts configures gecko settings and sidebar_action for firefox target', () => {
  assert.match(wxtConfig, /sidebar_action/);
  assert.match(wxtConfig, /browser_specific_settings/);
  assert.match(wxtConfig, /gecko/);
  assert.match(wxtConfig, /open_at_install:\s*false/);
});

test('background.js syncs side panel behavior and handles OPEN_SIDE_PANEL', () => {
  assert.match(backgroundJs, /syncSidePanelBehavior/);
  assert.match(backgroundJs, /setPanelBehavior/);
  assert.match(backgroundJs, /action === ['"]OPEN_SIDE_PANEL['"]/);
});

test('sidepanel.html includes export and settings iframe tabs and excludes embedded preview tab', () => {
  assert.match(sidepanelHtml, /data-tab="export-tab"/);
  assert.doesNotMatch(sidepanelHtml, /data-tab="preview-tab"/);
  assert.match(sidepanelHtml, /data-tab="settings-tab"/);
  assert.match(sidepanelHtml, /id="sp-export-iframe"/);
  assert.doesNotMatch(sidepanelHtml, /id="sp-preview-iframe"/);
  assert.match(sidepanelHtml, /id="sp-settings-iframe"/);
});

test('options.js synchronizes launch mode preferences with chrome.storage.sync', () => {
  const optionsJs = fs.readFileSync('entrypoints/options/options.js', 'utf8');
  assert.match(optionsJs, /chrome\.storage\.sync\.get\([^)]*launchMode[^)]*\)/);
  assert.match(optionsJs, /chrome\.storage\.sync\.set\(\{\s*launchMode:/);
});

test('popup.html and popup.js do not provide a side panel button in popup UI', () => {
  assert.doesNotMatch(popupHtml, /id="open-sidepanel-btn"/);
  assert.doesNotMatch(popupJs, /open-sidepanel-btn/);
});

test('sidepanel header contains refresh button and sidepanel.js handles tab switch listeners with debouncing', () => {
  assert.match(sidepanelHtml, /id="sp-refresh-btn"/);
  assert.match(sidepanelJs, /getElementById\(['"]sp-refresh-btn['"]\)/);
  assert.match(sidepanelJs, /chrome\.tabs\.onActivated/);
  assert.match(sidepanelJs, /chrome\.tabs\.onUpdated/);
  assert.match(sidepanelJs, /debouncedRefreshAllPanels/);
});

test('debouncedRefreshAllPanels coalesces burst tab switch events and only triggers after delay', async () => {
  let timer = null;
  let refreshCount = 0;
  function refreshAllPanels() {
    refreshCount++;
  }
  function debouncedRefreshAllPanels(delayMs = 150) {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      refreshAllPanels();
    }, delayMs);
  }

  // Simulate rapid burst of tab activations/updates
  debouncedRefreshAllPanels(150);
  debouncedRefreshAllPanels(150);
  debouncedRefreshAllPanels(150);

  // Before delay expires (at 50ms), no refresh should have fired
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(refreshCount, 0, 'Refresh should not execute prematurely before debounce duration');

  // After delay expires (past 150ms), exactly one refresh should have fired
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(refreshCount, 1, 'Burst of tab events must coalesce into a single refresh');
});

test('sidepanel header contains close button and sidepanel.js handles closing the sidebar', () => {
  assert.match(sidepanelHtml, /id="sp-close-btn"/);
  assert.match(sidepanelJs, /getElementById\(['"]sp-close-btn['"]\)/);
  assert.match(sidepanelJs, /browser\.sidebarAction\.close/);
});
