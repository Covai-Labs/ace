import { normalizeMessageNumbering } from '../formatters/base.js';

export const DEFAULT_INCLUDE_ATTRIBUTION = true;
export const DEFAULT_INCLUDE_THINKING = true;
export const DEFAULT_MESSAGE_NUMBERING = 'off';
export const DEFAULT_THEME = 'system';

export async function getAttributionSetting() {
  try {
    const syncData = await chrome.storage.sync.get('includeAttribution');
    if (syncData && syncData.includeAttribution !== undefined) {
      return syncData.includeAttribution;
    }
  } catch {
    // Ignore storage errors and fall back to the default
  }
  return DEFAULT_INCLUDE_ATTRIBUTION;
}

export async function getMessageNumberingSetting() {
  try {
    const syncData = await chrome.storage.sync.get('messageNumbering');
    if (syncData && syncData.messageNumbering !== undefined) {
      return normalizeMessageNumbering(syncData.messageNumbering);
    }
  } catch {
    // Ignore storage errors and fall back to the default
  }
  return DEFAULT_MESSAGE_NUMBERING;
}

/**
 * Reads and normalizes all export-relevant preferences from chrome.storage.sync.
 * @param {Record<string, any>} [overrides]
 * @returns {Promise<{ theme: string, includeAttribution: boolean, messageNumbering: string, [key: string]: any }>}
 */
export async function getExportOptions(overrides = {}) {
  let theme = DEFAULT_THEME;
  let includeAttribution = DEFAULT_INCLUDE_ATTRIBUTION;
  let includeThinking = DEFAULT_INCLUDE_THINKING;
  let messageNumbering = DEFAULT_MESSAGE_NUMBERING;

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      const syncData = await chrome.storage.sync.get([
        'theme',
        'includeAttribution',
        'includeThinking',
        'messageNumbering',
      ]);
      if (syncData) {
        if (syncData.theme) theme = syncData.theme;
        if (syncData.includeAttribution !== undefined) {
          includeAttribution = syncData.includeAttribution;
        }
        if (syncData.includeThinking !== undefined) {
          includeThinking = syncData.includeThinking !== false;
        }
        if (syncData.messageNumbering !== undefined) {
          messageNumbering = normalizeMessageNumbering(syncData.messageNumbering);
        }
      }
    }
  } catch {
    // Fall back to defaults on storage failure or standalone mode
  }

  const cleanOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  );

  return {
    theme,
    includeAttribution,
    includeThinking,
    messageNumbering,
    ...cleanOverrides,
  };
}

/**
 * Updates an in-memory export options object when chrome.storage.onChanged fires.
 * @param {Record<string, any>} currentOptions
 * @param {Record<string, { newValue?: any, oldValue?: any }>} changes
 * @returns {boolean} True if any export-related option changed.
 */
export function applyExportOptionChanges(currentOptions, changes) {
  if (!changes || !currentOptions) return false;
  let changed = false;

  if (changes.theme) {
    currentOptions.theme = changes.theme.newValue || DEFAULT_THEME;
    changed = true;
  }
  if (changes.includeAttribution) {
    currentOptions.includeAttribution = changes.includeAttribution.newValue !== false;
    changed = true;
  }
  if (changes.includeThinking) {
    currentOptions.includeThinking = changes.includeThinking.newValue !== false;
    changed = true;
  }
  if (changes.messageNumbering) {
    currentOptions.messageNumbering = normalizeMessageNumbering(changes.messageNumbering.newValue);
    changed = true;
  }

  return changed;
}
