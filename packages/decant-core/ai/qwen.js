import { ChatParser } from "./base.js";
import { convertToMarkdown } from "../utils/html-to-markdown.js";

export class QwenParser extends ChatParser {
  name = "Qwen";
  isAvailable(url) {
    return url.includes("qwen.ai");
  }

  async parse() {
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
        // Assistant messages are in .qwen-markdown elements
        const markdownContent = message.querySelector(".qwen-markdown");
        if (markdownContent) {
          content = convertToMarkdown(markdownContent);
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

    const currentUrl =
      typeof window !== "undefined" && window.location
        ? window.location.href || ""
        : "";
    const metadata = {
      Source: "Qwen",
      Date: new Date().toLocaleString(),
      Link: currentUrl,
      Method: "DOM",
    };

    return { title, messages, url: currentUrl, metadata };
  }
}
