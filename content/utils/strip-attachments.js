/**
 * Attachment Option Utility (issue #100)
 *
 * When "Include files" is off, every file attached to a user message, and any
 * long pasted text, is replaced by a one-line note that keeps its name and
 * details, so an export keeps the conversation itself without pages of raw
 * file content:
 *
 *   ***[File: page.html · 458.9 KB]***
 *   ***[File: notes.pdf · 3 pages]***
 *   ***[Pasted content · 14.8 KB · 312 lines]***
 *
 * The brackets mean the content was removed. The whole note is bold italic so
 * it stands apart from the message text and from inline code written by the AI.
 * Images are not affected: they follow the existing "Include images" option.
 *
 * Rules:
 * 1. Only user messages are touched, and only the attachment blocks the
 *    parser writes. Ordinary message text and AI responses are never modified.
 * 2. Text the platform flags as pasted (Claude: "### Pasted content", an
 *    attachment with no file name) is usually part of the question, so it is
 *    kept unless it is longer than PASTED_CONTENT_CHAR_LIMIT characters.
 *
 * Today only the Claude parser (decant-core) emits attachment content; ChatGPT,
 * Gemini and Qwen already export attachment names only, so the option leaves
 * them unchanged.
 *
 * Known limitation: attachments are recognised from the markdown the Claude
 * parser writes. If an attachment or paste is itself an export containing the
 * same attachment headers, its boundaries cannot be told apart from the
 * markdown alone, so that message is left unchanged. Structured attachment
 * data from decant-core would make this exact.
 */

/** Pasted text up to this many characters is kept even when files are omitted. */
export const PASTED_CONTENT_CHAR_LIMIT = 10000;

const OPEN_FENCE = '\n````\n';
const CLOSE_FENCE = '\n````';

// Text attachments and pasted content, e.g.
//   ### Attachment: report.html _(1.2 MB, text/html)_      (followed by a ```` block)
//   ### Pasted content _(20.4 KB)_                         (followed by a ```` block)
const TEXT_ATTACHMENT_RE =
  /^### (?:Attachment: (.+?)|(Pasted content))(?: _\(([^\n]*)\)_)?[ \t]*$/gm;

// Document files, e.g. **Attachment: [notes.pdf](/api/...)** _(document · 3 pages)_
const DOCUMENT_RE = /^\*\*Attachment: \[([^\n]+?)\]\([^\n]*?\)\*\*(?: _\(([^\n]*)\)_)?[ \t]*$/gm;

