/**
 * Evaluates the quality and richness of extracted HTML content.
 * Higher scores indicate cleaner article body with good formatting (headings, code, tables)
 * and low link/navigation noise.
 *
 * @param {string} html
 * @returns {number} Quality score >= 0
 */
export function scoreContent(html) {
  if (!html || typeof html !== "string") return 0;

  // Strip HTML tags to get raw visible text
  const rawText = html.replace(/<[^>]+>/g, "").trim();
  const textLength = rawText.length;
  if (textLength < 30) return 0;

  // 1. Base score scaled logarithmically by text volume
  let score = Math.log10(textLength) * 25;

  // 2. Bonus for structural elements (paragraphs, headings)
  const paragraphs = (html.match(/<p[\s>]/gi) || []).length;
  const headings = (html.match(/<h[1-6][\s>]/gi) || []).length;
  score += paragraphs * 2 + headings * 4;

  // 3. High bonus for code blocks & tables (technical articles/documentation)
  const codeBlocks = (html.match(/<pre[\s>]/gi) || []).length;
  const tables = (html.match(/<table[\s>]/gi) || []).length;
  const listItems = (html.match(/<li[\s>]/gi) || []).length;
  score += codeBlocks * 20 + tables * 15 + Math.min(listItems, 20) * 1.5;

  // 4. Heavy penalty for anchor density (detects sidebar link farms / navigation headers)
  const linkMatches = html.match(/<a[^>]*>(.*?)<\/a>/gi) || [];
  const linkTextLength = linkMatches.reduce((acc, tag) => {
    return acc + tag.replace(/<[^>]+>/g, "").length;
  }, 0);

  const anchorDensity = textLength > 0 ? linkTextLength / textLength : 0;
  if (anchorDensity > 0.3) {
    score -= (anchorDensity - 0.3) * 150;
  }

  return Math.max(0, Math.round(score * 100) / 100);
}

/**
 * Normalizes an article title by trimming brand/site suffixes (e.g. "Article Title | Medium" -> "Article Title").
 *
 * @param {string} title
 * @param {string} [siteName]
 * @returns {string} Cleaned title
 */
export function cleanTitle(title, siteName = "") {
  if (!title || typeof title !== "string") return "Untitled";
  let cleaned = title.trim();

  // Strip known siteName if provided at end
  if (siteName && siteName.trim()) {
    const escapedSite = siteName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const siteRegex = new RegExp(
      `\\s*[\\|\\-–—:•·]\\s*${escapedSite}\\s*$`,
      "i",
    );
    cleaned = cleaned.replace(siteRegex, "");
  }

  // Strip general brand suffix if short (e.g., " | BrandName", " - The Verge")
  cleaned = cleaned
    .replace(/\s*[|\-–—•·]\s*[^|\-–—•·]+$/, (match) => {
      // If the trailing segment is relatively short (brand name), remove it
      const segment = match.replace(/^[\s|\-–—•·]+/, "").trim();
      return segment.length > 0 && segment.length <= 35 ? "" : match;
    })
    .trim();

  return cleaned || title.trim() || "Untitled";
}
