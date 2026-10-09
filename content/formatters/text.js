import {
  ExportFormatter,
  getMessageNumbers,
  getTocItems,
  isArticleConversation,
  shouldIncludeAttribution,
  shouldIncludeTimestamps,
  formatMessageTimestamp,
  stripTags,
  getOmittedAttachmentsSuffix,
} from './base.js';

/**
 * Strips base64 data URIs and replaces them with clean image placeholders.
 * @param {string} text
 * @returns {string}
 */
export function stripEncodedImages(text) {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text.replace(
    /!\[([^\]]*)\]\((?:data:image(?:\/|\\\/)[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=\s\\]+)\)/gi,
    (match, alt) => {
      const label = alt && alt.trim() ? alt.trim() : 'Image';
      return `[Image: ${label}]`;
    },
  );
  cleaned = cleaned.replace(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/gi, '[Image Data]');
  return cleaned;
}

/**
 * Converts Markdown text into clean, readable plain text.
 * Preserves code block indentation and content, converts links,
 * and strips HTML tags, image data, and markdown decorative markers.
 * @param {string} markdown
 * @returns {string}
 */
export function markdownToPlainText(markdown) {
  if (!markdown || typeof markdown !== 'string') return '';

  // 1. Strip encoded base64 images first to prevent huge payloads
  let text = stripEncodedImages(markdown);

  // 2. Protect fenced code blocks before stripping HTML-like text.
  const codeBlocks = [];
  const lines = text.split('\n');
  const processedLines = [];
  let inFence = false;
  let fenceChar = '';
  let fenceLength = 0;
  let currentBlockLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inFence) {
      const match = line.match(/^[ ]{0,3}(`{3,}|~{3,})(.*)$/);
      if (match) {
        inFence = true;
        fenceChar = match[1][0];
        fenceLength = match[1].length;
        currentBlockLines = [line];
        continue;
      }
      processedLines.push(line);
    } else {
      currentBlockLines.push(line);
      const closeMatch = line.match(/^[ ]{0,3}(`{3,}|~{3,})[ \t]*$/);
      if (closeMatch && closeMatch[1][0] === fenceChar && closeMatch[1].length >= fenceLength) {
        inFence = false;
        const id = `@@CODE_BLOCK_${codeBlocks.length}@@`;
        codeBlocks.push({ lines: currentBlockLines.join('\n'), closed: true });
        currentBlockLines = [];
        processedLines.push(id);
      }
    }
  }

  if (inFence && currentBlockLines.length > 0) {
    const id = `@@CODE_BLOCK_${codeBlocks.length}@@`;
    codeBlocks.push({ lines: currentBlockLines.join('\n'), closed: false });
    processedLines.push(id);
  }

  // 2b. Protect CommonMark indented code blocks (4-space or tab indent after a blank line).
  // Distinguishes code indentation from list item continuations and mixed space/tab indentations.
  const postFenceLines = processedLines.join('\n').split('\n');
  const finalLines = [];
  let prevWasBlank = true; // treat start-of-input as blank
  let inList = false;

  const isIndent = (l) => /^(?: {4}|\t| {1,3}\t)/.test(l);
  const isListMarker = (l) => /^[ ]{0,3}(?:[*+-]|\d+[.)])[ \t]+/.test(l);

  for (let i = 0; i < postFenceLines.length; i++) {
    const line = postFenceLines[i];
    const isBlank = /^\s*$/.test(line);
    const isIndented = isIndent(line);
    const isPlaceholder = /^@@CODE_BLOCK_\d+@@$/.test(line);
    const isList = isListMarker(line);

    if (isList) {
      inList = true;
      finalLines.push(line);
      prevWasBlank = false;
    } else if (!isBlank && !isIndented) {
      inList = false;
      finalLines.push(line);
      prevWasBlank = false;
    } else if (isIndented && prevWasBlank && !isPlaceholder && !inList) {
      // Find contiguous indented lines, preserving any trailing blank lines for outer prose
      let lastIndented = i;
      for (let k = i + 1; k < postFenceLines.length; k++) {
        if (isIndent(postFenceLines[k])) {
          lastIndented = k;
        } else if (/^\s*$/.test(postFenceLines[k])) {
          continue;
        } else {
          break;
        }
      }
      const blockLines = postFenceLines.slice(i, lastIndented + 1);
      const id = `@@CODE_BLOCK_${codeBlocks.length}@@`;
      const blockContent = blockLines.map((l) => l.replace(/^(?: {4}|\t| {1,3}\t)/, '')).join('\n');
      codeBlocks.push({ lines: blockContent, closed: true, indented: true });
      finalLines.push(id);
      i = lastIndented;
      prevWasBlank = false;
    } else {
      finalLines.push(line);
      prevWasBlank = isBlank;
    }
  }

  text = finalLines.join('\n');

  const inlineCode = [];
  // Match CommonMark inline code spans: must not cross a blank line (paragraph boundary).
  // Supports both LF and CRLF line endings.
  text = text.replace(
    /(?<!`)(`+)(?!`)((?:(?!\r?\n[ \t]*\r?\n)[\s\S])+?)(?<!`)\1(?!`)/g,
    (match, delim, rawContent) => {
      let content = rawContent.replace(/\r?\n/g, ' ');
      if (content.startsWith(' ') && content.endsWith(' ') && content.trim().length > 0) {
        content = content.slice(1, -1);
      }
      const id = `@@INLINE_CODE_${inlineCode.length}@@`;
      inlineCode.push(content);
      return id;
    },
  );

  // 3. Normalize links and images BEFORE stripTags to protect angle-bracketed destinations
  // (e.g. [manual](<guide>)) from being removed as HTML tags.
  // Destination pattern: angle-bracketed <url with spaces and escapes> OR bare URL with up to 4 levels of
  // nested balanced parentheses. p0 excludes backslash from the bare-char class so only \\. consumes it.
  const p0 = '(?:\\\\.|[^()\\s\\\\])';
  const p1 = `(?:${p0}|\\(${p0}*\\))`;
  const p2 = `(?:${p0}|\\(${p1}*\\))`;
  const p3 = `(?:${p0}|\\(${p2}*\\))`;
  const p4 = `(?:${p0}|\\(${p3}*\\))`;
  const ANGLE_DEST = '<((?:\\\\.|[^<>\\r\\n\\\\])*)>';
  const BARE_DEST = `(${p4}*)`;
  const destPattern = `\\((?:${ANGLE_DEST}|${BARE_DEST})(?:\\s+["'][^"']*["'])?\\)`;
  const imgRe = new RegExp(`!\\[([^\\]]*)\\]${destPattern}`, 'g');
  const linkRe = new RegExp(`\\[([^\\]]+)\\]${destPattern}`, 'g');

  // Normalize images: ![alt](url) -> [Image: alt]
  text = text.replace(imgRe, (match, alt) => {
    const label = alt && alt.trim() ? alt.trim() : 'Image';
    return `[${label.startsWith('Image') ? label : `Image: ${label}`}]`;
  });

  // Normalize links: [text](url) -> text (url) if text != url, else url
  // angleDest captures <url> destinations; bareDest captures bare URL destinations.
  text = text.replace(linkRe, (match, linkText, angleDest, bareDest) => {
    const t = linkText.trim();
    const rawUrl = angleDest != null ? angleDest : bareDest || '';
    const u = rawUrl.trim().replace(/\\([()<>\\])/g, '$1');
    if (!t || t === u) return u;
    return `${t} (${u})`;
  });

  // Normalize reference-style links [text][ref] -> text
  text = text.replace(/\[([^\\]]+)\]\[[^\\]]*\]/g, '$1');

  // 4. Strip well-formed HTML tags and comments from remaining prose
  text = stripTags(text);

  // 7. Strip ATX headings prefixes (e.g., "# Heading" -> "Heading")
  text = text.replace(/^[ ]{0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/gm, '$1');

  // 7b. Strip blockquote prefixes (e.g., "> Quote" -> "Quote")
  text = text.replace(/^[ ]{0,3}>[ \t]?/gm, '');

  // 8. Strip bold, italic, strikethrough markers while preserving inner text
  // Bold & italic (***text*** or ___text___)
  text = text.replace(/(\*\*\*|___)(?!\s)(.+?)(?<!\s)\1/g, '$2');
  // Bold (**text** or __text__)
  text = text.replace(/(\*\*|__)(?!\s)(.+?)(?<!\s)\1/g, '$2');
  // Italic (*text* or _text_)
  text = text.replace(/(^|[^\w*])\*([^\s*](?:[^*]*[^\s*])?)\*(?=[^\w*]|$)/g, '$1$2');
  text = text.replace(/(^|[^\w_])_([^\s_](?:[^_]*[^\s_])?)_(?=[^\w_]|$)/g, '$1$2');
  // Strikethrough (~~text~~)
  text = text.replace(/~~(?!\s)(.+?)(?<!\s)~~/g, '$1');

  // 9. Convert horizontal rules to simple plain divider line (before restoring inline code)
  text = text.replace(
    /^[ ]{0,3}([-*_]){3,}[ \t]*$/gm,
    '--------------------------------------------------',
  );

  // 10. Normalize excessive blank lines and trim surrounding prose before restoring code
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  // 11. Restore inline code first so its placeholders inside fenced blocks are not substituted
  for (let i = 0; i < inlineCode.length; i++) {
    text = text.replace(`@@INLINE_CODE_${i}@@`, () => inlineCode[i]);
  }

  // 12. Restore code blocks; only strip closing fence when the block was properly closed
  for (let i = 0; i < codeBlocks.length; i++) {
    const block = codeBlocks[i];
    let blockContent;
    if (block.indented) {
      // Indented blocks: leading indent already stripped during collection
      blockContent = block.lines;
    } else {
      // Fenced blocks: remove opening fence line
      blockContent = block.lines.replace(/^[ ]{0,3}(?:`{3,}|~{3,})[^\n]*\r?\n?/, '');
      // Only remove the closing fence line when the block was actually closed
      if (block.closed) {
        blockContent = blockContent.replace(/\r?\n?[ ]{0,3}(?:`{3,}|~{3,})[ \t]*$/, '');
      }
    }
    text = text.replace(`@@CODE_BLOCK_${i}@@`, () => blockContent);
  }

  return text;
}

export class TextFormatter extends ExportFormatter {
  format(conversation, options = {}) {
    if (!conversation) return '';
    const { title, messages = [] } = conversation;
    const now = new Date();
    const formattedDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${now.toLocaleTimeString('en-US', { hour12: false })}`;

    let output = `${title || 'AI Chat Export'}\n\n`;

    if (shouldIncludeAttribution(options)) {
      output += `Exported with: AI Chat Exporter (https://ace.covai.org)\n`;
    }

    const metadata = conversation.metadata || {};
    const platform = metadata.Source || 'AI';
    const date = metadata.Date || formattedDate;
    const link = conversation.url || metadata.Link || '';
    const model = metadata.Model;
    const method = metadata.Method;

    output += `Source: ${platform}\n`;
    output += `Date: ${date}\n`;

    if (link) {
      output += `Link: ${link}\n`;
    }

    if (model) {
      output += `Model: ${model}\n`;
    }

    if (method) {
      output += `Method: ${method}\n`;
    }

    const standardKeys = new Set(['Source', 'Date', 'Link', 'Model', 'Method']);
    Object.entries(metadata).forEach(([key, value]) => {
      if (!standardKeys.has(key) && value) {
        output += `${key}: ${value}\n`;
      }
    });

    output += `\n`;

    const isWebArticle = isArticleConversation(conversation);
    const messageNumbers = getMessageNumbers(messages, options.messageNumbering);
    const showToc = Boolean(options?.includeToc) && !isWebArticle && messages.length > 0;

    if (showToc) {
      const tocItems = getTocItems(messages, {
        messageNumbering: options.messageNumbering,
        includeTimestamps: shouldIncludeTimestamps(options),
        platform,
      });

      output += `Table of Contents\n\n`;
      tocItems.forEach((item, tocIdx) => {
        const numberPrefix = item.number !== null ? `[${item.number}] ` : '';
        const dateSuffix = item.timestamp ? ` — ${item.timestamp}` : '';
        output += `${tocIdx + 1}. ${numberPrefix}${item.label}: ${item.snippet}${dateSuffix}\n`;
      });
      output += `\n`;
    }

    const headingTextFor = (msg, msgIndex) => {
      const msgNumber = messageNumbers[msgIndex];
      const numberSuffix = msgNumber !== null ? ` [${msgNumber}]` : '';
      const timestamp = shouldIncludeTimestamps(options)
        ? formatMessageTimestamp(msg?.timestamp)
        : null;
      const dateSuffix = timestamp ? ` — ${timestamp}` : '';
      return msg?.role === 'User'
        ? `Prompt${numberSuffix}${getOmittedAttachmentsSuffix(msg)}${dateSuffix}`
        : `Response${numberSuffix}${dateSuffix}`;
    };

    messages.forEach((msg, msgIndex) => {
      const isArticleRole = msg.role === 'Article' || msg.role === 'Web Article';
      const processedContent = markdownToPlainText(msg.content);

      if (isWebArticle || isArticleRole) {
        output += `${processedContent}\n\n`;
      } else {
        output += `${headingTextFor(msg, msgIndex)}:\n`;
        output += `${processedContent}\n\n`;
      }
    });

    return output.trimEnd() + '\n';
  }

  getFileExtension() {
    return 'txt';
  }

  getMimeType() {
    return 'text/plain';
  }
}
