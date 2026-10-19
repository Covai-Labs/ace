import { ChatParser } from "./base.js";
import { convertToMarkdown } from "../utils/html-to-markdown.js";
import { normalizeLatexMath } from "../utils/latex-math.js";

export function getThreadSlug(url) {
  if (!url || typeof url !== "string") return null;
  const match = url.match(/\/search\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  const matchPage = url.match(/\/page\/([a-zA-Z0-9_-]+)/);
  if (matchPage) return matchPage[1];
  return null;
}

export function extractAssistantAnswer(entry) {
  if (!entry) return "";
  // 1. Check blocks -> plan_block.goals for markdown answer
  if (Array.isArray(entry.blocks)) {
    for (const b of entry.blocks) {
      if (b.intended_usage === "plan" && b.plan_block?.goals) {
        for (const g of b.plan_block.goals) {
          if (g.description && g.description.length > 100) {
            return g.description.trim();
          }
        }
      }
      if (b.answer_block?.answer) {
        return b.answer_block.answer.trim();
      }
      if (b.markdown_block?.markdown) {
        return b.markdown_block.markdown.trim();
      }
    }
  }
  // 2. Check direct answer or text fields
  if (entry.answer && typeof entry.answer === "string") {
    return entry.answer.trim();
  }
  if (entry.text && typeof entry.text === "string") {
    try {
      const parsed = JSON.parse(entry.text);
      if (parsed.answer) return parsed.answer.trim();
    } catch {
      return entry.text.trim();
    }
  }
  return "";
}

export function formatApiResult(threadData, currentUrl, fallbackTitle) {
  const title =
    threadData.thread_title ||
    threadData.first_entry?.query_str ||
    fallbackTitle ||
    "Perplexity Search";

  const allEntries = [];
  if (threadData.first_entry) {
    allEntries.push(threadData.first_entry);
  }
  if (Array.isArray(threadData.entries)) {
    allEntries.push(...threadData.entries);
  }
  if (threadData.latest_entry) {
    allEntries.push(threadData.latest_entry);
  }

  // Deduplicate entries by uuid / backend_uuid
  const seenUuids = new Set();
  const uniqueEntries = [];
  for (const entry of allEntries) {
    const id = entry.uuid || entry.backend_uuid || entry.query_str;
    if (id && !seenUuids.has(id)) {
      seenUuids.add(id);
      uniqueEntries.push(entry);
    }
  }

  const messages = [];
  for (const entry of uniqueEntries) {
    const prompt = (entry.query_str || "").trim();
    const timestamp =
      entry.entry_created_datetime || entry.updated_datetime || undefined;

    if (prompt) {
      const userMsg = { role: "User", content: prompt };
      if (timestamp) userMsg.timestamp = timestamp;
      messages.push(userMsg);
    }

    const rawAnswer = extractAssistantAnswer(entry);
    if (rawAnswer) {
      const normalizedAnswer = normalizeLatexMath(rawAnswer);
      const assistantMsg = { role: "Perplexity", content: normalizedAnswer };
      if (timestamp) assistantMsg.timestamp = timestamp;
      messages.push(assistantMsg);
    }
  }

  const effectiveUrl =
    currentUrl ||
    (threadData.first_entry?.thread_url_slug
      ? `https://www.perplexity.ai/search/${threadData.first_entry.thread_url_slug}`
      : "");

  const metadata = {
    Source: "Perplexity",
    Date: new Date().toLocaleString(),
    Link: effectiveUrl,
    Method: "API",
  };

  return { title, messages, url: effectiveUrl, metadata };
}

export async function getPerplexityAccount() {
  if (typeof window === "undefined") return null;

  const isUuid = (str) =>
    typeof str === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      str.trim(),
    );

  // 1. Check sessionStorage ('pplx-active-account')
  try {
    const sessionAcc = window.sessionStorage?.getItem("pplx-active-account");
    if (sessionAcc && isUuid(sessionAcc)) return sessionAcc.trim();
  } catch {
    // Ignore storage errors
  }

  // 2. Check localStorage ('pplx-last-active-account')
  try {
    const localAcc = window.localStorage?.getItem("pplx-last-active-account");
    if (localAcc && isUuid(localAcc)) return localAcc.trim();
  } catch {
    // Ignore storage errors
  }

  // 3. Scan keys in sessionStorage and localStorage for pplx account UUIDs
  try {
    for (const storage of [window.sessionStorage, window.localStorage]) {
      if (!storage) continue;
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && (key.includes("pplx") || key.includes("account"))) {
          const val = storage.getItem(key);
          if (val && isUuid(val)) return val.trim();
        }
      }
    }
  } catch {
    // Ignore storage scanning errors
  }

  // 4. Check document.cookie if available
  try {
    const match = document.cookie?.match(
      /(?:pplx-last-active-account|pplx-active-account)=([0-9a-f-]{36})/i,
    );
    if (match && isUuid(match[1])) return match[1].trim();
  } catch {
    // Ignore cookie errors
  }

  // 5. Fallback: query https://www.perplexity.ai/api/auth/linked-accounts using session cookies
  try {
    if (typeof fetch === "function") {
      const res = await fetch(
        "https://www.perplexity.ai/api/auth/linked-accounts",
        {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
        },
      );
      if (res.ok) {
        const data = await res.json();
        const accountId = data?.accounts?.[0]?.user_id;
        if (accountId && isUuid(accountId)) return accountId.trim();
      }
    }
  } catch {
    // Ignore linked-accounts network error
  }

  return null;
}

