import { ChatParser } from "./base.js";
import { convertToMarkdown } from "../utils/html-to-markdown.js";

export class ChubParser extends ChatParser {
  name = "Chub";

  isAvailable(url) {
    return url.includes("chub.ai") || url.includes("characterhub.org");
  }

  async parse() {
    // Extract Character Name
    const charLink = document.querySelector('a[href*="/characters/"]');
    const character = charLink
      ? charLink.textContent.trim().replace(/\s+/g, " ")
      : "";

    // Extract User Name
    const userLink = document.querySelector('a[href*="/users/"]');
    let user = "";
    if (userLink) {
      const href = userLink.getAttribute("href") || "";
      const match = href.match(/\/users\/([^/?#]+)/);
      user = match ? match[1] : userLink.textContent.trim();
    }

    // Extract Title
    let title = document.title
      ? document.title.trim().replace(/\s+/g, " ")
      : "";
    if (
      !title ||
      title.toLowerCase() === "chub" ||
      title.toLowerCase() === "chub ai"
    ) {
      title = character ? `Chat with ${character}` : "Chub AI Conversation";
    }

    // Select message items
    let items = Array.from(
      document.querySelectorAll("li.ant-list-item.message-full"),
    );
    if (items.length === 0) {
      const allMsg = Array.from(document.querySelectorAll(".message-full"));
      items = allMsg.filter(
        (el) => !allMsg.some((parent) => parent !== el && parent.contains(el)),
      );
    }

    const messages = [];
    for (const item of items) {
      const isUser =
        !!item.querySelector('a[href*="/users/"]') ||
        !item.querySelector('a[href*="/characters/"]');
      const role = isUser ? "User" : "Chub";

      const contentEl =
        item.querySelector(".msg-mkdn-container") ||
        item.querySelector(".ant-list-item-meta-description") ||
        item;
      const clone = contentEl.cloneNode(true);

      // Clean up UI controls and noise elements
      clone
        .querySelectorAll(
          "button, .message-control-buttons, .message-title, .ant-image-mask, .anticon",
        )
        .forEach((el) => el.remove());

      const markdown = convertToMarkdown(clone);
      if (markdown.trim()) {
        messages.push({ role, content: markdown.trim() });
      }
    }

    const currentUrl =
      typeof window !== "undefined" && window.location
        ? window.location.href || ""
        : "";
    const metadata = {
      Source: "Chub",
      Date: new Date().toLocaleString(),
      Link: currentUrl,
      Method: "DOM",
    };
    if (character) metadata.Character = character;
    if (user) metadata.User = user;

    return { title, messages, url: currentUrl, metadata };
  }
}
