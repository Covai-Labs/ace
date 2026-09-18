import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import {
  SUPPORTED_LANGUAGES,
  formatMessage,
  t,
  applyI18n,
  initI18n,
} from '../content/utils/i18n.js';

const REQUIRED_LOCALES = [
  'en',
  'ru',
  'ta',
  'es',
  'zh_CN',
  'zh_TW',
  'ja',
  'de',
  'fr',
  'hi',
  'pt_BR',
  'it',
  'ko',
];

test('all required locale message files exist and are valid JSON', () => {
  for (const locale of REQUIRED_LOCALES) {
    const publicLocalePath = path.join('public', '_locales', locale, 'messages.json');
    assert.ok(
      fs.existsSync(publicLocalePath),
      `public/_locales/${locale}/messages.json should exist`,
    );

    const content = fs.readFileSync(publicLocalePath, 'utf8');
    const parsed = JSON.parse(content);
    assert.ok(typeof parsed === 'object' && parsed !== null);
  }
});

test('all localized catalogs contain every key defined in the English reference', () => {
  const enCatalog = JSON.parse(
    fs.readFileSync(path.join('public', '_locales', 'en', 'messages.json'), 'utf8'),
  );
  const enKeys = Object.keys(enCatalog);
  assert.ok(enKeys.length > 20, 'English reference should contain full message dictionary');

  for (const locale of REQUIRED_LOCALES) {
    const catalog = JSON.parse(
      fs.readFileSync(path.join('public', '_locales', locale, 'messages.json'), 'utf8'),
    );
    for (const key of enKeys) {
      assert.ok(
        catalog[key] && typeof catalog[key].message === 'string',
        `Locale ${locale} should have message for key "${key}"`,
      );
      assert.ok(
        catalog[key].message.length > 0,
        `Locale ${locale} message for "${key}" should not be empty`,
      );
    }
  }
});

test('Russian and Tamil locales contain accurate native translations', () => {
  const ruCatalog = JSON.parse(
    fs.readFileSync(path.join('public', '_locales', 'ru', 'messages.json'), 'utf8'),
  );
  const taCatalog = JSON.parse(
    fs.readFileSync(path.join('public', '_locales', 'ta', 'messages.json'), 'utf8'),
  );

  // Russian specific checks
  assert.match(ruCatalog.statusReady.message, /Готово/);
  assert.match(ruCatalog.exportChat.message, /Экспортировать/);
  assert.match(ruCatalog.optionsTitle.message, /Настройки/);

  // Tamil specific checks
  assert.match(taCatalog.statusReady.message, /தயார்/);
  assert.match(taCatalog.exportChat.message, /ஏற்றுமதி/);
  assert.match(taCatalog.optionsTitle.message, /விருப்பங்கள்/);
});

test('formatMessage handles substitutions correctly', () => {
  // Scalar substitution
  assert.equal(formatMessage('$COUNT$ messages found', 12), '12 messages found');
  assert.equal(formatMessage('Turn $1 of $2', 3), 'Turn 3 of $2');

  // Array substitutions
  assert.equal(formatMessage('Turn $1 of $2', [4, 10]), 'Turn 4 of 10');

  // Object substitutions
  assert.equal(
    formatMessage('Hello $NAME$ from $CITY$', { name: 'Alice', city: 'Paris' }),
    'Hello Alice from Paris',
  );
});

test('t function retrieves message and handles missing keys gracefully', async () => {
  await initI18n('en');
  assert.equal(t('statusReady'), 'Ready');
  assert.equal(t('nonExistentKey'), 'nonExistentKey');
});

test('SUPPORTED_LANGUAGES exports complete metadata', () => {
  assert.ok(Array.isArray(SUPPORTED_LANGUAGES));
  assert.ok(SUPPORTED_LANGUAGES.some((l) => l.code === 'ru'));
  assert.ok(SUPPORTED_LANGUAGES.some((l) => l.code === 'ta'));
  assert.ok(SUPPORTED_LANGUAGES.some((l) => l.code === 'en'));
  assert.ok(SUPPORTED_LANGUAGES.some((l) => l.code === 'auto'));
});

