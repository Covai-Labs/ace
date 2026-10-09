/**
 * Attachment Option Utility (issue #100)
 *
 * Attachments in a user message are written in one of two forms. Content that
 * stays in the export sits under a sub-heading, so it still shows in a document
 * outline or navigation pane:
 *
 *   ### File: page.html · 458.9 KB             (followed by the file content)
 *   ### File: notes.pdf · 3 pages
 *   ### Image: photo.png                       (followed by the picture)
 *   ### Pasted content · 4.7 KB · 37 lines     (followed by the text)
 *
 * The picture below an image sub-heading gets an empty alt text, since the
 * sub-heading already names it.
 *
 * Content left out is replaced by a one-line note with the same text in
 * brackets. The whole note is bold italic so it stands apart from the message
 * text and from inline code written by the AI:
 *
 *   ***[File: page.html · 458.9 KB]***
 *   ***[File: notes.pdf · 3 pages]***
 *   ***[Image: photo.png]***
 *   ***[Pasted content · 14.8 KB · 312 lines]***
 *
 * When "Include files" is off, files and long pasted text become notes.
 * Images follow only the existing "Include images" option: an image whose
 * picture was removed becomes a note, whatever this option says.
 *
 * Rules:
 * 1. Only user messages are touched, and only the attachments the parser
 *    appends after the message text. Ordinary message text and AI responses
 *    are never modified, and attachment content is never edited.
 * 2. Text the platform flags as pasted (Claude: "### Pasted content", an
 *    attachment with no file name) is usually part of the question, so it is
 *    kept unless it is longer than PASTED_CONTENT_CHAR_LIMIT characters.
 * 3. File types ("text/html", "document") are dropped because the extension
 *    already says them, and sizes of 1024 KB or more are shown in MB.
 * 4. Links to documents are dropped: they point to Claude's internal API and
 *    do not open anywhere outside claude.ai.
 * 5. The sub-headings and notes written here are recognised as input too, so
 *    applying the option again (the preview re-applies it to a conversation
 *    that was already processed) gives the same result.
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

// Sub-headings the parser writes for text attachments and pasted content, each
// usually followed by a ```` block:
//   ### Attachment: report.html _(1.2 MB, text/html)_
//   ### Pasted content _(20.4 KB)_
// and the ones this module writes:
//   ### File: report.html · 1.2 MB
//   ### Pasted content · 20.4 KB · 312 lines
//   ### Image: photo.png                       (followed by the picture)
const HEADING_RE =
  /^### (?:Attachment: (.+?)(?: _\(([^\n]*)\)_)?|(Pasted content)(?: _\(([^\n]*)\)_| · ([^\n]*?))?|File: (.+?)|Image: (.+?))[ \t]*$/gm;

// The picture right below an image sub-heading belongs to it.
const PICTURE_RE = /^\n\n!\[[^\n]*?\]\([^\n]*?\)[ \t]*(?=\n|$)/;

// Document files, e.g. **Attachment: [notes.pdf](/api/...)** _(document · 3 pages)_
const DOCUMENT_RE = /^\*\*Attachment: \[([^\n]+?)\]\([^\n]*?\)\*\*(?: _\(([^\n]*)\)_)?[ \t]*$/gm;

// Image files, e.g. **Attachment: photo.png** followed by ![photo.png](url). The
// picture is missing when "Include images" removed it.
const IMAGE_RE =
  /^\*\*Attachment: ([^\n[][^\n]*?)\*\*[ \t]*(\n\n!\[[^\n]*?\]\([^\n]*?\)[ \t]*)?$/gm;

// Notes this module writes.
const NOTE_LINE_RE = /^\*\*\*\[(?:File: |Image: |Pasted content)[^\n]*\]\*\*\*[ \t]*$/gm;

// Any card or note line, used to find the ones the parser appended to the message.
const CARD_RE = new RegExp(
  [DOCUMENT_RE, IMAGE_RE, NOTE_LINE_RE].map((re) => re.source).join('|'),
  'gm',
);

// Asterisks in a file name would end the bold italic early, so they are escaped.
function safeName(name) {
  return String(name).trim().replace(/\*/g, '\\*');
}

