import { initI18n, applyI18n, t } from '../../content/utils/i18n.js';

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
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    try {
      const stored = await chrome.storage.sync.get(['theme']);
      applyTheme(stored.theme || 'system');
    } catch {
      // Ignore
    }
  }

  await initI18n();
  applyI18n();

  const statusEl = document.getElementById('sp-status');
  const headerRefreshBtn = document.getElementById('sp-refresh-btn');
  const headerCloseBtn = document.getElementById('sp-close-btn');
  const tabBtns = document.querySelectorAll('.sp-tab-btn');
  const tabContents = document.querySelectorAll('.sp-tab-content');

  if (headerCloseBtn) {
    headerCloseBtn.addEventListener('click', () => {
      if (
        typeof browser !== 'undefined' &&
        browser.sidebarAction &&
        typeof browser.sidebarAction.close === 'function'
      ) {
        browser.sidebarAction.close();
      } else if (typeof window !== 'undefined' && typeof window.close === 'function') {
        window.close();
      }
    });
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      tabBtns.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      const activeContent = document.getElementById(targetTab);
      if (activeContent) {
        activeContent.classList.add('active');
      }
    });
  });

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

  async function checkAvailability() {
    if (!statusEl) return;
    try {
      const activeTab = await getActiveTab();
      if (!activeTab || !activeTab.id) {
        statusEl.textContent = 'No Active Tab';
        return;
      }

      const response = await chrome.tabs.sendMessage(activeTab.id, {
        action: 'CHECK_AVAILABILITY',
      });

      if (response && response.available) {
        statusEl.textContent = `${t('statusReady') || 'Ready'}: ${response.platform}`;
      } else {
        statusEl.textContent = t('statusError') || 'Not Supported';
      }
    } catch {
      statusEl.textContent = t('statusError') || 'Not Supported';
    }
  }

  async function refreshAllPanels() {
    await checkAvailability();
    const iframes = document.querySelectorAll('.sp-tab-iframe');
    iframes.forEach((iframe) => {
      if (iframe && iframe.contentWindow) {
        try {
          iframe.contentWindow.postMessage({ action: 'REFRESH_PANEL' }, '*');
          iframe.contentWindow.location.reload();
        } catch {
          const currentSrc = iframe.src;
          iframe.src = currentSrc;
        }
      }
    });
  }

  let refreshDebounceTimer = null;
  function debouncedRefreshAllPanels(delayMs = 150) {
    if (refreshDebounceTimer) {
      clearTimeout(refreshDebounceTimer);
    }
    refreshDebounceTimer = setTimeout(() => {
      refreshAllPanels();
    }, delayMs);
  }

  if (headerRefreshBtn) {
    headerRefreshBtn.addEventListener('click', async () => {
      await refreshAllPanels();
    });
  }

  if (typeof chrome !== 'undefined' && chrome.tabs) {
    if (chrome.tabs.onActivated) {
      chrome.tabs.onActivated.addListener(() => {
        debouncedRefreshAllPanels();
      });
    }
    if (chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
        if (changeInfo.status === 'complete' || changeInfo.url || changeInfo.title) {
          const activeTab = await getActiveTab();
          if (activeTab && activeTab.id === tabId) {
            debouncedRefreshAllPanels();
          }
        }
      });
    }
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(async (changes, areaName) => {
      if (areaName === 'sync') {
        if (changes.theme) {
          applyTheme(changes.theme.newValue || 'system');
        }
        if (changes.uiLanguage) {
          await initI18n(changes.uiLanguage.newValue || 'auto');
          applyI18n();
        }
      }
    });
  }

  await checkAvailability();
});
