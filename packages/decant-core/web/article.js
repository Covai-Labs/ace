import { Readability } from "@mozilla/readability";
import Defuddle from "defuddle";
import { extractFromHtml } from "@extractus/article-extractor";
import { convertToMarkdown } from "../utils/html-to-markdown.js";
import { scoreContent, cleanTitle } from "./scoring.js";
import { ChatParser } from "../ai/base.js";

/**
 * Resolves a Document object from a document or an HTML string.
 * Works seamlessly in browser DOM and Node/testing environments (via linkedom).
 *
 * @param {Document|string} docOrHtml
 * @param {string} [url]
 * @returns {Promise<{ doc: Document, rawHtml: string, url: string }>}
 */
async function resolveDocument(docOrHtml, url = "") {
  let doc = null;
  let rawHtml = "";
  let finalUrl = url;

  if (typeof docOrHtml === "string") {
    rawHtml = docOrHtml;
    if (typeof DOMParser !== "undefined") {
      doc = new DOMParser().parseFromString(docOrHtml, "text/html");
    } else {
      const { parseHTML } = await import("linkedom");
      const parsed = parseHTML(docOrHtml);
      doc = parsed.document;
    }
  } else if (
    docOrHtml &&
    typeof docOrHtml === "object" &&
    docOrHtml.documentElement
  ) {
    doc = docOrHtml;
    rawHtml = docOrHtml.documentElement.innerHTML || "";
    if (
      !finalUrl &&
      docOrHtml.location &&
      docOrHtml.location.href &&
      docOrHtml.location.href !== "about:blank"
    ) {
      finalUrl = docOrHtml.location.href;
    }
  } else if (typeof document !== "undefined") {
    doc = document;
    rawHtml = document.documentElement.innerHTML || "";
    if (!finalUrl && typeof window !== "undefined" && window.location) {
      finalUrl = window.location.href;
    }
  }

  if (!finalUrl) {
    finalUrl = "https://localhost/article";
  }

  return { doc, rawHtml, url: finalUrl };
}

/**
 * Extracts content from any web page running Readability, Defuddle,
 * and Article-Extractor in parallel, with intelligent scoring and arbitration.
 *
 * @param {Document|string} [docOrHtml] - Document or HTML string
 * @param {Object} [options] - Options { url?: string, turndownOptions?: object }
 * @returns {Promise<{
 *   title: string,
 *   author: string,
 *   published: string,
 *   siteName: string,
 *   description: string,
 *   image: string,
 *   url: string,
 *   content: string,
 *   htmlContent: string,
 *   markdown: string,
 *   engine: 'readability' | 'defuddle' | 'raw',
 *   wordCount: number
 * }>}
 */