function withDetails(text, details) {
  return text + details.map((detail) => ` · ${detail}`).join('');
}

// A note stands in for content that was removed, so it is wrapped in brackets.
function note(text, details = []) {
  return `***[${withDetails(text, details)}]***`;
}

// Kept content uses the same text as the note, without brackets, as a sub-heading.
function heading(text, details = []) {
  return `### ${withDetails(text, details)}`;
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

function isDetail(part) {
  return SIZE_RE.test(part) || PAGES_RE.test(part);
}

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

// Keeps the details worth showing: sizes and page counts.
function usefulDetails(meta) {
  if (!meta) return [];
  return meta
    .split(/\s+·\s+|,\s+/)
    .map((part) => part.trim())
    .filter(isDetail)
    .map(formatSize);
}

// "notes.pdf · 3 pages" → name "notes.pdf", details ["3 pages"]
function splitFileHeading(text) {
  const parts = text.split(' · ');
  const details = [];
  while (parts.length > 1 && isDetail(parts[parts.length - 1].trim())) {
    details.unshift(parts.pop().trim());
  }
  return { name: parts.join(' · ').trim(), details };
}

function parseHeading(match) {
  const [, name, meta, pasted, pastedMeta, pastedDetails, fileText, imageName] = match;
  if (imageName !== undefined) return { kind: 'image', name: imageName.trim(), details: [] };
  if (pasted) return { kind: 'pasted', details: usefulDetails(pastedMeta ?? pastedDetails) };
  if (fileText !== undefined) return { kind: 'file', ...splitFileHeading(fileText) };
  return { kind: 'file', name: name.trim(), details: usefulDetails(meta) };
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
 * Finds the attachment blocks (a sub-heading and what belongs to it) at the end
 * of a message. Returns null when the markdown is ambiguous, for example when
 * pasted text is itself an export containing attachment headers: the parser
 * does not escape nested fences, so their boundaries cannot be recovered.
 * Callers then leave the message unchanged rather than risk cutting it in the
 * wrong place.
 * @param {string} content
 * @returns {Array<{start: number, headerEnd: number, end: number, kind: string, name?: string, details: string[], extracted: string|null, hasPicture: boolean}>|null}
 */
function findBlocks(content) {
  const headers = [...content.matchAll(HEADING_RE)];
  const blocks = [];

  for (let i = 0; i < headers.length; i++) {
    const match = headers[i];
    const start = match.index;
    const headerEnd = start + match[0].length;
    const nextStart = i + 1 < headers.length ? headers[i + 1].index : content.length;
    const body = content.slice(headerEnd, nextStart);
    const parsed = parseHeading(match);

    let extracted = null;
    let hasPicture = false;
    let end = headerEnd;
    if (parsed.kind === 'image') {
      const picture = body.match(PICTURE_RE);
      if (picture) {
        hasPicture = true;
        end = headerEnd + picture[0].length;
      }
    } else if (body.startsWith(OPEN_FENCE)) {
      const closeIdx = body.lastIndexOf(CLOSE_FENCE);
      if (closeIdx < OPEN_FENCE.length - 1) return null; // fence never closes
      extracted = body.slice(OPEN_FENCE.length, closeIdx);
      if (!hasBalancedFences(extracted)) return null; // closed on a nested fence
      end = headerEnd + closeIdx + CLOSE_FENCE.length;
    }

    // The parser writes attachment blocks back to back.
    if (i + 1 < headers.length && !onlyCardsAndNotes(content.slice(end, nextStart))) return null;

    blocks.push({ start, headerEnd, end, extracted, hasPicture, ...parsed });
  }

  if (blocks.length > 0 && !onlyCardsAndNotes(content.slice(blocks[blocks.length - 1].end))) {
    return null;
  }
  return blocks;
}

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

// An image keeps its sub-heading only while its picture is there. The sub-heading
// already names the image, so the picture's alt text is left empty: when the
// picture does not load (Claude's links only work on claude.ai), browsers would
// otherwise show the name a second time in its place.
function rewriteImage(name, picture) {
  if (!picture) return note(`Image: ${safeName(name)}`);
  return heading(`Image: ${name.trim()}`) + picture.replace(/!\[[^\n]*?\]\(/, '![](');
}

function rewriteBlock(block, content, omit, pastedCharLimit) {
  const body = content.slice(block.headerEnd, block.end);
  if (block.kind === 'image') return rewriteImage(block.name, block.hasPicture ? body : '');
  if (block.kind === 'file') {
    return omit
      ? note(`File: ${safeName(block.name)}`, block.details)
      : heading(`File: ${block.name}`, block.details) + body;
  }
  const lines = block.extracted ? [lineCount(block.extracted)] : [];
  // Short pastes are usually part of the question: keep them.
  if (omit && block.extracted !== null && block.extracted.length > pastedCharLimit) {
    return note('Pasted content', [...block.details, ...lines]);
  }
  return heading('Pasted content', [...block.details, ...lines]) + body;
}

function rewriteCards(segment, omit) {
  return segment
    .replace(DOCUMENT_RE, (_match, name, meta) =>
      omit
        ? note(`File: ${safeName(name)}`, usefulDetails(meta))
        : heading(`File: ${name.trim()}`, usefulDetails(meta)),
    )
    .replace(IMAGE_RE, (_match, name, picture) => rewriteImage(name, picture));
}

function rewriteAttachments(content, omit, pastedCharLimit) {
  if (!content || typeof content !== 'string') return '';

  const blocks = findBlocks(content);
  if (blocks === null) return content;

  // Only the cards after the message text are rewritten; the text itself is kept.
  const head = blocks.length > 0 ? content.slice(0, blocks[0].start) : content;
  const cardsStart = trailingCardsStart(head);
  let result = head.slice(0, cardsStart) + rewriteCards(head.slice(cardsStart), omit);
  let cursor = head.length;
  for (const block of blocks) {
    result += rewriteCards(content.slice(cursor, block.start), omit);
    result += rewriteBlock(block, content, omit, pastedCharLimit);
    cursor = block.end;
  }
  return result + rewriteCards(content.slice(cursor), omit);
}

/**
 * Replaces every attached file, and long pasted text, in a message's markdown
 * with a one-line note. Short pasted text and images with their picture stay,
 * under sub-headings. Messages whose attachment markdown is ambiguous are
 * returned unchanged.
 * @param {string} content - Markdown content of a single user message
 * @param {{ pastedCharLimit?: number }} [options]
 * @returns {string}
 */
export function stripAttachments(content, { pastedCharLimit = PASTED_CONTENT_CHAR_LIMIT } = {}) {
  return rewriteAttachments(content, true, pastedCharLimit);
}

/**
 * Writes the attachments of a message whose files are kept under sub-headings.
 * Their content is never changed. Messages whose attachment markdown is
 * ambiguous are returned unchanged.
 * @param {string} content - Markdown content of a single user message
 * @returns {string}
 */
export function formatAttachmentHeadings(content) {
  return rewriteAttachments(content, false, PASTED_CONTENT_CHAR_LIMIT);
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
 * message; it only changes user messages. When the option is on, the files
 * stay and only their sub-headings get the new format.
 * @param {{ role?: string, content?: string }} msg
 * @param {{ includeAttachments?: boolean, pastedCharLimit?: number }} [options]
 * @returns {string} The message content to export
 */
export function applyAttachmentOption(msg, options = {}) {
  const content = msg && typeof msg.content === 'string' ? msg.content : '';
  if (!content || !isUserMessage(msg)) return content;
  if (options.includeAttachments !== false) return formatAttachmentHeadings(content);
  return stripAttachments(content, { pastedCharLimit: options.pastedCharLimit });
}
