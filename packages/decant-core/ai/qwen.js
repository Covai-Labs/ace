import { ChatParser } from "./base.js";
import { convertToMarkdown } from "../utils/html-to-markdown.js";

export function getQwenChatId(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/(?:c|chat)\/([a-f0-9-]{8,})/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function orderQwenHistory(messagesMap, currentId, fallbackList = []) {
  if (messagesMap && typeof messagesMap === "object" && currentId) {
    const chain = [];
    const seen = new Set();
    let cursor = currentId;

    while (cursor && !seen.has(cursor) && messagesMap[cursor]) {
      seen.add(cursor);
      const entry = messagesMap[cursor];
      chain.push(entry);
      cursor = entry.parentId || null;
    }

    if (chain.length > 0) {
      return chain.reverse();
    }
  }
  return Array.isArray(fallbackList) ? fallbackList : [];
}

function formatAttachments(files) {
  if (!Array.isArray(files) || files.length === 0) return "";
  const lines = files
    .map((f) => {
      const name = f?.name || f?.filename || f?.file_name || "Attachment";
      const size = f?.size ? ` (${f.size})` : "";
      return `- **${name}**${size}`;
    })
    .filter(Boolean);
  return lines.length > 0 ? `\n\n**Attachments:**\n${lines.join("\n")}` : "";
}

export function formatQwenApiMessage(entry) {
  if (!entry || typeof entry !== "object") return null;
  const role = entry.role === "user" ? "User" : "Qwen";

  let thinking =
    typeof entry.reasoning_content === "string"
      ? entry.reasoning_content.trim()
      : "";
  let answer = typeof entry.content === "string" ? entry.content.trim() : "";

  if (Array.isArray(entry.content_list) && entry.content_list.length > 0) {
    const thoughtParts = [];
    const answerParts = [];

    for (const part of entry.content_list) {
      if (!part || typeof part.content !== "string") continue;
      const text = part.content.trim();
      if (!text) continue;

      if (part.phase === "think" || part.phase === "thinking_summary") {
        thoughtParts.push(text);
      } else {
        answerParts.push(text);
      }
    }

    if (!thinking && thoughtParts.length > 0) {
      thinking = thoughtParts.join("\n\n");
    }
    if (answerParts.length > 0) {
      answer = answerParts.join("\n\n");
    }
  }

  answer = (answer + formatAttachments(entry.files)).trim();
  if (!answer && !thinking) return null;

  const content = thinking
    ? answer
      ? `<think>\n${thinking}\n</think>\n\n${answer}`
      : `<think>\n${thinking}\n</think>`
    : answer;

  const msg = { role, content };
  if (thinking) {
    msg.thinking = thinking;
  }
  return msg;
}

function getQwenAuthToken() {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("token") || "";
    }
  } catch {
    // Ignore storage access restrictions
  }
  return "";
}

export class QwenParser extends ChatParser {
  name = "Qwen";
  isAvailable(url) {
    return url.includes("qwen.ai");
  }

