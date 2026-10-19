import { ChatParser } from "./base.js";
import { convertToMarkdown } from "../utils/html-to-markdown.js";

export const ZAI_BATCH_SIZE = 20;

export function getZaiChatId(url) {
  if (!url || typeof url !== "string") return null;
  return url.match(/chat\.z\.ai\/c\/([a-f0-9-]+)/i)?.[1] ?? null;
}

/** Walk the skeleton history (id -> {parentId}) from currentId to root. */
export function orderZaiHistory(messagesById, currentId) {
  if (!messagesById || typeof messagesById !== "object") return [];
  const ordered = [];
  const seen = new Set();
  let current = currentId ?? null;
  // Fallback: if no currentId, start from the node nobody parents.
  if (!current || !messagesById[current]) {
    const childIds = new Set(
      Object.values(messagesById).flatMap((m) => m?.childrenIds || []),
    );
    const leaf = Object.keys(messagesById).find((id) => !childIds.has(id));
    current = leaf ?? null;
  }
  while (current && messagesById[current] && !seen.has(current)) {
    seen.add(current);
    ordered.unshift(current);
    current = messagesById[current].parentId ?? null;
  }
  return ordered;
}

export function formatZaiMessage(entry) {
  if (!entry) return null;
  const role = entry.role === "user" ? "User" : "Z.ai";
  if (entry.role === "user") {
    const content = (entry.content || "").trim();
    return content ? { role, content } : null;
  }
  const blocks = Array.isArray(entry.content_blocks)
    ? entry.content_blocks
    : [];
  const texts = blocks
    .filter((b) => b && b.type === "text" && typeof b.content === "string")
    .map((b) => b.content.trim())
    .filter(Boolean);
  // Fallback to legacy top-level content string when blocks are absent.
  if (
    texts.length === 0 &&
    typeof entry.content === "string" &&
    entry.content.trim()
  ) {
    texts.push(entry.content.trim());
  }
  if (texts.length === 0) return null;
  let content = texts.join("\n\n");
  const reasoning = blocks
    .filter((b) => b && b.type === "reasoning" && typeof b.content === "string")
    .map((b) => b.content.trim())
    .filter(Boolean)
    .join("\n\n");
  if (reasoning) {
    content = `<think>\n${reasoning}\n</think>\n\n${content}`;
  }
  const msg = { role, content };
  if (reasoning) {
    msg.thinking = reasoning;
  }
  if (entry.timestamp) {
    try {
      msg.timestamp = new Date(entry.timestamp * 1000).toISOString();
    } catch {
      // Ignore timestamp formatting errors
    }
  }
  return msg;
}

export class ZAiParser extends ChatParser {
  name = "Z.ai";
  isAvailable(url) {
    return url.includes("chat.z.ai");
  }

