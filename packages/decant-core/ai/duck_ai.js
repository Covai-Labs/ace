import { ChatParser } from "./base.js";
import { convertToMarkdown } from "../utils/html-to-markdown.js";

export function isDuckAiUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "duck.ai" || host.endsWith(".duck.ai")) {
      return true;
    }
    if (host === "duckduckgo.com" || host.endsWith(".duckduckgo.com")) {
      if (parsed.pathname === "/chat" || parsed.pathname.startsWith("/chat/")) {
        return true;
      }
      return parsed.searchParams.get("ia") === "chat";
    }
  } catch {
    return false;
  }
  return false;
}

export class DuckAIParser extends ChatParser {
  name = "Duck.ai";

  isAvailable(url) {
    return isDuckAiUrl(url);
  }

  async parse() {
    // 1. Extract Title
    let title = "";
    if (typeof document !== "undefined" && document.title) {
      title = document.title
        .replace(/\s*-\s*DuckDuckGo.*$/i, "")
        .replace(/\s*-\s*Duck\.ai.*$/i, "")
        .trim();
      if (/^(?:duckduckgo\s*ai\s*chat|duck\.ai)$/i.test(title)) {
        title = "";
      }
    }

    if (!title && typeof document !== "undefined") {
      const activeChat = document.querySelector(
        '[data-testid="ChatsList"] [aria-current="page"], [data-testid="ChatsList"] button, [data-testid="ChatsList"] a',
      );
      if (activeChat && activeChat.textContent) {
        title = activeChat.textContent.trim();
      }
    }

    // 2. Extract Messages
    const messages = [];
    let latestModel = "";

    const userElements =
      typeof document !== "undefined"
        ? Array.from(document.querySelectorAll('[data-testid="user-message"]'))
        : [];

    for (let i = 0; i < userElements.length; i++) {
      const userEl = userElements[i];

      // Process User Message
      const userClone = userEl.cloneNode(true);
      // Remove inline favicon images
      userClone
        .querySelectorAll(
          'img[src*="duckduckgo.com/ip3/"], img[src*="favicons"]',
        )
        .forEach((img) => img.remove());
      const userText = convertToMarkdown(userClone);
      if (userText.trim()) {
        messages.push({
          role: "User",
          content: userText.trim(),
        });
      }

      // Process Assistant Message
      let assistantEl = userEl.nextElementSibling;
      if (
        !assistantEl ||
        assistantEl.getAttribute("data-testid") === "user-message"
      ) {
        // Fallback: look within parent turn container for assistant message element
        assistantEl =
          userEl.parentElement?.querySelector('[id*="-assistant-message-"]') ||
          null;
      }

      if (assistantEl) {
        // Extract Model Badge if present
        let turnModel = "";
        const heading = assistantEl.querySelector(
          '[id^="heading-"][id*="-assistant-message-"], [id*="-assistant-message-"] h2, [id*="-assistant-message-"] h3',
        );
        if (heading && heading.textContent) {
          turnModel = heading.textContent.replace(/^[^a-zA-Z0-9]+/, "").trim();
          if (turnModel) {
            latestModel = turnModel;
          }
        }

        const astClone = assistantEl.cloneNode(true);

        // Remove header / heading
        astClone
          .querySelectorAll(
            '[id^="heading-"], .OFnY5LgQty8A4PIj3XdY, button, [data-testid="feedback-prompt"]',
          )
          .forEach((el) => el.remove());

        // Remove transient web search query box
        astClone
          .querySelectorAll('.f_6cBYM9KdwpDEKf3fGW, [class*="search"]')
          .forEach((el) => el.remove());

        // Remove actions / footer container
        astClone
          .querySelectorAll("._4aCfUrBe8vy05lxcMBX")
          .forEach((el) => el.remove());

        // Preprocess Streamdown code blocks into standard <pre><code class="language-xyz">...</code></pre>
        astClone
          .querySelectorAll('[data-streamdown="code-block"]')
          .forEach((cb) => {
            const header = cb.querySelector(
              '[data-streamdown="code-block-header"]',
            );
            const lang =
              header?.getAttribute("data-language") ||
              header?.textContent?.trim().toLowerCase() ||
              "";
            const codeEl =
              cb.querySelector('[data-streamdown="code-block-body"] code') ||
              cb.querySelector("code");
            const codeText = codeEl?.textContent || "";

            const pre = astClone.ownerDocument.createElement("pre");
            const code = astClone.ownerDocument.createElement("code");
            if (lang) {
              code.className = `language-${lang}`;
            }
            code.textContent = codeText;
            pre.appendChild(code);
            if (cb.parentNode) {
              cb.parentNode.replaceChild(pre, cb);
            }
          });

        // Clean up favicon images
        astClone
          .querySelectorAll(
            'img[src*="duckduckgo.com/ip3/"], img[src*="favicons"]',
          )
          .forEach((img) => img.remove());

        // Format Read More citation links: ensure space before domain name in citation text
        astClone
          .querySelectorAll(
            "section h4 + div li a span > span, section ul li a span > span",
          )
          .forEach((domainSpan) => {
            const domainText = domainSpan.textContent.trim();
            if (domainText) {
              domainSpan.textContent = ` (${domainText})`;
            }
          });

        const astText = convertToMarkdown(astClone);
        if (astText.trim()) {
          const msg = {
            role: "Duck.ai",
            content: astText.trim(),
          };
          if (turnModel) {
            msg.model = turnModel;
          }
          messages.push(msg);
        }
      }
    }

    if (!title && messages.length > 0) {
      const firstUser = messages.find((m) => m.role === "User");
      if (firstUser && firstUser.content) {
        title = firstUser.content.slice(0, 60).trim();
      }
    }
    title = title || "Duck.ai Conversation";

    const currentUrl =
      typeof window !== "undefined" && window.location
        ? window.location.href || ""
        : "";

    const metadata = {
      Source: "Duck.ai",
      Date: new Date().toLocaleString(),
      Link: currentUrl,
      Method: "DOM",
      ...(latestModel ? { Model: latestModel } : {}),
    };

    return { title, messages, url: currentUrl, metadata };
  }
}
