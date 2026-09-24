export const DEFAULT_INCLUDE_ATTRIBUTION = true;
export const DEFAULT_MESSAGE_NUMBERING = 'off';

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
    if (syncData && typeof syncData.messageNumbering === 'string') {
      if (syncData.messageNumbering === 'per-message' || syncData.messageNumbering === 'per-turn') {
        return syncData.messageNumbering;
      }
      if (syncData.messageNumbering === 'perMessage') return 'per-message';
      if (syncData.messageNumbering === 'perTurn') return 'per-turn';
    }
  } catch {
    // Ignore storage errors and fall back to the default
  }
  return DEFAULT_MESSAGE_NUMBERING;
}