  async fetchChatSkeleton(chatId) {
    const url = `https://chat.z.ai/api/v1/chats/${chatId}`;
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Z.ai chat request failed: ${response.status}`);
    }
    return response.json();
  }

  async fetchMessageBatch(chatId, ids) {
    const url = `https://chat.z.ai/api/v1/chats/${chatId}/messages/batch`;
    const collected = {};
    for (let i = 0; i < ids.length; i += ZAI_BATCH_SIZE) {
      const chunk = ids.slice(i, i + ZAI_BATCH_SIZE);
      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: chunk }),
      });
      if (!response.ok) {
        throw new Error(`Z.ai batch request failed: ${response.status}`);
      }
      const json = await response.json();
      Object.assign(collected, json?.data || {});
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
      Source: "Z.ai",
      Date: new Date().toLocaleString(),
      Link: currentUrl,
    };

    const titleEl = document.querySelector("title");
    let title = "";
    if (titleEl) {
      title = titleEl.textContent.trim().replace(/\s+/g, " ");
    }
    if (!title && document.title) {
      title = document.title.trim().replace(/\s+/g, " ");
    }
    title = title || "Z.ai Chat";

    // Primary: internal API (chat skeleton for ordering + batched bodies)
    if (parserMode !== "prefer_dom") {
      try {
        const chatId = getZaiChatId(currentUrl);
        if (chatId) {
          const skeleton = await this.fetchChatSkeleton(chatId);
          const history = skeleton?.chat?.history || {};
          const orderedIds = orderZaiHistory(
            history.messages || {},
            history.currentId,
          );
          if (orderedIds.length > 0) {
            const bodies = await this.fetchMessageBatch(chatId, orderedIds);
            const apiTitle = (skeleton?.title || "").trim() || title;
            const apiMessages = orderedIds
              .map((id) => formatZaiMessage(bodies[id]))
              .filter(Boolean);
            if (apiMessages.length > 0) {
              return {
                title: apiTitle,
                messages: apiMessages,
                url: currentUrl,
                metadata: { ...metadata, Method: "API" },
              };
            }
          }
        }
      } catch (e) {
        console.warn(
          "[AI Exporter] Z.ai API fetch failed, falling back to DOM:",
          e,
        );
      }
    }

    // Secondary: DOM fallback
    const messages = [];

    // Selectors for z.ai messages
    const userSelector = ".chat-user";
    const assistantSelector = ".chat-assistant";

    // We'll traverse the DOM to find these in order
    const allElements = document.querySelectorAll(
      `${userSelector}, ${assistantSelector}`,
    );

    allElements.forEach((el) => {
      let role = "Unknown";
      let contentEl = null;

      if (el.matches(userSelector)) {
        role = "User";
        // Select user message text block (excluding edit/copy buttons)
        contentEl = el.querySelector("div.relative.overflow-hidden") || el;
      } else if (el.matches(assistantSelector)) {
        role = "Z.ai";
        // Select assistant message content wrapper (excluding copy/regenerate buttons)
        const rawContentEl =
          el.querySelector("#response-content-container") ||
          el.querySelector(".markdown-prose") ||
          el;
        const contentElClone = rawContentEl.cloneNode(true);

        // Preprocess CodeMirror 6 code blocks into standard HTML <pre><code> structures
        contentElClone.querySelectorAll(".cm-editor").forEach((cmEditor) => {
          // Detect language from class names of the parent language container
          const languageWrapper = cmEditor.closest('[class*="language-"]');
          let language = "";
          if (languageWrapper) {
            const classList = Array.from(languageWrapper.classList);
            const langClass = classList.find((cls) =>
              cls.startsWith("language-"),
            );
            if (langClass) {
              language = langClass.replace("language-", "");
            }
          }

          // Extract the lines from CodeMirror editor view
          const lines = Array.from(cmEditor.querySelectorAll(".cm-line"));
          const codeText = lines.map((line) => line.textContent).join("\n");

          // Create new pre and code tags using the clone's owner document context
          const ownerDoc = cmEditor.ownerDocument || document;
          const pre = ownerDoc.createElement("pre");
          const code = ownerDoc.createElement("code");
          if (language) {
            code.className = `language-${language}`;
          }
          code.textContent = codeText;
          pre.appendChild(code);

          // Replace the enclosing language wrapper or cm-editor with the pre element
          const targetToReplace = languageWrapper || cmEditor;
          if (targetToReplace && targetToReplace.parentNode) {
            targetToReplace.parentNode.replaceChild(pre, targetToReplace);
          }
        });

        contentEl = contentElClone;
      }

      if (contentEl) {
        const text = convertToMarkdown(contentEl);
        if (text.trim()) {
          messages.push({ role, content: text.trim() });
        }
      }
    });

    const domMetadata = {
      Source: "Z.ai",
      Date: new Date().toLocaleString(),
      Link: currentUrl,
      Method: "DOM",
    };

    return { title, messages, url: currentUrl, metadata: domMetadata };
  }
}
