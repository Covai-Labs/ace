import { ExportFormatter, formatMessageTimestamp, shouldIncludeTimestamps } from './base.js';
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
   * @param {object} [options] Formatter options, such as `{ includeTimestamps: boolean }`.
   * @returns {string} Pretty-printed JSON ready for Open-WebUI's Import Chats action.
   */
  format(conversation, options = {}) {
    return JSON.stringify([this.toImportChat(conversation, options)], null, 2);
  }

  /**
   * Converts one parser conversation into an Open-WebUI import object.
   *
   * @param {object} conversation Parsed conversation returned by a platform parser.
   * @param {object} [options] Formatter options.
   * @returns {object} Standard-format Open-WebUI import entry.
   */
  toImportChat(conversation, options = {}) {
    const metadata = conversation.metadata || {};
    const platform = String(metadata.Source || this.platform || 'Unknown');
    const model = resolveModel(metadata.Model, platform);
    const includeTimestamps = shouldIncludeTimestamps(options);
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

      const timestamp = includeTimestamps ? toUnixSeconds(message.timestamp) : null;
      if (timestamp !== null) {
        entry.timestamp = timestamp;
        timestamps.push(timestamp);
      }

      messages[id] = entry;
    });

    return {
      chat: {
        title: conversation.title || 'AI Chat Export',
        models: [model],
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
 * @param {unknown} timestamp Parser-provided timestamp.
 * @returns {number|null} Unix timestamp in seconds, or null when undatable.
 */
function toUnixSeconds(timestamp) {
  const date = Date.parse(formatMessageTimestamp(timestamp) || '');
  return Number.isFinite(date) ? Math.floor(date / 1000) : null;
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