// Image files, e.g. **Attachment: photo.png** optionally followed by ![photo.png](url)
const IMAGE_RE =
  /^\*\*Attachment: ([^\n[][^\n]*?)\*\*[ \t]*(?:\n\n!\[[^\n]*?\]\([^\n]*?\)[ \t]*)?$/gm;

// Notes this module writes. They may sit between attachment blocks when the
// option is applied to a message that was already processed.
const NOTE_LINE_RE = /^\*\*\*\[(?:File: |Image: |Pasted content)[^\n]*\]\*\*\*[ \t]*$/gm;

// Asterisks in a file name would end the bold italic early, so they are escaped.
function safeName(name) {
  return String(name).trim().replace(/\*/g, '\\*');
}

function withDetails(text, details) {
  return text + details.map((detail) => ` · ${detail}`).join('');
}

// A note stands in for content that was removed, so it is wrapped in brackets.
function note(text, details) {
  return `***[${withDetails(text, details)}]***`;
}

function fileNote(name, details) {
  return note(`File: ${safeName(name)}`, details);
}

function countLines(text) {
  const trimmed = text.replace(/\n+$/, '');
  return trimmed ? trimmed.split('\n').length : 0;
}

function lineCount(text) {
  const lines = countLines(text);
  return `${lines} ${lines === 1 ? 'line' : 'lines'}`;
}

const SIZE_RE = /^(\d+(?:\.\d+)?) ?(B|KB|MB|GB)$/i;
const PAGES_RE = /^\d+ pages?$/i;

// The parser writes sizes in KB only ("2048.0 KB"); show larger ones in MB or GB.
function formatSize(label) {
  const match = String(label).match(SIZE_RE);
  if (!match) return label;
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = Number(match[1]);
  let unit = units.indexOf(match[2].toUpperCase());
  if (unit === 0 || value < 1024) return label;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

// Keeps the details worth showing: sizes and page counts. File types such as
// "text/html" or "document" repeat what the file extension already says.
function usefulDetails(meta) {
  if (!meta) return [];
  return meta
    .split(/\s+·\s+|,\s+/)
    .map((part) => part.trim())
    .filter((part) => SIZE_RE.test(part) || PAGES_RE.test(part))
    .map(formatSize);
}

function hasBalancedFences(text) {
  return text.split('\n').filter((line) => line === '````').length % 2 === 0;
}

// What may appear between and after attachment blocks: blank lines, the
// document and image cards the parser adds at the end, and this module's notes.
function onlyCardsAndNotes(text) {
  return (
    text.replace(DOCUMENT_RE, '').replace(IMAGE_RE, '').replace(NOTE_LINE_RE, '').trim() === ''
  );
}

/**
 * Finds the text attachment blocks the parser wrote at the end of a message.
 * Returns null when the markdown is ambiguous, for example when pasted text is
 * itself an export containing attachment headers: the parser does not escape
 * nested fences, so their boundaries cannot be recovered. Callers then leave the
 * message unchanged rather than risk cutting it in the wrong place.
 * @param {string} content
 * @returns {Array<{start: number, headerEnd: number, end: number, fileName?: string, isPasted: boolean, details: string[], extracted: string|null}>|null}
 */
function findTextBlocks(content) {
  const headers = [...content.matchAll(TEXT_ATTACHMENT_RE)];
  const blocks = [];

  for (let i = 0; i < headers.length; i++) {
    const match = headers[i];
    const start = match.index;
    const headerEnd = start + match[0].length;
    const nextStart = i + 1 < headers.length ? headers[i + 1].index : content.length;
    const body = content.slice(headerEnd, nextStart);

    let extracted = null;
    let end = headerEnd;
    if (body.startsWith(OPEN_FENCE)) {
      const closeIdx = body.lastIndexOf(CLOSE_FENCE);
      if (closeIdx < OPEN_FENCE.length - 1) return null; // fence never closes
      extracted = body.slice(OPEN_FENCE.length, closeIdx);
      if (!hasBalancedFences(extracted)) return null; // closed on a nested fence
      end = headerEnd + closeIdx + CLOSE_FENCE.length;
    }

    // The parser writes attachment blocks back to back.
    if (i + 1 < headers.length && !onlyCardsAndNotes(content.slice(end, nextStart))) return null;

    blocks.push({
      start,
      headerEnd,
      end,
      fileName: match[1],
      isPasted: Boolean(match[2]),
      details: usefulDetails(match[3]),
      extracted,
    });
  }

  if (blocks.length > 0 && !onlyCardsAndNotes(content.slice(blocks[blocks.length - 1].end))) {
    return null;
  }
  return blocks;
}

// Any card or note line, used to find the ones the parser appended to the message.
const CARD_RE = new RegExp(
  [DOCUMENT_RE, IMAGE_RE, NOTE_LINE_RE].map((re) => re.source).join('|'),
  'gm',
);

/**
 * Index where the cards at the end of `text` begin, or text.length if it ends
 * with something else. The parser appends cards after the message text, so a
 * card-like line followed by more text was written by the user and is kept.
 * @param {string} text
 * @returns {number}
 */
function trailingCardsStart(text) {
  let runStart = text.length;
  let lastEnd = 0;
  for (const match of text.matchAll(CARD_RE)) {
    if (runStart === text.length || text.slice(lastEnd, match.index).trim() !== '') {
      runStart = match.index;
    }
    lastEnd = match.index + match[0].length;
  }
  return text.slice(lastEnd).trim() === '' ? runStart : text.length;
}

function noteForBlock(block, pastedCharLimit) {
  if (!block.isPasted) return fileNote(block.fileName, block.details);
  // Short pastes are usually part of the question: keep them.
  if (block.extracted === null || block.extracted.length <= pastedCharLimit) return null;
  return note('Pasted content', [...block.details, lineCount(block.extracted)]);
}

function noteForDocumentCards(segment) {
  return segment.replace(DOCUMENT_RE, (_match, name, meta) => fileNote(name, usefulDetails(meta)));
}

/**
 * Replaces every attached file, and long pasted text, in a message's markdown
 * with a one-line note. Images are left as they are. Messages whose attachment
 * markdown is ambiguous are returned unchanged.
 * @param {string} content - Markdown content of a single user message
 * @param {{ pastedCharLimit?: number }} [options]
 * @returns {string}
 */
export function stripAttachments(content, { pastedCharLimit = PASTED_CONTENT_CHAR_LIMIT } = {}) {
  if (!content || typeof content !== 'string') return '';

  const blocks = findTextBlocks(content);
  if (blocks === null) return content;

  // Only the cards after the message text are rewritten; the text itself is kept.
  const head = blocks.length > 0 ? content.slice(0, blocks[0].start) : content;
  const cardsStart = trailingCardsStart(head);
  let result = head.slice(0, cardsStart) + noteForDocumentCards(head.slice(cardsStart));
  let cursor = head.length;
  for (const block of blocks) {
    result += noteForDocumentCards(content.slice(cursor, block.start));
    const replacement = noteForBlock(block, pastedCharLimit);
    result += replacement === null ? content.slice(block.start, block.end) : replacement;
    cursor = block.end;
  }
  return result + noteForDocumentCards(content.slice(cursor));
}

/**
 * Returns true for messages written by the user (the only ones carrying attachments).
 * @param {{ role?: string }} msg
 * @returns {boolean}
 */
export function isUserMessage(msg) {
  return Boolean(msg) && typeof msg.role === 'string' && /^(user|human)$/i.test(msg.role.trim());
}

/**
 * Applies the "Include files" option to one message. Callers run it on every
 * message; it only changes user messages, and only when the option is off.
 * @param {{ role?: string, content?: string }} msg
 * @param {{ includeAttachments?: boolean, pastedCharLimit?: number }} [options]
 * @returns {string} The message content to export
 */
export function applyAttachmentOption(msg, options = {}) {
  const content = msg && typeof msg.content === 'string' ? msg.content : '';
  if (!content || !isUserMessage(msg)) return content;
  if (options.includeAttachments !== false) return content;
  return stripAttachments(content, { pastedCharLimit: options.pastedCharLimit });
}
