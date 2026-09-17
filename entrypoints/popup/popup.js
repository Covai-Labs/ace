import { initI18n, applyI18n, t } from '../../content/utils/i18n.js';
import {
  formatFilename,
  resolveConversationTitle,
  DEFAULT_FILENAME_TEMPLATE,
} from '../../content/utils/filename.js';
import { createLogger } from '../../content/utils/logger.js';
import { shouldShowUnsupportedWarning, buildPlatformSupportIssueUrl } from '../../content/utils/feedback.js';

const logger = createLogger('Popup');

function applyTheme(theme) {
  if (theme && theme !== 'system') {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
  try {
    chrome.storage.sync.get(['theme'], (res) => {
      if (res && res.theme) {
        applyTheme(res.theme);
      }
    });
  } catch {
    // Ignore early fetch error
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.self !== window.top) {
    document.documentElement.classList.add('in-iframe');
  }

  // Initialize localization
  await initI18n();
  applyI18n();

  const statusEl = document.getElementById('status');
  const reparseBtn = document.getElementById('reparse-btn');
  const chatInfoEl = document.getElementById('chat-info');
  const actionsEl = document.getElementById('actions');
  const errorEl = document.getElementById('error-msg');
  const chatTitleEl = document.getElementById('chat-title');
  const msgCountEl = document.getElementById('message-count');
  const exportBtn = document.getElementById('export-btn');
  const copyBtn = document.getElementById('copy-btn');
  const previewBtn = document.getElementById('preview-btn');
  const formatSelect = document.getElementById('format-select');
  const includeImagesCheckbox = document.getElementById('include-images-checkbox');
  const filenameInput = document.getElementById('filename-input');
  const continueTargetSelect = document.getElementById('continue-target-select');
  const unsupportedBanner = document.getElementById('unsupported-warning-banner');
  const requestSupportBtn = document.getElementById('request-support-btn');
  const previewableFormats = new Set(['markdown', 'json', 'html', 'doc', 'png', 'pdf']);
  const copyableFormats = new Set(['markdown', 'json', 'html']);

  function updateUnsupportedWarning(report, pageUrl) {
    if (!unsupportedBanner) return;
    if (shouldShowUnsupportedWarning(report)) {
      unsupportedBanner.classList.remove('hidden');
      if (requestSupportBtn) {
        requestSupportBtn.onclick = (e) => {
          e.preventDefault();
          const issueUrl = buildPlatformSupportIssueUrl(pageUrl || tab?.url || '');
          chrome.tabs.create({ url: issueUrl });
        };
      }
    } else {
      unsupportedBanner.classList.add('hidden');
    }
  }

  function setStatus(state, message) {
    if (!statusEl) return;
    statusEl.className = `status status-${state}`;
    let textNode = statusEl.querySelector('.status-text');
    let indicator = statusEl.querySelector('.status-indicator');
    if (!indicator || !textNode) {
      statusEl.innerHTML = `<span class="status-indicator ${state}"></span><span class="status-text"></span>`;
      textNode = statusEl.querySelector('.status-text');
    }
    if (textNode) {
      textNode.textContent = message;
    } else {
      statusEl.textContent = message;
    }
  }

  let sessionPort = null;
  function establishSession(targetTabId) {
    if (sessionPort) {
      try {
        sessionPort.disconnect();
      } catch {
        // Ignore
      }
      sessionPort = null;
    }
    if (typeof chrome !== 'undefined' && chrome.tabs?.connect && targetTabId) {
      try {
        sessionPort = chrome.tabs.connect(targetTabId, { name: 'popup-tab-session' });
      } catch {
        // Ignore
      }
    }
  }

  const openOptionsBtn = document.getElementById('open-options-btn');
  if (openOptionsBtn) {
    openOptionsBtn.addEventListener('click', () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
      }
    });
  }

  if (reparseBtn) {
    reparseBtn.addEventListener('click', async () => {
      if (reparseBtn.disabled) return;
      reparseBtn.classList.add('spin');
      reparseBtn.disabled = true;
      try {
        await checkAvailability({ force: true });
      } finally {
        reparseBtn.classList.remove('spin');
        reparseBtn.disabled = false;
      }
    });
  }

  const reportIssueLink = document.getElementById('report-issue-link');
  if (reportIssueLink) {
    reportIssueLink.addEventListener('click', (e) => {
      e.preventDefault();
      const issueUrl =
        'https://github.com/Covai-Labs/ai-chat-exporter/issues/new?template=bug_report.md';
      chrome.tabs.create({ url: issueUrl });
    });
  }

  const decantLink = document.getElementById('decant-link');
  if (decantLink) {
    decantLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: decantLink.href });
    });
  }

  const copilotRedirectBox = document.getElementById('copilot-redirect-box');
  const copilotRedirectBtn = document.getElementById('copilot-redirect-btn');
  if (copilotRedirectBtn) {
    copilotRedirectBtn.addEventListener('click', async () => {
      if (tab && tab.url) {
        const targetUrl = tab.url.replace('copilot.microsoft.com', 'copilot.com');
        chrome.tabs.create({ url: targetUrl });
      } else {
        chrome.tabs.create({ url: 'https://copilot.com/' });
      }
    });
  }

  const storedSettings = await chrome.storage.sync.get([
    'theme',
    'uiLanguage',
    'defaultFormat',
    'includeImages',
    'filenameTemplate',
    'defaultTransferTarget',
    'parserMode',
  ]);
  applyTheme(storedSettings.theme || 'system');

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(async (changes, areaName) => {
      if (areaName === 'sync') {
        if (changes.theme) {
          storedSettings.theme = changes.theme.newValue || 'system';
          applyTheme(storedSettings.theme);
        }
        if (changes.uiLanguage) {
          await initI18n(changes.uiLanguage.newValue || 'auto');
          applyI18n();
          updateCopyButtonVisibility();
        }
        if (changes.filenameTemplate) {
          storedSettings.filenameTemplate = changes.filenameTemplate.newValue;
        }
      }
    });
  }

  if (storedSettings.defaultFormat && formatSelect) {
    formatSelect.value = storedSettings.defaultFormat;
  }
  if (storedSettings.includeImages !== undefined && includeImagesCheckbox) {
    includeImagesCheckbox.checked = storedSettings.includeImages;
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

  let tab = await getActiveTab();
  logger.debug('Active tab detected:', {
    id: tab?.id,
    url: tab?.url,
    title: tab?.title,
  });

  if (!tab) {
    logger.warn('No active tab found');
    setStatus('error', 'Error: No active tab');
    return;
  }

  let activeTargetFrameId = null;

  async function sendTabMessage(actionPayload) {
    if (!tab || !tab.id) throw new Error('No active tab');
    if (typeof activeTargetFrameId === 'number') {
      try {
        return await chrome.tabs.sendMessage(tab.id, actionPayload, {
          frameId: activeTargetFrameId,
        });
      } catch (err) {
        logger.debug('Sending to target frame failed, falling back to broadcast:', err);
      }
    }
    return await chrome.tabs.sendMessage(tab.id, actionPayload);
  }

  function scoreFrameReport(report) {
    if (!report || !report.available) return -1;
    let score = 0;
    if (report.isDedicatedAi) score += 1000;
    score += (report.count || 0) * 10;
    if (report.isTopFrame) score += 5;
    return score;
  }

  async function discoverBestFrame(tabId, options = {}) {
    return new Promise((resolve) => {
      const reports = [];
      const queryId = `${Date.now()}_${Math.random()}`;

      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
          chrome.runtime.onMessage.removeListener(listener);
        }
        if (reports.length === 0) {
          resolve(null);
          return;
        }
        reports.sort((a, b) => scoreFrameReport(b) - scoreFrameReport(a));
        resolve(reports[0]);
      };

      const listener = (msg, sender) => {
        if (msg?.action === 'FRAME_REPORT' && msg?.queryId === queryId && msg.data) {
          const fid =
            typeof sender.frameId === 'number' ? sender.frameId : msg.data.isTopFrame ? 0 : null;
          reports.push({
            ...msg.data,
            frameId: fid,
          });

          if (msg.data.platform) {
            setStatus(
              'scanning',
              `${t('statusScanning') || 'Scanning messages...'} (${msg.data.platform})`,
            );
          }
        }
      };

      if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.addListener(listener);
      }

      chrome.tabs
        .sendMessage(tabId, {
          action: 'DISCOVER_FRAMES',
          queryId,
          force: Boolean(options.force),
          parserMode: storedSettings.parserMode || 'auto',
        })
        .catch(() => {});

      setTimeout(finish, 350);
    });
  }

  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 500;
  let availabilityCheckSeq = 0;

  async function checkAvailability(options = {}) {
    const currentSeq = ++availabilityCheckSeq;
    const isForce = Boolean(options.force);
    tab = await getActiveTab();
    if (currentSeq !== availabilityCheckSeq) return;
    logger.debug('checkAvailability() starting for tab:', tab?.id, tab?.url, { isForce });
    if (!tab || !tab.id) {
      logger.warn('Tab or Tab ID invalid');
      setStatus('error', 'Error: No active tab');
      showError();
      return;
    }

    establishSession(tab.id);

    if (isForce) {
      setStatus('scanning', t('statusScanning') || 'Scanning messages...');
    } else {
      setStatus('connecting', t('statusConnecting') || 'Connecting...');
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (currentSeq !== availabilityCheckSeq) return;
      try {
        if (!isForce && attempt === 0) {
          setStatus('connecting', t('statusConnecting') || 'Connecting...');
        } else {
          setStatus('detecting', t('statusDetecting') || 'Detecting...');
        }

        logger.debug(`Attempt ${attempt + 1}/${MAX_RETRIES}: Discovering frames in tab ${tab.id}`);
        let bestReport = await discoverBestFrame(tab.id, options);
        if (currentSeq !== availabilityCheckSeq) return;
        let response = null;

        if (bestReport && bestReport.available) {
          activeTargetFrameId = typeof bestReport.frameId === 'number' ? bestReport.frameId : null;
          response = bestReport;
        } else if (!bestReport) {
          logger.debug('No DISCOVER_FRAMES reports, falling back to CHECK_AVAILABILITY');
          setStatus('scanning', t('statusScanning') || 'Scanning messages...');
          response = await chrome.tabs.sendMessage(tab.id, {
            action: 'CHECK_AVAILABILITY',
            force: isForce,
            parserMode: storedSettings.parserMode || 'auto',
          });
          activeTargetFrameId = null;
        }

        logger.debug('Response received:', response);
        if (response && response.available) {
          logger.info(
            `Successfully connected to platform: ${response.platform} with ${response.count} messages (frameId: ${activeTargetFrameId})`,
          );
          setStatus('ready', `${t('statusReady') || 'Ready'}: ${response.platform}`);
          const platformName = response.platform || 'AI';
          const displayTitle = resolveConversationTitle(response.title, platformName, {
            title: tab.title,
          });
          chatTitleEl.textContent = displayTitle;
          const count = response.count || 0;
          msgCountEl.textContent = t('messagesFound', count) || `${count} messages found`;
          if (filenameInput) {
            const formattedDefault = formatFilename(
              storedSettings.filenameTemplate || DEFAULT_FILENAME_TEMPLATE,
              {
                platform: response.platform,
                title: displayTitle,
              },
            );
            filenameInput.value = formattedDefault;
          }
          if (continueTargetSelect) {
            const platformKey = (response.platform || '').toLowerCase();
            let target = storedSettings.defaultTransferTarget || 'claude';
            if (platformKey.includes('chatgpt') && target === 'chatgpt') {
              target = 'claude';
            } else if (platformKey.includes('claude') && target === 'claude') {
              target = 'chatgpt';
            }
            continueTargetSelect.value = target;
          }
          chatInfoEl.classList.remove('hidden');
          actionsEl.classList.remove('hidden');
          updateUnsupportedWarning(response, tab?.url);
          errorEl.classList.add('hidden');
          if (copilotRedirectBox) {
            copilotRedirectBox.classList.add('hidden');
          }
          return;
        } else {
          logger.debug(
            'Response indicated parser is not available or returned empty response:',
            response,
          );
          showError();
          return;
        }
      } catch (e) {
        const isNotReady = e.message && e.message.includes('Receiving end does not exist');
        logger.debug(`Attempt ${attempt + 1} communication status:`, e.message);
        if (
          isNotReady &&
          attempt === 0 &&
          typeof chrome !== 'undefined' &&
          chrome.scripting?.executeScript
        ) {
          try {
            logger.debug('Attempting on-demand script injection for tab:', tab.id);
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content-scripts/content.js'],
            });
            await new Promise((resolve) => setTimeout(resolve, 200));
            continue;
          } catch (injectErr) {
            logger.debug('Dynamic script injection failed:', injectErr);
          }
        }
        if (!isNotReady) {
          logger.debug('Unexpected error connecting to tab:', e);
          showError();
          return;
        }
        if (attempt < MAX_RETRIES - 1) {
          logger.debug(`Waiting ${RETRY_DELAY_MS}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }
    logger.debug('Exhausted connection attempts to content script.');
    showError();
  }

  window.addEventListener('message', async (event) => {
    if (event.data?.action === 'REFRESH_PANEL') {
      await checkAvailability();
    }
  });

  const pngWarningBanner = document.getElementById('png-warning-banner');
  const pngQualityContainer = document.getElementById('png-quality-container');
  const pngQualityCheckbox = document.getElementById('png-quality-checkbox');

  function updateCopyButtonVisibility() {
    const format = formatSelect.value;
    const isCopyable = copyableFormats.has(format);
    const isPreviewable = previewableFormats.has(format) && format !== 'png';
    copyBtn.classList.toggle('hidden', !isCopyable);
    previewBtn.classList.toggle('hidden', !isPreviewable);
    if (format === 'png') {
      exportBtn.textContent = '🖼️ ' + (t('openInTab') || 'Export in New Tab');
    } else if (format === 'pdf') {
      exportBtn.textContent = '📄 ' + (t('printSavePdf') || 'Export & Print PDF');
    } else {
      exportBtn.textContent = t('exportChat') || '📥 Export Chat';
    }
    if (pngWarningBanner) {
      pngWarningBanner.classList.toggle('hidden', format !== 'png');
    }
    if (pngQualityContainer) {
      pngQualityContainer.classList.toggle('hidden', format !== 'png');
    }
  }

  function showError() {
    setStatus('error', t('statusError') || 'Not Supported');
    errorEl.classList.remove('hidden');
    if (unsupportedBanner) {
      unsupportedBanner.classList.add('hidden');
    }
    if (copilotRedirectBox) {
      const isCopilotMs = Boolean(tab?.url && tab.url.includes('copilot.microsoft.com'));
      copilotRedirectBox.classList.toggle('hidden', !isCopilotMs);
    }
  }

  formatSelect.addEventListener('change', updateCopyButtonVisibility);
  updateCopyButtonVisibility();

  await checkAvailability();

  exportBtn.addEventListener('click', async () => {
    const format = formatSelect.value;
    const customFilename = filenameInput ? filenameInput.value.trim() : '';
    exportBtn.disabled = true;
    exportBtn.textContent =
      format === 'png'
        ? t('loadingContent') || 'Opening Preview...'
        : format === 'pdf'
          ? t('loadingContent') || 'Opening PDF Preview...'
          : t('statusExporting') || 'Exporting...';

    try {
      if (format === 'pdf' || format === 'png') {
        const formatToRequest = format === 'pdf' ? 'html' : 'markdown';
        const response = await sendTabMessage({
          action: 'COPY_CHAT',
          format: formatToRequest,
          includeImages: includeImagesCheckbox.checked,
          parserMode: storedSettings.parserMode || 'auto',
          theme: storedSettings.theme || 'system',
        });

        if (response && response.success) {
          await chrome.storage.local.set({
            previewConversation: response.conversation || null,
            previewContent: response.content,
            previewTitle: response.conversation?.title || tab.title || 'Untitled Chat',
            previewFilename: customFilename || null,
            previewFormat: format,
            previewTheme: storedSettings.theme || 'system',
            autoPrint: format === 'pdf',
            autoDownloadPng: format === 'png',
            highQualityPng: pngQualityCheckbox ? pngQualityCheckbox.checked : true,
            includeImages: includeImagesCheckbox ? includeImagesCheckbox.checked : true,
          });

          const formatCode = format === 'markdown' ? 'md' : format;
          await chrome.tabs.create({
            url:
              chrome.runtime.getURL('preview.html') +
              `?export_format=${encodeURIComponent(formatCode)}`,
          });

          setStatus('ready', t('statusExportSuccess') || 'Export Successful!');
        } else {
          setStatus(
            'error',
            (t('statusError') || 'Export Failed') + ': ' + (response?.error || 'Unknown'),
          );
        }
      } else {
        const response = await sendTabMessage({
          action: 'EXPORT_CHAT',
          format: format,
          includeImages: includeImagesCheckbox.checked,
          customFilename: customFilename,
          highQualityPng: pngQualityCheckbox ? pngQualityCheckbox.checked : true,
          parserMode: storedSettings.parserMode || 'auto',
          theme: storedSettings.theme || 'system',
        });

        if (response && response.success) {
          setStatus('ready', t('statusExportSuccess') || 'Export Successful!');
        } else {
          setStatus(
            'error',
            (t('statusError') || 'Export Failed') + ': ' + (response?.error || 'Unknown'),
          );
        }
      }
    } catch (e) {
      setStatus('error', 'Error: ' + e.message);
    } finally {
      exportBtn.disabled = false;
      updateCopyButtonVisibility();
    }
  });

  copyBtn.addEventListener('click', async () => {
    const format = formatSelect.value;
    copyBtn.disabled = true;
    copyBtn.textContent = t('statusExporting') || 'Copying...';
    setStatus('exporting', t('statusExporting') || 'Copying...');

    try {
      const response = await sendTabMessage({
        action: 'COPY_CHAT',
        format: format,
        includeImages: includeImagesCheckbox.checked,
        theme: storedSettings.theme || 'system',
      });

      if (response && response.success) {
        if (
          response.htmlContent &&
          typeof ClipboardItem !== 'undefined' &&
          navigator.clipboard &&
          navigator.clipboard.write
        ) {
          try {
            const htmlBlob = new Blob([response.htmlContent], { type: 'text/html' });
            const textBlob = new Blob([response.content], { type: 'text/plain' });
            await navigator.clipboard.write([
              new ClipboardItem({
                'text/html': htmlBlob,
                'text/plain': textBlob,
              }),
            ]);
          } catch (writeErr) {
            logger.warn('Dual-MIME clipboard write failed, falling back to text:', writeErr);
            await navigator.clipboard.writeText(response.content);
          }
        } else {
          await navigator.clipboard.writeText(response.content);
        }
        setStatus('ready', t('statusCopied') || 'Copied to clipboard!');
      } else {
        setStatus('error', 'Copy Failed: ' + (response?.error || 'Unknown'));
      }
    } catch (e) {
      setStatus('error', 'Error: ' + e.message);
    } finally {
      copyBtn.disabled = false;
      copyBtn.textContent = t('copyChat') || '📋 Copy Chat';
    }
  });

  previewBtn.addEventListener('click', async () => {
    const format = formatSelect.value;
    previewBtn.disabled = true;
    previewBtn.textContent = t('loadingContent') || 'Opening...';
    setStatus('exporting', t('loadingContent') || 'Opening...');

    try {
      const formatToRequest = format === 'pdf' ? 'html' : format === 'png' ? 'markdown' : format;
      const response = await sendTabMessage({
        action: 'COPY_CHAT',
        format: formatToRequest,
        includeImages: includeImagesCheckbox.checked,
        parserMode: storedSettings.parserMode || 'auto',
      });

      if (response && response.success) {
        const customFilename = filenameInput ? filenameInput.value.trim() : '';
        await chrome.storage.local.set({
          previewConversation: response.conversation || null,
          previewContent: response.content,
          previewTitle: response.conversation?.title || tab.title || 'Untitled Chat',
          previewFilename: customFilename || null,
          previewFormat: format,
          previewTheme: storedSettings.theme || 'system',
          autoPrint: false,
          autoDownloadPng: false,
          highQualityPng: pngQualityCheckbox ? pngQualityCheckbox.checked : true,
          includeImages: includeImagesCheckbox ? includeImagesCheckbox.checked : true,
        });

        const activeFormat = formatSelect ? formatSelect.value : 'markdown';
        const formatCode = activeFormat === 'markdown' ? 'md' : activeFormat;
        await chrome.tabs.create({
          url:
            chrome.runtime.getURL('preview.html') +
            `?export_format=${encodeURIComponent(formatCode)}`,
        });

        setStatus('ready', t('statusOpenedInTab') || 'Opened in New Tab!');
      } else {
        setStatus('error', 'Preview Failed: ' + (response?.error || 'Unknown'));
      }
    } catch (e) {
      setStatus('error', 'Error: ' + e.message);
    } finally {
      previewBtn.disabled = false;
      previewBtn.textContent = t('openInTab') || '👁️ Open in Tab';
    }
  });

  const transferBtn = document.getElementById('transfer-btn');

  if (transferBtn) {
    transferBtn.addEventListener('click', async () => {
      const targetPlatform = continueTargetSelect ? continueTargetSelect.value : 'chatgpt';
      transferBtn.disabled = true;
      transferBtn.textContent = t('statusExporting') || 'Transferring...';
      setStatus('exporting', t('statusExporting') || 'Transferring...');

      try {
        const response = await sendTabMessage({
          action: 'GET_CONTINUATION_PAYLOAD',
          includeImages: includeImagesCheckbox.checked,
        });

        if (response && response.success && response.payload) {
          let autoSend = true;
          let copyToClipboard = false;
          try {
            const syncData = await chrome.storage.sync.get([
              'transferAutoSend',
              'transferCopyToClipboard',
            ]);
            if (syncData && syncData.transferAutoSend !== undefined) {
              autoSend = syncData.transferAutoSend !== false;
            }
            if (syncData && syncData.transferCopyToClipboard) {
              copyToClipboard = true;
            }
          } catch {
            // Default to auto-send
          }
          if (copyToClipboard && response.payload) {
            try {
              if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(response.payload);
              }
            } catch (err) {
              logger.warn('Failed to copy to clipboard on transfer:', err);
            }
          }
          await chrome.runtime.sendMessage({
            action: 'TRANSFER_CHAT',
            targetPlatform: targetPlatform,
            title: filenameInput ? filenameInput.value : 'AI Conversation',
            payload: response.payload,
            autoSend,
          });
          setStatus('ready', `Opening ${targetPlatform}...`);
        } else {
          setStatus('error', 'Transfer Failed: ' + (response?.error || 'No content'));
        }
      } catch (e) {
        setStatus('error', 'Error: ' + e.message);
      } finally {
        transferBtn.disabled = false;
        transferBtn.textContent = t('transferBtn') || '↗ Transfer';
      }
    });
  }
});
