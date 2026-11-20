import { ExportFormatter, formatMessageTimestamp } from './base.js';
import { normalizeRole } from './json.js';

/**
 * Exports a conversation in Open-WebUI's chat import format.
 *
 * Open-WebUI imports a JSON array of chats whose history is a message tree.
 * ACE parses conversations as a linear list, so this formatter turns that list
 * into a single-branch tree while keeping the content and timestamps intact.
 *
 * @see https://docs.openwebui.com/features/chat-conversations/data-controls/import-export/
 */
export class OpenWebUIFormatter extends ExportFormatter {
  /**
   * @param {object} [options] Formatter defaults.
   * @param {string} [options.platform] Fallback platform name when parser metadata is missing.
   * @param {() => string} [options.generateId] Message ID factory, mainly for deterministic tests.
   */
  constructor(options = {}) {
    super();
    this.platform = options.platform || null;
    this.generateId = options.generateId || generateMessageId;
  }

  /**
   * Formats parser output as an Open-WebUI import JSON array.
   *
   * @param {object} conversation Parsed conversation returned by a platform parser.
   * @returns {string} Pretty-printed JSON ready for Open-WebUI's Import Chats action.
   */
  format(conversation) {
    return JSON.stringify([this.toImportChat(conversation)], null, 2);
  }

  /**
   * Converts one parser conversation into an Open-WebUI import object.
   *
   * Open-WebUI stores timestamps as part of the imported chat, so this formatter
   * always includes them when the parser supplied one.
   *
   * @param {object} conversation Parsed conversation returned by a platform parser.
   * @returns {object} Standard-format Open-WebUI import entry.
   */
  toImportChat(conversation) {
    const metadata = conversation.metadata || {};
    const platform = String(metadata.Source || this.platform || 'Unknown');
    const model = resolveModel(metadata.Model, platform);
    const sourceMessages = Array.isArray(conversation.messages) ? conversation.messages : [];
    const ids = sourceMessages.map(() => this.generateId());
    const messages = {};
    const timestamps = [];

    sourceMessages.forEach((message, index) => {
      const id = ids[index];
      const role = toImportRole(normalizeRole(message.role));
      const entry = {
        id,
        parentId: index === 0 ? null : ids[index - 1],
        childrenIds: index === sourceMessages.length - 1 ? [] : [ids[index + 1]],
        role,
        content: message.content || '',
        done: true,
      };

      if (role === 'assistant') {
        entry.model = model;
      }

      const timestamp = toUnixSeconds(message.timestamp);
      if (timestamp !== null) {
        entry.timestamp = timestamp;
        timestamps.push(timestamp);
      }

      messages[id] = entry;
    });

    return {
      chat: {
        title: conversation.title || 'AI Chat Export',
        models: [platform],
        history: {
          currentId: ids.length > 0 ? ids[ids.length - 1] : '',
          messages,
        },
      },
      meta: {
        tags: [toImportTag(platform)],
      },
      created_at: timestamps.length > 0 ? Math.min(...timestamps) : null,
      updated_at: timestamps.length > 0 ? Math.max(...timestamps) : null,
    };
  }

  /**
   * @returns {string} The `json` file extension.
   */
  getFileExtension() {
    return 'json';
  }

  /**
   * @returns {string} The JSON MIME type.
   */
  getMimeType() {
    return 'application/json';
  }
}

/**
 * Maps ACE's normalized roles onto the two roles Open-WebUI can import.
 * Content from system/tool/artifact messages is preserved as assistant output.
 *
 * @param {string} role Normalized schema role.
 * @returns {'user'|'assistant'} Open-WebUI message role.
 */
function toImportRole(role) {
  return role === 'user' ? 'user' : 'assistant';
}

/**
 * Builds the platform tag Open-WebUI creates on import, e.g. `imported-chatgpt`.
 *
 * @param {string} platform Detected platform name.
 * @returns {string} Tag safe for Open-WebUI's tag handling.
 */
function toImportTag(platform) {
  const slug = String(platform || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .split('-')
    .filter(Boolean)
    .join('-');
  return `imported-${slug || 'unknown'}`;
}

/**
 * Returns a usable model label, falling back to the platform name.
 *
 * @param {unknown} value Parser metadata model label.
 * @param {string} platform Detected platform name.
 * @returns {string} Trimmed single-line model identifier.
 */
function resolveModel(value, platform) {
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const model = raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return model || platform;
}

/**
 * Converts parser timestamps (ISO, epoch, or locale strings) to Unix seconds.
 *
 * `formatMessageTimestamp()` handles ISO, numeric epochs, and ChatGPT's en-US
 * locale output. Other locale strings are common in ChatGPT's API data (it uses
 * `toLocaleString()`), so fall back to a small `D.M.YYYY` / `D/M/YYYY` parser.
 *
 * @param {unknown} timestamp Parser-provided timestamp.
 * @returns {number|null} Unix timestamp in seconds, or null when undatable.
 */
function toUnixSeconds(timestamp) {
  const formatted = formatMessageTimestamp(timestamp);
  if (!formatted) return null;

  const direct = Date.parse(formatted);
  if (Number.isFinite(direct)) {
    return Math.floor(direct / 1000);
  }

  const locale = parseLocaleTimestamp(formatted);
  return locale === null ? null : Math.floor(locale / 1000);
}

/**
 * Parses non-en-US locale date strings such as `15.11.2026, 10:00:00`.
 *
 * Ambiguous slash dates stay on `formatMessageTimestamp()`'s documented en-US
 * interpretation; this fallback is only reached when that interpretation fails
 * or the separator is a dot.
 *
 * @param {string} value Timestamp string.
 * @returns {number|null} Milliseconds since epoch, or null when unparseable.
 */
function parseLocaleTimestamp(value) {
  const parts = value.replace(/,/g, ' ').trim().split(/\s+/);
  const datePart = parts[0] || '';
  const timePart = parts[1] || '';
  const meridiem = (parts[2] || '').toUpperCase();

  const separator = datePart.includes('.') ? '.' : datePart.includes('/') ? '/' : '-';
  const dateNumbers = datePart.split(separator).map((part) => Number(part));
  if (dateNumbers.length !== 3 || dateNumbers.some((part) => !Number.isInteger(part))) {
    return null;
  }

  let year;
  let month;
  let day;
  if (dateNumbers[0] > 31) {
    [year, month, day] = dateNumbers;
  } else {
    year = dateNumbers[2];
    if (dateNumbers[0] > 12) {
      [day, month] = dateNumbers;
    } else if (dateNumbers[1] > 12) {
      [month, day] = dateNumbers;
    } else {
      [day, month] = dateNumbers;
    }
  }

  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  if (timePart) {
    const timeNumbers = timePart.split(':').map((part) => Number(part));
    if (timeNumbers.length < 2 || timeNumbers.length > 3) return null;
    [hours, minutes, seconds = 0] = timeNumbers;
    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
      return null;
    }
  }

  const parsed = new Date(year, month - 1, day, hours, minutes, seconds);
  const valid =
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day &&
    parsed.getHours() === hours &&
    parsed.getMinutes() === minutes &&
    parsed.getSeconds() === seconds;
  return valid ? parsed.getTime() : null;
}

/**
 * Generates a unique message ID supported by both browsers and Node.
 *
 * @returns {string} Unique message identifier.
 */
function generateMessageId() {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      return `ace-${hex}`;
    }
  }

  fallbackIdCounter += 1;
  return `ace-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}`;
}

let fallbackIdCounter = 0;
