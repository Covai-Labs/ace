import {
  ExportFormatter,
  getMessageNumbers,
  getTocItems,
  isArticleConversation,
  shouldIncludeAttribution,
  shouldIncludeTimestamps,
  formatMessageTimestamp,
  slugifyHeading,
} from './base.js';

function cleanLatexMath(latex) {
  if (!latex || typeof latex !== 'string') return '';
  return latex.replace(/\\\\([a-zA-Z]+)/g, '\\$1').replace(/\\([_\][*])/g, '$1');
}

export function normalizeLatexMath(text) {
  if (!text || typeof text !== 'string') return '';

  const placeholders = [];
  let tokenCounter = 0;

  // 1. Protect fenced code blocks (``` ... ``` or ~~~ ... ~~~)
  let processed = text.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, (match) => {
    const id = `@@MATH_CODE_BLOCK_${tokenCounter++}@@`;
    placeholders.push({ id, content: match });
    return id;
  });

  // 2. Protect inline code (`...`)
  processed = processed.replace(/`([^`\n]+?)`/g, (match) => {
    const id = `@@MATH_INLINE_CODE_${tokenCounter++}@@`;
    placeholders.push({ id, content: match });
    return id;
  });

  // 3. Protect existing display math ($$ ... $$) and clean any escaped LaTeX syntax
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, math) => {
    const id = `@@MATH_DISPLAY_${tokenCounter++}@@`;
    placeholders.push({ id, content: `$$${cleanLatexMath(math)}$$` });
    return id;
  });

  // 4. Protect existing inline math ($ ... $) and clean any escaped LaTeX syntax
  processed = processed.replace(/\$([^$\n]+?)\$/g, (match, math) => {
    const id = `@@MATH_INLINE_${tokenCounter++}@@`;
    placeholders.push({ id, content: `$${cleanLatexMath(math)}$` });
    return id;
  });

  // 5. Convert display math: \[ ... \] or \\[ ... \\]
  processed = processed.replace(/(?:\\{1,2}\[)([\s\S]+?)(?:\\{1,2}\])/g, (match, math) => {
    return `$$${cleanLatexMath(math).trim()}$$`;
  });

  // 6. Convert inline math: \( ... \) or \\( ... \\)
  processed = processed.replace(/(?:\\{1,2}\()([\s\S]+?)(?:\\{1,2}\))/g, (match, math) => {
    return `$${cleanLatexMath(math).trim()}$`;
  });

  // 7. Collapse excessive blank lines outside protected code
  processed = processed.replace(/\n{3,}/g, '\n\n');

  // 8. Restore protected items in reverse order
  for (let i = placeholders.length - 1; i >= 0; i--) {
    const { id, content } = placeholders[i];
    processed = processed.replace(id, () => content);
  }

  return processed;
}

export function extractBase64ImagesToReference(
  text,
  imageCounter = { count: 1 },
  definitions = [],
  occupiedLabels = new Set(),
) {
  if (!text || typeof text !== 'string') return { text: '', definitions };

  // Collect existing reference labels from text to avoid collisions
  const labelMatches = text.match(/\[([^\]]+)\]/g);
  if (labelMatches) {
    labelMatches.forEach((m) => {
      occupiedLabels.add(m.slice(1, -1).trim().toLowerCase());
    });
  }

  // Match markdown images with data:image/ URIs (including escaped slashes or line breaks in base64)
  const processed = text.replace(
    /!\[([\s\S]*?)\]\((data:image(?:\/|\\\/)[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=\s\\]+)\)/gi,
    (match, alt, dataUri) => {
      while (occupiedLabels.has(`image-${imageCounter.count}`.toLowerCase())) {
        imageCounter.count++;
      }
      const label = `image-${imageCounter.count++}`;
      occupiedLabels.add(label.toLowerCase());
      const cleanUri = dataUri.replace(/\\\//g, '/').replace(/\s+/g, '');
      definitions.push(`[${label}]: ${cleanUri}`);
      return `![${alt}][${label}]`;
    },
  );

  return { text: processed, definitions };
}

export class MarkdownFormatter extends ExportFormatter {
  format(conversation, options = {}) {
    const { title, messages } = conversation;
    const now = new Date();
    const formattedDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${now.toLocaleTimeString('en-US', { hour12: false })}`;

    let output = `# ${title || 'AI Chat Export'}\n\n`;

    if (shouldIncludeAttribution(options)) {
      output += `**Exported with:** [AI Chat Exporter](https://ace.covai.org)  \n`;
    }

    const metadata = conversation.metadata || {};
    const platform = metadata.Source || 'AI';
    const date = metadata.Date || formattedDate;
    const link = conversation.url || metadata.Link || '';
    const model = metadata.Model;
    const method = metadata.Method;

    output += `**Source:** ${platform}  \n`;
    output += `**Date:** ${date}  \n`;

    if (link) {
      output += `**Link:** [${link}](${link})  \n`;
    }

    if (model) {
      output += `**Model:** ${model}  \n`;
    }

    if (method) {
      output += `**Method:** ${method}  \n`;
    }

    const standardKeys = new Set(['Source', 'Date', 'Link', 'Model', 'Method']);
    Object.entries(metadata).forEach(([key, value]) => {
      if (!standardKeys.has(key) && value) {
        if (typeof value === 'string' && value.startsWith('http')) {
          output += `**${key}:** [${value}](${value})  \n`;
        } else {
          output += `**${key}:** ${value}  \n`;
        }
      }
    });

    output += `\n`;

    const isWebArticle = isArticleConversation(conversation);
    const messageNumbers = getMessageNumbers(messages, options.messageNumbering);
    const showToc = Boolean(options?.includeToc) && !isWebArticle && messages.length > 0;
    const tocItems = showToc
      ? getTocItems(messages, {
          messageNumbering: options.messageNumbering,
          includeTimestamps: shouldIncludeTimestamps(options),
          platform,
        })
      : [];

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

    if (showToc) {
      // Unique anchors, GitHub-style: first use bare, repeats get -1, -2.
      // Content headings consume slugs too (renderers number every heading
      // in document order), so register them interleaved with ours.
      const slugCounts = new Map();
      const uniqueSlug = (text) => {
        const base = slugifyHeading(text);
        const seen = slugCounts.get(base) || 0;
        slugCounts.set(base, seen + 1);
        return seen === 0 ? base : `${base}-${seen}`;
      };
      uniqueSlug('Table of Contents');
      const anchors = tocItems.map((item) => {
        const anchor = uniqueSlug(headingTextFor(messages[item.index], item.index));
        const content = messages[item.index]?.content || '';
        for (const match of String(content).matchAll(/^#{1,6}\s+(.+)$/gm)) {
          uniqueSlug(match[1]);
        }
        return anchor;
      });
      output += `## Table of Contents\n\n`;
      tocItems.forEach((item, tocIdx) => {
        const numberPrefix = item.number !== null ? `[${item.number}] ` : '';
        const dateSuffix = item.timestamp ? ` — ${item.timestamp}` : '';
        const linkText = `${numberPrefix}${item.label}: ${item.snippet}${dateSuffix}`
          .replace(/\s+/g, ' ')
          .replace(/[\\[\]]/g, '\\$&');
        output += `- [${linkText}](#${anchors[tocIdx]})\n`;
      });
      output += `\n`;
    }
    const imageCounter = { count: 1 };
    const imageDefinitions = [];
    const occupiedLabels = new Set();

    // Pre-collect existing reference labels across all messages
    messages.forEach((msg) => {
      if (msg.content && typeof msg.content === 'string') {
        const matches = msg.content.match(/\[([^\]]+)\]/g);
        if (matches) {
          matches.forEach((m) => {
            occupiedLabels.add(m.slice(1, -1).trim().toLowerCase());
          });
        }
      }
    });

    messages.forEach((msg, msgIndex) => {
      const isArticleRole = msg.role === 'Article' || msg.role === 'Web Article';
      const normalized = normalizeLatexMath(msg.content);
      const { text: processedContent } = extractBase64ImagesToReference(
        normalized,
        imageCounter,
        imageDefinitions,
        occupiedLabels,
      );

      if (isWebArticle || isArticleRole) {
        output += `${processedContent}\n\n`;
      } else {
        output += `## ${headingTextFor(msg, msgIndex)}:\n`;
        output += `${processedContent}\n\n`;
      }
    });

    if (imageDefinitions.length > 0) {
      output += `<!-- Image References -->\n\n${imageDefinitions.join('\n\n')}\n\n`;
    }

    return output;
  }

  getFileExtension() {
    return 'md';
  }

  getMimeType() {
    return 'text/markdown';
  }
}