export async function extractArticleIntelligent(docOrHtml, options = {}) {
  const { doc, rawHtml, url } = await resolveDocument(docOrHtml, options.url);

  if (!doc) {
    throw new Error(
      "Unable to resolve a valid Document object for extraction.",
    );
  }

  // 1. Run all 3 extractors concurrently
  const [readabilitySettled, defuddleSettled, extractusSettled] =
    await Promise.allSettled([
      // Mozilla Readability
      Promise.resolve().then(() => {
        try {
          const clone = doc.cloneNode(true);
          const reader = new Readability(clone);
          return reader.parse();
        } catch {
          return null;
        }
      }),
      // Defuddle
      Promise.resolve().then(() => {
        try {
          const defuddle = new Defuddle(doc, { url });
          return defuddle.parse();
        } catch {
          return null;
        }
      }),
      // Article-Extractor (Metadata & JSON-LD)
      Promise.resolve().then(async () => {
        try {
          if (!rawHtml) return null;
          return await extractFromHtml(rawHtml, url);
        } catch {
          return null;
        }
      }),
    ]);

  const rData =
    readabilitySettled.status === "fulfilled" ? readabilitySettled.value : null;
  const dData =
    defuddleSettled.status === "fulfilled" ? defuddleSettled.value : null;
  const mData =
    extractusSettled.status === "fulfilled" ? extractusSettled.value : null;

  // 2. Best-of-breed Metadata Resolution
  const ogSiteName = doc
    .querySelector?.('meta[property="og:site_name"], meta[name="og:site_name"]')
    ?.getAttribute?.("content");
  const metaAuthor = doc
    .querySelector?.('meta[name="author"], meta[property="article:author"]')
    ?.getAttribute?.("content");
  const siteName =
    ogSiteName || mData?.source || rData?.siteName || dData?.site || "";

  const articleH1 = doc
    .querySelector?.("article h1, main h1")
    ?.textContent?.trim();
  const rawTitle =
    articleH1 && articleH1.length > 3
      ? articleH1
      : mData?.title || rData?.title || dData?.title || doc.title || "Untitled";
  const title = cleanTitle(rawTitle, siteName);

  const author =
    metaAuthor || mData?.author || rData?.byline || dData?.author || "";
  const published =
    mData?.published || rData?.publishedTime || dData?.published || "";
  const description =
    mData?.description || rData?.excerpt || dData?.description || "";
  const image = mData?.image || dData?.image || "";

  // 3. Content Quality Scoring & Arbitration
  const rHtml = rData?.content || "";
  const dHtml = dData?.content || "";

  const rScore = scoreContent(rHtml);
  const dScore = scoreContent(dHtml);

  let bestHtml;
  let winningEngine;

  if (rScore === 0 && dScore === 0) {
    // Fallback: take main/article or body
    const mainEl = doc.querySelector(
      "main, article, #content, .content, .post",
    );
    bestHtml = mainEl
      ? mainEl.innerHTML
      : doc.body
        ? doc.body.innerHTML
        : rawHtml;
    winningEngine = "raw";
  } else if (rScore >= dScore) {
    bestHtml = rHtml || dHtml;
    winningEngine = "readability";
  } else {
    bestHtml = dHtml || rHtml;
    winningEngine = "defuddle";
  }

  // 4. Convert to Markdown using decant-core convertToMarkdown
  let markdownBody;
  try {
    const container = doc.createElement("div");
    container.innerHTML = bestHtml;
    markdownBody = convertToMarkdown(container, options.turndownOptions || {});
  } catch {
    markdownBody = convertToMarkdown(bestHtml, options.turndownOptions || {});
  }
  const cleanMarkdown = markdownBody ? markdownBody.trim() : "";
  const fullMarkdown = title ? `# ${title}\n\n${cleanMarkdown}` : cleanMarkdown;

  // Approximate word count
  const rawText = bestHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const wordCount = rawText ? rawText.split(" ").length : 0;

  return {
    title,
    author,
    published,
    siteName,
    description,
    image,
    url,
    content: cleanMarkdown,
    htmlContent: bestHtml,
    markdown: fullMarkdown,
    engine: winningEngine,
    wordCount,
  };
}

/**
 * Standard alias for extractArticleIntelligent.
 */
export const extractArticle = extractArticleIntelligent;

/**
 * ArticleParser conforms to the decant-core Parser interface,
 * allowing extensions to treat generic web pages uniformly alongside AI chat parsers.
 */
export class ArticleParser extends ChatParser {
  name = "WebArticle";

  getPlatformName() {
    return "Web Article";
  }

  /**
   * Always available for standard HTTP/HTTPS URLs.
   * @param {string} url
   * @returns {boolean}
   */
  isAvailable(url) {
    if (!url || typeof url !== "string") return false;
    if (
      typeof window !== "undefined" &&
      window.self &&
      window.top &&
      window.self !== window.top
    ) {
      return false;
    }
    return (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("file://")
    );
  }

  /**
   * Parses the current document into a standardized format.
   * @param {Object} [options]
   * @returns {Promise<{
   *   title: string,
   *   messages: Array<{ role: string, content: string }>,
   *   metadata: Record<string, string>,
   *   url: string
   * }>}
   */
  async parse(options = {}) {
    const article = await extractArticleIntelligent(
      typeof document !== "undefined" ? document : null,
      options,
    );

    return {
      title: article.title,
      messages: [
        {
          role: "Assistant",
          content: article.content,
        },
      ],
      metadata: {
        Source: article.siteName || "Web Article",
        Author: article.author || "",
        Date: article.published || new Date().toISOString().split("T")[0],
        Description: article.description || "",
        Engine: article.engine,
      },
      url: article.url,
      rawArticle: article,
    };
  }
}
