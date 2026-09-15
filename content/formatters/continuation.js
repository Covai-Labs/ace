import { ExportFormatter } from './base.js';

export function stripEncodedImages(content) {
  if (!content) return '';
  // 1. Replace markdown images with base64 data URIs: ![alt](data:image/...) -> [Image: alt]
  let cleaned = content.replace(
    /!\[([^\]]*)\]\(data:image\/[^;]+;base64,[^)]+\)/gi,
    (match, alt) => {
      const label = alt && alt.trim() && !alt.startsWith('http') ? alt.trim() : 'Image';
      return `[${label}]`;
    },
  );

  // 2. Replace standalone base64 data URIs
  cleaned = cleaned.replace(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/gi, '[Image Data]');

  // 3. Clean up consecutive newlines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}

export const DEFAULT_TRANSFER_INSTRUCTION =
  'Please review the conversation history above and continue our conversation from where we left off.';

export const DEFAULT_TRANSFER_PROMPT_TEMPLATE = `Here is the context of our previous conversation on {source}{title}:

{history}

--- Continuation Instruction ---
{instruction}`;

export const DEFAULT_ARTICLE_PROMPT_TEMPLATE = `Here is content extracted from {title} ({source}):

{history}

--- Instruction ---
{instruction}`;

export const DEFAULT_ARTICLE_INSTRUCTION =
  'Please use the extracted content above as context for our conversation.';

export const DEFAULT_SELECTION_PROMPT_TEMPLATE = `Here is an excerpt from {title} ({source}):

{history}

--- Instruction ---
{instruction}`;

export const DEFAULT_SELECTION_INSTRUCTION = 'Please explain or analyze the excerpt above.';

export function formatSelectionPrompt(selectionText, opts = {}) {
  const cleanedSelection = stripEncodedImages(selectionText || '').trim();
  const title = (opts.title || '').trim();
  const source = (opts.source || opts.url || '').trim();
  const instruction =
    opts.instruction && opts.instruction.trim().length > 0
      ? opts.instruction.trim()
      : DEFAULT_SELECTION_INSTRUCTION;
  const template =
    typeof opts.template === 'string' && opts.template.includes('{history}')
      ? opts.template
      : DEFAULT_SELECTION_PROMPT_TEMPLATE;

  const displayTitle = title || 'Web Page';
  const displaySource = source || (title ? 'Web Page' : 'Unknown Source');

  return applyPromptTemplate(template, {
    title: displayTitle,
    source: displaySource,
    history: cleanedSelection,
    instruction,
  });
}

export function applyPromptTemplate(template, vars) {
  const fallback = DEFAULT_TRANSFER_PROMPT_TEMPLATE;
  const out = typeof template === 'string' && template.includes('{history}') ? template : fallback;
  // Single pass: placeholder text inside substituted values is preserved.
  return out.replace(/\{(source|title|history|instruction)\}/g, (match, key) => vars[key] || '');
}

export class ContinuationFormatter extends ExportFormatter {
  format(conversation, customInstruction = '', opts = {}) {
    const { title, messages } = conversation;
    const sourcePlatform = conversation.metadata?.Source || 'AI Platform';

    const formattedMessages = messages
      .map((msg) => {
        const role = msg.role === 'User' ? 'User' : 'Assistant';
        const cleanedContent = stripEncodedImages(msg.content);
        return `[${role}]: ${cleanedContent}`;
      })
      .join('\n\n');

    const isArticle =
      opts.isArticle === true ||
      /web\s*article/i.test(sourcePlatform || '') ||
      conversation.metadata?.isArticle === true;
    const instruction =
      customInstruction && customInstruction.trim().length > 0
        ? customInstruction.trim()
        : isArticle
          ? DEFAULT_ARTICLE_INSTRUCTION
          : DEFAULT_TRANSFER_INSTRUCTION;
    const template =
      typeof opts.template === 'string' && opts.template.includes('{history}')
        ? opts.template
        : isArticle
          ? DEFAULT_ARTICLE_PROMPT_TEMPLATE
          : DEFAULT_TRANSFER_PROMPT_TEMPLATE;

    return applyPromptTemplate(template, {
      source: sourcePlatform,
      title: title ? ` ("${title}")` : '',
      history: formattedMessages,
      instruction,
    });
  }

  formatSelection(selectionText, opts = {}) {
    return formatSelectionPrompt(selectionText, opts);
  }

  getFileExtension() {
    return 'txt';
  }

  getMimeType() {
    return 'text/plain';
  }
}
