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
    const rawSite = siteName.trim();
    const sepChars = ["|", "-", "–", "—", ":", "•", "·"];
    for (const sep of sepChars) {
      const sepIdx = cleaned.lastIndexOf(sep);
      if (sepIdx !== -1) {
        const candidate = cleaned.slice(sepIdx + 1).trim();
        if (candidate.localeCompare(rawSite, undefined, { sensitivity: "accent" }) === 0 ||
            candidate.toLowerCase() === rawSite.toLowerCase()) {
          cleaned = cleaned.slice(0, sepIdx).trim();
          break;
        }
      }
    }
  }

  // Strip general brand suffix if short (e.g., " | BrandName", " - The Verge")
  const sepMatch = cleaned.match(/[|\-–—•·](?=[^|\-–—•·]+$)/);
  if (sepMatch && sepMatch.index !== undefined) {
    const trailing = cleaned.slice(sepMatch.index + 1).trim();
    if (trailing.length > 0 && trailing.length <= 35) {
      cleaned = cleaned.slice(0, sepMatch.index).trim();
    }
  }

  return cleaned || title.trim() || "Untitled";
}