  async fetchChatData(chatId) {
    const url = `https://chat.qwen.ai/api/v2/chats/${chatId}`;
    const headers = { Accept: "application/json" };
    const token = getQwenAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers,
    });
    if (!response.ok) {
      throw new Error(`Qwen chat request failed: ${response.status}`);
    }
    return response.json();
  }

  extractDomMessages() {
    const messages = [];

    // chat.qwen.ai uses specific class names
    let chatMessages = document.querySelectorAll(".qwen-chat-message");
    // Fallback for markup drift: user/assistant content blocks in order.
    if (chatMessages.length === 0) {
      chatMessages = document.querySelectorAll(
        ".user-message-content, .qwen-markdown",
      );
    }

    chatMessages.forEach((message) => {
      // Fallback nodes are the content blocks themselves.
      const isFallbackContent =
        message.matches?.(".user-message-content, .qwen-markdown") ?? false;
      const isUser = isFallbackContent
        ? message.matches(".user-message-content")
        : message.classList.contains("qwen-chat-message-user");
      const role = isUser ? "User" : "Qwen";

      let content = "";
      let attachments = [];

      if (isFallbackContent) {
        content = convertToMarkdown(message);
      } else if (isUser) {
        // Extract attachments first
        const fileItems = message.querySelectorAll(
          ".index-module__file-message-document___OjWnc",
        );
        fileItems.forEach((item) => {
          const fileNameEl = item.querySelector(".fileitem-file-name-text");
          const fileExtEl = item.querySelector(".fileitem-file-name-ext");
          const fileSizeEl = item.querySelector(".fileitem-file-size span");

          if (fileNameEl && fileExtEl) {
            const fileName = fileNameEl.textContent.trim();
            const fileExt = fileExtEl.textContent.trim();
            const fileSize = fileSizeEl ? fileSizeEl.textContent.trim() : "";

            attachments.push({
              name: fileName + fileExt,
              size: fileSize,
            });
          }
        });

        // User messages are in .user-message-content
        const userContent = message.querySelector(".user-message-content");
        if (userContent) {
          content = convertToMarkdown(userContent);
        }
      } else {
        // Assistant messages can contain multiple .qwen-markdown blocks
        const markdownBlocks = message.querySelectorAll(".qwen-markdown");
        if (markdownBlocks.length > 0) {
          content = Array.from(markdownBlocks)
            .map((block) => convertToMarkdown(block).trim())
            .filter(Boolean)
            .join("\n\n");
        }
      }

      // Add attachments to content if any exist
      if (attachments.length > 0) {
        const attachmentList = attachments
          .map((att) => `- **${att.name}** (${att.size})`)
          .join("\n");
        content = content + "\n\n**Attachments:**\n" + attachmentList;
      }

      if (content && content.trim()) {
        messages.push({ role, content: content.trim() });
      }
    });

    return messages;
  }

  async parse(options = {}) {
    const parserMode = options.parserMode || "prefer_api";
    const currentUrl =
      typeof window !== "undefined" && window.location
        ? window.location.href || ""
        : "";

    // Try to get the actual chat title from multiple possible selectors
    const titleSelectors = [
      ".chat-item-drag-link-content-tip-text",
      ".ant-tooltip-inner",
      'input[placeholder*="title"]',
      ".chat-title",
      "h1",
      "title",
    ];

    let title = "Qwen Chat";
    for (const selector of titleSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent || element.value || element.innerText;
        if (text && text.trim() && text !== document.title) {
          title = text.trim().replace(/\s+/g, " ");
          break;
        }
      }
    }
    if (title === "Qwen Chat" && document.title) {
      const docTitle = document.title.trim();
      if (docTitle && docTitle.toLowerCase() !== "qwen studio") {
        title = docTitle;
      }
    }

    const metadata = {
      Source: "Qwen",
      Date: new Date().toLocaleString(),
      Link: currentUrl,
      Method: "DOM",
    };

    // Primary: internal API fetches full conversation without DOM pagination truncation
    if (parserMode !== "prefer_dom") {
      try {
        const chatId = getQwenChatId(currentUrl);
        if (chatId) {
          const json = await this.fetchChatData(chatId);
          const data = json?.data || json;
          const chat = data?.chat || {};
          const history = chat.history || {};
          const ordered = orderQwenHistory(
            history.messages,
            history.currentId || data?.currentId,
            chat.messages,
          );
          const apiMessages = ordered
            .map((entry) => formatQwenApiMessage(entry))
            .filter(Boolean);

          if (apiMessages.length > 0) {
            const apiTitle =
              (typeof data?.title === "string" ? data.title.trim() : "") ||
              title;
            const modelName =
              data?.models?.[0] ||
              ordered.find((m) => m?.modelName || m?.model)?.modelName ||
              ordered.find((m) => m?.model)?.model;
            if (modelName) {
              metadata.Model = modelName;
            }
            return {
              title: apiTitle,
              messages: apiMessages,
              url: currentUrl,
              metadata: { ...metadata, Method: "API" },
            };
          }
        }
      } catch (err) {
        console.warn(
          "[AI Exporter] Qwen API fetch failed, falling back to DOM:",
          err,
        );
      }
    }

    const messages = this.extractDomMessages();
    return { title, messages, url: currentUrl, metadata };
  }
}