export class PerplexityParser extends ChatParser {
  name = "Perplexity";
  isAvailable(url) {
    return url.includes("perplexity.ai");
  }

  async fetchThread(slug) {
    const accountId = await getPerplexityAccount();
    const url = `https://www.perplexity.ai/rest/thread/${slug}?with_parent_info=true&with_schematized_response=true&version=2.18&source=default&limit=100&offset=0&from_first=true`;
    const headers = {
      Accept: "application/json",
      "x-app-apiclient": "default",
      "x-app-apiversion": "2.18",
    };
    if (accountId) {
      headers["x-pplx-account"] = accountId;
    }

    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers,
    });
    if (!response.ok) {
      throw new Error(
        `Perplexity API request failed with status ${response.status}`,
      );
    }
    return response.json();
  }

  async parse(options = {}) {
    const parserMode = options.parserMode || "prefer_api";
    const currentUrl =
      typeof window !== "undefined" && window.location
        ? window.location.href || ""
        : "";

    const rawTitle =
      document.querySelector(".share-title-section h1")?.textContent ||
      document.querySelector("h1")?.textContent ||
      document.title ||
      "Perplexity Search";
    const title = rawTitle.trim().replace(/\s+/g, " ");

    // 1. Attempt API-first extraction when in prefer_api mode
    if (parserMode !== "prefer_dom") {
      const slug = getThreadSlug(currentUrl);
      if (slug) {
        try {
          const apiData = await this.fetchThread(slug);
          if (apiData && (apiData.entries?.length || apiData.first_entry)) {
            return formatApiResult(apiData, currentUrl, title);
          }
        } catch (err) {
          console.warn(
            "[AI Exporter] Perplexity API fetch failed, falling back to DOM:",
            err,
          );
        }
      }
    }

    // 2. DOM extraction fallback
    const messages = [];

    // Perplexity Container
    const threadContainer =
      document.querySelector(".max-w-threadContentWidth") || document.body;

    // Candidates for User Messages
    const userSelectors = [
      ".group\\/user-bubble",
      "h1.group\\/query",
      ".group\\/query",
      ".whitespace-pre-line.text-pretty",
      '[data-testid="search-bar-input"]', // fallback for input? typically input is not the message display
    ];

    // Candidates for Assistant Messages
    const assistantSelectors = ['div[id^="markdown-content-"]', ".prose"];

    // Strategy: Iterate children of thread container or find all matches in document
    // Thread container is better to preserve order

    // Let's select all potential message blocks within the thread container
    const selectorString = [...userSelectors, ...assistantSelectors].join(", ");
    const elements = threadContainer.querySelectorAll(selectorString);

    // Helper to determine role
    const isUser = (el) => {
      for (const s of userSelectors) {
        if (el.matches(s)) return true;
      }
      return false;
    };

    const isAssistant = (el) => {
      for (const s of assistantSelectors) {
        if (el.matches(s)) return true;
      }
      return false;
    };

    elements.forEach((el) => {
      // Check if inside "related" or "sources"
      if (el.closest('[class*="related"], [class*="sources"]')) return;

      if (isUser(el)) {
        if (el.parentElement?.closest(".group\\/user-bubble, .group\\/query")) {
          return;
        }

        // Extract timestamp if present in bubble
        const timeEl = el.querySelector(
          ".text-tertiary, [class*='text-tertiary']",
        );
        const timestamp = timeEl ? timeEl.textContent.trim() : undefined;

        // Clean user text container
        const textEl = el.querySelector(".whitespace-pre-line") || el;
        const text = convertToMarkdown(textEl).trim();
        if (!text) return;

        const msgObj = { role: "User", content: text };
        if (timestamp) {
          msgObj.timestamp = timestamp;
        }
        messages.push(msgObj);
      } else if (isAssistant(el)) {
        // Avoid duplicate nested assistant containers (e.g. .prose inside div[id^="markdown-content-"])
        if (el.parentElement?.closest('div[id^="markdown-content-"], .prose')) {
          return;
        }

        const text = convertToMarkdown(el).trim();
        if (!text) return;

        messages.push({ role: "Perplexity", content: text });
      }
    });

    const metadata = {
      Source: "Perplexity",
      Date: new Date().toLocaleString(),
      Link: currentUrl,
      Method: "DOM",
    };

    return { title, messages, url: currentUrl, metadata };
  }
}
