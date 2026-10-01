import {
  ExportFormatter,
  getMessageNumbers,
  getTocItems,
  isArticleConversation,
  shouldIncludeAttribution,
  shouldIncludeTimestamps,
  formatMessageTimestamp,
  stripTags,
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

  // 2. Protect fenced and inline code before stripping HTML-like text.
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
      const closeMatch = line.match(/^[ ]{0,3}(`{3,}|~{3,})\s*$/);
      if (closeMatch && closeMatch[1][0] === fenceChar && closeMatch[1].length >= fenceLength) {
        inFence = false;
        const id = `@@CODE_BLOCK_${codeBlocks.length}@@`;
        codeBlocks.push(currentBlockLines.join('\n'));
        currentBlockLines = [];
        processedLines.push(id);
      }
    }
  }

  if (inFence && currentBlockLines.length > 0) {
    const id = `@@CODE_BLOCK_${codeBlocks.length}@@`;
    codeBlocks.push(currentBlockLines.join('\n'));
    processedLines.push(id);
  }

  text = processedLines.join('\n');

  const inlineCode = [];
  text = text.replace(/`([^`\n]+)`/g, (match, content) => {
    const id = `@@INLINE_CODE_${inlineCode.length}@@`;
    inlineCode.push(content);
    return id;
  });

  // 3. Strip well-formed HTML tags and comments
  text = stripTags(text);

  // 4. Normalize images: ![alt](url) -> [Image: alt]
  text = text.replace(/!\[([^\]]*)\]\(((?:\\.|[^()\\]|\([^()]*\))*)\)/g, (match, alt) => {
    const label = alt && alt.trim() ? alt.trim() : 'Image';
    return `[${label.startsWith('Image') ? label : `Image: ${label}`}]`;
  });

  // 5. Normalize links: [text](url) -> text (url) if text != url, else url
  text = text.replace(/\[([^\]]+)\]\(((?:\\.|[^()\\]|\([^()]*\))+)\)/g, (match, linkText, url) => {
    const t = linkText.trim();
    const u = url.trim().replace(/\\([()\\])/g, '$1');
    if (!t || t === u) return u;
    return `${t} (${u})`;
  });

  // 6. Normalize reference-style links [text][ref] -> text
  text = text.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');

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
  // Inline code was protected before HTML stripping; restore its literal contents.
  inlineCode.forEach((content, i) => {
    text = text.replace(`@@INLINE_CODE_${i}@@`, () => content);
  });

  // 9. Convert horizontal rules to simple plain divider line
  text = text.replace(
    /^[ ]{0,3}([-*_]){3,}[ \t]*$/gm,
    '--------------------------------------------------',
  );

  // 10. Normalize excessive blank lines and trim surrounding prose before restoring code blocks
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  // 11. Restore code blocks (stripping outer markdown backtick fences while preserving indented code content and internal newlines)
  for (let i = 0; i < codeBlocks.length; i++) {
    const rawBlock = codeBlocks[i];
    const strippedBlock = rawBlock
      .replace(/^[ ]{0,3}(?:`{3,}|~{3,})[^\n]*\r?\n?/, '')
      .replace(/\r?\n?[ ]{0,3}(?:`{3,}|~{3,})\s*$/, '');
    text = text.replace(`@@CODE_BLOCK_${i}@@`, () => strippedBlock);
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
        ? `Prompt${numberSuffix}${dateSuffix}`
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
