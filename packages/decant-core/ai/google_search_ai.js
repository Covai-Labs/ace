import { ChatParser } from "./base.js";
import { convertToMarkdown } from "../utils/html-to-markdown.js";

function cleanAriaLabel(label) {
  if (!label) return "";
  return label
    .replace(/\s*\.\s*Opens in new tab\.?\s*$/i, "")
    .replace(/\s*\.\s*Related results\s*$/i, "")
    .replace(/\s*,\s*Video,\s*watch on YouTube\s*$/i, "")
    .trim();
}

export function extractSourcesFromRhs(turnEl) {
  if (!turnEl || typeof turnEl.querySelector !== "function") return [];
  const rhs = turnEl.querySelector('[data-container-id="rhs-col"]');
  if (!rhs) return [];

  const cards = rhs.querySelectorAll(".cRH23c, [data-src-id]");
  const sources = [];
  const seenUrls = new Set();

  for (const card of cards) {
    const link = card.querySelector("a[href]");
    if (!link) continue;
    let url = link.getAttribute("href") || "";
    if (url.startsWith("/goto?") || url.startsWith("/url?")) {
      try {
        const parsed = new URL(url, "https://www.google.com");
        url =
          parsed.searchParams.get("url") ||
          parsed.searchParams.get("q") ||
          url;
      } catch {
        // Keep original url
      }
    }
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);

    let title = cleanAriaLabel(link.getAttribute("aria-label"));
    if (!title) {
      title = card.textContent.trim().split("\n")[0].trim() || url;
    }
    sources.push({ title, url });
  }
  return sources;
}

export function sanitizeResponseContainer(container) {
  if (!container) return container;
  const clone =
    typeof container.cloneNode === "function"
      ? container.cloneNode(true)
      : container;

  // 1. Remove script, style, and noscript elements to prevent inline script leakage
  const unwanted = clone.querySelectorAll
    ? clone.querySelectorAll("script, style, noscript")
    : [];
  unwanted.forEach((el) => el.remove());

  // 2. Remove base64 inline images to prevent megabyte-scale text walls in markdown exports,
  // while preserving math LaTeX equation images marked with data-xpm-latex
  const images = clone.querySelectorAll ? clone.querySelectorAll("img") : [];
  images.forEach((img) => {
    const src = img.getAttribute("src") || "";
    if (src.startsWith("data:image/") && !img.hasAttribute("data-xpm-latex")) {
      img.remove();
    }
  });

  // 3. Process citation chips (.NMq1me) so anchors retain valid link text instead of being purged
  const citationChips = clone.querySelectorAll
    ? clone.querySelectorAll("span.NMq1me")
    : [];
  citationChips.forEach((chip) => {
    const a = chip.querySelector("a[href]");
    const btn = chip.querySelector("button");
    if (a && !a.textContent.trim()) {
      let label = a.getAttribute("aria-label") || btn?.getAttribute("aria-label") || "";
      label = cleanAriaLabel(label).replace(/\s*–\s*.*$/, "").trim();
      if (!label && chip.textContent.trim()) {
        label = chip.textContent.trim();
      }
      if (label) {
        a.textContent = label;
      }
    }
    if (btn) {
      btn.remove();
    }
  });

  // 4. Unwrap Google tracking redirects (/goto?url=..., /url?q=...) to direct URLs
  const links = clone.querySelectorAll ? clone.querySelectorAll("a[href]") : [];
  links.forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (
      href.startsWith("/goto?") ||
      href.startsWith("/url?") ||
      href.includes("google.com/url?") ||
      href.includes("google.com/goto?")
    ) {
      try {
        const parsed = new URL(href, "https://www.google.com");
        const target =
          parsed.searchParams.get("url") || parsed.searchParams.get("q");
        if (
          target &&
          (target.startsWith("http://") || target.startsWith("https://"))
        ) {
          a.setAttribute("href", target);
        }
      } catch {
        // Keep original href if URL parsing fails
      }
    }

    // 5. If link text is empty and contains no image/svg, check aria-label before treating as an empty link shell
    if (!a.textContent.trim() && !a.querySelector("img, svg")) {
      const aria = a.getAttribute("aria-label");
      if (aria) {
        const label = cleanAriaLabel(aria).replace(/\s*–\s*.*$/, "").trim();
        if (label) {
          a.textContent = label;
        }
      }
    }

    // 6. Remove empty link shells left behind by stripped images/tracking icons
    if (!a.textContent.trim() && !a.querySelector("img, svg")) {
      a.remove();
    }
  });

  return clone;
}