test('applyI18n updates DOM data attributes', async () => {
  await initI18n('en');

  const { document } = parseHTML(`
    <div>
      <h1 data-i18n="optionsHeaderTitle">Original Title</h1>
      <input data-i18n-placeholder="filenamePlaceholder" placeholder="Old" />
      <button data-i18n-title="openOptions" title="Old Title">Button</button>
      <div data-i18n-aria-label="sidepanelRefresh" aria-label="Old"></div>
    </div>
  `);

  applyI18n(document);

  const h1 = document.querySelector('h1');
  const input = document.querySelector('input');
  const button = document.querySelector('button');
  const div = document.querySelector('div[aria-label]');

  assert.equal(h1.textContent, 'AI Chat Exporter');
  assert.equal(input.placeholder, 'Filename');
  assert.equal(button.title, 'Open Options');
  assert.equal(div.getAttribute('aria-label'), 'Refresh panel');
});

test('options UI includes Language selector and options.js handles uiLanguage', () => {
  const optionsHtml = fs.readFileSync('entrypoints/options/index.html', 'utf8');
  const optionsJs = fs.readFileSync('entrypoints/options/options.js', 'utf8');

  assert.match(optionsHtml, /id="language-select"/);
  assert.match(optionsHtml, /value="ru"/);
  assert.match(optionsHtml, /value="ta"/);

  assert.match(optionsJs, /uiLanguage/);
  assert.match(optionsJs, /initI18n/);
  assert.match(optionsJs, /applyI18n/);
});

test('manifest.json and wxt.config.ts configure default_locale and names for web extension localization', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const wxtConfig = fs.readFileSync('wxt.config.ts', 'utf8');

  assert.equal(manifest.default_locale, 'en');
  assert.match(manifest.name, /__MSG_extensionName__/);
  assert.match(manifest.short_name, /__MSG_extensionShortName__/);
  assert.match(manifest.description, /__MSG_extensionDescription__/);

  assert.match(wxtConfig, /default_locale:\s*'en'/);
  assert.match(wxtConfig, /short_name:\s*'__MSG_extensionShortName__'/);
  assert.match(wxtConfig, /__MSG_extensionNameEdge__/);
  assert.match(wxtConfig, /__MSG_extensionNameFirefox__/);
});

test('store extension names and short_name adhere to strict length limits across all locales', () => {
  for (const locale of REQUIRED_LOCALES) {
    const catalog = JSON.parse(
      fs.readFileSync(path.join('public', '_locales', locale, 'messages.json'), 'utf8'),
    );

    const chromeName = catalog.extensionName?.message;
    const edgeName = catalog.extensionNameEdge?.message;
    const firefoxName = catalog.extensionNameFirefox?.message;
    const shortName = catalog.extensionShortName?.message;

    assert.ok(chromeName, `Locale ${locale} should have extensionName`);
    assert.ok(edgeName, `Locale ${locale} should have extensionNameEdge`);
    assert.ok(firefoxName, `Locale ${locale} should have extensionNameFirefox`);
    assert.ok(shortName, `Locale ${locale} should have extensionShortName`);

    assert.ok(
      chromeName.length <= 75,
      `Locale ${locale} Chrome extensionName (${chromeName.length}) exceeds 75 chars: "${chromeName}"`,
    );
    assert.ok(
      edgeName.length <= 45,
      `Locale ${locale} Edge extensionNameEdge (${edgeName.length}) exceeds 45 chars: "${edgeName}"`,
    );
    assert.ok(
      firefoxName.length <= 50,
      `Locale ${locale} Firefox extensionNameFirefox (${firefoxName.length}) exceeds 50 chars: "${firefoxName}"`,
    );
    assert.ok(
      shortName.length <= 12,
      `Locale ${locale} extensionShortName (${shortName.length}) exceeds 12 chars: "${shortName}"`,
    );
  }
});
