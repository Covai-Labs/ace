import { ChatParser } from "./base.js";
import { convertToMarkdown } from "../utils/html-to-markdown.js";

export const GROK_BATCH_SIZE = 20;

export function getGrokConversationId(url) {
  if (!url || typeof url !== "string") return null;

  // 1. Direct conversation paths take precedence (/c/, /chat/, /conversation/)
  const pathMatch = url.match(
    /grok\.com\/(?:chat|c|conversation)\/([a-f0-9-]+)/i,
  )?.[1];
  if (pathMatch) return pathMatch;

  // 2. Project URLs with chat query parameter (/project/<workspaceId>?chat=<conversationId>)
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const isGrokHost =
      hostname === "grok.com" || hostname.endsWith(".grok.com");
    if (isGrokHost && parsed.pathname.startsWith("/project/")) {
      const chatParam = parsed.searchParams.get("chat");
      if (
        chatParam &&
        /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(chatParam)
      ) {
        return chatParam;
      }
    }
  } catch {
    // Ignore invalid URL parsing
  }

  return null;
}

/**
 * Order response-node entries into a single parent-linked chain.
 * Response-nodes form a linear branch via parentResponseId; walk from
 * the leaf (the id that is never a parent) back to the root and reverse.
 */
export function orderGrokNodes(responseNodes) {
  if (!Array.isArray(responseNodes) || responseNodes.length === 0) return [];
  const byId = new Map(responseNodes.map((n) => [n?.responseId, n]));
  const parentIds = new Set(
    responseNodes.map((n) => n?.parentResponseId).filter(Boolean),
  );
  let leaf = responseNodes.find((n) => n && !parentIds.has(n.responseId));
  if (!leaf) leaf = responseNodes[responseNodes.length - 1];
  const chain = [];
  const seen = new Set();
  let current = leaf;
  while (current && current.responseId && !seen.has(current.responseId)) {
    seen.add(current.responseId);
    chain.unshift(current);
    current = byId.get(current.parentResponseId) ?? null;
  }
  return chain;
}

export function formatGrokResponses(responses, orderedIds, fallbackTitle) {
  const byId = new Map((responses || []).map((r) => [r?.responseId, r]));
  const ids =
    Array.isArray(orderedIds) && orderedIds.length > 0
      ? orderedIds
      : (responses || []).map((r) => r?.responseId).filter(Boolean);
  const messages = [];
  let title = fallbackTitle || "Grok Conversation";
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;
    const content = (r.message || "").trim();
    if (!content) continue;
    const role = r.sender === "human" ? "User" : "Grok";
    const msg = { role, content };
    if (r.createTime) msg.timestamp = r.createTime;
    messages.push(msg);
  }
  return { messages, title };
}

export class GrokParser extends ChatParser {
  name = "Grok";
  isAvailable(url) {
    return url.includes("grok.com");
  }

  async fetchConversationMeta(conversationId) {
    const url =
      `https://grok.com/rest/app-chat/conversations_v2/${conversationId}` +
      `?includeWorkspaces=true&includeTaskResult=true`;
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Grok API request failed: ${response.status}`);
    }
    return response.json();
  }

  async fetchResponseNodes(conversationId) {
    const url = `https://grok.com/rest/app-chat/conversations/${conversationId}/response-node`;
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Grok response-node request failed: ${response.status}`);
    }
    return response.json();
  }

  async fetchResponses(conversationId, responseIds) {
    const url = `https://grok.com/rest/app-chat/conversations/${conversationId}/load-responses`;
    const collected = [];
    for (let i = 0; i < responseIds.length; i += GROK_BATCH_SIZE) {
      const chunk = responseIds.slice(i, i + GROK_BATCH_SIZE);
      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ responseIds: chunk }),
      });
      if (!response.ok) {
        throw new Error(`Grok load-responses failed: ${response.status}`);
      }
      const json = await response.json();
      if (Array.isArray(json?.responses)) collected.push(...json.responses);
    }
    return collected;
  }

  async parse(options = {}) {
    const parserMode = options.parserMode || "prefer_api";
    const currentUrl =
      typeof window !== "undefined" && window.location
        ? window.location.href || ""
        : "";
    const metadata = {
      Source: "Grok",
      Date: new Date().toLocaleString(),
      Link: currentUrl,
    };
    const domTitle =
      (document.title || "").replace(/\s*-\s*Grok\s*$/i, "").trim() ||
      "Grok Conversation";

    // Primary: internal API (response-node ordering + load-responses bodies)
    if (parserMode !== "prefer_dom") {
      try {
        const conversationId = getGrokConversationId(currentUrl);
        if (conversationId) {
          const [meta, nodes] = await Promise.all([
            this.fetchConversationMeta(conversationId).catch(() => null),
            this.fetchResponseNodes(conversationId),
          ]);
          const ordered = orderGrokNodes(nodes?.responseNodes);
          const orderedIds = ordered.map((n) => n.responseId);
          if (orderedIds.length > 0) {
            const responses = await this.fetchResponses(
              conversationId,
              orderedIds,
            );
            const title = meta?.conversation?.title?.trim() || domTitle;
            const { messages } = formatGrokResponses(
              responses,
              orderedIds,
              title,
            );
            if (messages.length > 0) {
              return {
                title,
                messages,
                url: currentUrl,
                metadata: { ...metadata, Method: "API" },
              };
            }
          }
        }
      } catch (e) {
        console.warn(
          "[AI Exporter] Grok API fetch failed, falling back to DOM:",
          e,
        );
      }
    }

    // Secondary: DOM fallback
    const userSelector = '[data-testid="user-message"]';
    const assistantSelector = '[data-testid="assistant-message"]';
    const candidates = Array.from(
      document.querySelectorAll(`${userSelector}, ${assistantSelector}`),
    );
    // Keep only outermost matches to avoid nested bubbles duplicating turns.
    const elements = candidates.filter((el) => {
      let parent = el.parentElement;
      while (parent) {
        if (
          parent.matches &&
          (parent.matches(userSelector) || parent.matches(assistantSelector))
        ) {
          return false;
        }
        parent = parent.parentElement;
      }
      return true;
    });

    const messages = [];
    for (const el of elements) {
      const isUser = el.matches(userSelector);
      const role = isUser ? "User" : "Grok";
      const contentEl =
        el.querySelector(".response-content-markdown") ||
        el.querySelector(".message-bubble") ||
        el;
      const clone = contentEl.cloneNode(true);
      clone
        .querySelectorAll(
          ".thinking-container, button, [data-testid='canvas-trigger']",
        )
        .forEach((n) => n.remove());
      const text = convertToMarkdown(clone).trim();
      if (text) messages.push({ role, content: text });
    }

    return {
      title: domTitle,
      messages,
      url: currentUrl,
      metadata: { ...metadata, Method: "DOM" },
    };
  }
}
