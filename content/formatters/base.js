/**
 * Message numbering modes for exported conversations (issue #74).
 * - 'off': no numbers (default, preserves current behavior)
 * - 'per-message': sequential 1..N across messages
 * - 'per-turn': user message starts a new turn, following assistant
 *   message(s) share that turn number
 */
export const MESSAGE_NUMBERING_MODES = ['off', 'per-message', 'per-turn'];

/**
 * Normalizes a stored numbering value to a supported mode.
 * @param {unknown} value
 * @returns {'off'|'per-message'|'per-turn'}
 */
export function normalizeMessageNumbering(value) {
  if (value === 'per-message' || value === 'perMessage') return 'per-message';
  if (value === 'per-turn' || value === 'perTurn') return 'per-turn';
  return 'off';
}

/**
 * Returns display numbers for all messages in a single pass.
 * @param {Array<{role?: string}>} messages
 * @param {'off'|'per-message'|'per-turn'} mode
 * @returns {Array<number|null>}
 */
export function getMessageNumbers(messages, mode) {
  if (!Array.isArray(messages)) return [];
  const normalized = normalizeMessageNumbering(mode);
  if (normalized === 'off') return Array.from(messages, () => null);
  if (normalized === 'per-message') return Array.from(messages, (_, index) => index + 1);
  let turn = 0;
  return Array.from(messages, (message) => {
    if (message?.role === 'User') turn += 1;
    return turn === 0 ? 1 : turn;
  });
}

/**
 * Returns the display number for a message at a given index.
 * @param {Array<{role?: string}>} messages
 * @param {number} index
 * @param {'off'|'per-message'|'per-turn'} mode
 * @returns {number|null} 1-based number, or null when numbering is off
 */
export function getMessageNumber(messages, index, mode) {
  const normalized = normalizeMessageNumbering(mode);
  if (normalized === 'off') return null;
  if (!Array.isArray(messages) || index < 0 || index >= messages.length) return null;
  if (normalized === 'per-message') return index + 1;
  return getMessageNumbers(messages, normalized)[index];
}
/**
 * Determines whether attribution should be included based on formatter options.
 * Attribution is included by default and only omitted when explicitly disabled.
 * @param {{ includeAttribution?: boolean }} [options]
 * @returns {boolean}
 */
export function shouldIncludeAttribution(options = {}) {
  return options.includeAttribution !== false;
}

/**
 * Determines whether per-message timestamps should be included based on formatter options.
 * Timestamps are opt-in and only rendered when the parser provided one.
 * @param {{ includeTimestamps?: boolean }} [options]
 * @returns {boolean}
 */
export function shouldIncludeTimestamps(options = {}) {
  return options.includeTimestamps === true;
}

/**
 * Normalizes a numeric epoch to milliseconds.
 * Values with abs < 1e11 are treated as seconds (current ms ~1.7e12,
 * current seconds ~1.7e9); everything else is treated as milliseconds.
 * This keeps `0` as a valid Unix-epoch value.
 * @param {number} value
 * @returns {number}
 */
export function normalizeEpochToMs(value) {
  if (Math.abs(value) < 1e11) return value * 1000;
  return value;
}

/**
 * Returns the raw timestamp string for a message, if present.
 * Parsers (via decant-core) attach `timestamp` as ISO, epoch, or locale strings.
 * @param {{ timestamp?: unknown }} [message]
 * @returns {string|null}
 */
export function getMessageTimestamp(message) {
  return formatMessageTimestamp(message?.timestamp);
}

/**
 * Formats a raw timestamp for display as ISO 8601 (UTC).
 * Numeric epochs (seconds or ms) are normalized to ISO; ISO and locale
 * date strings are parsed and re-emitted as ISO so every platform renders
 * the same sortable format. Strips line breaks so the value is safe to
 * embed in Markdown headings and HTML attributes. Returns null when
 * absent or blank; unparseable non-ISO text is returned as single-line text.
 * @param {unknown} timestamp
 * @returns {string|null}
 */
export function formatMessageTimestamp(timestamp) {
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    try {
      return new Date(normalizeEpochToMs(timestamp)).toISOString();
    } catch {
      return null;
    }
  }
  if (typeof timestamp === 'string') {
    // Numeric strings may be seconds or ms epochs — normalize like numbers.
    const trimmed = timestamp.trim();
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
    // Collapse line breaks/tabs to single spaces and cap length, then
    // standardize parseable dates to ISO; keep raw text as last resort.
    const singleLine = trimmed
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!singleLine) return null;
    if (!/^\d{4}-\d{2}-\d{2}T/.test(singleLine)) return singleLine.slice(0, 200);
    const parsed = new Date(singleLine.slice(0, 200));
    if (!Number.isNaN(parsed.getTime())) {
      try {
        return parsed.toISOString();
      } catch {
        return singleLine.slice(0, 200);
      }
    }
    return singleLine.slice(0, 200);
  }
  return null;
}

/**
 * Builds one Table of Contents entry per message.
 * Snippets are plain text (tags, checkboxes, and markdown markers stripped)
 * capped at 60 characters; timestamps are ISO when enabled and available.
 * @param {Array<{role?: string, content?: string, timestamp?: unknown}>} messages
 * @param {{ messageNumbering?: string, includeTimestamps?: boolean, platform?: string }} [options]
 * @returns {Array<{index: number, label: string, number: number|null, snippet: string, timestamp: string|null}>}
 */
export function getTocItems(messages, options = {}) {
  if (!Array.isArray(messages)) return [];
  const numbers = getMessageNumbers(messages, options.messageNumbering);
  const includeTimestamps = shouldIncludeTimestamps(options);
  const platform = options.platform || 'Assistant';
  return messages.map((m, i) => {
    const isUser = m?.role === 'User';
    const label = isUser ? 'User' : m?.role && m.role !== 'Assistant' ? m.role : platform;
    const snippet = (m?.content || '')
      .replace(/<[^>]*>/g, '')
      .replace(/\[(?:x|X|\s)\]/g, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[`#*_~]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 60);
    return {
      index: i,
      label,
      number: numbers[i],
      snippet: snippet || 'Message',
      timestamp: includeTimestamps && m ? formatMessageTimestamp(m.timestamp) : null,
    };
  });
}

/**
 * GitHub-style heading slug used for Markdown ToC anchors.
 * Lowercases, drops punctuation, turns each space into a hyphen
 * (no collapsing — matches GitHub's anchor generation).
 * @param {string} text
 * @returns {string}
 */
export function slugifyHeading(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/ /g, '-');
}

export class ExportFormatter {
  constructor() {}

  /**
   * Formats the conversation object into a string/blob
   * @param {{ title: string, messages: Array<{role: string, content: string}> }} conversation
   * @returns {string} The formatted content
   */
  format(_conversation) {
    throw new Error('Not implemented');
  }

  getFileExtension() {
    throw new Error('Not implemented');
  }

  getMimeType() {
    throw new Error('Not implemented');
  }
}
