import { ChatParser } from "./base.js";
import { convertToMarkdown } from "../utils/html-to-markdown.js";

export class GeminiCloudAssistParser extends ChatParser {
  name = "Gemini Cloud Assist";
  isAvailable(url) {
    return url.includes("console.cloud.google.com/gemini");
  }

  async parse() {
    const activeItem = document.querySelector(
      "mat-list-item.mdc-list-item--activated span.cfc-flex-grow-content",
    );
    let title = activeItem?.textContent?.trim() || "";

    // Fallback if no active item
    if (!title) {
      const firstUserMsg = document
        .querySelector(".aic-user-message-text")
        ?.textContent?.trim();
      if (firstUserMsg) {
        title =
          firstUserMsg.length > 50
            ? firstUserMsg.substring(0, 50) + "..."
            : firstUserMsg;
      }
    }

    if (!title) {
      title = document.title || "Gemini Cloud Assist";
    }

    // Clean up title whitespace
    title = title.replace(/\s+/g, " ").trim();

    const messages = [];

    // Find all turns inside aic-conversation or standard turn containers
    const turns = document.querySelectorAll(
      "aic-conversation .aic-turn, .aic-turn",
    );

    turns.forEach((turn) => {
      // 1. Process user message
      const userEl = turn.querySelector(".aic-user-message");
      if (userEl) {
        const textEl = userEl.querySelector(".aic-user-message-text") || userEl;
        let text = convertToMarkdown(textEl).trim();
        if (text) {
          messages.push({
            role: "User",
            content: text,
          });
        }
      }

      // 2. Process assistant message
      const agentEl = turn.querySelector("aic-agent-entry");
      if (agentEl) {
        // Prefer the actual markdown renderer content if present, to avoid feedback actions/buttons noise
        const markdownEl =
          agentEl.querySelector(".ai-markdown-artifact-renderer") ||
          agentEl.querySelector(".aic-markdown-renderer-container") ||
          agentEl.querySelector(".aic-agent-content") ||
          agentEl;

        // Clone the element to safely strip unwanted components
        const clone = markdownEl.cloneNode(true);
        // Remove thumb up/down feedback buttons or loader/expander elements
        clone
          .querySelectorAll(
            "button, aic-feedback-actions, .aic-agent-thoughts-container, aic-loading-indicator",
          )
          .forEach((el) => {
            el.remove();
          });

        let text = convertToMarkdown(clone).trim();
        if (text) {
          messages.push({
            role: "Model",
            content: text,
          });
        }
      }
    });

    const currentUrl =
      typeof window !== "undefined" && window.location
        ? window.location.href || ""
        : "";
    const metadata = {
      Source: "Gemini Cloud Assist",
      Date: new Date().toLocaleString(),
      Link: currentUrl,
      Method: "DOM",
    };

    return { title, messages, url: currentUrl, metadata };
  }
}
