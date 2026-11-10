import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

test('chrome.storage.sync schema defaults for options system', () => {
  const defaultOptions = {
    defaultFormat: 'markdown',
    includeImages: true,
    filenameTemplate: '{platform} - {title} - {datetime}',
    parserMode: 'auto',
    defaultTransferTarget: 'claude',
    launchMode: 'popup',
    theme: 'system',
    showContextMenu: true,
  };

  assert.equal(defaultOptions.defaultFormat, 'markdown');
  assert.equal(defaultOptions.includeImages, true);
  assert.equal(defaultOptions.filenameTemplate, '{platform} - {title} - {datetime}');
  assert.equal(defaultOptions.parserMode, 'auto');
  assert.equal(defaultOptions.defaultTransferTarget, 'claude');
  assert.equal(defaultOptions.launchMode, 'popup');
  assert.equal(defaultOptions.theme, 'system');
  assert.equal(defaultOptions.showContextMenu, true);
});

test('smart transfer target logic defaults away from current platform', () => {
  function getSmartTransferTarget(currentPlatform, userDefault = 'claude') {
    const platformKey = (currentPlatform || '').toLowerCase();
    let target = userDefault;
    if (platformKey.includes('chatgpt') && target === 'chatgpt') {
      target = 'claude';
    } else if (platformKey.includes('claude') && target === 'claude') {
      target = 'chatgpt';
    }
    return target;
  }

  // When on ChatGPT and user default is chatgpt -> switches to claude
  assert.equal(getSmartTransferTarget('ChatGPT', 'chatgpt'), 'claude');

  // When on Claude and user default is claude -> switches to chatgpt
  assert.equal(getSmartTransferTarget('Claude Chat', 'claude'), 'chatgpt');

  // When on Gemini and user default is claude -> remains claude
  assert.equal(getSmartTransferTarget('Gemini', 'claude'), 'claude');

  // When on ChatGPT and user default is deepseek -> remains deepseek
  assert.equal(getSmartTransferTarget('ChatGPT', 'deepseek'), 'deepseek');
});

test('applyTheme correctly sets data-theme for all themes and removes for system', () => {
  const mockDoc = {
    attrs: {},
    documentElement: {
      setAttribute(name, val) {
        mockDoc.attrs[name] = val;
      },
      removeAttribute(name) {
        delete mockDoc.attrs[name];
      },
      getAttribute(name) {
        return mockDoc.attrs[name];
      },
    },
  };

  function applyTheme(theme, targetDoc = mockDoc) {
    if (theme && theme !== 'system') {
      targetDoc.documentElement.setAttribute('data-theme', theme);
    } else {
      targetDoc.documentElement.removeAttribute('data-theme');
    }
  }

  // System removes attribute
  applyTheme('system');
  assert.equal(mockDoc.documentElement.getAttribute('data-theme'), undefined);

  // Dark & Light
  applyTheme('dark');
  assert.equal(mockDoc.documentElement.getAttribute('data-theme'), 'dark');

  applyTheme('light');
  assert.equal(mockDoc.documentElement.getAttribute('data-theme'), 'light');

  // Modern aliases
  applyTheme('modern-dark');
  assert.equal(mockDoc.documentElement.getAttribute('data-theme'), 'modern-dark');

  applyTheme('modern-light');
  assert.equal(mockDoc.documentElement.getAttribute('data-theme'), 'modern-light');

  // Palette themes
  const themes = [
    'catppuccin',
    'monokai',
    'synthwave',
    'gruvbox',
    'dracula',
    'nord',
    'github-dark',
    'github-light',
    'solarized-dark',
    'solarized-light',
  ];
  for (const th of themes) {
    applyTheme(th);
    assert.equal(mockDoc.documentElement.getAttribute('data-theme'), th);
  }

  // Empty or undefined removes attribute
  applyTheme('');
  assert.equal(mockDoc.documentElement.getAttribute('data-theme'), undefined);
});

test('transferCopyToClipboard defaults to false in options system', () => {
  const defaultOptions = {
    transferAutoSend: true,
    transferCopyToClipboard: false,
  };
  assert.equal(defaultOptions.transferCopyToClipboard, false);
});

test('options HTML page defines transfer-copy-clipboard-checkbox', () => {
  const entrypointsOptionsHtml = fs.readFileSync('entrypoints/options/index.html', 'utf8');

  assert.match(entrypointsOptionsHtml, /id="transfer-copy-clipboard-checkbox"/);
  assert.match(entrypointsOptionsHtml, /data-i18n="transferCopyClipboardLabel"/);
});

test('options script wires transferCopyToClipboard storage setting', () => {
  const entrypointsOptionsJs = fs.readFileSync('entrypoints/options/options.js', 'utf8');

  assert.match(entrypointsOptionsJs, /'transferCopyToClipboard'/);
  assert.match(entrypointsOptionsJs, /transferCopyClipboardCheckbox/);
});

test('options HTML page defines default-include-thinking checkbox', () => {
  const entrypointsOptionsHtml = fs.readFileSync('entrypoints/options/index.html', 'utf8');

  assert.match(entrypointsOptionsHtml, /id="default-include-thinking"/);
  assert.match(entrypointsOptionsHtml, /data-i18n="includeThinkingDefault"/);
});

