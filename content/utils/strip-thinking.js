/**
 * Thinking Process Stripping Utility
 * Removes AI reasoning / thought process blocks across multiple platform representations:
 * 1. DeepSeek / Qwen / Ollama: <think>...</think>
 * 2. ChatGPT: <details><summary>Thought Process</summary>...</details>
 * 3. Claude: > **Thinking Process:** blockquotes
 */

/**
 * Strips thinking / reasoning process blocks from markdown or text content.
 * @param {string} content - Markdown or text content
 * @returns {string} Content with thinking blocks removed
 */
export function stripThinking(content) {
  if (!content || typeof content !== 'string') return '';

  let cleaned = content;
  const placeholders = [];
  let tokenCounter = 0;

  // 1. Protect fenced code blocks (```...``` or ~~~...~~~)
  cleaned = cleaned.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, (match) => {
    const id = `__THINK_CODE_BLOCK_${tokenCounter++}__`;
    placeholders.push({ id, content: match });
    return id;
  });

  // 2. Protect inline code spans (`...`)
  cleaned = cleaned.replace(/(`+)([\s\S]*?)\1/g, (match) => {
    const id = `__THINK_INLINE_CODE_${tokenCounter++}__`;
    placeholders.push({ id, content: match });
    return id;
  });

  // 3. Remove <think>...</think> tags (case-insensitive)
  cleaned = cleaned.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '');

  // 4. Remove <details> blocks containing Thought / Thinking Process
  cleaned = cleaned.replace(
    /<details\b[^>]*>\s*<summary\b[^>]*>[\s\S]*?(?:Thought|Thinking)\s+Process[\s\S]*?<\/summary>[\s\S]*?<\/details>/gi,
    '',
  );

  // 5. Remove Claude blockquotes: > **Thinking Process:** ... up to non-quote line
  cleaned = cleaned.replace(/(?:^|\n)> \*\*Thinking Process:\*\*(?:[ \t]*\n>.*)*(?:\n|$)/gi, '\n');

  // 6. Restore protected code blocks and inline code
  for (const placeholder of placeholders) {
    cleaned = cleaned.replace(placeholder.id, () => placeholder.content);
  }

  // 7. Clean up leading/trailing empty lines
  cleaned = cleaned
    .replace(/^\s*\n+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned;
}
