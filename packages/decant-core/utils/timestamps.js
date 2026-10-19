/**
 * Shared per-message timestamp normalization (decant-core).
 *
 * Parsers attach `timestamp` as ISO strings, locale strings, or numeric
 * epochs (seconds or milliseconds). Display layers (ace) format whatever
 * string they receive, so this helper keeps ISO/locale strings as-is and
 * converts numeric epochs to ISO.
 *
 * Turn-granularity sources (Perplexity entries, Meta edges, DeepSeek pairs)
 * reuse the same timestamp for both prompt and response — callers pass the
 * same value to both messages.
 */

/** Epoch values with abs < 1e11 are treated as seconds, else milliseconds. */
export function normalizeEpochToMs(value) {
  if (Math.abs(value) < 1e11) return value * 1000;
  return value;
}

/**
 * Normalizes a raw timestamp to a display-ready string.
 * @param {unknown} value ISO string, locale string, epoch number, or numeric string.
 * @returns {string|null} ISO string for epochs, trimmed input for date strings, else null.
 */
export function normalizeTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    try {
      return new Date(normalizeEpochToMs(value)).toISOString();
    } catch {
      return null;
    }
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        try {
          return new Date(normalizeEpochToMs(numeric)).toISOString();
        } catch {
          return null;
        }
      }
      return null;
    }
    return trimmed;
  }
  return null;
}

/**
 * Picks the first available timestamp from candidate fields.
 * @param {object} source Parser payload object.
 * @param {string[]} keys Field names to try in order.
 * @returns {string|null}
 */
export function pickTimestamp(source, keys) {
  if (!source || !Array.isArray(keys)) return null;
  for (const key of keys) {
    const normalized = normalizeTimestamp(source[key]);
    if (normalized) return normalized;
  }
  return null;
}
