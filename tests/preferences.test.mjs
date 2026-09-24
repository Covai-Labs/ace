import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_INCLUDE_ATTRIBUTION,
  DEFAULT_MESSAGE_NUMBERING,
  DEFAULT_THEME,
  getExportOptions,
  applyExportOptionChanges,
} from '../content/utils/preferences.js';

test('getExportOptions returns defaults when storage is empty or throws', async () => {
  globalThis.chrome = {
    storage: {
      sync: {
        get: async () => ({}),
      },
    },
  };

  const options = await getExportOptions();
  assert.equal(options.theme, DEFAULT_THEME);
  assert.equal(options.includeAttribution, DEFAULT_INCLUDE_ATTRIBUTION);
  assert.equal(options.messageNumbering, DEFAULT_MESSAGE_NUMBERING);
});

test('getExportOptions normalizes and respects stored values', async () => {
  globalThis.chrome = {
    storage: {
      sync: {
        get: async () => ({
          theme: 'dark',
          includeAttribution: false,
          messageNumbering: 'perTurn',
        }),
      },
    },
  };

  const options = await getExportOptions();
  assert.equal(options.theme, 'dark');
  assert.equal(options.includeAttribution, false);
  assert.equal(options.messageNumbering, 'per-turn');
});

test('getExportOptions applies overrides', async () => {
  globalThis.chrome = {
    storage: {
      sync: {
        get: async () => ({
          theme: 'dark',
          includeAttribution: true,
          messageNumbering: 'per-message',
        }),
      },
    },
  };

  const options = await getExportOptions({ theme: 'light', highQuality: true });
  assert.equal(options.theme, 'light');
  assert.equal(options.includeAttribution, true);
  assert.equal(options.messageNumbering, 'per-message');
  assert.equal(options.highQuality, true);
});

test('getExportOptions ignores undefined overrides but preserves explicit non-undefined values', async () => {
  globalThis.chrome = {
    storage: {
      sync: {
        get: async () => ({
          theme: 'dark',
          includeAttribution: true,
          messageNumbering: 'per-message',
        }),
      },
    },
  };

  const optionsWithUndefined = await getExportOptions({
    theme: undefined,
    customNull: null,
    customFalse: false,
  });
  assert.equal(optionsWithUndefined.theme, 'dark');
  assert.equal(optionsWithUndefined.includeAttribution, true);
  assert.equal(optionsWithUndefined.messageNumbering, 'per-message');
  assert.equal(optionsWithUndefined.customNull, null);
  assert.equal(optionsWithUndefined.customFalse, false);
});

test('applyExportOptionChanges updates options and returns true on changes', () => {
  const current = {
    theme: 'system',
    includeAttribution: true,
    messageNumbering: 'off',
  };

  const changedTheme = applyExportOptionChanges(current, {
    theme: { newValue: 'modern-dark' },
  });
  assert.equal(changedTheme, true);
  assert.equal(current.theme, 'modern-dark');

  const changedAttribution = applyExportOptionChanges(current, {
    includeAttribution: { newValue: false },
  });
  assert.equal(changedAttribution, true);
  assert.equal(current.includeAttribution, false);

  const changedNumbering = applyExportOptionChanges(current, {
    messageNumbering: { newValue: 'per-message' },
  });
  assert.equal(changedNumbering, true);
  assert.equal(current.messageNumbering, 'per-message');

  const noChanges = applyExportOptionChanges(current, {
    unrelatedSetting: { newValue: 'xyz' },
  });
  assert.equal(noChanges, false);
});
