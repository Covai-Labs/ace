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
// Matches the notes written by content/utils/strip-attachments.js for files, images and
// pasted text left out of the export (kept content is never written in brackets). Kept
// here so this module stays free of imports.
const OMITTED_ATTACHMENT_NOTE_RE = /^\*\*\*\[(?:File: |Image: |Pasted content)/gm;

/**
 * Title suffix for a user message whose attachments were omitted, e.g.
 * " · 2 attachments omitted". Empty for other messages.
 * @param {{ role?: string, content?: string }} message
 * @returns {string}
 */
export function getOmittedAttachmentsSuffix(message) {
  if (!message || message.role !== 'User' || typeof message.content !== 'string') return '';
  const count = (message.content.match(OMITTED_ATTACHMENT_NOTE_RE) || []).length;
  if (count === 0) return '';
  return ` · ${count} ${count === 1 ? 'attachment' : 'attachments'} omitted`;
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
 *
 * Documented contract (deliberate, not an oversight):
 * - Numeric epochs (seconds or ms) and ISO-8601 strings → ISO via Date.
 * - ChatGPT-style en-US locale strings (`M/D/YYYY[, ]H:mm[:ss][ AM/PM]`,
 *   exactly what its parser emits via `toLocaleString()`) → parsed with an
 *   explicit M/D field map → ISO. No `new Date()` guessing, so `05/09/2026`
 *   can never silently become 9 May and output never varies by browser.
 * - Anything else (other locales, relative phrases, garbage) → returned as
 *   cleaned single-line text so information is never blanked. Callers hide
 *   the date row when this returns null only.
 * Strips line breaks so the value is safe to embed in Markdown headings
 * and HTML attributes. Returns null when absent/blank/undatable numeric.
 * @param {unknown} timestamp
 * @returns {string|null}
 */
const ISO_LIKE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?(?:\s*(Z|[+-]\d{2}:?\d{2}))?$/i;
const EN_US_LOCALE =
  /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?)?$/i;

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
    // Collapse line breaks/tabs to single spaces and cap length.
    const singleLine = trimmed
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 200);
    if (!singleLine) return null;

    // ISO-8601 strings: validate calendar and time fields.
    const isoMatch = singleLine.match(ISO_LIKE);
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]);
      const day = Number(isoMatch[3]);
      const hour = isoMatch[4] !== undefined ? Number(isoMatch[4]) : 0;
      const minute = isoMatch[5] !== undefined ? Number(isoMatch[5]) : 0;
      const second = isoMatch[6] !== undefined ? Number(isoMatch[6]) : 0;
      const ms = isoMatch[7] !== undefined ? Number(isoMatch[7].slice(0, 3).padEnd(3, '0')) : 0;
      const tz = isoMatch[8];

      if (month < 1 || month > 12) return singleLine;
      if (day < 1 || day > 31) return singleLine;
      if (hour < 0 || hour > 23) return singleLine;
      if (minute < 0 || minute > 59) return singleLine;
      if (second < 0 || second > 59) return singleLine;

      const testUtc = new Date(Date.UTC(year, month - 1, day));
      if (
        testUtc.getUTCFullYear() !== year ||
        testUtc.getUTCMonth() !== month - 1 ||
        testUtc.getUTCDate() !== day
      ) {
        return singleLine;
      }

      if (!tz) {
        const local = new Date(year, month - 1, day, hour, minute, second, ms);
        if (!Number.isNaN(local.getTime())) {
          try {
            return local.toISOString();
          } catch {
            return singleLine;
          }
        }
        return singleLine;
      }

      const parsed = new Date(singleLine);
      if (!Number.isNaN(parsed.getTime())) {
        try {
          return parsed.toISOString();
        } catch {
          return singleLine;
        }
      }
      return singleLine;
    }

    // ChatGPT en-US locale strings: explicit M/D field map, never guessed.
    const locale = singleLine.match(EN_US_LOCALE);
    if (locale) {
      const month = Number(locale[1]);
      const day = Number(locale[2]);
      const year = Number(locale[3]);
      let hour = locale[4] !== undefined ? Number(locale[4]) : 0;
      const minute = locale[5] !== undefined ? Number(locale[5]) : 0;
      const second = locale[6] !== undefined ? Number(locale[6]) : 0;
      const meridiem = locale[7] ? locale[7].toUpperCase() : null;

      if (month < 1 || month > 12) return singleLine;
      if (day < 1 || day > 31) return singleLine;
      if (minute < 0 || minute > 59) return singleLine;
      if (second < 0 || second > 59) return singleLine;

      if (meridiem) {
        if (hour < 1 || hour > 12) return singleLine;
        if (meridiem === 'PM' && hour < 12) hour += 12;
        if (meridiem === 'AM' && hour === 12) hour = 0;
      } else {
        if (hour < 0 || hour > 23) return singleLine;
      }

      const parsed = new Date(year, month - 1, day, hour, minute, second);
      const valid =
        parsed.getFullYear() === year &&
        parsed.getMonth() === month - 1 &&
        parsed.getDate() === day &&
        parsed.getHours() === hour &&
        parsed.getMinutes() === minute &&
        parsed.getSeconds() === second;
      if (valid) {
        try {
          return parsed.toISOString();
        } catch {
          return singleLine;
        }
      }
      return singleLine;
    }
    return singleLine;
  }
  return null;
}

/**
 * Strips HTML tags and comments while preserving literal angle-bracket
 * comparisons (e.g. `1 < 2 and 3 > 1` or `x < pivot`) and code syntax.
 * Only well-formed HTML tags (`<tag...>`, `</tag>`, `<tag/>`) and comments
 * (`<!--...-->`) are removed; unclosed or literal `<` are preserved.
 * @param {unknown} text
 * @returns {string}
 */
export function stripTags(text) {
  const input = String(text || '');
  let output = '';
  let i = 0;
  while (i < input.length) {
    const open = input.indexOf('<', i);
    if (open === -1) {
      output += input.slice(i);
      break;
    }
    output += input.slice(i, open);
    const rest = input.slice(open);
    const tagMatch = rest.match(
      /^<(?:\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s+[^"'>]*(?:(?:"[^"]*"|'[^']*')[^"'>]*)*)?\s*\/?>|!--[\s\S]*?-->|![a-zA-Z][^>]*>)/,
    );
    if (tagMatch) {
      i = open + tagMatch[0].length;
    } else {
      output += '<';
      i = open + 1;
    }
  }
  return output;
}

/**
 * Builds one Table of Contents entry per message.
 * Snippets are plain single-line text (tags, checkboxes, markdown links and
 * markers stripped) capped at 60 characters; timestamps are ISO when enabled
 * and available.
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
    const snippet = stripTags(m?.content || '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
      .replace(/\[(?:x|X|\s)\]/g, '')
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
 * True when the export is a generic web article rather than a chat.
 * ArticleParser reports the site name in Source/platform, so the check
 * covers metadata, the parser's platform tag, and the dedicated-AI flag.
 * @param {object} conversation
 * @returns {boolean}
 */
export function isArticleConversation(conversation) {
  if (!conversation) return false;
  if (conversation.rawArticle) return true;
  const source = conversation.metadata?.Source;
  if (source === 'Web Article' || source === 'WebArticle') return true;
  const platform = conversation.platform;
  if (platform === 'Article' || platform === 'WebArticle' || platform === 'Web Article')
    return true;
  if (conversation.isDedicatedAi === false) return true;
  return false;
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
