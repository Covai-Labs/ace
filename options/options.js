import { initI18n, applyI18n, t } from '../content/utils/i18n.js';
import { formatFilename, DEFAULT_FILENAME_TEMPLATE } from '../content/utils/filename.js';
import { DEFAULT_TRANSFER_PROMPT_TEMPLATE } from '../content/formatters/continuation.js';

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

  const themeSelect = document.getElementById('theme-select');
  const languageSelect = document.getElementById('language-select');
  const defaultFormatSelect = document.getElementById('default-format-select');
  const defaultIncludeImages = document.getElementById('default-include-images');
  const includeAttribution = document.getElementById('include-attribution');
  const filenameTemplateInput = document.getElementById('filename-template-input');
  const filenamePreview = document.getElementById('filename-preview');
  const parserModeSelect = document.getElementById('parser-mode-select');
  const defaultTransferSelect = document.getElementById('default-transfer-select');
  const launchModeSection = document.getElementById('launch-mode-section');
  const launchModeRadios = document.querySelectorAll('input[name="launch-mode"]');
  const firefoxSidebarSection = document.getElementById('firefox-sidebar-section');
  const toast = document.getElementById('toast');

  let toastTimer = null;
  function showToast(message) {
    const toastMsg = message || t('toastSaved') || 'Preferences saved!';
    toast.textContent = toastMsg;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2000);
  }

  function updateFilenamePreview(template) {
    if (!filenamePreview) return;
    const sampleDate = new Date();
    filenamePreview.textContent = formatFilename(template || DEFAULT_FILENAME_TEMPLATE, {
      platform: 'Gemini',
      title: 'Comparing Markdown and PDF',
      date: sampleDate,
    });
  }

  const isFirefox =
    (typeof navigator !== 'undefined' && navigator.userAgent.includes('Firefox')) ||
    (typeof browser !== 'undefined' &&
      typeof browser.runtime !== 'undefined' &&
      Boolean(browser.runtime.getBrowserInfo));
  if (isFirefox) {
    if (launchModeSection) launchModeSection.classList.add('hidden');
    if (firefoxSidebarSection) firefoxSidebarSection.classList.remove('hidden');
  } else {
    if (launchModeSection) launchModeSection.classList.remove('hidden');
    if (firefoxSidebarSection) firefoxSidebarSection.classList.add('hidden');
  }

  const obsidianVaultInput = document.getElementById('obsidian-vault-input');

  const stored = await chrome.storage.sync.get([
    'theme',
    'uiLanguage',
    'defaultFormat',
    'includeImages',
    'includeAttribution',
    'filenameTemplate',
    'parserMode',
    'defaultTransferTarget',
    'obsidianVaultName',
    'launchMode',
    'transferAutoSend',
    'transferCopyToClipboard',
    'transferPromptTemplate',
  ]);

  const activeTheme = stored.theme || 'system';
  if (themeSelect) {
    const matchedVal =
      activeTheme === 'modern-dark'
        ? 'dark'
        : activeTheme === 'modern-light'
          ? 'light'
          : activeTheme;
    themeSelect.value = matchedVal;
  }
  applyTheme(activeTheme);

  const activeLanguage = stored.uiLanguage || 'auto';
  if (languageSelect) languageSelect.value = activeLanguage;

  if (stored.defaultFormat) defaultFormatSelect.value = stored.defaultFormat;
  if (stored.includeImages !== undefined) defaultIncludeImages.checked = stored.includeImages;
  if (stored.includeAttribution !== undefined)
    includeAttribution.checked = stored.includeAttribution;
  if (filenameTemplateInput) {
    filenameTemplateInput.value = stored.filenameTemplate || DEFAULT_FILENAME_TEMPLATE;
    updateFilenamePreview(filenameTemplateInput.value);
  }
  if (stored.parserMode) parserModeSelect.value = stored.parserMode;
  if (stored.defaultTransferTarget) defaultTransferSelect.value = stored.defaultTransferTarget;
  if (stored.obsidianVaultName && obsidianVaultInput)
    obsidianVaultInput.value = stored.obsidianVaultName;
  if (stored.launchMode && !isFirefox) {
    const radio = document.querySelector(`input[name="launch-mode"][value="${stored.launchMode}"]`);
    if (radio) radio.checked = true;
  }

  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      const selectedTheme = themeSelect.value;
      chrome.storage.sync.set({ theme: selectedTheme });
      applyTheme(selectedTheme);
      showToast();
    });
  }

  if (languageSelect) {
    languageSelect.addEventListener('change', async () => {
      const selectedLang = languageSelect.value;
      await chrome.storage.sync.set({ uiLanguage: selectedLang });
      await initI18n(selectedLang);
      applyI18n();
      showToast();
    });
  }

  defaultFormatSelect.addEventListener('change', () => {
    chrome.storage.sync.set({ defaultFormat: defaultFormatSelect.value });
    showToast();
  });

  defaultIncludeImages.addEventListener('change', () => {
    chrome.storage.sync.set({ includeImages: defaultIncludeImages.checked });
    showToast();
  });

  includeAttribution.addEventListener('change', () => {
    chrome.storage.sync.set({ includeAttribution: includeAttribution.checked });
    showToast();
  });

  if (filenameTemplateInput) {
    filenameTemplateInput.addEventListener('input', () => {
      updateFilenamePreview(filenameTemplateInput.value);
    });
    filenameTemplateInput.addEventListener('change', () => {
      const template = filenameTemplateInput.value.trim() || DEFAULT_FILENAME_TEMPLATE;
      filenameTemplateInput.value = template;
      chrome.storage.sync.set({ filenameTemplate: template });
      updateFilenamePreview(template);
      showToast();
    });
  }

  parserModeSelect.addEventListener('change', () => {
    chrome.storage.sync.set({ parserMode: parserModeSelect.value });
    showToast();
  });

  defaultTransferSelect.addEventListener('change', () => {
    chrome.storage.sync.set({ defaultTransferTarget: defaultTransferSelect.value });
    showToast();
  });

  if (obsidianVaultInput) {
    obsidianVaultInput.addEventListener('change', () => {
      chrome.storage.sync.set({ obsidianVaultName: obsidianVaultInput.value.trim() });
      showToast();
    });
  }

  const transferAutosendCheckbox = document.getElementById('transfer-autosend-checkbox');
  if (transferAutosendCheckbox) {
    transferAutosendCheckbox.checked = stored.transferAutoSend !== false;
    transferAutosendCheckbox.addEventListener('change', () => {
      chrome.storage.sync.set({ transferAutoSend: transferAutosendCheckbox.checked });
      showToast();
    });
  }

  const transferCopyClipboardCheckbox = document.getElementById('transfer-copy-clipboard-checkbox');
  if (transferCopyClipboardCheckbox) {
    transferCopyClipboardCheckbox.checked = stored.transferCopyToClipboard === true;
    transferCopyClipboardCheckbox.addEventListener('change', () => {
      chrome.storage.sync.set({ transferCopyToClipboard: transferCopyClipboardCheckbox.checked });
      showToast();
    });
  }

  const transferPromptInput = document.getElementById('transfer-prompt-input');
  const transferPromptReset = document.getElementById('transfer-prompt-reset');
  if (transferPromptInput) {
    transferPromptInput.value = stored.transferPromptTemplate || DEFAULT_TRANSFER_PROMPT_TEMPLATE;
    transferPromptInput.addEventListener('change', () => {
      const value = transferPromptInput.value.trim() || DEFAULT_TRANSFER_PROMPT_TEMPLATE;
      transferPromptInput.value = value.includes('{history}')
        ? value
        : DEFAULT_TRANSFER_PROMPT_TEMPLATE;
      chrome.storage.sync.set({ transferPromptTemplate: transferPromptInput.value });
      showToast();
    });
  }
  if (transferPromptReset) {
    transferPromptReset.addEventListener('click', () => {
      if (transferPromptInput) transferPromptInput.value = DEFAULT_TRANSFER_PROMPT_TEMPLATE;
      chrome.storage.sync.set({ transferPromptTemplate: DEFAULT_TRANSFER_PROMPT_TEMPLATE });
      showToast();
    });
  }

  launchModeRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked && !isFirefox) {
        chrome.storage.sync.set({ launchMode: radio.value });
        showToast();
      }
    });
  });

  const chromeShortcutsAction = document.getElementById('chrome-shortcuts-action');
  const firefoxShortcutsAction = document.getElementById('firefox-shortcuts-action');
  const configureShortcutsBtn = document.getElementById('configure-shortcuts-btn');
  const copyAboutAddonsBtn = document.getElementById('copy-about-addons-btn');

  if (isFirefox) {
    if (chromeShortcutsAction) chromeShortcutsAction.classList.add('hidden');
    if (firefoxShortcutsAction) firefoxShortcutsAction.classList.remove('hidden');
  } else {
    if (chromeShortcutsAction) chromeShortcutsAction.classList.remove('hidden');
    if (firefoxShortcutsAction) firefoxShortcutsAction.classList.add('hidden');
  }

  if (configureShortcutsBtn) {
    configureShortcutsBtn.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
      }
    });
  }

  if (copyAboutAddonsBtn) {
    copyAboutAddonsBtn.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText('about:addons');
        }
        showToast(t('copiedAboutAddons') || 'Copied!');
      } catch {
        showToast('about:addons');
      }
    });
  }

  const copySystemInfoBtn = document.getElementById('copy-system-info-btn');
  if (copySystemInfoBtn) {
    copySystemInfoBtn.addEventListener('click', async () => {
      const manifest =
        typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest
          ? chrome.runtime.getManifest()
          : { version: '1.12.1' };

      const userAgent = navigator.userAgent || 'Unknown';
      let browserName = 'Unknown';
      if (userAgent.includes('Firefox/')) {
        const match = userAgent.match(/Firefox\/([\d.]+)/);
        browserName = `Mozilla Firefox ${match ? match[1] : ''}`.trim();
      } else if (userAgent.includes('Edg/')) {
        const match = userAgent.match(/Edg\/([\d.]+)/);
        browserName = `Microsoft Edge ${match ? match[1] : ''}`.trim();
      } else if (userAgent.includes('Chrome/')) {
        const match = userAgent.match(/Chrome\/([\d.]+)/);
        browserName = `Google Chrome / Chromium ${match ? match[1] : ''}`.trim();
      } else if (userAgent.includes('Safari/')) {
        browserName = 'Safari';
      }

      const platform =
        navigator.platform ||
        (navigator.userAgentData && navigator.userAgentData.platform) ||
        'Unknown';
      const language = navigator.language || 'en';

      const debugInfo = [
        '### System & Environment Info',
        `- **Extension Version:** ${manifest.version || '1.12.1'}`,
        `- **Browser:** ${browserName}`,
        `- **Platform / OS:** ${platform}`,
        `- **Language:** ${language}`,
        `- **User Agent:** \`${userAgent}\``,
      ].join('\n');

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(debugInfo);
        }
        showToast(t('systemInfoCopied') || 'System info copied to clipboard!');
      } catch {
        showToast('System info copied!');
      }
    });
  }

  const feedbackLink = document.getElementById('feedback-link');
  if (feedbackLink) {
    const manifest =
      typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest
        ? chrome.runtime.getManifest()
        : { version: '1.12.1' };
    const userAgent = navigator.userAgent || '';
    let browser = 'Other';
    if (userAgent.includes('Firefox/')) browser = 'Firefox';
    else if (userAgent.includes('Edg/')) browser = 'Edge';
    else if (userAgent.includes('Chrome/')) browser = 'Chrome';
    else if (userAgent.includes('Safari/')) browser = 'Safari';

    const os = navigator.platform || '';
    const params = new URLSearchParams({
      v: manifest.version || '1.12.1',
      app_version: manifest.version || '1.12.1',
      browser: browser,
      os: os,
    });
    feedbackLink.href = `https://ace.covai.org/feedback.html?${params.toString()}`;
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(async (changes, areaName) => {
      if (areaName === 'sync') {
        if (changes.theme) {
          const newTheme = changes.theme.newValue || 'system';
          const matchedVal =
            newTheme === 'modern-dark' ? 'dark' : newTheme === 'modern-light' ? 'light' : newTheme;
          if (themeSelect) themeSelect.value = matchedVal;
          applyTheme(newTheme);
        }
        if (changes.uiLanguage) {
          const newLang = changes.uiLanguage.newValue || 'auto';
          if (languageSelect) languageSelect.value = newLang;
          await initI18n(newLang);
          applyI18n();
        }
      }
    });
  }
});
