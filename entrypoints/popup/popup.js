import { initI18n, applyI18n, t } from '../../content/utils/i18n.js';
import {
  formatFilename,
  resolveConversationTitle,
  DEFAULT_FILENAME_TEMPLATE,
} from '../../content/utils/filename.js';
import { createLogger } from '../../content/utils/logger.js';
import {
  shouldShowUnsupportedWarning,
  buildPlatformSupportIssueUrl,
} from '../../content/utils/feedback.js';
import { hasPermission, requestPermission } from '../../content/utils/permissions.js';
import {
  initTooltips,
  registerShortcutHandler,
  createShortcutSheet,
} from '../../content/utils/ui-shortcuts.js';

const logger = createLogger('Popup');

function stripLeadingEmoji(text) {
  return String(text || '').replace(
    /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\s]+/u,
    '',
  );
}

function setBtnLabel(btn, text) {
  if (!btn) return;
  const cleaned = stripLeadingEmoji(text);
  const label = btn.querySelector('.btn-label');
  if (label) {
    label.textContent = cleaned;
  } else {
    btn.textContent = cleaned;
  }
}

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

  // Initialize localization & tooltips
  await initI18n();
  applyI18n();
  document.querySelectorAll('.btn-label').forEach((el) => {
    el.textContent = stripLeadingEmoji(el.textContent);
  });
  initTooltips();

  const statusEl = document.getElementById('status');
  const reparseBtn = document.getElementById('reparse-btn');
  const shortcutHelpBtn = document.getElementById('shortcut-help-btn');
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
  const articleSupportRow = document.getElementById('article-support-row');
  const parserModeContainer = document.getElementById('parser-mode-container');
  const parserModeSelect = document.getElementById('parser-mode-select');
  const requestSupportBtn = document.getElementById('request-support-btn');
  const articleEngineSelectPopup = document.getElementById('article-engine-select-popup');
  const popupOptionsBtn = document.getElementById('popup-options-btn');
  const popupOptionsMenu = document.getElementById('popup-options-menu');
  const previewableFormats = new Set([
    'markdown',
    'text',
    'json',
    'openwebui',
    'html',
    'doc',
    'png',
    'pdf',
  ]);
  const copyableFormats = new Set(['markdown', 'text', 'json', 'openwebui', 'html']);
  let isCurrentArticle = false;

  // Segmented tabs
  const popupTabBtns = Array.from(document.querySelectorAll('[data-popup-tab]'));
  const popupTabPanels = {
    export: document.getElementById('tab-panel-export'),
    transfer: document.getElementById('tab-panel-transfer'),
    batch: document.getElementById('tab-panel-batch'),
  };

  function switchPopupTab(tabName) {
    if (!popupTabPanels[tabName]) return;
    popupTabBtns.forEach((btn) => {
      const isActive = btn.dataset.popupTab === tabName;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    Object.entries(popupTabPanels).forEach(([name, panel]) => {
      if (panel) panel.classList.toggle('active', name === tabName);
    });
  }

  popupTabBtns.forEach((btn) => {
    btn.addEventListener('click', () => switchPopupTab(btn.dataset.popupTab));
  });

  function updateUnsupportedWarning(report, pageUrl) {
    const isArticle = shouldShowUnsupportedWarning(report);
    isCurrentArticle = isArticle;
    if (unsupportedBanner) {
      unsupportedBanner.classList.toggle('hidden', !isArticle);
    }
    if (articleSupportRow) {
      articleSupportRow.classList.toggle('hidden', !isArticle);
    }
    if (parserModeContainer) {
      parserModeContainer.classList.toggle('hidden', isArticle);
    }
    if (isArticle) {
      if (articleEngineSelectPopup) {
        articleEngineSelectPopup.value = storedSettings.articleEngine || 'auto';
      }
      if (requestSupportBtn) {
        requestSupportBtn.onclick = (e) => {
          e.preventDefault();
          const issueUrl = buildPlatformSupportIssueUrl(pageUrl || tab?.url || '');
          chrome.tabs.create({ url: issueUrl });
        };
      }
    } else if (parserModeSelect) {
      parserModeSelect.value = storedSettings.parserMode || 'auto';
    }
  }

  if (parserModeSelect) {
    parserModeSelect.addEventListener('change', async (e) => {
      const prevMode = storedSettings.parserMode || 'auto';
      const selected = e.target.value;
      try {
        storedSettings.parserMode = selected;
        if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
          await chrome.storage.sync.set({ parserMode: selected });
        }
        await checkAvailability({ force: true, parserMode: selected });
      } catch (err) {
        logger.error('Failed to update parser mode:', err);
        storedSettings.parserMode = prevMode;
        parserModeSelect.value = prevMode;
        setStatus('error', 'Failed to save mode: ' + (err.message || 'Storage error'));
      }
    });
  }

  if (popupOptionsBtn && popupOptionsMenu) {
    popupOptionsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = popupOptionsMenu.classList.contains('hidden');
      popupOptionsMenu.classList.toggle('hidden', !willOpen);
      popupOptionsBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });

    document.addEventListener('click', (e) => {
      if (
        !popupOptionsMenu.classList.contains('hidden') &&
        !popupOptionsMenu.contains(e.target) &&
        e.target !== popupOptionsBtn &&
        !popupOptionsBtn.contains(e.target)
      ) {
        popupOptionsMenu.classList.add('hidden');
        popupOptionsBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  if (articleEngineSelectPopup) {
    articleEngineSelectPopup.addEventListener('change', async (e) => {
      const prevEngine = storedSettings.articleEngine || 'auto';
      const selected = e.target.value;
      try {
        storedSettings.articleEngine = selected;
        if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
          await chrome.storage.sync.set({ articleEngine: selected });
        }
        await checkAvailability({ force: true, articleEngine: selected });
      } catch (err) {
        logger.error('Failed to update article extraction engine:', err);
        storedSettings.articleEngine = prevEngine;
        articleEngineSelectPopup.value = prevEngine;
        setStatus('error', 'Failed to save engine selection: ' + (err.message || 'Storage error'));
      }
    });
  }

  function setStatus(state, message) {
    if (!statusEl) return;
    statusEl.className = `status status-${state}`;
    let textNode = statusEl.querySelector('.status-text');
    let indicator = statusEl.querySelector('.status-indicator');
    if (!indicator || !textNode) {
      statusEl.innerHTML = `<span class="status-indicator ${state}"></span><span class="status-text"></span>`;
      textNode = statusEl.querySelector('.status-text');
      indicator = statusEl.querySelector('.status-indicator');
    }
    if (indicator) {
      indicator.className = `status-indicator ${state}`;
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

  const supportBtn = document.getElementById('support-btn');
  if (supportBtn) {
    supportBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html#love') });
    });
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
      const issueUrl = 'https://github.com/Covai-Labs/ace/issues/new?template=bug_report.md';
      chrome.tabs.create({ url: issueUrl });
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
    'includeAttachments',
    'includeThinking',
    'includeTimestamps',
    'includeToc',
    'pageBreakPerPrompt',
    'splitLongPng',
    'messageNumbering',
    'filenameTemplate',
    'defaultTransferTarget',
    'parserMode',
    'articleEngine',
  ]);
  applyTheme(storedSettings.theme || 'system');

  const popupOptionsSyncMap = [
    ['popup-include-attachments', 'includeAttachments', true],
    ['popup-include-thinking', 'includeThinking', true],
    ['popup-include-timestamps', 'includeTimestamps', false],
    ['popup-include-toc', 'includeToc', false],
    ['popup-page-break', 'pageBreakPerPrompt', false],
  ];

  const optionsSummaryEl = document.getElementById('options-summary');
  function updateOptionsSummary() {
    if (!optionsSummaryEl) return;
    const enabled = [];
    if (includeImagesCheckbox?.checked) enabled.push('Images');
    if (document.getElementById('popup-include-attachments')?.checked) enabled.push('Files');
    if (document.getElementById('popup-include-thinking')?.checked) enabled.push('Thoughts');
    if (document.getElementById('popup-include-timestamps')?.checked) enabled.push('Dates');
    if (document.getElementById('popup-include-toc')?.checked) enabled.push('TOC');
    optionsSummaryEl.textContent = enabled.length ? enabled.join(', ') : 'Default options';
  }

  popupOptionsSyncMap.forEach(([elId, key, defaultVal]) => {
    const el = document.getElementById(elId);
    if (!el) return;
    el.checked = storedSettings[key] !== undefined ? Boolean(storedSettings[key]) : defaultVal;
    el.addEventListener('change', () => {
      storedSettings[key] = el.checked;
      updateOptionsSummary();
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        chrome.storage.sync.set({ [key]: el.checked });
      }
    });
  });
  if (includeImagesCheckbox) {
    includeImagesCheckbox.addEventListener('change', updateOptionsSummary);
  }
  updateOptionsSummary();

  const popupNumberingSelect = document.getElementById('popup-numbering-select');
  if (popupNumberingSelect) {
    popupNumberingSelect.value = storedSettings.messageNumbering || 'off';
    popupNumberingSelect.addEventListener('change', () => {
      storedSettings.messageNumbering = popupNumberingSelect.value;
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        chrome.storage.sync.set({ messageNumbering: popupNumberingSelect.value });
      }
    });
  }

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
        if (changes.articleEngine) {
          storedSettings.articleEngine = changes.articleEngine.newValue || 'auto';
          if (articleEngineSelectPopup) {
            articleEngineSelectPopup.value = storedSettings.articleEngine;
          }
        }
        if (changes.includeThinking) {
          storedSettings.includeThinking = changes.includeThinking.newValue !== false;
        }
        if (changes.includeAttachments) {
          storedSettings.includeAttachments = changes.includeAttachments.newValue !== false;
        }
        if (changes.includeTimestamps) {
          storedSettings.includeTimestamps = changes.includeTimestamps.newValue === true;
        }
        if (changes.includeToc) {
          storedSettings.includeToc = changes.includeToc.newValue === true;
        }
        if (changes.pageBreakPerPrompt) {
          storedSettings.pageBreakPerPrompt = changes.pageBreakPerPrompt.newValue === true;
        }
        if (changes.splitLongPng) {
          storedSettings.splitLongPng = changes.splitLongPng.newValue !== false;
          if (pngSplitCheckbox) {
            pngSplitCheckbox.checked = storedSettings.splitLongPng;
          }
        }
        if (changes.messageNumbering) {
          storedSettings.messageNumbering = changes.messageNumbering.newValue || 'off';
        }
      }
    });
  }

  if (storedSettings.defaultFormat && formatSelect) {
    formatSelect.value = storedSettings.defaultFormat;
  }
  if (storedSettings.parserMode && parserModeSelect) {
    parserModeSelect.value = storedSettings.parserMode;
  }
  if (storedSettings.articleEngine && articleEngineSelectPopup) {
    articleEngineSelectPopup.value = storedSettings.articleEngine;
  }
  if (storedSettings.includeImages !== undefined && includeImagesCheckbox) {
    includeImagesCheckbox.checked = storedSettings.includeImages;
  }
  updateOptionsSummary();

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
        const res = await chrome.tabs.sendMessage(tab.id, actionPayload, {
          frameId: activeTargetFrameId,
        });
        if (res && res.error === 'No parser available') {
          logger.debug(
            `Target frame ${activeTargetFrameId} returned 'No parser available', falling back to broadcast`,
          );
        } else {
          return res;
        }
      } catch (err) {
        logger.debug(
          `Sending to target frame ${activeTargetFrameId} failed, falling back to broadcast:`,
          err,
        );
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
          articleEngine: options.articleEngine || storedSettings.articleEngine || 'auto',
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

    chatInfoEl.classList.add('hidden');
    actionsEl.classList.add('hidden');
    errorEl.classList.add('hidden');

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
            articleEngine: options.articleEngine || storedSettings.articleEngine || 'auto',
          });
          if (response && response.available) {
            activeTargetFrameId =
              typeof response.frameId === 'number'
                ? response.frameId
                : response.isTopFrame
                  ? 0
                  : null;
          } else {
            activeTargetFrameId = null;
          }
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
          const isArticle = shouldShowUnsupportedWarning(response);
          if (msgCountEl) {
            if (isArticle || count === 0) {
              msgCountEl.classList.add('hidden');
            } else {
              msgCountEl.textContent = `${count} ${count === 1 ? 'msg' : 'msgs'}`;
              msgCountEl.classList.remove('hidden');
            }
          }
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
          updateCopyButtonVisibility();
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
  const pngSplitContainer = document.getElementById('png-split-container');
  const pngSplitCheckbox = document.getElementById('png-split-checkbox');

  if (pngSplitCheckbox) {
    pngSplitCheckbox.checked = storedSettings.splitLongPng !== false;
    pngSplitCheckbox.addEventListener('change', () => {
      storedSettings.splitLongPng = pngSplitCheckbox.checked;
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        chrome.storage.sync.set({ splitLongPng: pngSplitCheckbox.checked });
      }
    });
  }

  function updateCopyButtonVisibility() {
    const format = formatSelect.value;
    const isCopyable = copyableFormats.has(format);
    const isPreviewable = previewableFormats.has(format);
    copyBtn.classList.toggle('hidden', !isCopyable);
    previewBtn.classList.toggle('hidden', !isPreviewable);
    if (format === 'pdf') {
      setBtnLabel(exportBtn, t('printSavePdf') || 'Export & Print PDF');
    } else {
      setBtnLabel(exportBtn, isCurrentArticle ? 'Export' : t('exportChat') || 'Export');
    }
    setBtnLabel(copyBtn, isCurrentArticle ? 'Copy' : t('copyChat') || 'Copy');
    if (pngWarningBanner) {
      pngWarningBanner.classList.toggle('hidden', format !== 'png');
    }
    if (pngQualityContainer) {
      pngQualityContainer.classList.toggle('hidden', format !== 'png');
    }
    if (pngSplitContainer) {
      pngSplitContainer.classList.toggle('hidden', format !== 'png');
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
    setBtnLabel(
      exportBtn,
      format === 'png'
        ? t('loadingContent') || 'Opening Preview...'
        : format === 'pdf'
          ? t('loadingContent') || 'Opening PDF Preview...'
          : t('statusExporting') || 'Exporting...',
    );

    try {
      if (format === 'pdf' || format === 'png') {
        const formatToRequest = format === 'pdf' ? 'html' : 'markdown';
        const response = await sendTabMessage({
          action: 'COPY_CHAT',
          // The preview applies the attachments option itself, so it needs them all.
          includeAttachments: true,
          format: formatToRequest,
          includeImages: includeImagesCheckbox.checked,
          parserMode: storedSettings.parserMode || 'auto',
          articleEngine: storedSettings.articleEngine || 'auto',
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
            splitLongPng: pngSplitCheckbox ? pngSplitCheckbox.checked : true,
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
          splitLongPng: pngSplitCheckbox ? pngSplitCheckbox.checked : true,
          parserMode: storedSettings.parserMode || 'auto',
          articleEngine: storedSettings.articleEngine || 'auto',
          theme: storedSettings.theme || 'system',
          includeThinking: storedSettings.includeThinking !== false,
          includeAttachments: storedSettings.includeAttachments !== false,
          includeTimestamps: storedSettings.includeTimestamps === true,
          includeToc: storedSettings.includeToc === true,
          pageBreakPerPrompt: storedSettings.pageBreakPerPrompt === true,
          messageNumbering: storedSettings.messageNumbering || 'off',
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
    setBtnLabel(copyBtn, t('statusExporting') || 'Copying...');
    setStatus('exporting', t('statusExporting') || 'Copying...');

    try {
      const response = await sendTabMessage({
        action: 'COPY_CHAT',
        format: format,
        includeImages: includeImagesCheckbox.checked,
        parserMode: storedSettings.parserMode || 'auto',
        articleEngine: storedSettings.articleEngine || 'auto',
        theme: storedSettings.theme || 'system',
        includeThinking: storedSettings.includeThinking !== false,
        includeAttachments: storedSettings.includeAttachments !== false,
        includeTimestamps: storedSettings.includeTimestamps === true,
        includeToc: storedSettings.includeToc === true,
        pageBreakPerPrompt: storedSettings.pageBreakPerPrompt === true,
        messageNumbering: storedSettings.messageNumbering || 'off',
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
      setBtnLabel(copyBtn, isCurrentArticle ? 'Copy' : t('copyChat') || 'Copy');
    }
  });

  previewBtn.addEventListener('click', async () => {
    const format = formatSelect.value;
    previewBtn.disabled = true;
    setBtnLabel(previewBtn, t('loadingContent') || 'Opening...');
    setStatus('exporting', t('loadingContent') || 'Opening...');

    try {
      const formatToRequest = format === 'pdf' ? 'html' : format === 'png' ? 'markdown' : format;
      const response = await sendTabMessage({
        action: 'COPY_CHAT',
        // The preview applies the attachments option itself, so it needs them all.
        includeAttachments: true,
        format: formatToRequest,
        includeImages: includeImagesCheckbox.checked,
        parserMode: storedSettings.parserMode || 'auto',
        articleEngine: storedSettings.articleEngine || 'auto',
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
          splitLongPng: pngSplitCheckbox ? pngSplitCheckbox.checked : true,
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
      setBtnLabel(previewBtn, t('openInTab') || 'Open in Workspace');
    }
  });

  const transferBtn = document.getElementById('transfer-btn');

  if (transferBtn) {
    transferBtn.addEventListener('click', async () => {
      const targetPlatform = continueTargetSelect ? continueTargetSelect.value : 'chatgpt';
      transferBtn.disabled = true;
      setBtnLabel(transferBtn, t('statusExporting') || 'Transferring...');
      setStatus('exporting', t('statusExporting') || 'Transferring...');
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        chrome.storage.sync.set({ lastTransferTarget: targetPlatform });
      }

      try {
        const response = await sendTabMessage({
          action: 'GET_CONTINUATION_PAYLOAD',
          includeImages: includeImagesCheckbox.checked,
          parserMode: storedSettings.parserMode || 'auto',
          articleEngine: storedSettings.articleEngine || 'auto',
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
        setBtnLabel(transferBtn, t('transferBtn') || 'Transfer');
      }
    });
  }

  const batchExportBtn = document.getElementById('batch-export-btn');
  const batchModeSelect = document.getElementById('batch-mode-select');
  const batchProgress = document.getElementById('batch-progress');

  let hasDownloadsPermission = false;
  hasPermission('downloads').then((granted) => {
    hasDownloadsPermission = granted;
  });

  async function ensureDownloadsPermission() {
    if (hasDownloadsPermission) return true;
    const granted = await requestPermission('downloads');
    if (granted) {
      hasDownloadsPermission = true;
      return true;
    }
    return false;
  }

  async function triggerBatchExport(mode) {
    const currentWin = await chrome.windows.getCurrent();
    const noteAppTargets = ['obsidian', 'logseq', 'bear', 'noteplan', 'drafts'];
    let targetAi = continueTargetSelect ? continueTargetSelect.value : 'chatgpt';
    if (noteAppTargets.includes(targetAi)) {
      targetAi = 'chatgpt';
    }
    await chrome.runtime.sendMessage({
      action: 'BATCH_EXPORT_TABS',
      mode,
      windowId: currentWin.id,
      targetAi,
      options: {
        includeImages: includeImagesCheckbox ? includeImagesCheckbox.checked : true,
      },
    });
  }

  function handleBatchComplete(result) {
    if (!batchProgress) return;
    const extracted = result?.extracted || 0;
    const total = result?.total || extracted;
    const failed = result?.failed || 0;
    if (failed > 0) {
      batchProgress.textContent = `✓ Exported ${extracted} of ${total} tabs (${failed} skipped/failed)`;
    } else {
      batchProgress.textContent = `✓ Exported ${extracted} tabs!`;
    }
    setTimeout(() => {
      batchProgress.classList.add('hidden');
      if (batchExportBtn) batchExportBtn.disabled = false;
    }, 2500);
  }

  if (batchExportBtn) {
    batchExportBtn.addEventListener('click', async () => {
      const mode = batchModeSelect ? batchModeSelect.value : 'zip';

      if (mode === 'zip' || mode === 'combined') {
        const permitted = await ensureDownloadsPermission();
        if (!permitted) {
          if (batchProgress) {
            batchProgress.classList.remove('hidden');
            batchProgress.textContent =
              t('batchDownloadPermissionDenied') ||
              'Downloads permission is required to save batch files.';
            setTimeout(() => {
              batchProgress.classList.add('hidden');
            }, 4000);
          }
          return;
        }
      }

      batchExportBtn.disabled = true;
      if (batchProgress) {
        batchProgress.classList.remove('hidden');
        batchProgress.textContent = 'Processing open tabs...';
      }

      try {
        await triggerBatchExport(mode);
      } catch (err) {
        logger.error('Failed to trigger batch export:', err);
        if (batchProgress) batchProgress.textContent = 'Batch export failed.';
        batchExportBtn.disabled = false;
      }
    });

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === 'BATCH_PROGRESS' && batchProgress) {
        batchProgress.classList.remove('hidden');
        batchProgress.textContent = `Extracting ${msg.processed} of ${msg.total} tabs...`;
      } else if (msg.action === 'BATCH_COMPLETE') {
        handleBatchComplete(msg.result);
      } else if (msg.action === 'BATCH_ERROR') {
        if (batchProgress) {
          batchProgress.textContent = `⚠️ Error: ${msg.error || 'Failed'}`;
        }
        if (batchExportBtn) batchExportBtn.disabled = false;
      }
    });
  }

  // Update batch tab count badge
  const batchTabCountEl = document.getElementById('batch-tab-count');
  if (batchTabCountEl && typeof chrome !== 'undefined' && chrome.tabs?.query) {
    chrome.tabs
      .query({ currentWindow: true })
      .then((tabs) => {
        const httpTabs = (tabs || []).filter(
          (tItem) =>
            tItem.url && (tItem.url.startsWith('http://') || tItem.url.startsWith('https://')),
        );
        if (httpTabs.length > 0) {
          batchTabCountEl.textContent = String(httpTabs.length);
          batchTabCountEl.classList.remove('hidden');
        }
      })
      .catch(() => {});
  }

  // Shortcut Cheat Sheet & Local Single-Key Dispatcher
  const shortcutSheet = createShortcutSheet({
    title: 'Popup Shortcuts',
    localShortcuts: [
      { key: '1 / 2 / 3', label: 'Switch Export / Transfer / Batch tab' },
      { key: 'O', label: 'Open in Workspace' },
      { key: 'E', label: 'Export current tab (or Batch in Batch tab)' },
      { key: 'C', label: 'Copy to clipboard' },
      { key: 'T', label: 'Transfer conversation' },
      { key: 'M', label: 'Cycle Extraction Mode / Article Engine' },
      { key: 'P', label: 'Toggle Options menu' },
      { key: 'R', label: 'Reparse conversation' },
      { key: '?', label: 'Show / hide shortcuts' },
    ],
  });

  if (shortcutHelpBtn) {
    shortcutHelpBtn.addEventListener('click', () => shortcutSheet.toggle());
  }

  function cycleSelectValue(selectEl) {
    if (!selectEl || !selectEl.options.length) return;
    const nextIdx = (selectEl.selectedIndex + 1) % selectEl.options.length;
    selectEl.selectedIndex = nextIdx;
    selectEl.dispatchEvent(new Event('change'));
  }

  registerShortcutHandler(
    {
      1: () => switchPopupTab('export'),
      2: () => switchPopupTab('transfer'),
      3: () => switchPopupTab('batch'),
      o: () => {
        if (previewBtn && !previewBtn.classList.contains('hidden')) previewBtn.click();
      },
      e: () => {
        if (popupTabPanels.batch?.classList.contains('active')) {
          batchExportBtn?.click();
        } else if (exportBtn && !exportBtn.classList.contains('hidden')) {
          exportBtn.click();
        }
      },
      c: () => {
        if (copyBtn && !copyBtn.classList.contains('hidden')) copyBtn.click();
      },
      t: () => {
        switchPopupTab('transfer');
        transferBtn?.click();
      },
      m: () => {
        if (isCurrentArticle) {
          cycleSelectValue(articleEngineSelectPopup);
        } else {
          cycleSelectValue(parserModeSelect);
        }
      },
      p: () => popupOptionsBtn?.click(),
      r: () => reparseBtn?.click(),
      '?': () => shortcutSheet.toggle(),
    },
    {
      onEscape: () => {
        if (shortcutSheet.isOpen()) {
          shortcutSheet.close();
        } else if (popupOptionsMenu && !popupOptionsMenu.classList.contains('hidden')) {
          popupOptionsMenu.classList.add('hidden');
          popupOptionsBtn?.setAttribute('aria-expanded', 'false');
        }
      },
    },
  );
});
