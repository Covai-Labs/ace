// Background service worker
// Currently used for handling extension installation events or global context menus

const extVersion =
  typeof chrome !== 'undefined' && chrome.runtime?.getManifest
    ? chrome.runtime.getManifest()?.version || '1.12.1'
    : '1.12.1';
const UNINSTALL_URL = `https://ai-chat-exporter.covai.org/uninstall-feedback.html?v=${extVersion}`;
const WELCOME_URL = 'https://ai-chat-exporter.covai.org/welcome.html';

if (typeof chrome !== 'undefined' && chrome.runtime?.setUninstallURL) {
  chrome.runtime.setUninstallURL(UNINSTALL_URL);
}

const TRANSFER_TARGET_IDS = [
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
];

// Transfer-only registry (12 targets). Export/parsing still supports all platforms.
const PLATFORM_URLS = {
  chatgpt: 'https://chatgpt.com/',
  claude: 'https://claude.ai/new',
  gemini: 'https://gemini.google.com/app',
  deepseek: 'https://chat.deepseek.com/',
  perplexity: 'https://www.perplexity.ai/',
  qwen: 'https://chat.qwen.ai/',
  mistral: 'https://chat.mistral.ai/',
  lumo: 'https://lumo.proton.me/',
  copilot: 'https://copilot.com/',
  meta: 'https://www.meta.ai/',
  z_ai: 'https://chat.z.ai/',
  grok: 'https://grok.com/',
};

async function syncSidePanelBehavior() {
  const sidePanelApi = typeof chrome !== 'undefined' ? chrome['sidePanel'] : undefined;
  if (sidePanelApi && typeof sidePanelApi['setPanelBehavior'] === 'function') {
    try {
      const data = await chrome.storage.sync.get('launchMode');
      const openPanelOnActionClick = data.launchMode === 'sidepanel';
      await sidePanelApi['setPanelBehavior']({ openPanelOnActionClick });
    } catch (err) {
      console.warn('[AI Exporter Background] Failed to set side panel behavior:', err);
    }
  }
}

