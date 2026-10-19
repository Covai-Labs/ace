import { ChatParser } from "./base.js";
import { convertToMarkdown } from "../utils/html-to-markdown.js";

export class JoylandParser extends ChatParser {
  name = "Joyland";

  isAvailable(url) {
    return url.includes("joyland.ai");
  }

  async parse() {
    // Extract Character Name & Creator
    const botNameEl =
      document.querySelector(".bot-name-text") ||
      document.querySelector(".bot-name");
    let botName = botNameEl
      ? botNameEl.textContent.trim().replace(/\s+/g, " ")
      : "";
    if (
      botName.endsWith("1") &&
      botNameEl?.parentElement?.querySelector(".bot-name-text")
    ) {
      const cleanEl = botNameEl.parentElement.querySelector(".bot-name-text");
      if (cleanEl) botName = cleanEl.textContent.trim();
    }

    const creatorEl = document.querySelector(".creator-name .name");
    const creator = creatorEl
      ? creatorEl.textContent.trim().replace(/\s+/g, " ")
      : "";

    // Extract Title
    let title = "";
    if (botName) {
      title = `${botName} - Joyland Chat`;
    } else if (document.title) {
      title = document.title.replace(/\s*-\s*Joyland.*$/i, "").trim();
    }
    title = title || "Joyland Conversation";

    const messages = [];
    const items = document.querySelectorAll(".chat-list-item");

    for (const item of items) {
      const isUser = !!item.querySelector(".user-text-box, .user-text");
      const isRobot = !!item.querySelector(".robot-text-box, .robot-text");
      if (!isUser && !isRobot) continue;

      const rawContentEl =
        item.querySelector(".markdown-body") ||
        item.querySelector(".body-text") ||
        item;
      const contentElClone = rawContentEl.cloneNode(true);

      // Remove UI noise elements (audio player, ratings, refresh buttons, etc.)
      contentElClone
        .querySelectorAll(
          ".audio-style-box, .audio-style, .rate-container, .rate, .refresh, button, .click-gif, svg",
        )
        .forEach((el) => el.remove());

      const markdown = convertToMarkdown(contentElClone);
      if (markdown.trim()) {
        messages.push({
          role: isUser ? "User" : "Joyland",
          content: markdown.trim(),
        });
      }
    }

    const currentUrl =
      typeof window !== "undefined" && window.location
        ? window.location.href || ""
        : "";
    const metadata = {
      Source: "Joyland",
      Date: new Date().toLocaleString(),
      Link: currentUrl,
      Method: "DOM",
    };
    if (botName) metadata.Character = botName;
    if (creator) metadata.Creator = creator;

    return { title, messages, url: currentUrl, metadata };
  }
}
