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
