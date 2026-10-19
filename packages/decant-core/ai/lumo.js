import { ChatParser } from "./base.js";
import { convertToMarkdown } from "../utils/html-to-markdown.js";

export class LumoParser extends ChatParser {
  name = "Lumo";
  isAvailable(url) {
    return url.includes("lumo.proton.me");
  }

  async parse() {
    // Extract Title
    let title = "";
    const titleBtn = document.querySelector(
      ".conversation-header-title-view button",
    );
    if (titleBtn && titleBtn.textContent) {
      title = titleBtn.textContent.trim();
    } else if (document.title) {
      title = document.title.replace(/\s*-\s*Lumo.*$/i, "").trim();
    }
    title = title || "Lumo Conversation";

    const messages = [];
    const messageElements = document.querySelectorAll(
      ".lumo-chat-item[data-message-role]",
    );

    for (const el of messageElements) {
      const roleAttr = el.getAttribute("data-message-role");

      if (roleAttr === "user") {
        const contentEl =
          el.querySelector(".lumo-markdown") ||
          el.querySelector(".user-msg-container") ||
          el;
        const text = convertToMarkdown(contentEl);
        if (text.trim()) {
          messages.push({
            role: "User",
            content: text.trim(),
          });
        }
      } else if (roleAttr === "assistant") {
        const contentEl =
          el.querySelector(".progressive-markdown-content") ||
          el.querySelector(".assistant-msg-container") ||
          el;

        const ownerDoc = el.ownerDocument || document;
        const contentElClone = contentEl.cloneNode(true);

        // Preprocess Lumo code blocks to standard <pre><code class="language-xyz">...</code></pre>
        contentElClone
          .querySelectorAll(".lumo-syntax-highlighter, .lumo-code-block")
          .forEach((codeBlock) => {
            const codeEl = codeBlock.querySelector("code");
            if (codeEl) {
              let language = "";
              const match = (codeEl.className || "").match(/language-([^\s]+)/);
              if (match) {
                language = match[1];
              }

              const codeText = codeEl.textContent || "";
              const pre = ownerDoc.createElement("pre");
              const code = ownerDoc.createElement("code");
              if (language) {
                code.className = `language-${language}`;
              }
              code.textContent = codeText;
              pre.appendChild(code);

              const parentToReplace =
                codeBlock.closest(".message-container") || codeBlock;
              if (parentToReplace && parentToReplace.parentNode) {
                parentToReplace.parentNode.replaceChild(pre, parentToReplace);
              }
            }
          });

        // Clean up UI toolbar and avatar elements from assistant clone
        contentElClone
          .querySelectorAll(
            ".action-toolbar, .lumo-no-copy, .lumo-avatar, button",
          )
          .forEach((noCopy) => {
            noCopy.remove();
          });

        const markdown = convertToMarkdown(contentElClone);
        if (markdown.trim()) {
          messages.push({
            role: "Lumo",
            content: markdown.trim(),
          });
        }
      }
    }

    const currentUrl =
      typeof window !== "undefined" && window.location
        ? window.location.href || ""
        : "";
    const metadata = {
      Source: "Lumo",
      Date: new Date().toLocaleString(),
      Link: currentUrl,
      Method: "DOM",
    };

    return { title, messages, url: currentUrl, metadata };
  }
}
