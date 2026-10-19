import { ChatParser } from "./base.js";
import { convertToMarkdown } from "../utils/html-to-markdown.js";
import { pickTimestamp } from "../utils/timestamps.js";

// Observed Relay doc_ids for the conversation message list (Sept 2026).
// These rotate when Meta redeploys the web client. The parser tries the
// pinned IDs first, then resolves fresh ones from the page's own JS chunks,
// and finally falls back to DOM extraction.
export const META_MESSAGES_DOC_ID = "d6d27be74bdbe5bec25ad7685dc65ac4";
export const META_MESSAGES_PAGE_DOC_ID = "bc523f4325577cba4ccbac4ffdec7ff4";
export const META_PAGE_SIZE = 10;
export const META_MAX_SCRIPT_CHUNKS = 25;
export const META_MAX_CHUNK_CHARS = 5_000_000;
export const META_MAX_DOCID_TRIALS = 8;

// Markers that identify the conversation-messages Relay artifact inside a
// JS chunk. Candidates are only trusted from chunks containing one of these.
const META_QUERY_MARKERS = [
  "latestBranchPath",
  "GenAIMarkdownTextUXPrimitive",
  "GenAIBotThinkingStatusPrimitive",
];

let cachedMetaDocIds = null;

/** Test hook: clear the in-memory resolved doc_id cache. */
export function __resetMetaDocIdCache() {
  cachedMetaDocIds = null;
}

/**
 * Extract persisted-query doc_ids from a JS chunk — but only when the chunk
 * contains the conversation-messages query markers, so unrelated Relay
 * artifacts (analytics, surveys) are never mistaken for message queries.
 */
export function extractMetaDocIdCandidates(jsText) {
  if (typeof jsText !== "string") return [];
  if (!META_QUERY_MARKERS.some((marker) => jsText.includes(marker))) return [];
  const ids = new Set();
  const patterns = [
    /["']id["']\s*:\s*["']([a-f0-9]{32})["']/g,
    /doc_id["']?\s*[:=]\s*["']([a-f0-9]{32})["']/g,
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(jsText)) !== null) ids.add(match[1]);
  }
  return [...ids];
}

/** Absolute URLs of the page's own script chunks (bounded). */
export function getMetaScriptUrls(limit = META_MAX_SCRIPT_CHUNKS) {
  try {
    const urls = [];
    const base =
      typeof window !== "undefined" && window.location?.href
        ? window.location.href
        : "https://www.meta.ai/";
    for (const script of document.querySelectorAll("script[src]")) {
      const src = script.getAttribute("src");
      if (!src || src.startsWith("data:") || src.startsWith("blob:")) continue;
      try {
        const absolute = new URL(src, base).href;
        if (!urls.includes(absolute)) urls.push(absolute);
      } catch {
        // Ignore unresolvable src values
      }
      if (urls.length >= limit) break;
    }
    return urls;
  } catch {
    return [];
  }
}

export function getMetaConversationId(url) {
  if (!url || typeof url !== "string") return null;
  return (
    url.match(/meta\.ai\/(?:c|chat|prompt)\/([a-f0-9-]+)/i)?.[1] ??
    url.match(/[?&]conversationId=([a-f0-9-]+)/i)?.[1] ??
    null
  );
}

