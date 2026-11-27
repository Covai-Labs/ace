import { ChatParser } from "./base.js";
import { convertToMarkdown } from "../utils/html-to-markdown.js";

/**
 * Checks whether a URL belongs to Dola (dola.com or subdomains).
 * @param {string} url
 * @returns {boolean}
 */
export function isDolaUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host === "dola.com" || host.endsWith(".dola.com");
  } catch {
    return false;
  }
}

export class DolaParser extends ChatParser {
  name = "Dola";

  isAvailable(url) {
    return isDolaUrl(url);
  }

  /**
   * Extracts user-attached file names as `[Attachment: filename]` lines.
   * @param {Element} root
   * @returns {string[]}
   */
  extractAttachments(root) {
    const items = root.querySelectorAll('[data-testid="attachment_file_item"]');
    const attachments = [];
    for (const item of items) {
      const nameEl = item.querySelector(
        '[data-testid="message_nested_content_file_name"]',
      );
      const name = (nameEl?.textContent || item.textContent || "").trim();
      if (name) {
        attachments.push(`[Attachment: ${name}]`);
      }
    }
    return attachments;
  }

  /**
   * Converts a message element's text content to Markdown after stripping UI chrome.
   * @param {Element} container
   * @returns {string}
   */
  extractMessageMarkdown(container) {
    const clone = container.cloneNode(true);
    clone
      .querySelectorAll(
        '[data-copy-ignore], [data-testid="message_action_bar"], [data-testid="message_attachment_grid"], button',
      )
      .forEach((el) => el.remove());

    const textBlocks = clone.querySelectorAll(
      '[data-testid="message_text_content"]',
    );
    if (textBlocks.length > 0) {
      const parts = [];
      for (const block of textBlocks) {
        const md = convertToMarkdown(block).trim();
        if (md) parts.push(md);
      }
      return parts.join("\n\n");
    }

    const contentEl = clone.querySelector('[data-testid="message_content"]');
    return convertToMarkdown(contentEl || clone).trim();
  }

  async parse() {
    let title = "";
    const titleEl =
      document.querySelector("[data-conversation-title-text]") ||
      document.querySelector('[data-testid="editable_conversation_name"]');
    if (titleEl && titleEl.textContent) {
      title = titleEl.textContent.trim();
    } else if (document.title) {
      title = document.title.replace(/\s*-\s*Dola.*$/i, "").trim();
    }
    if (/^dola$/i.test(title)) {
      title = "";
    }
    title = title || "Dola Conversation";

    const messages = [];
    let containers = Array.from(
      document.querySelectorAll('[data-testid="union_message"]'),
    );
    if (containers.length === 0) {
      containers = Array.from(
        document.querySelectorAll(
          '[data-testid="send_message"], [data-testid="receive_message"]',
        ),
      );
    }

    for (const el of containers) {
      const sendEl =
        el.getAttribute("data-testid") === "send_message"
          ? el
          : el.querySelector('[data-testid="send_message"]');
      const receiveEl =
        el.getAttribute("data-testid") === "receive_message"
          ? el
          : el.querySelector('[data-testid="receive_message"]');
      const roleEl = el.querySelector("[data-message-role]") || el;
      const roleAttr = roleEl.getAttribute("data-message-role");

      const isUser = Boolean(sendEl) || roleAttr === "user";
      const isAssistant = Boolean(receiveEl) || roleAttr === "assistant";

      if (isUser) {
        const target = sendEl || el;
        const attachments = this.extractAttachments(target);
        const text = this.extractMessageMarkdown(target);
        const parts = [...attachments];
        if (text) parts.push(text);
        const content = parts.join("\n\n").trim();
        if (content) {
          messages.push({ role: "User", content });
        }
      } else if (isAssistant) {
        const target = receiveEl || el;
        const content = this.extractMessageMarkdown(target);
        if (content) {
          messages.push({ role: "Dola", content });
        }
      }
    }

    const currentUrl =
      typeof window !== "undefined" && window.location
        ? window.location.href || ""
        : "";
    const metadata = {
      Source: "Dola",
      Date: new Date().toLocaleString(),
      Link: currentUrl,
      Method: "DOM",
    };

    return { title, messages, url: currentUrl, metadata };
  }
}
