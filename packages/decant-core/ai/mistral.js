import { ChatParser } from "./base.js";
import { convertToMarkdown } from "../utils/html-to-markdown.js";

export class MistralParser extends ChatParser {
  name = "Mistral";
  isAvailable(url) {
    return url.includes("chat.mistral.ai");
  }

  async parse() {
    // Extract Title: document.title is the most reliable source; the
    // sidebar truncate span may match unrelated UI ("Upgrade to Pro").
    let title = (document.title || "")
      .replace(/\s*-\s*Mistral\s*$/i, "")
      .trim();
    if (!title) {
      const titleElement = document.querySelector(
        "span.truncate.text-sm, [data-testid='conversation-title']",
      );
      title =
        (titleElement?.textContent || "").trim() || "Mistral Conversation";
    }

    const messages = [];
    const messageElements = document.querySelectorAll(
      "[data-message-author-role]",
    );

    for (const el of messageElements) {
      const role = el.getAttribute("data-message-author-role");

      if (role === "user") {
        const contentEl =
          el.querySelector(".select-text") ||
          el.querySelector(".whitespace-pre-wrap") ||
          el;
        const text = convertToMarkdown(contentEl).trim();
        if (text) {
          messages.push({ role: "User", content: text });
        }
      } else if (role === "assistant") {
        const answerEl =
          el.querySelector('[data-message-part-type="answer"]') || el;
        const markdown = convertToMarkdown(answerEl).trim();
        if (markdown) {
          messages.push({ role: "Mistral", content: markdown });
        }
      }
    }

    const currentUrl =
      typeof window !== "undefined" && window.location
        ? window.location.href || ""
        : "";
    const metadata = {
      Source: "Mistral",
      Date: new Date().toLocaleString(),
      Link: currentUrl,
      Method: "DOM",
    };

    return { title, messages, url: currentUrl, metadata };
  }
}