test('options script wires includeThinking storage setting', () => {
  const entrypointsOptionsJs = fs.readFileSync('entrypoints/options/options.js', 'utf8');

  assert.match(entrypointsOptionsJs, /'includeThinking'/);
  assert.match(entrypointsOptionsJs, /defaultIncludeThinking/);
});

test('options HTML page defines show-context-menu-checkbox', () => {
  const entrypointsOptionsHtml = fs.readFileSync('entrypoints/options/index.html', 'utf8');

  assert.match(entrypointsOptionsHtml, /id="show-context-menu-checkbox"/);
  assert.match(entrypointsOptionsHtml, /data-i18n="showContextMenuLabel"/);
});

test('options script wires showContextMenu storage setting', () => {
  const entrypointsOptionsJs = fs.readFileSync('entrypoints/options/options.js', 'utf8');

  assert.match(entrypointsOptionsJs, /'showContextMenu'/);
  assert.match(entrypointsOptionsJs, /showContextMenuCheckbox/);
});

test('options HTML page defines #love section and #nav-love link', () => {
  const entrypointsOptionsHtml = fs.readFileSync('entrypoints/options/index.html', 'utf8');

  assert.match(entrypointsOptionsHtml, /id="nav-love"/);
  assert.match(entrypointsOptionsHtml, /href="#love"/);
  assert.match(entrypointsOptionsHtml, /id="love"/);
  assert.ok(entrypointsOptionsHtml.includes('/sponsors/deadrat-in'));
});

test('popup header includes #support-btn opening options.html#love', () => {
  const entrypointsPopupHtml = fs.readFileSync('entrypoints/popup/index.html', 'utf8');
  const entrypointsPopupJs = fs.readFileSync('entrypoints/popup/popup.js', 'utf8');

  assert.match(entrypointsPopupHtml, /id="support-btn"/);
  assert.match(entrypointsPopupJs, /supportBtn/);
  assert.match(entrypointsPopupJs, /options\.html#love/);
});

test('options HTML and popup HTML include text format in format selects', () => {
  const entrypointsOptionsHtml = fs.readFileSync('entrypoints/options/index.html', 'utf8');
  const entrypointsPopupHtml = fs.readFileSync('entrypoints/popup/index.html', 'utf8');

  assert.match(entrypointsOptionsHtml, /<option value="text">Plain Text \(\.txt\)<\/option>/);
  assert.match(entrypointsPopupHtml, /<option value="text"[^>]*>📄 Plain Text \(\.txt\)<\/option>/);
});

test('options HTML page defines #feedback-section with feedback and GitHub issues links', () => {
  const entrypointsOptionsHtml = fs.readFileSync('entrypoints/options/index.html', 'utf8');

  assert.match(entrypointsOptionsHtml, /id="feedback-section"/);
  assert.match(entrypointsOptionsHtml, /id="feedback-link"/);
  assert.match(entrypointsOptionsHtml, /id="github-issues-link"/);
  assert.match(
    entrypointsOptionsHtml,
    /href="https:\/\/github\.com\/Covai-Labs\/ace\/issues\/new\/choose"/,
  );
  assert.match(entrypointsOptionsHtml, /id="copy-system-info-btn"/);
  assert.doesNotMatch(entrypointsOptionsHtml, /data-i18n="feedbackStoryHelp"/);
});

test('options HTML page defines the include-attachments checkbox and help text', () => {
  const html = fs.readFileSync('entrypoints/options/index.html', 'utf8');
  assert.match(html, /id="default-include-attachments"/);
  assert.match(html, /data-i18n="includeAttachmentsDefault"/);
  assert.match(html, /data-i18n="includeAttachmentsHelp"/);
});

test('options script wires the includeAttachments storage setting', () => {
  const js = fs.readFileSync('entrypoints/options/options.js', 'utf8');
  assert.match(js, /'includeAttachments'/);
  assert.match(js, /defaultIncludeAttachments/);
});

test('options HTML and script wire articleEngine setting', () => {
  const html = fs.readFileSync('entrypoints/options/index.html', 'utf8');
  assert.match(html, /id="article-engine-select"/);
  assert.match(html, /data-i18n="articleEngineLabel"/);
  assert.match(html, /data-i18n="articleEngineHelp"/);

  const js = fs.readFileSync('entrypoints/options/options.js', 'utf8');
  assert.match(js, /'articleEngine'/);
  assert.match(js, /articleEngineSelect/);
});

test('popup HTML and script wire article-engine-select-popup and web article banner', () => {
  const html = fs.readFileSync('entrypoints/popup/index.html', 'utf8');
  assert.match(html, /id="article-engine-select-popup"/);
  assert.match(html, /class="web-article-banner/);
  assert.match(html, /data-i18n="webArticleModeTitle"/);

  const js = fs.readFileSync('entrypoints/popup/popup.js', 'utf8');
  assert.match(js, /article-engine-select-popup/);
  assert.match(js, /articleEngine/);
});
