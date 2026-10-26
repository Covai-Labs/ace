import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasPermission,
  requestPermission,
  removePermission,
} from '../content/utils/permissions.js';

test('permissions helper: hasPermission checks contains on chrome.permissions', async () => {
  const grantedSet = new Set(['storage']);
  globalThis.chrome = {
    permissions: {
      contains: async ({ permissions }) => permissions.every((p) => grantedSet.has(p)),
    },
  };

  assert.equal(await hasPermission('storage'), true);
  assert.equal(await hasPermission('downloads'), false);
  assert.equal(await hasPermission('clipboardWrite'), false);

  delete globalThis.chrome;
});

test('permissions helper: requestPermission requests via chrome.permissions', async () => {
  let requested = null;
  globalThis.chrome = {
    permissions: {
      request: async ({ permissions }) => {
        requested = permissions;
        return true;
      },
    },
  };

  const result = await requestPermission('downloads');
  assert.equal(result, true);
  assert.deepEqual(requested, ['downloads']);

  delete globalThis.chrome;
});

test('permissions helper: removePermission removes via chrome.permissions', async () => {
  let removed = null;
  globalThis.chrome = {
    permissions: {
      remove: async ({ permissions }) => {
        removed = permissions;
        return true;
      },
    },
  };

  const result = await removePermission('clipboardWrite');
  assert.equal(result, true);
  assert.deepEqual(removed, ['clipboardWrite']);

  delete globalThis.chrome;
});

test('permissions helper: gracefully handles absence of permissions API', async () => {
  const oldChrome = globalThis.chrome;
  const oldBrowser = globalThis.browser;
  delete globalThis.chrome;
  delete globalThis.browser;

  assert.equal(await hasPermission('downloads'), false);
  assert.equal(await requestPermission('downloads'), false);
  assert.equal(await removePermission('downloads'), false);

  globalThis.chrome = oldChrome;
  globalThis.browser = oldBrowser;
});
