import { ChatParser } from "./base.js";
import { convertToMarkdown } from "../utils/html-to-markdown.js";

export class NotebookLMParser extends ChatParser {
  name = "NotebookLM";
  isAvailable(url) {
    return (
      url.includes("notebooklm.google.com") ||
      url.includes("notebook.google.com")
    );
  }

  async parse() {
    let title = "";

    // Title extraction
    const titleEl = document.querySelector(
      '.title-container .title, .notebook-title-input, input[aria-label*="title" i], h1.notebook-title',
    );
    if (titleEl) {
      title = (titleEl.value || titleEl.textContent || "").trim();
    }
    if (!title) {
      title = (document.title || "Gemini Notebook")
        .replace(/\s*-\s*(Gemini Notebook|NotebookLM)$/i, "")
        .trim();
    }
    title = title || "NotebookLM Conversation";

    const messages = [];

    // Selectors for turn pairs or individual message cards in NotebookLM
    const messagePairs = Array.from(
      document.querySelectorAll(
        ".chat-message-pair, chat-message, .message-pair-container",
      ),
    );

    // Filter to top-level containers
    const topContainers = messagePairs.filter(
      (el) =>
        !messagePairs.some((parent) => parent !== el && parent.contains(el)),
    );

    if (topContainers.length > 0) {
      topContainers.forEach((pair) => {
        // User message
        const userContainer = pair.querySelector(
          ".from-user-container, .from-user-message-card-content",
        );

        // Model / Assistant response
        const aiContainer = pair.querySelector(
          ".to-user-container, .to-user-message-inner-content, labs-tailwind-doc-viewer",
        );

        if (userContainer) {
          const contentEl =
            userContainer.querySelector(
              ".message-text-content, .md3-body-text, .from-user-message-inner-content",
            ) || userContainer;

          const clone = contentEl.cloneNode(true);
          // Clean up noise buttons & icons
          clone
            .querySelectorAll("button, mat-icon, .mat-mdc-button-touch-target")
            .forEach((el) => el.remove());

          const userText = convertToMarkdown(clone).trim();
          if (userText) {
            messages.push({ role: "User", content: userText });
          }
        }

        if (aiContainer) {
          const contentEl =
            aiContainer.querySelector(
              "labs-tailwind-doc-viewer, .message-text-content, .to-user-message-inner-content",
            ) || aiContainer;

          const clone = contentEl.cloneNode(true);
          // Format citation markers (e.g., button.citation-marker -> <span class="citation-ref">[1]</span>)
          clone.querySelectorAll("button.citation-marker").forEach((btn) => {
            const citeNum = btn.textContent.trim();
            if (citeNum && typeof document !== "undefined") {
              const spanNode = document.createElement("span");
              spanNode.className = "citation-ref";
              spanNode.textContent = ` [${citeNum}]`;
              btn.replaceWith(spanNode);
            }
          });

          // Clean up other UI noise (thumbs up/down, action buttons)
          clone
            .querySelectorAll(
              "button, mat-icon, .mat-mdc-button-touch-target, .feedback-actions",
            )
            .forEach((el) => el.remove());

          const aiText = convertToMarkdown(clone).trim();
          if (aiText) {
            messages.push({ role: "NotebookLM", content: aiText });
          }
        }
      });
    }

    // Direct fallback if topContainers loop yielded no messages
    if (messages.length === 0) {
      const userContainers = Array.from(
        document.querySelectorAll(".from-user-container"),
      );
      const aiContainers = Array.from(
        document.querySelectorAll(".to-user-container"),
      );

      const maxLen = Math.max(userContainers.length, aiContainers.length);
      for (let i = 0; i < maxLen; i++) {
        if (userContainers[i]) {
          const text = convertToMarkdown(userContainers[i]).trim();
          if (text) messages.push({ role: "User", content: text });
        }
        if (aiContainers[i]) {
          const clone = aiContainers[i].cloneNode(true);
          clone.querySelectorAll("button.citation-marker").forEach((btn) => {
            const citeNum = btn.textContent.trim();
            if (citeNum && typeof document !== "undefined") {
              const spanNode = document.createElement("span");
              spanNode.className = "citation-ref";
              spanNode.textContent = ` [${citeNum}]`;
              btn.replaceWith(spanNode);
            }
          });
          clone
            .querySelectorAll("button, mat-icon")
            .forEach((el) => el.remove());

          const text = convertToMarkdown(clone).trim();
          if (text) messages.push({ role: "NotebookLM", content: text });
        }
      }
    }

    const currentUrl =
      typeof window !== "undefined" && window.location
        ? window.location.href || ""
        : "";
    const metadata = {
      Source: "NotebookLM",
      Date: new Date().toLocaleString(),
      Link: currentUrl,
      Method: "DOM",
    };

    return { title, messages, url: currentUrl, metadata };
  }
}