if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(syncSidePanelBehavior);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.launchMode) {
    syncSidePanelBehavior();
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('AI Chat Exporter installed/updated:', details?.reason);

  if (details?.reason === 'install') {
    try {
      await chrome.tabs.create({ url: WELCOME_URL });
    } catch (e) {
      console.warn('[AI Exporter Background] Failed to open welcome page:', e);
    }
  }

  await syncSidePanelBehavior();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'OPEN_SIDE_PANEL') {
    (async () => {
      try {
        const sidePanelApi = typeof chrome !== 'undefined' ? chrome['sidePanel'] : undefined;
        if (sidePanelApi && typeof sidePanelApi['open'] === 'function') {
          let windowId = request.windowId || sender.tab?.windowId;
          if (!windowId) {
            const currentWin = await chrome.windows.getCurrent();
            windowId = currentWin.id;
          }
          await sidePanelApi['open']({ windowId });
          sendResponse({ success: true });
        } else if (
          typeof browser !== 'undefined' &&
          browser.sidebarAction &&
          typeof browser.sidebarAction.open === 'function'
        ) {
          await browser.sidebarAction.open();
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Side panel API unavailable' });
        }
      } catch (err) {
        console.error('[AI Exporter Background] Failed to open side panel:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (request.action === 'TRANSFER_CHAT') {
    const target = request.targetPlatform;

    const uriAppTargets = ['obsidian', 'logseq', 'bear', 'noteplan', 'drafts'];
    if (uriAppTargets.includes(target)) {
      (async () => {
        try {
          const syncData = await chrome.storage.sync.get('obsidianVaultName');
          const vault = syncData.obsidianVaultName || '';
          const title = request.title || 'AI Conversation';
          const content = request.payload || '';

          const cleanTitle =
            title
              .replace(/[#|^[\]]/g, '')
              .replace(/[/\\?%*:|"<>]/g, '')
              .trim()
              .slice(0, 245) || 'AI Conversation';

          let appUri = '';
          if (target === 'obsidian') {
            const params = new URLSearchParams();
            params.append('name', cleanTitle);
            if (vault && vault.trim().length > 0) params.append('vault', vault.trim());
            if (content) params.append('content', content);
            appUri = `obsidian://new?${params.toString()}`;
          } else if (target === 'logseq') {
            const params = new URLSearchParams();
            params.append('page', cleanTitle);
            if (content) params.append('content', content);
            appUri = `logseq://x-callback-url/quickCapture?${params.toString()}`;
          } else if (target === 'bear') {
            const params = new URLSearchParams();
            params.append('title', cleanTitle);
            if (content) params.append('text', content);
            appUri = `bear://x-callback-url/create?${params.toString()}`;
          } else if (target === 'noteplan') {
            const params = new URLSearchParams();
            params.append('noteTitle', cleanTitle);
            if (content) params.append('text', content);
            appUri = `noteplan://x-callback-url/addText?${params.toString()}`;
          } else if (target === 'drafts') {
            const params = new URLSearchParams();
            const fullText = cleanTitle ? `# ${cleanTitle}\n\n${content}` : content;
            params.append('text', fullText);
            appUri = `drafts://x-callback-url/create?${params.toString()}`;
          }

          await chrome.tabs.create({ url: appUri });
          sendResponse({ success: true, uri: appUri });
        } catch (e) {
          console.error(`[AI Exporter Background] ${target} transfer failed:`, e);
          sendResponse({ success: false, error: e.message });
        }
      })();
      return true;
    }

    if (!TRANSFER_TARGET_IDS.includes(target)) {
      sendResponse({ success: false, error: `Unsupported transfer target: ${target}` });
      return true;
    }

    const url = PLATFORM_URLS[target] || 'https://chatgpt.com/';

    (async () => {
      try {
        const payload = request.payload || '';
        const autoSend = request.autoSend !== false;
        // Create first: the record is keyed to this tab id in a single
        // write, so concurrent transfers never share mutable state.
        const tab = await chrome.tabs.create({ url });
        const base = {
          targetPlatform: target,
          url,
          timestamp: Date.now(),
          autoSend,
        };
        if (tab && tab.id !== undefined) {
          const key = `xfer_${tab.id}`;
          try {
            await chrome.storage.local.set({ [key]: { ...base, payload } });
          } catch {
            await writeChunkedOrTruncated(tab.id, base, payload);
          }
          pruneTransferKeys();
        } else {
          // No tab id (rare) — legacy singular record so transfer still works.
          try {
            await chrome.storage.local.set({ pendingContinuation: { ...base, payload } });
          } catch {
            await chrome.storage.local.set({
              pendingContinuation: { ...base, payload: truncatedPayload(payload), truncated: true },
            });
          }
        }
        sendResponse({ success: true });
      } catch (e) {
        console.error('[AI Exporter Background] Transfer failed:', e);
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
});

// Quota fallback: chunk the payload across tab-scoped keys, else store an
// honestly-marked truncation. Limits mirror content/transfer/records.js.
async function writeChunkedOrTruncated(tabId, base, payload) {
  const key = `xfer_${tabId}`;
  const parts = [];
  for (let i = 0; i < payload.length; i += 700000) {
    parts.push(payload.slice(i, i + 700000));
  }
  if (parts.length > 1 && parts.length <= 10) {
    const obj = { [key]: { ...base, chunked: true, count: parts.length } };
    parts.forEach((part, i) => {
      obj[`xfer_${tabId}_c${i}`] = part;
    });
    try {
      await chrome.storage.local.set(obj);
      return;
    } catch {
      // Fall through to truncation
    }
  }
  await chrome.storage.local.set({
    [key]: { ...base, payload: truncatedPayload(payload), truncated: true },
  });
}

function truncatedPayload(payload) {
  return `${(payload || '').slice(0, 500000)}\n\n[Truncated: conversation too large to transfer in full.]`;
}

// Best-effort cleanup of other tabs' records. Only expired entries are
// removed, so a concurrent fresh transfer is never touched.
function pruneTransferKeys() {
  (async () => {
    try {
      const dump = (await chrome.storage.local.get(null)) || {};
      const now = Date.now();
      const dead = [];
      for (const [k, v] of Object.entries(dump)) {
        if (!k.startsWith('xfer_') || k.includes('_c')) continue;
        if (!v || typeof v !== 'object' || now - (v.timestamp || 0) >= 300000) {
          dead.push(k);
          const tabId = k.slice('xfer_'.length);
          for (const ck of Object.keys(dump)) {
            if (ck.startsWith(`xfer_${tabId}_c`)) dead.push(ck);
          }
        }
      }
      if (dead.length > 0) await chrome.storage.local.remove(dead);
    } catch {
      // Ignore
    }
  })();
}

// Nudge the target tab once it finishes loading so late-hydrating
// composers (React/SPA) get a retry even if document_idle fired early.
if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (!changeInfo || changeInfo.status !== 'complete') return;
    try {
      const key = `xfer_${tabId}`;
      const res = await chrome.storage.local.get(key);
      const data = res && res[key];
      if (!data || Date.now() - (data.timestamp || 0) > 300000) return;
      chrome.tabs.sendMessage(tabId, { action: 'TRY_TRANSFER_INJECT', key }).catch(() => {});
    } catch {
      // Ignore
    }
  });
}

async function getActiveTab() {
  if (typeof chrome === 'undefined' || !chrome.tabs) return null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab) return tab;
  } catch {
    // Ignore
  }
  try {
    const [fallbackTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return fallbackTab || null;
  } catch {
    return null;
  }
}

async function handleCommand(command, previewPath = 'popup/preview.html') {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;

  if (command === 'copy_markdown' || command === 'download_markdown') {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'EXECUTE_SHORTCUT',
        shortcutAction: command,
      });
    } catch (err) {
      console.warn(`[AI Exporter Background] Shortcut ${command} failed:`, err);
    }
  } else if (command === 'open_preview') {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'COPY_CHAT',
        format: 'markdown',
      });
      if (response && response.success) {
        await chrome.storage.local.set({
          previewConversation: response.conversation || null,
          previewContent: response.content,
          previewTitle: tab.title || 'AI Conversation',
          previewFormat: 'markdown',
        });
        await chrome.tabs.create({
          url: chrome.runtime.getURL(previewPath),
        });
      }
    } catch (err) {
      console.warn('[AI Exporter Background] Shortcut open_preview failed:', err);
    }
  }
}

if (typeof chrome !== 'undefined' && chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener((command) => {
    handleCommand(command, 'popup/preview.html');
  });
}
