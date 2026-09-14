/**
 * Internationalization (i18n) Helper Module for AI Chat Exporter
 */

export const SUPPORTED_LANGUAGES = [
  { code: 'auto', nameKey: 'languageAuto', defaultName: 'Browser Default (Auto-detect)' },
  { code: 'en', name: 'English' },
  { code: 'ru', name: 'Русский (Russian)' },
  { code: 'ta', name: 'தமிழ் (Tamil)' },
  { code: 'es', name: 'Español (Spanish)' },
  { code: 'zh_CN', name: '简体中文 (Simplified Chinese)' },
  { code: 'zh_TW', name: '繁體中文 (Traditional Chinese)' },
  { code: 'ja', name: '日本語 (Japanese)' },
  { code: 'de', name: 'Deutsch (German)' },
  { code: 'fr', name: 'Français (French)' },
  { code: 'hi', name: 'हिन्दी (Hindi)' },
  { code: 'pt_BR', name: 'Português (Portuguese)' },
  { code: 'it', name: 'Italiano (Italian)' },
  { code: 'ko', name: '한국어 (Korean)' },
];

let currentLocale = 'auto';
let localeDictionary = null;
let fallbackDictionary = null;

/**
 * Load a messages.json dictionary for a specific locale
 * @param {string} locale
 * @returns {Promise<Record<string, { message: string }> | null>}
 */
async function loadLocaleDictionary(locale) {
  if (!locale || locale === 'auto') return null;

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
    } else if (typeof process !== 'undefined' && process.versions?.node) {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const filePath = path.resolve('public', '_locales', locale, 'messages.json');
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    }
  } catch {
    // Fallback if fetch/read fails
  }
  return null;
}

/**
 * Initialize i18n settings and load locale dictionary
 * @param {string} [preferredLocale]
 */
export async function initI18n(preferredLocale) {
  if (preferredLocale) {
    currentLocale = preferredLocale;
  } else if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    try {
      const data = await chrome.storage.sync.get(['uiLanguage']);
      currentLocale = data.uiLanguage || 'auto';
    } catch {
      currentLocale = 'auto';
    }
  } else {
    currentLocale = 'auto';
  }

  if (currentLocale !== 'auto') {
    localeDictionary = await loadLocaleDictionary(currentLocale);
  } else {
    localeDictionary = null;
  }

  // Preload English fallback dictionary
  if (!fallbackDictionary) {
    fallbackDictionary = await loadLocaleDictionary('en');
  }

  return currentLocale;
}

/**
 * Format string message with substitutions (e.g. $1 or $COUNT$)
 * @param {string} message
 * @param {string|number|Array<string|number>|Record<string, string|number>} [substitutions]
 * @returns {string}
 */
export function formatMessage(message, substitutions) {
  if (!message || substitutions === undefined || substitutions === null) {
    return message;
  }

  if (Array.isArray(substitutions)) {
    return substitutions.reduce(
      (msg, val, index) => msg.replace(new RegExp(`\\$${index + 1}`, 'g'), String(val)),
      message,
    );
  }

  if (typeof substitutions === 'object') {
    return Object.entries(substitutions).reduce((msg, [key, val]) => {
      const normalizedKey = key.toUpperCase();
      return msg
        .replace(new RegExp(`\\$${normalizedKey}\\$`, 'g'), String(val))
        .replace(new RegExp(`\\{${key}\\}`, 'g'), String(val));
    }, message);
  }

  // Single scalar substitution: replace $1 or $COUNT$
  return message
    .replace(/\$1/g, String(substitutions))
    .replace(/\$COUNT\$/g, String(substitutions))
    .replace(/\{count\}/gi, String(substitutions));
}

/**
 * Get localized message by key
 * @param {string} key
 * @param {string|number|Array<string|number>|Record<string, string|number>} [substitutions]
 * @returns {string}
 */
export function t(key, substitutions) {
  if (!key) return '';

  // 1. Check loaded custom locale dictionary
  if (localeDictionary && localeDictionary[key]?.message) {
    return formatMessage(localeDictionary[key].message, substitutions);
  }

  // 2. Check native chrome.i18n if locale is auto
  if (currentLocale === 'auto' && typeof chrome !== 'undefined' && chrome.i18n?.getMessage) {
    const nativeMsg = chrome.i18n.getMessage(
      key,
      Array.isArray(substitutions)
        ? substitutions.map(String)
        : substitutions !== undefined
          ? [String(substitutions)]
          : undefined,
    );
    if (nativeMsg) {
      return formatMessage(nativeMsg, substitutions);
    }
  }

  // 3. Fallback dictionary (en)
  if (fallbackDictionary && fallbackDictionary[key]?.message) {
    return formatMessage(fallbackDictionary[key].message, substitutions);
  }

  // 4. Native chrome.i18n fallback
  if (typeof chrome !== 'undefined' && chrome.i18n?.getMessage) {
    const fallbackMsg = chrome.i18n.getMessage(key);
    if (fallbackMsg) {
      return formatMessage(fallbackMsg, substitutions);
    }
  }

  return key;
}

export const getMessage = t;

/**
 * Apply translations to DOM elements in the document or container
 * @param {HTMLElement|Document} [root=document]
 */
export function applyI18n(root = document) {
  if (!root || !root.querySelectorAll) return;

  // Text content
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const translation = t(key);
    if (translation && translation !== key) {
      el.textContent = translation;
    }
  });

  // Placeholder attribute
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (!key) return;
    const translation = t(key);
    if (translation && translation !== key) {
      el.placeholder = translation;
    }
  });

  // Title attribute
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (!key) return;
    const translation = t(key);
    if (translation && translation !== key) {
      el.title = translation;
    }
  });

  // Aria-label attribute
  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria-label');
    if (!key) return;
    const translation = t(key);
    if (translation && translation !== key) {
      el.setAttribute('aria-label', translation);
    }
  });

  // Label attribute (e.g. optgroup headings in transfer target selects)
  root.querySelectorAll('[data-i18n-label]').forEach((el) => {
    const key = el.getAttribute('data-i18n-label');
    if (!key) return;
    const translation = t(key);
    if (translation && translation !== key) {
      el.setAttribute('label', translation);
    }
  });

  // Format options inside selects
  root
    .querySelectorAll('select#format-select option, select#default-format-select option')
    .forEach((opt) => {
      const formatKey = {
        markdown: 'formatMarkdown',
        json: 'formatJson',
        html: 'formatHtml',
        doc: 'formatDoc',
        png: 'formatPng',
        pdf: 'formatPdf',
      }[opt.value];
      if (formatKey) {
        const translation = t(formatKey);
        if (translation && translation !== formatKey) {
          opt.textContent = translation;
        }
      }
    });

  // Theme options inside select
  root.querySelectorAll('select#theme-select option').forEach((opt) => {
    const themeKey = {
      system: 'themeSystem',
      light: 'themeLight',
      dark: 'themeDark',
    }[opt.value];
    if (themeKey) {
      const translation = t(themeKey);
      if (translation && translation !== themeKey) {
        opt.textContent = translation;
      }
    }
  });

  // Parser mode options inside select
  root.querySelectorAll('select#parser-mode-select option').forEach((opt) => {
    const parserKey = {
      auto: 'parserModeAuto',
      prefer_dom: 'parserModeDom',
      prefer_api: 'parserModeApi',
    }[opt.value];
    if (parserKey) {
      const translation = t(parserKey);
      if (translation && translation !== parserKey) {
        opt.textContent = translation;
      }
    }
  });
}

/**
 * Get the current active locale code
 * @returns {string}
 */
export function getCurrentLocale() {
  return currentLocale;
}