export function cleanMarkdownSpacing(markdown) {
  if (!markdown) return "";
  return markdown
    .replace(
      /(?:google|sn)\.\\?_setImageSrc\s*\(\s*['"][^'"]*['"]\s*,\s*['"][^'"]*['"]\s*\);?/gi,
      "",
    )
    .replace(
      /data:image(?:\\)?\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=\\]+/gi,
      "",
    )
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getInitialQueryFallback() {
  let userQuery = "";
  if (typeof document === "undefined") return "";

  const uqEl = document.querySelector("[data-uq]");
  if (uqEl) {
    userQuery = uqEl.getAttribute("data-uq") || "";
  }
  if (!userQuery) {
    const qEl = document.querySelector("[data-q]");
    if (qEl) {
      userQuery = qEl.getAttribute("data-q") || "";
    }
  }
  if (!userQuery && typeof window !== "undefined" && window.location) {
    try {
      const url = new URL(window.location.href);
      userQuery = url.searchParams.get("q") || "";
    } catch {
      // Ignore invalid URLs
    }
  }
  if (!userQuery) {
    const textarea =
      document.querySelector("textarea.gLFyf") ||
      document.querySelector("textarea.ITIRGe") ||
      document.querySelector('input[name="q"]');
    if (textarea) {
      userQuery = textarea.value || textarea.textContent || "";
    }
  }
  if (!userQuery && typeof document !== "undefined" && document.title) {
    const titleMatch = document.title.match(/^(.*?)\s*-\s*Google\s*Search$/i);
    if (titleMatch && titleMatch[1]) {
      userQuery = titleMatch[1];
    }
  }
  return userQuery.trim();
}

export class GoogleSearchAIParser extends ChatParser {
  name = "Google Search AI";
  isAvailable(url) {
    return /google\.[a-z.]+\/search/.test(url);
  }

  async parse() {
    const title = document.title || "Google Search AI Overview";
    const messages = [];

    // 1. Extract the user's queries from .sUKAcb
    const queryElements = document.querySelectorAll(".sUKAcb");
    const extractedQueries = [];
    queryElements.forEach((el) => {
      // Clone the element to avoid mutating the live DOM
      const clone = el.cloneNode(true);
      const prefixEl = clone.querySelector(".iMqumd");
      if (prefixEl) {
        prefixEl.remove();
      }
      let text = clone.textContent || "";
      // Fallback regex cleanup if needed
      text = text.replace(/^\s*You\s+said:\s*/i, "").trim();
      if (text) {
        extractedQueries.push(text);
      }
    });

    // 2. Identify turn elements or fallback containers
    const turnElements = Array.from(
      document.querySelectorAll('[data-scope-id="turn"]'),
    );
    const responseContainers = [];

    if (turnElements.length > 0) {
      turnElements.forEach((turnEl) => {
        const resEl =
          turnEl.querySelector('[data-container-id="main-col"]') ||
          turnEl.querySelector(
            '[data-container-id="model-response-placeholder"]',
          );
        if (resEl) {
          responseContainers.push({ el: resEl, turnEl });
        }
      });
    } else {
      // Fallback for pages without data-scope-id="turn"
      const resEl =
        document.querySelector('[data-container-id="main-col"]') ||
        document.querySelector(
          '[data-container-id="model-response-placeholder"]',
        );
      if (resEl) {
        responseContainers.push({ el: resEl, turnEl: null });
      }
    }

    // 3. Align queries and response containers
    const initialQuery = getInitialQueryFallback();
    let queries = [...extractedQueries];

    if (
      responseContainers.length > 0 &&
      queries.length === responseContainers.length - 1 &&
      initialQuery
    ) {
      // The initial prompt was only present in URL/search input, subsequent turns are in .sUKAcb
      queries = [initialQuery, ...queries];
    } else if (queries.length === 0 && initialQuery) {
      queries = [initialQuery];
    }

    // Pair queries and responses in order
    const totalTurns = Math.max(queries.length, responseContainers.length);
    for (let i = 0; i < totalTurns; i++) {
      const query = queries[i] || (i === 0 ? initialQuery : "");
      const response = responseContainers[i];

      if (query) {
        messages.push({ role: "User", content: query.trim() });
      }

      if (response && response.el) {
        const cleanContainer = sanitizeResponseContainer(response.el);
        let text = cleanMarkdownSpacing(convertToMarkdown(cleanContainer));

        // Append Sources list if rhs-col sources exist for this turn
        const sources = response.turnEl
          ? extractSourcesFromRhs(response.turnEl)
          : [];
        if (sources.length > 0) {
          const sourcesMd =
            "\n\n**Sources:**\n" +
            sources.map((s) => `- [${s.title}](${s.url})`).join("\n");
          text += sourcesMd;
        }

        if (text) {
          messages.push({ role: "Model", content: text });
        }
      }
    }

    const currentUrl =
      typeof window !== "undefined" && window.location
        ? window.location.href || ""
        : "";
    const metadata = {
      Source: "Google Search AI",
      Date: new Date().toLocaleString(),
      Link: currentUrl,
      Method: "DOM",
    };

    return { title, messages, url: currentUrl, metadata };
  }
}
