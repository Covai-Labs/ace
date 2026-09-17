import { formatSelectionPrompt } from '../content/formatters/continuation.js';

export default defineBackground(() => {
  const extVersion =
    typeof chrome !== 'undefined' && chrome.runtime?.getManifest
      ? chrome.runtime.getManifest()?.version || '1.12.1'
      : '1.12.1';
  const UNINSTALL_URL = `https://ai-chat-exporter.covai.org/uninstall-feedback.html?v=${extVersion}`;
  const WELCOME_URL = 'https://ai-chat-exporter.covai.org/welcome.html';

  if (typeof chrome !== 'undefined' && chrome.runtime?.setUninstallURL) {
    chrome.runtime.setUninstallURL(UNINSTALL_URL);
  }

  const TRANSFER_TARGETS = [
    { id: 'chatgpt', label: 'ChatGPT' },
    { id: 'claude', label: 'Claude' },
    { id: 'gemini', label: 'Gemini' },
    { id: 'deepseek', label: 'DeepSeek' },
    { id: 'perplexity', label: 'Perplexity' },
    { id: 'qwen', label: 'Qwen' },
    { id: 'mistral', label: 'Mistral' },
    { id: 'lumo', label: 'Lumo' },
    { id: 'copilot', label: 'Copilot' },
    { id: 'meta', label: 'Meta AI' },
    { id: 'z_ai', label: 'Z.ai' },
    { id: 'grok', label: 'Grok' },
  ];

  const TRANSFER_TARGET_IDS = TRANSFER_TARGETS.map((t) => t.id);

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

  const SUPPORTED_DOCUMENT_URL_PATTERNS = ['<all_urls>'];

  function setupContextMenus() {
    if (typeof chrome === 'undefined' || !chrome.contextMenus) return;

    chrome.contextMenus.removeAll(() => {
      const parentTitle = chrome.i18n?.getMessage('contextMenuParent') || 'Export AI Chat';
      const copyTitle = chrome.i18n?.getMessage('contextMenuCopyMarkdown') || 'Copy Markdown';
      const downloadTitle =
        chrome.i18n?.getMessage('contextMenuDownloadMarkdown') || 'Download Markdown';
      const previewTitle =
        chrome.i18n?.getMessage('contextMenuOpenPreview') || 'Open in Preview Tab';
      const sendToAITitle = chrome.i18n?.getMessage('contextMenuSendToAI') || 'Send to AI';

      // Root item scoped only to supported AI chat platforms
      chrome.contextMenus.create({
        id: 'ai-exporter-root',
        title: parentTitle,
        contexts: ['page', 'selection'],
        documentUrlPatterns: SUPPORTED_DOCUMENT_URL_PATTERNS,
      });

      // Sub-item: Copy Markdown
      chrome.contextMenus.create({
        id: 'ai-exporter-copy-markdown',
        parentId: 'ai-exporter-root',
        title: `${copyTitle} (Alt+Shift+C)`,
        contexts: ['page', 'selection'],
        documentUrlPatterns: SUPPORTED_DOCUMENT_URL_PATTERNS,
      });

      // Sub-item: Download Markdown
      chrome.contextMenus.create({
        id: 'ai-exporter-download-markdown',
        parentId: 'ai-exporter-root',
        title: `${downloadTitle} (Alt+Shift+D)`,
        contexts: ['page', 'selection'],
        documentUrlPatterns: SUPPORTED_DOCUMENT_URL_PATTERNS,
      });

      // Sub-item: Open Preview Tab
      chrome.contextMenus.create({
        id: 'ai-exporter-open-preview',
        parentId: 'ai-exporter-root',
        title: `${previewTitle} (Alt+Shift+P)`,
        contexts: ['page', 'selection'],
        documentUrlPatterns: SUPPORTED_DOCUMENT_URL_PATTERNS,
      });

      // Root item: Send to AI
      chrome.contextMenus.create({
        id: 'ai-exporter-transfer-root',
        title: sendToAITitle,
        contexts: ['page', 'selection'],
        documentUrlPatterns: SUPPORTED_DOCUMENT_URL_PATTERNS,
      });

      // Child items for each transfer target
      for (const target of TRANSFER_TARGETS) {
        chrome.contextMenus.create({
          id: `ai-exporter-transfer-${target.id}`,
          parentId: 'ai-exporter-transfer-root',
          title: target.label,
          contexts: ['page', 'selection'],
          documentUrlPatterns: SUPPORTED_DOCUMENT_URL_PATTERNS,
        });
      }
    });
  }

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

  if (typeof chrome !== 'undefined' && chrome.runtime?.onStartup) {
    chrome.runtime.onStartup.addListener(() => {
      syncSidePanelBehavior();
      setupContextMenus();
    });
  }

  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync' && changes.launchMode) {
        syncSidePanelBehavior();
      }
    });
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled) {
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
      setupContextMenus();

      // Inject content script into existing tabs on install/reload
      if (typeof chrome !== 'undefined' && chrome.scripting?.executeScript && chrome.tabs?.query) {
        try {
          const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
          for (const t of tabs) {
            if (t.id) {
              chrome.scripting
                .executeScript({
                  target: { tabId: t.id },
                  files: ['content-scripts/content.js'],
                })
                .catch(() => {});
            }
          }
        } catch (e) {
          console.warn('[AI Exporter Background] Failed to inject content script on install:', e);
        }
      }
    });
  }

  async function performTransfer(target, payload = '', title = 'AI Conversation', autoSend = true) {
    const uriAppTargets = ['obsidian', 'logseq', 'bear', 'noteplan', 'drafts'];
    if (uriAppTargets.includes(target)) {
      const syncData = await chrome.storage.sync.get('obsidianVaultName');
      const vault = syncData?.obsidianVaultName || '';
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
        if (payload) params.append('content', payload);
        appUri = `obsidian://new?${params.toString()}`;
      } else if (target === 'logseq') {
        const params = new URLSearchParams();
        params.append('page', cleanTitle);
        if (payload) params.append('content', payload);
        appUri = `logseq://x-callback-url/quickCapture?${params.toString()}`;
      } else if (target === 'bear') {
        const params = new URLSearchParams();
        params.append('title', cleanTitle);
        if (payload) params.append('text', payload);
        appUri = `bear://x-callback-url/create?${params.toString()}`;
      } else if (target === 'noteplan') {
        const params = new URLSearchParams();
        params.append('noteTitle', cleanTitle);
        if (payload) params.append('text', payload);
        appUri = `noteplan://x-callback-url/addText?${params.toString()}`;
      } else if (target === 'drafts') {
        const params = new URLSearchParams();
        const fullText = cleanTitle ? `# ${cleanTitle}\n\n${payload}` : payload;
        params.append('text', fullText);
        appUri = `drafts://x-callback-url/create?${params.toString()}`;
      }

      await chrome.tabs.create({ url: appUri });
      return { success: true, uri: appUri };
    }

    if (!TRANSFER_TARGET_IDS.includes(target)) {
      throw new Error(`Unsupported transfer target: ${target}`);
    }

    const url = PLATFORM_URLS[target] || 'https://chatgpt.com/';
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
          pendingContinuation: {
            ...base,
            payload: truncatedPayload(payload),
            truncated: true,
          },
        });
      }
    }
    return { success: true };
  }

  async function handleTransferContextMenu(targetId, info, tab) {
    let syncData;
    try {
      syncData = await chrome.storage.sync.get([
        'transferAutoSend',
        'selectionPromptTemplate',
        'transferCopyToClipboard',
      ]);
    } catch {
      // Defaults apply
    }
    const autoSend = syncData?.transferAutoSend !== false;
    const copyToClipboard = Boolean(syncData?.transferCopyToClipboard);

    const targetFrameId = typeof info.frameId === 'number' ? info.frameId : undefined;
    const sendOptions = targetFrameId !== undefined ? { frameId: targetFrameId } : undefined;

    let selectedText = info.selectionText ? info.selectionText.trim() : '';

    // If info.selectionText is empty, query content script in tab
    if (!selectedText && tab && tab.id !== undefined) {
      try {
        const selRes = await chrome.tabs.sendMessage(
          tab.id,
          { action: 'GET_CURRENT_SELECTION' },
          sendOptions,
        );
        if (selRes && selRes.success && typeof selRes.selection === 'string') {
          selectedText = selRes.selection.trim();
        }
      } catch {
        if (targetFrameId && targetFrameId !== 0) {
          try {
            const topRes = await chrome.tabs.sendMessage(
              tab.id,
              { action: 'GET_CURRENT_SELECTION' },
              { frameId: 0 },
            );
            if (topRes && topRes.success && typeof topRes.selection === 'string') {
              selectedText = topRes.selection.trim();
            }
          } catch {
            // Ignore
          }
        }
      }
    }

    // 1. Text is selected: format selected text excerpt
    if (selectedText && selectedText.length > 0) {
      const effectiveUrl = info.frameUrl || info.pageUrl || tab.url || '';
      let pageSource = '';
      try {
        if (effectiveUrl) {
          pageSource = new URL(effectiveUrl).hostname;
        }
      } catch {
        pageSource = effectiveUrl;
      }

      const payload = formatSelectionPrompt(selectedText, {
        title: tab.title || '',
        source: pageSource,
        url: effectiveUrl,
        template: syncData?.selectionPromptTemplate,
      });

      if (copyToClipboard && tab?.id !== undefined) {
        try {
          await chrome.tabs.sendMessage(
            tab.id,
            { action: 'COPY_TO_CLIPBOARD', text: payload },
            sendOptions,
          );
        } catch {
          // Ignore
        }
      }

      try {
        await performTransfer(targetId, payload, tab.title || 'AI Selection', autoSend);
      } catch (err) {
        console.error('[AI Exporter Background] Selection transfer failed:', err);
      }
      return;
    }

    // 2. No text selected: ask content script to extract (article or AI chat continuation)
    try {
      let response;
      try {
        response = await chrome.tabs.sendMessage(
          tab.id,
          { action: 'GET_CONTINUATION_PAYLOAD' },
          sendOptions,
        );
      } catch {
        // If content script was not already loaded in the target frame, attempt injection
        if (typeof chrome !== 'undefined' && chrome.scripting?.executeScript) {
          try {
            const scriptTarget =
              targetFrameId !== undefined
                ? { tabId: tab.id, frameIds: [targetFrameId] }
                : { tabId: tab.id };
            await chrome.scripting.executeScript({
              target: scriptTarget,
              files: ['content-scripts/content.js'],
            });
            await new Promise((resolve) => setTimeout(resolve, 150));
            response = await chrome.tabs.sendMessage(
              tab.id,
              { action: 'GET_CONTINUATION_PAYLOAD' },
              sendOptions,
            );
          } catch (injectErr) {
            console.warn('[AI Exporter Background] Script injection retry failed:', injectErr);
          }
        }
      }

      // If subframe failed or returned empty, try fallback to top frame if targetFrameId was not 0
      if ((!response || !response.success) && targetFrameId && targetFrameId !== 0) {
        try {
          response = await chrome.tabs.sendMessage(
            tab.id,
            { action: 'GET_CONTINUATION_PAYLOAD' },
            { frameId: 0 },
          );
        } catch {
          // Ignore
        }
      }

      if (response && response.success && response.payload) {
        if (copyToClipboard && tab?.id !== undefined) {
          try {
            await chrome.tabs.sendMessage(
              tab.id,
              { action: 'COPY_TO_CLIPBOARD', text: response.payload },
              sendOptions,
            );
          } catch {
            // Ignore
          }
        }
        await performTransfer(targetId, response.payload, tab.title || 'AI Conversation', autoSend);
      } else {
        console.warn(
          '[AI Exporter Background] GET_CONTINUATION_PAYLOAD failed or empty:',
          response?.error,
        );
      }
    } catch (err) {
      console.warn('[AI Exporter Background] Transfer from context menu failed:', err);
    }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
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
        (async () => {
          try {
            const res = await performTransfer(
              request.targetPlatform,
              request.payload || '',
              request.title || 'AI Conversation',
              request.autoSend !== false,
            );
            sendResponse(res);
          } catch (e) {
            console.error('[AI Exporter Background] Transfer failed:', e);
            sendResponse({ success: false, error: e.message });
          }
        })();
        return true;
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

  async function handleCommand(command, previewPath = 'preview.html') {
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
      handleCommand(command, 'preview.html');
    });
  }

  if (typeof chrome !== 'undefined' && chrome.contextMenus?.onClicked) {
    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
      if (info.menuItemId === 'ai-exporter-copy-markdown') {
        handleCommand('copy_markdown', 'preview.html');
      } else if (info.menuItemId === 'ai-exporter-download-markdown') {
        handleCommand('download_markdown', 'preview.html');
      } else if (info.menuItemId === 'ai-exporter-open-preview') {
        handleCommand('open_preview', 'preview.html');
      } else if (
        typeof info.menuItemId === 'string' &&
        info.menuItemId.startsWith('ai-exporter-transfer-')
      ) {
        const targetId = info.menuItemId.replace('ai-exporter-transfer-', '');
        if (!TRANSFER_TARGET_IDS.includes(targetId)) return;

        const currentTab = tab || (await getActiveTab());
        if (!currentTab || !currentTab.id) return;

        await handleTransferContextMenu(targetId, info, currentTab);
      }
    });
  }

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
  if (typeof chrome !== 'undefined' && chrome.tabs?.onUpdated) {
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
});
