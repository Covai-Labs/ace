/**
 * Clean up LaTeX math formulas by unescaping common markdown parser artifacts.
 * @param {string} latex - Raw LaTeX math string
 * @returns {string} Cleaned LaTeX math
 */
export function cleanLatexMath(latex) {
  if (!latex || typeof latex !== "string") return "";
  return latex
    .replace(/\\\\([a-zA-Z]+)/g, "\\$1")
    .replace(/\\([_\][*])/g, "$1");
}

/**
 * Standardize LaTeX math delimiters in markdown text.
 * Converts LaTeX bracket delimiters (\[...\] and \(...\)) to standard markdown
 * math delimiters ($$...$$ and $...$) while protecting code blocks and inline code.
 *
 * @param {string} text - Input text/markdown
 * @returns {string} Text with normalized LaTeX math delimiters
 */
export function normalizeLatexMath(text) {
  if (!text || typeof text !== "string") return "";

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
  processed = processed.replace(
    /(?:\\{1,2}\[)([\s\S]+?)(?:\\{1,2}\])/g,
    (match, math) => {
      return `$$${cleanLatexMath(math).trim()}$$`;
    },
  );

  // 6. Convert inline math: \( ... \) or \\( ... \\)
  processed = processed.replace(
    /(?:\\{1,2}\()([\s\S]+?)(?:\\{1,2}\))/g,
    (match, math) => {
      return `$${cleanLatexMath(math).trim()}$`;
    },
  );

  // 7. Collapse excessive blank lines outside protected code
  processed = processed.replace(/\n{3,}/g, "\n\n");

  // 8. Restore protected items in reverse order
  for (let i = placeholders.length - 1; i >= 0; i--) {
    const { id, content } = placeholders[i];
    processed = processed.replace(id, () => content);
  }

  return processed;
}
