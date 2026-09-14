// Per-tab transfer record storage.
//
// Each transfer owns keys scoped to the tab it created (`xfer_<tabId>`), so
// concurrent transfers never read-modify-write shared state. The content
// script picks its record by matching the stored target origin against the
// page it runs on — it never needs to know its own tab id.

export const TRANSFER_KEY_PREFIX = 'xfer_';
export const LEGACY_TRANSFER_KEY = 'pendingContinuation';
export const TRANSFER_TTL_MS = 300000;
export const CHUNK_SIZE = 700000;
export const MAX_CHUNKS = 10;

export function transferKey(tabId) {
  return `${TRANSFER_KEY_PREFIX}${tabId}`;
}

export function chunkKey(tabId, index) {
  return `${TRANSFER_KEY_PREFIX}${tabId}_c${index}`;
}

export function splitPayload(text) {
  const parts = [];
  const src = text || '';
  for (let i = 0; i < src.length; i += CHUNK_SIZE) {
    parts.push(src.slice(i, i + CHUNK_SIZE));
  }
  return parts.length > 0 ? parts : [''];
}

function isFresh(record, now) {
  return record && typeof record.timestamp === 'number' && now - record.timestamp < TRANSFER_TTL_MS;
}

function originMatches(recordUrl, origin) {
  if (!recordUrl) return true;
  try {
    return new URL(recordUrl).origin === origin;
  } catch {
    return true;
  }
}

/**
 * Pick the newest fresh record for this origin from a full storage dump.
 * Pure — covered by unit tests.
 */
export function pickTransferRecord(dump, origin, now = Date.now()) {
  if (!dump || typeof dump !== 'object') return null;
  let best = null;
  for (const [key, record] of Object.entries(dump)) {
    if (!key.startsWith(TRANSFER_KEY_PREFIX)) continue;
    if (key.includes('_c')) continue; // chunk part, not a record
    if (!record || typeof record !== 'object') continue;
    if (!isFresh(record, now)) continue;
    if (!originMatches(record.url, origin)) continue;
    if (!best || (record.timestamp || 0) > (best.record.timestamp || 0)) {
      best = { key, record };
    }
  }
  // Legacy singular-key fallback (pre-map transfers in flight during update).
  if (!best) {
    const legacy = dump[LEGACY_TRANSFER_KEY];
    if (
      legacy &&
      typeof legacy === 'object' &&
      isFresh(legacy, now) &&
      originMatches(legacy.url, origin) &&
      legacy.payload
    ) {
      best = { key: LEGACY_TRANSFER_KEY, record: legacy };
    }
  }
  return best;
}

/** Reassemble a chunked record from the dump. Returns null on missing parts. */
export function joinChunkedRecord(dump, key, record) {
  if (!record || !record.chunked) return record?.payload ?? null;
  const count = record.count || 0;
  if (count <= 0 || count > MAX_CHUNKS) return null;
  const tabId = key.slice(TRANSFER_KEY_PREFIX.length);
  const parts = [];
  for (let i = 0; i < count; i++) {
    const part = dump[chunkKey(tabId, i)];
    if (typeof part !== 'string') return null;
    parts.push(part);
  }
  return parts.join('');
}

/** Keys safe to delete (expired transfer records + their chunks). Pure. */
export function expiredTransferKeys(dump, now = Date.now()) {
  if (!dump || typeof dump !== 'object') return [];
  const liveTabIds = new Set();
  for (const [key, record] of Object.entries(dump)) {
    if (!key.startsWith(TRANSFER_KEY_PREFIX) || key.includes('_c')) continue;
    if (record && typeof record === 'object' && isFresh(record, now)) {
      liveTabIds.add(key.slice(TRANSFER_KEY_PREFIX.length));
    }
  }
  const dead = [];
  for (const key of Object.keys(dump)) {
    if (key === LEGACY_TRANSFER_KEY) {
      const legacy = dump[key];
      if (legacy && typeof legacy === 'object' && !isFresh(legacy, now)) dead.push(key);
      continue;
    }
    if (!key.startsWith(TRANSFER_KEY_PREFIX)) continue;
    const rest = key.slice(TRANSFER_KEY_PREFIX.length);
    const tabId = rest.includes('_c') ? rest.slice(0, rest.indexOf('_c')) : rest;
    if (!liveTabIds.has(tabId)) {
      const rec = dump[TRANSFER_KEY_PREFIX + tabId];
      if (!rec || !isFresh(rec, now)) dead.push(key);
    }
  }
  return dead;
}

/** Load + join our record. Returns { keys, record, payload } or null. */
export async function loadTransferRecord(storage, location, now = Date.now()) {
  let dump;
  try {
    dump = (await storage.get(null)) || {};
  } catch {
    return null;
  }
  const origin = location?.origin;
  const picked = pickTransferRecord(dump, origin, now);
  if (!picked) return null;

  let payload = picked.record.payload;
  let keys = [picked.key];
  if (picked.record.chunked) {
    const count = picked.record.count || 0;
    const tabId = picked.key.slice(TRANSFER_KEY_PREFIX.length);
    if (picked.key === LEGACY_TRANSFER_KEY || count <= 0) return null;
    let parts;
    try {
      const names = [];
      for (let i = 0; i < count; i++) names.push(chunkKey(tabId, i));
      parts = (await storage.get(names)) || {};
    } catch {
      return null;
    }
    payload = joinChunkedRecord({ ...dump, ...parts }, picked.key, picked.record);
    if (payload === null) return null;
    keys = [picked.key];
    for (let i = 0; i < count; i++) keys.push(chunkKey(tabId, i));
  }
  if (!payload) return null;
  return { keys, record: picked.record, payload };
}

export async function clearTransferRecord(storage, keys) {
  if (!keys || keys.length === 0) return;
  try {
    await storage.remove(keys);
  } catch {
    // Ignore
  }
}