export function extractMetaUserText(node) {
  if (!node) return "";
  for (const key of ["userContent", "content", "originalUserPrompt"]) {
    const val = node[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return "";
}

export function extractMetaAssistantText(node) {
  if (!node) return "";
  const renderer = node.contentRenderer || {};
  const message = renderer.message || {};
  if (typeof message.content === "string" && message.content.trim()) {
    return message.content.trim();
  }
  // Fallback: walk unified_response sections for markdown primitives.
  const sections = renderer.unified_response?.sections;
  if (Array.isArray(sections)) {
    const parts = [];
    for (const section of sections) {
      const primitive = section?.view_model?.primitive;
      if (
        primitive &&
        typeof primitive.text === "string" &&
        primitive.text.trim()
      ) {
        parts.push(primitive.text.trim());
      }
    }
    if (parts.length > 0) return parts.join("\n\n");
  }
  if (typeof node.content === "string" && node.content.trim()) {
    return node.content.trim();
  }
  return "";
}

export function formatMetaEdges(edges) {
  const seen = new Set();
  const nodes = [];
  for (const edge of edges || []) {
    const cursor = edge?.cursor;
    if (cursor) {
      if (seen.has(cursor)) continue;
      seen.add(cursor);
    }
    if (edge?.node) nodes.push(edge.node);
  }
  // Relay returns oldest-first across pages; order by branchPath as a guard.
  nodes.sort((a, b) => {
    const pa = parseInt(a?.branchPath ?? "0", 10);
    const pb = parseInt(b?.branchPath ?? "0", 10);
    if (Number.isNaN(pa) || Number.isNaN(pb)) return 0;
    return pa - pb;
  });
  const messages = [];
  for (const node of nodes) {
    // Turn granularity: user + assistant in the same turn share createdAt,
    // so both messages carry the same timestamp (matches Perplexity pattern).
    const timestamp = pickTimestamp(node, ["createdAt", "userCreatedAt"]);
    if (node.__typename === "UserMessage") {
      const content = extractMetaUserText(node);
      if (content) {
        const msg = { role: "User", content };
        if (timestamp) msg.timestamp = timestamp;
        messages.push(msg);
      }
    } else if (node.__typename === "AssistantMessage") {
      const content = extractMetaAssistantText(node);
      if (content) {
        const msg = { role: "Meta AI", content };
        if (timestamp) msg.timestamp = timestamp;
        messages.push(msg);
      }
    }
  }
  return messages;
}

export class MetaParser extends ChatParser {
  name = "Meta AI";
  isAvailable(url) {
    return url.includes("meta.ai");
  }

  async fetchGraphQL(docId, variables) {
    const response = await fetch("https://www.meta.ai/api/graphql", {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ doc_id: docId, variables }),
    });
    if (!response.ok) {
      throw new Error(`Meta GraphQL request failed: ${response.status}`);
    }
    return response.json();
  }

  async fetchConversation(conversationId, docIds = {}) {
    const initialId = docIds.initial || META_MESSAGES_DOC_ID;
    const pageId = docIds.page || META_MESSAGES_PAGE_DOC_ID;
    const allEdges = [];
    // First page (latest messages).
    const first = await this.fetchGraphQL(initialId, {
      conversationId,
    });
    const conv = first?.data?.conversation;
    if (!conv || !conv.messages) {
      throw new Error("Meta GraphQL response missing conversation.messages");
    }
    const title = conv.displayTitle || conv.title || "";
    allEdges.push(...(conv.messages.edges || []));
    // Walk backwards through history while older pages exist.
    let pageInfo = conv.messages.pageInfo;
    let guard = 0;
    while (pageInfo?.hasPreviousPage && pageInfo?.startCursor && guard < 50) {
      guard += 1;
      const page = await this.fetchGraphQL(pageId, {
        conversationId,
        before: pageInfo.startCursor,
        last: META_PAGE_SIZE,
      });
      const pageConv = page?.data?.conversation;
      if (!pageConv?.messages) break;
      allEdges.push(...(pageConv.messages.edges || []));
      pageInfo = pageConv.messages.pageInfo;
    }
    return { title, edges: allEdges };
  }

  /** Verify a candidate doc_id returns a message list (self-validating). */
  async trialMetaDocId(docId, variables) {
    try {
      const json = await this.fetchGraphQL(docId, variables);
      const messages = json?.data?.conversation?.messages;
      if (messages && Array.isArray(messages.edges)) return json;
    } catch {
      // Invalid/retired doc_id — caller tries the next candidate.
    }
    return null;
  }

  /**
   * Resolve fresh doc_ids from the page's own JS chunks when the pinned IDs
   * stop working. Every candidate is trial-verified against the live API, so
   * wrong guesses cost one request and never corrupt the export. Results are
   * cached in-memory for the session.
   */
  async resolveMetaDocIds(conversationId) {
    if (cachedMetaDocIds) return cachedMetaDocIds;
    const tried = new Set();
    const candidates = [];
    for (const chunkUrl of getMetaScriptUrls()) {
      let jsText;
      try {
        const response = await fetch(chunkUrl, {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok) continue;
        jsText = await response.text();
      } catch {
        continue;
      }
      if (!jsText || jsText.length > META_MAX_CHUNK_CHARS) continue;
      for (const id of extractMetaDocIdCandidates(jsText)) {
        if (!tried.has(id)) {
          tried.add(id);
          candidates.push(id);
        }
      }
      if (tried.size >= META_MAX_DOCID_TRIALS) break;
    }

    let initial = null;
    let initialJson = null;
    for (const id of candidates.slice(0, META_MAX_DOCID_TRIALS)) {
      initialJson = await this.trialMetaDocId(id, { conversationId });
      if (initialJson) {
        initial = id;
        break;
      }
    }
    if (!initial) {
      throw new Error("No working Meta doc_id found in page chunks");
    }

    // The pagination query may differ from the initial-page query: prefer the
    // initial winner, then trial the remaining candidates with page vars.
    let page = initial;
    const pageInfo = initialJson.data.conversation.messages.pageInfo;
    if (pageInfo?.hasPreviousPage && pageInfo?.startCursor) {
      const pageVars = {
        conversationId,
        before: pageInfo.startCursor,
        last: META_PAGE_SIZE,
      };
      if (!(await this.trialMetaDocId(initial, pageVars))) {
        for (const id of candidates.slice(0, META_MAX_DOCID_TRIALS)) {
          if (id === initial) continue;
          if (await this.trialMetaDocId(id, pageVars)) {
            page = id;
            break;
          }
        }
      }
    }
    cachedMetaDocIds = { initial, page };
    return cachedMetaDocIds;
  }

  /** Pick the richest markdown candidate (thinking stubs are near-empty). */
  pickAssistantContent(el) {
    const candidates = Array.from(
      el.querySelectorAll(".markdown-content, .ur-markdown, .prose"),
    );
    const pool = candidates.length > 0 ? candidates : [el];
    let best = null;
    let bestLen = -1;
    for (const cand of pool) {
      const len = (cand.textContent || "").trim().length;
      if (len > bestLen) {
        bestLen = len;
        best = cand;
      }
    }
    return best || el;
  }

  async parse(options = {}) {
    const parserMode = options.parserMode || "prefer_api";
    const currentUrl =
      typeof window !== "undefined" && window.location
        ? window.location.href || ""
        : "";
    const metadata = {
      Source: "Meta AI",
      Date: new Date().toLocaleString(),
      Link: currentUrl,
    };

    // Primary: internal GraphQL API (same-session cookies required).
    // Pinned doc_ids first; if Meta rotated them, resolve fresh ones from
    // the page's own JS chunks before giving up to DOM extraction.
    if (parserMode !== "prefer_dom") {
      const conversationId = getMetaConversationId(currentUrl);
      if (conversationId) {
        const runApi = async (docIds) => {
          const { title: apiTitle, edges } = await this.fetchConversation(
            conversationId,
            docIds,
          );
          const messages = formatMetaEdges(edges);
          if (messages.length === 0) return null;
          return {
            title: apiTitle || "Meta AI Session",
            messages,
            url: currentUrl,
            metadata: { ...metadata, Method: "API" },
          };
        };
        try {
          // Attempt 1: pinned doc_ids (fast path, no extra requests).
          const pinned = await runApi();
          if (pinned) return pinned;
        } catch (e) {
          console.warn("[AI Exporter] Meta pinned doc_ids failed:", e);
          try {
            // Attempt 2: resolve fresh doc_ids from the page's JS chunks.
            const resolved = await runApi(
              await this.resolveMetaDocIds(conversationId),
            );
            if (resolved) return resolved;
          } catch (e2) {
            console.warn("[AI Exporter] Meta doc_id resolution failed:", e2);
          }
        }
        console.warn("[AI Exporter] Meta API exhausted, falling back to DOM");
      }
    }

    // Secondary: DOM extraction fallback
    // Try to get the conversation title from the input field or the header button
    const titleInput = document.querySelector(
      'input[placeholder="Conversation title"]',
    );
    const titleButton = document.querySelector(
      '[data-slot="button"] span.truncate',
    );
    const title =
      titleInput && titleInput.value
        ? titleInput.value
        : titleButton
          ? titleButton.innerText
          : "Meta AI Session";

    const messages = [];

    // Find all possible message elements directly to avoid missing any that don't have a wrapper
    const messageElements = Array.from(
      document.querySelectorAll(
        '[data-message-type="user"], [data-testid="assistant-message"], [data-message-id$="_user"], [data-message-id$="_assistant"]',
      ),
    );

    // Keep only the outer-most elements if there are nested matches
    const uniqueElements = messageElements.filter((el) => {
      let parent = el.parentElement;
      while (parent) {
        if (messageElements.includes(parent)) {
          return false;
        }
        parent = parent.parentElement;
      }
      return true;
    });

    uniqueElements.forEach((el) => {
      let role = "Unknown";
      let content = "";

      // Check if the element itself identifies as user or assistant
      const isUser =
        el.matches('[data-message-type="user"]') ||
        (el.getAttribute("data-message-id") &&
          el.getAttribute("data-message-id").endsWith("_user"));
      const isAssistant =
        el.matches('[data-testid="assistant-message"]') ||
        (el.getAttribute("data-message-id") &&
          el.getAttribute("data-message-id").endsWith("_assistant"));

      if (isUser) {
        role = "User";
        // User text is usually in a span with text-response class or simply pre-wrap
        const textEl =
          el.querySelector('[data-slot="text"].text-response') ||
          el.querySelector(".whitespace-pre-wrap");
        if (textEl) {
          content = convertToMarkdown(textEl);
        } else {
          content = convertToMarkdown(el);
        }
      } else if (isAssistant) {
        role = "Meta AI";
        // Assistant turns nest several .markdown-content wrappers (a
        // near-empty thinking stub plus the real answer). Convert the
        // richest candidate so thinking stubs never shadow the answer.
        const contentEl = this.pickAssistantContent(el);
        if (contentEl) {
          const clone = contentEl.cloneNode(true);

          // Remove noise elements (like citation pills, edit buttons, thinking status, etc)
          const noiseSelectors = [
            "button",
            ".ur-citation-pill",
            "svg",
            '[data-testid="citation-pill"]',
            '[data-testid="thinking-status"]',
          ];
          noiseSelectors.forEach((sel) => {
            clone.querySelectorAll(sel).forEach((n) => n.remove());
          });

          content = convertToMarkdown(clone);
        } else {
          content = convertToMarkdown(el);
        }
      }

      if (content) {
        messages.push({ role, content });
      }
    });

    const domMetadata = {
      Source: "Meta AI",
      Date: new Date().toLocaleString(),
      Link: currentUrl,
      Method: "DOM",
    };

    return { title, messages, url: currentUrl, metadata: domMetadata };
  }
}
