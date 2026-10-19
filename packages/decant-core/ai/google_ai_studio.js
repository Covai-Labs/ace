import { ChatParser } from "./base.js";
import { convertToMarkdown } from "../utils/html-to-markdown.js";

export class GoogleAIStudioParser extends ChatParser {
  name = "Google AI Studio";
  isAvailable(url) {
    return url.includes("aistudio.google.com");
  }

  async parse() {
    let title = "";

    // Title extraction strategies
    const titleInput = document.querySelector(
      'input[aria-label*="prompt name" i], input[aria-label*="title" i], .prompt-title',
    );
    if (titleInput && titleInput.value) {
      title = titleInput.value.trim();
    }
    if (!title) {
      const headerTitle = document.querySelector(
        ".title-text, h1, .prompt-name",
      );
      if (headerTitle) {
        title = headerTitle.textContent.trim();
      }
    }
    if (!title) {
      title = document.title || "Google AI Studio Chat";
    }
    title = title.replace(/\s+/g, " ").trim();

    const messages = [];

    // Selectors for chat turns
    const allTurnElements = Array.from(
      document.querySelectorAll(
        "ms-chat-turn, .chat-turn-container, ms-prompt-editor",
      ),
    );

    // Filter to top-level turn elements only (avoiding child elements nested in parent turn containers)
    const turnElements = allTurnElements.filter(
      (el) =>
        !allTurnElements.some((parent) => parent !== el && parent.contains(el)),
    );

    if (turnElements.length > 0) {
      turnElements.forEach((turn) => {
        // User prompt element
        const userEl =
          turn.querySelector(
            ".user-prompt, .user-prompt-container, .user-message",
          ) || (turn.tagName === "MS-PROMPT-EDITOR" ? turn : null);

        // Model output element
        const aiEl = turn.querySelector(
          ".model-response-text, .model-output, ms-model-output, .model-prompt-container",
        );

        if (userEl) {
          const contentEl =
            userEl.querySelector(".turn-content, .prompt-text, textarea") ||
            userEl;
          let text;
          if (contentEl.tagName === "TEXTAREA") {
            text = contentEl.value || contentEl.textContent || "";
          } else {
            text = convertToMarkdown(contentEl);
          }
          text = text.trim();
          if (text) {
            messages.push({ role: "User", content: text });
          }
        }

        if (aiEl) {
          const clone = aiEl.cloneNode(true);
          // Remove noise elements like copy buttons or action menus
          clone
            .querySelectorAll(
              "button, .mat-expansion-panel-header, .author-label, .timestamp, ms-prompt-options-menu, .navigator-container",
            )
            .forEach((el) => el.remove());

          let text = convertToMarkdown(clone).trim();
          if (
            text &&
            text !== "Thinking..." &&
            !text.includes("model_thought_output")
          ) {
            messages.push({ role: "Google AI Studio", content: text });
          }
        }
      });
    }

    // Fallback if turnElements linear loop yielded no messages
    if (messages.length === 0) {
      const userPrompts = document.querySelectorAll(
        ".user-prompt, .user-prompt-container",
      );
      const modelOutputs = document.querySelectorAll(
        ".model-response-text, ms-model-output, .model-output",
      );

      const maxLen = Math.max(userPrompts.length, modelOutputs.length);
      for (let i = 0; i < maxLen; i++) {
        if (userPrompts[i]) {
          const text = (
            userPrompts[i].value || convertToMarkdown(userPrompts[i])
          ).trim();
          if (text) messages.push({ role: "User", content: text });
        }
        if (modelOutputs[i]) {
          const text = convertToMarkdown(modelOutputs[i]).trim();
          if (text) messages.push({ role: "Google AI Studio", content: text });
        }
      }
    }

    const currentUrl =
      typeof window !== "undefined" && window.location
        ? window.location.href || ""
        : "";
    const metadata = {
      Source: "Google AI Studio",
      Date: new Date().toLocaleString(),
      Link: currentUrl,
      Method: "DOM",
    };

    return { title, messages, url: currentUrl, metadata };
  }
}
