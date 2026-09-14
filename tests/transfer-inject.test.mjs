import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';

import {
  TRANSFER_TARGETS,
  TRANSFER_TARGET_IDS,
  PLATFORM_URLS,
  getTransferTarget,
  isSupportedTransferTarget,
} from '../content/transfer/targets.js';
import {
  findComposer,
  findBlocker,
  verifyContent,
  attemptTransferInject,
  pollTransferInject,
} from '../content/transfer/injector.js';
import {
  ContinuationFormatter,
  applyPromptTemplate,
  DEFAULT_TRANSFER_PROMPT_TEMPLATE,
  DEFAULT_ARTICLE_PROMPT_TEMPLATE,
} from '../content/formatters/continuation.js';

function docOf(html) {
  return parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`).document;
}

const okEnv = (document, seen = {}) => ({
  document,
  isTopFrame: true,
  clipboardWrite: async (text) => {
    seen.clipboard = text;
  },
});

// ── targets registry ──────────────────────────────────────────────

test('transfer targets: exactly the 12 supported AI chats', () => {
  assert.deepEqual(TRANSFER_TARGET_IDS, [
    'chatgpt',
    'claude',
    'gemini',
    'deepseek',
    'perplexity',
    'qwen',
    'mistral',
    'lumo',
    'copilot',
    'meta',
    'z_ai',
    'grok',
  ]);
  assert.equal(TRANSFER_TARGETS.length, 12);
});

test('transfer targets: copilot uses copilot.com, grok/z_ai present', () => {
  assert.equal(PLATFORM_URLS.copilot, 'https://copilot.com/');
  assert.equal(PLATFORM_URLS.grok, 'https://grok.com/');
  assert.equal(PLATFORM_URLS.z_ai, 'https://chat.z.ai/');
  assert.equal(getTransferTarget('meta').requiresAuth, true);
  assert.equal(getTransferTarget('chatgpt').requiresAuth, undefined);
});

test('transfer targets: disabled platforms are unsupported', () => {
  for (const id of ['notebooklm', 'aistudio', 'joyland', 'chub']) {
    assert.equal(isSupportedTransferTarget(id), false);
    assert.equal(getTransferTarget(id), null);
    assert.equal(PLATFORM_URLS[id], undefined);
  }
});

// ── composer discovery ────────────────────────────────────────────

test('findComposer: per-platform selectors hit the right node', () => {
  const cases = [
    ['claude', '<div data-testid="chat-input" contenteditable="true">x</div>'],
    [
      'gemini',
      '<rich-textarea><div class="ql-editor" role="textbox" contenteditable="true">x</div></rich-textarea>',
    ],
    ['perplexity', '<div id="ask-input" data-lexical-editor="true" contenteditable="true">x</div>'],
    [
      'copilot',
      '<span id="m365-chat-editor-target-element" role="textbox" contenteditable="true">x</span>',
    ],
    [
      'meta',
      '<div data-testid="composer-input" data-lexical-editor="true" contenteditable="true">x</div>',
    ],
    ['z_ai', '<textarea id="chat-input">x</textarea>'],
    ['lumo', '<textarea class="tiptap ProseMirror composer">x</textarea>'],
    [
      'grok',
      '<div data-testid="chat-input"><div class="tiptap ProseMirror" role="textbox" contenteditable="true">x</div></div>',
    ],
    [
      'chatgpt',
      '<div id="prompt-textarea" class="ProseMirror" role="textbox" contenteditable="true">x</div>',
    ],
    ['qwen', '<textarea class="message-input-textarea">x</textarea>'],
    ['mistral', '<div class="ProseMirror" data-placeholder="x" contenteditable="true">x</div>'],
    ['deepseek', '<textarea placeholder="Message DeepSeek">x</textarea>'],
  ];
  for (const [target, html] of cases) {
    const el = findComposer(docOf(html), target);
    assert.ok(el, `${target}: composer found`);
  }
});

test('findComposer: skips hidden measuring mirrors', () => {
  const el = findComposer(
    docOf(
      '<textarea tabindex="-1" aria-hidden="true" style="visibility:hidden">mirror</textarea>' +
        '<div id="ask-input" data-lexical-editor="true" contenteditable="true">real</div>',
    ),
    'perplexity',
  );
  assert.ok(el);
  assert.equal(el.getAttribute('id'), 'ask-input');
});

test('findComposer: returns null when nothing editable exists', () => {
  assert.equal(findComposer(docOf('<div><p>hello</p></div>'), 'grok'), null);
});

// ── blocker detection ─────────────────────────────────────────────

test('findBlocker: flags a modal dialog over the composer', () => {
  const doc = docOf(
    '<div role="dialog" aria-modal="true" aria-label="Security check required"><span>Verification required</span></div>' +
      '<div id="ask-input" data-lexical-editor="true" contenteditable="true">x</div>',
  );
  const composer = findComposer(doc, 'perplexity');
  assert.ok(composer);
  assert.ok(findBlocker(doc, composer));
});

test('findBlocker: dialog inside an aria-hidden ancestor does not block', () => {
  const doc = docOf(
    '<div id="onetrust-pc-sdk" hidden aria-hidden="true">' +
      '<div role="dialog" aria-modal="true" aria-label="Cookie Preferences"></div>' +
      '</div>' +
      '<div data-testid="chat-input"><div role="textbox" contenteditable="true">x</div></div>',
  );
  const composer = findComposer(doc, 'grok');
  assert.ok(composer);
  assert.equal(findBlocker(doc, composer), null);
});

test('findBlocker: hidden overlays do not block', () => {
  const doc = docOf(
    '<div id="cf-overlay" style="display:none"></div>' +
      '<textarea placeholder="Message DeepSeek">x</textarea>',
  );
  const composer = findComposer(doc, 'deepseek');
  assert.ok(composer);
  assert.equal(findBlocker(doc, composer), null);
});

// ── fill + verify ─────────────────────────────────────────────────

test('attemptTransferInject: fills a native textarea and verifies', async () => {
  const doc = docOf('<textarea placeholder="Message DeepSeek"></textarea>');
  const seen = {};
  const res = await attemptTransferInject(okEnv(doc, seen), {
    payload: 'Hello DeepSeek, continue our chat',
    targetPlatform: 'deepseek',
    autoSend: false,
  });
  assert.equal(res.ok, true);
  assert.equal(res.autoSent, false);
  assert.equal(doc.querySelector('textarea').value, 'Hello DeepSeek, continue our chat');
  assert.equal(seen.clipboard, 'Hello DeepSeek, continue our chat');
});

test('attemptTransferInject: fills a contenteditable composer', async () => {
  const doc = docOf('<div data-testid="chat-input" contenteditable="true" role="textbox"></div>');
  const res = await attemptTransferInject(okEnv(doc), {
    payload: 'Claude, here is our previous chat context',
    targetPlatform: 'claude',
    autoSend: false,
  });
  assert.equal(res.ok, true);
  assert.ok(
    verifyContent(
      doc.querySelector('[data-testid="chat-input"]'),
      'Claude, here is our previous chat context',
    ),
  );
});

test('attemptTransferInject: blocked composer fails closed with clipboard backup', async () => {
  const doc = docOf(
    '<div role="dialog" aria-modal="true"><span>Verification required</span></div>' +
      '<div id="ask-input" data-lexical-editor="true" contenteditable="true"></div>',
  );
  const seen = {};
  const res = await attemptTransferInject(okEnv(doc, seen), {
    payload: 'important prompt',
    targetPlatform: 'perplexity',
    autoSend: true,
  });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'blocked');
  assert.equal(seen.clipboard, 'important prompt');
});

test('attemptTransferInject: ignores iframes and empty payloads', async () => {
  const doc = docOf('<textarea></textarea>');
  assert.equal(
    (
      await attemptTransferInject(
        { ...okEnv(doc), isTopFrame: false },
        { payload: 'x', targetPlatform: 'qwen' },
      )
    ).reason,
    'not-top-frame',
  );
  assert.equal(
    (await attemptTransferInject(okEnv(doc), { payload: '', targetPlatform: 'qwen' })).reason,
    'empty-payload',
  );
});

test('pollTransferInject: reports attempts and succeeds once composer mounts', async () => {
  const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');
  let calls = 0;
  const origQuery = document.querySelectorAll.bind(document);
  document.querySelectorAll = (...args) => {
    calls++;
    // Mount the composer on the second poll to simulate SPA hydration.
    // (One findComposer pass issues ~5 querySelectorAll calls for deepseek.)
    if (calls === 6) {
      const el = document.createElement('textarea');
      el.setAttribute('placeholder', 'Message DeepSeek');
      document.body.appendChild(el);
    }
    return origQuery(...args);
  };
  const res = await pollTransferInject(
    okEnv(document),
    { payload: 'late hydration payload here', targetPlatform: 'deepseek', autoSend: false },
    { maxWaitMs: 5000, pollMs: 10 },
  );
  assert.equal(res.ok, true);
  assert.ok(res.attempts >= 2);
});

// ── prompt templates ──────────────────────────────────────────────

test('continuation template: default output unchanged', () => {
  const f = new ContinuationFormatter();
  const out = f.format({
    title: 'T',
    metadata: { Source: 'ChatGPT' },
    messages: [{ role: 'User', content: 'hi' }],
  });
  assert.match(out, /previous conversation on ChatGPT/);
  assert.match(out, /continue our conversation from where we left off/);
});

test('continuation template: custom template with placeholders', () => {
  const f = new ContinuationFormatter();
  const out = f.format(
    {
      title: 'T',
      metadata: { Source: 'Claude' },
      messages: [{ role: 'User', content: 'hi there' }],
    },
    'Keep going.',
    { template: 'CTX:{source}|{title}|{history}|{instruction}' },
  );
  assert.ok(out.startsWith('CTX:Claude'));
  assert.ok(out.includes('[User]: hi there'));
  assert.ok(out.endsWith('Keep going.'));
});

test('continuation template: template without {history} falls back to default', () => {
  assert.equal(
    applyPromptTemplate('no placeholders', { history: 'H' }),
    applyPromptTemplate(DEFAULT_TRANSFER_PROMPT_TEMPLATE, { history: 'H' }),
  );
});

test('continuation template: placeholders inside values are preserved', () => {
  const out = applyPromptTemplate('S:{source} H:{history} I:{instruction}', {
    source: 'ChatGPT',
    title: '',
    history: 'literal {instruction} in chat text',
    instruction: 'Go.',
  });
  assert.ok(out.includes('literal {instruction} in chat text'));
  assert.ok(out.endsWith('I:Go.'));
});

// ── per-tab transfer records ──────────────────────────────────────

test('transfer records: picks newest fresh record for this origin', async () => {
  const { pickTransferRecord } = await import('../content/transfer/records.js');
  const now = 1_000_000;
  const dump = {
    xfer_11: {
      targetPlatform: 'claude',
      url: 'https://claude.ai/new',
      timestamp: now - 1000,
      payload: 'old',
    },
    xfer_22: {
      targetPlatform: 'claude',
      url: 'https://claude.ai/new',
      timestamp: now - 100,
      payload: 'new',
    },
    xfer_33: {
      targetPlatform: 'chatgpt',
      url: 'https://chatgpt.com/',
      timestamp: now - 50,
      payload: 'wrong-site',
    },
    xfer_44: {
      targetPlatform: 'claude',
      url: 'https://claude.ai/new',
      timestamp: now - 400000,
      payload: 'expired',
    },
  };
  const picked = pickTransferRecord(dump, 'https://claude.ai', now);
  assert.equal(picked.key, 'xfer_22');
  assert.equal(picked.record.payload, 'new');
  assert.equal(pickTransferRecord(dump, 'https://chatgpt.com', now).key, 'xfer_33');
  assert.equal(pickTransferRecord(dump, 'https://unknown.ai', now), null);
});

test('transfer records: legacy singular key is a fallback only', async () => {
  const { pickTransferRecord } = await import('../content/transfer/records.js');
  const now = 2_000_000;
  assert.equal(
    pickTransferRecord(
      { pendingContinuation: { url: 'https://grok.com/', timestamp: now - 10, payload: 'p' } },
      'https://grok.com',
      now,
    ).key,
    'pendingContinuation',
  );
  // Per-tab record wins over legacy.
  const both = pickTransferRecord(
    {
      pendingContinuation: { url: 'https://grok.com/', timestamp: now - 10, payload: 'legacy' },
      xfer_9: { url: 'https://grok.com/', timestamp: now - 5, payload: 'fresh' },
    },
    'https://grok.com',
    now,
  );
  assert.equal(both.key, 'xfer_9');
});

test('transfer records: chunk join and expiry prune', async () => {
  const { joinChunkedRecord, expiredTransferKeys, splitPayload } =
    await import('../content/transfer/records.js');
  assert.deepEqual(splitPayload('abc'), ['abc']);
  const now = 3_000_000;
  const dump = {
    xfer_7: { chunked: true, count: 2, timestamp: now - 10 },
    xfer_7_c0: 'hello ',
    xfer_7_c1: 'world',
    xfer_8: { timestamp: now - 999999, payload: 'stale' },
    xfer_8_c0: 'stale-part',
    xfer_9: { timestamp: now - 10, payload: 'live' },
  };
  assert.equal(joinChunkedRecord(dump, 'xfer_7', dump.xfer_7), 'hello world');
  assert.equal(joinChunkedRecord({ ...dump, xfer_7_c1: undefined }, 'xfer_7', dump.xfer_7), null);
  const dead = expiredTransferKeys(dump, now);
  assert.ok(dead.includes('xfer_8'));
  assert.ok(dead.includes('xfer_8_c0'));
  assert.ok(!dead.includes('xfer_7'));
  assert.ok(!dead.includes('xfer_9'));
});

test('transfer records: load joins chunks and clear removes exactly its keys', async () => {
  const { loadTransferRecord, clearTransferRecord } =
    await import('../content/transfer/records.js');
  const store = {
    xfer_5: {
      targetPlatform: 'z_ai',
      url: 'https://chat.z.ai/',
      timestamp: Date.now(),
      chunked: true,
      count: 2,
    },
    xfer_5_c0: 'part-one ',
    xfer_5_c1: 'part-two',
    xfer_6: {
      targetPlatform: 'z_ai',
      url: 'https://chat.z.ai/',
      timestamp: Date.now(),
      payload: 'other-tab',
    },
  };
  const storage = {
    get: async (k) => {
      if (k === null || k === undefined) return { ...store };
      if (Array.isArray(k)) return Object.fromEntries(k.map((n) => [n, store[n]]));
      return { [k]: store[k] };
    },
    remove: async (keys) => {
      for (const k of keys) delete store[k];
    },
  };
  const loaded = await loadTransferRecord(storage, { origin: 'https://chat.z.ai' }, Date.now());
  assert.ok(loaded);
  assert.equal(loaded.payload, 'part-one part-two');
  await clearTransferRecord(storage, loaded.keys);
  assert.equal(store.xfer_5, undefined);
  assert.equal(store.xfer_5_c0, undefined);
  // The concurrent transfer's record is untouched.
  assert.equal(store.xfer_6.payload, 'other-tab');
});

test('continuation template: article source uses webpage framing', () => {
  const f = new ContinuationFormatter();
  const out = f.format({
    title: 'Some Page',
    metadata: { Source: 'Web Article' },
    messages: [{ role: 'User', content: 'extracted text' }],
  });
  assert.ok(
    out.includes(
      DEFAULT_ARTICLE_PROMPT_TEMPLATE.split('{history}')[0].split('{title}')[0].trim().slice(0, 20),
    ),
  );
  assert.match(out, /extracted/i);
});
