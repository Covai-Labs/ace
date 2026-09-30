import { ExportFormatter } from './base.js';

const SCHEMA_PATH = './schemas/export-v1.schema.json';

export class JsonFormatter extends ExportFormatter {
  /**
   * Creates a JSON export formatter.
   *
   * @param {object} [options] Export defaults used when parser output is incomplete.
   * @param {string} [options.platform] Fallback platform name for the `source` block.
   * @param {string} [options.url] Fallback conversation URL for the `source` block.
   * @param {string} [options.exportedAt] Fixed ISO timestamp, mainly for deterministic tests.
   */
  constructor(options = {}) {
    super();
    this.platform = options.platform || null;
    this.url = options.url || null;
    this.exportedAt = options.exportedAt || null;
  }

  /**
   * Formats parser output as a pretty-printed schema v1 JSON export.
   *
   * @param {object} conversation Parsed conversation returned by a platform parser.
   * @returns {string} JSON text suitable for download or clipboard export.
   */
  format(conversation) {
    return JSON.stringify(this.toSchema(conversation), null, 2);
  }

  /**
   * Converts parser-specific conversation output into the stable export schema.
   *
   * Parser implementations do not all expose the same metadata fields, so this
   * method normalizes the fields consumers need while preserving parser metadata
   * under `metadata`.
   *
   * @param {object} conversation Parsed conversation returned by a platform parser.
   * @param {string} [conversation.title] Conversation title.
   * @param {string} [conversation.url] Conversation URL.
   * @param {Array<{role?: string, content?: string}>} [conversation.messages] Messages to export.
   * @param {Record<string, string|number|boolean|null>} [conversation.metadata] Parser metadata.
   * @returns {object} Export object conforming to `schemas/export-v1.schema.json`.
   */
  toSchema(conversation) {
    const metadata = conversation.metadata || {};
    const source = metadata.Source || this.platform || 'Unknown';

    return {
      $schema: SCHEMA_PATH,
      schemaVersion: 1,
      exportedAt: this.exportedAt || new Date().toISOString(),
      source: {
        platform: source,
        url: conversation.url || metadata.Link || this.url,
        title: conversation.title || 'AI Chat Export',
      },
      messages: (conversation.messages || []).map((message, index) => {
        const entry = {
          index,
          role: normalizeRole(message.role),
          displayRole: message.role || 'Unknown',
          content: message.content || '',
        };
        const timestamp =
          typeof message.timestamp === 'number' && Number.isFinite(message.timestamp)
            ? (() => {
                try {
                  return new Date(message.timestamp).toISOString();
                } catch {
                  return String(message.timestamp);
                }
              })()
            : typeof message.timestamp === 'string' && message.timestamp.trim()
              ? message.timestamp.trim()
              : null;
        if (timestamp) {
          entry.timestamp = timestamp;
        }
        return entry;
      }),
      metadata,
    };
  }

  /**
   * Returns the file extension used for JSON downloads.
   *
   * @returns {string} The `json` file extension.
   */
  getFileExtension() {
    return 'json';
  }

  /**
   * Returns the MIME type used for JSON downloads.
   *
   * @returns {string} The JSON MIME type.
   */
  getMimeType() {
    return 'application/json';
  }
}

/**
 * Maps platform-specific role labels onto the schema's normalized role enum.
 *
 * @param {string} role Parser-provided role label.
 * @returns {'user'|'assistant'|'system'|'tool'|'artifact'|'unknown'} Normalized schema role.
 */
function normalizeRole(role) {
  const normalized = String(role || '').toLowerCase();

  if (normalized === 'user') {
    return 'user';
  }

  if (normalized.includes('artifact')) {
    return 'artifact';
  }

  if (normalized.includes('system')) {
    return 'system';
  }

  if (normalized.includes('tool')) {
    return 'tool';
  }

  if (
    normalized.includes('assistant') ||
    normalized.includes('chatgpt') ||
    normalized.includes('claude') ||
    normalized.includes('model') ||
    normalized.includes('meta ai') ||
    normalized.includes('mistral') ||
    normalized.includes('deepseek') ||
    normalized.includes('qwen') ||
    normalized.includes('perplexity') ||
    normalized.includes('lumo') ||
    normalized.includes('joyland') ||
    normalized.includes('chub')
  ) {
    return 'assistant';
  }

  return 'unknown';
}
