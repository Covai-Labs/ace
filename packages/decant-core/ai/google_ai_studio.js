import { ChatParser } from "./base.js";
import { convertToMarkdown } from "../utils/html-to-markdown.js";

const NOISE_SELECTOR = [
  "button",
  "mat-expansion-panel-header",
  ".mat-expansion-panel-header",
  ".actions-container",
  "ms-chat-turn-options",
  ".author-label",
  ".timestamp",
  ".turn-separator",
  "ms-prompt-options-menu",
  ".navigator-container",
].join(", ");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findScrollRoot(turns) {
  const firstTurn = turns.find(Boolean);
  let node = firstTurn?.parentElement || null;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.scrollHeight > node.clientHeight + 80) {
      return node;
    }
    node = node.parentElement;
  }
  const scrollingEl = document.scrollingElement || document.documentElement;
  if (scrollingEl && scrollingEl.scrollHeight > scrollingEl.clientHeight + 80) {
    return scrollingEl;
  }
  return null;
}

function cleanTurnContent(element) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll(NOISE_SELECTOR).forEach((el) => el.remove());

  // Unwrap <pre><code> inside inline <ms-katex> so KaTeX spans convert as inline math
  clone.querySelectorAll("ms-katex.inline").forEach((katexHost) => {
    const katexSpan = katexHost.querySelector(".katex");
    if (katexSpan) {
      katexHost.replaceChildren(katexSpan);
    }
  });

  return convertToMarkdown(clone).trim();
}

function extractModernTurn(turn) {
  const roleContainer = turn.querySelector("[data-turn-role]");
  const turnRole = roleContainer?.getAttribute("data-turn-role");
  if (!turnRole) return null;

  const contentRoot =
    roleContainer.querySelector(".turn-content") || roleContainer;
  const hasPromptContent = Boolean(
    contentRoot.querySelector(
      "ms-prompt-chunk, ms-thought-chunk, ms-text-chunk, ms-cmark-node, textarea, img",
    ),
  );
  if (!hasPromptContent) return null;

  const isThought =
    turn.classList?.contains("thought-activity-host") ||
    Boolean(contentRoot.querySelector("ms-thought-chunk"));

  const textarea =
    turnRole === "User" &&
    !contentRoot.querySelector("ms-text-chunk, ms-cmark-node")
      ? contentRoot.querySelector("textarea")
      : null;
  const text = textarea
    ? (textarea.value || textarea.textContent || "").trim()
    : cleanTurnContent(contentRoot);

  if (
    !text ||
    (turnRole !== "User" &&
      (text === "Thinking..." || text.includes("model_thought_output")))
  ) {
    return null;
  }

  return {
    key: turn.getAttribute("id") || "",
    role: turnRole === "User" ? "User" : "Google AI Studio",
    content: text,
    isThought,
  };
}

async function collectVirtualizedTurns(turns) {
  const collected = new Map();
  turns.forEach((turn, idx) => {
    const extracted = extractModernTurn(turn);
    if (extracted) {
      collected.set(extracted.key || `idx-${idx}`, { idx, ...extracted });
    }
  });

  const hasUnmounted = turns.some((t) => {
    const roleEl = t.querySelector("[data-turn-role]");
    return roleEl && !extractModernTurn(t);
  });

  const scrollRoot = hasUnmounted ? findScrollRoot(turns) : null;
  if (!scrollRoot || typeof window === "undefined") {
    return Array.from(collected.values()).sort((a, b) => a.idx - b.idx);
  }

  const prevScrollTop = scrollRoot.scrollTop;
  const prevBehavior = scrollRoot.style?.scrollBehavior;
  if (scrollRoot.style) scrollRoot.style.scrollBehavior = "auto";

  try {
    for (let idx = 0; idx < turns.length; idx++) {
      const turn = turns[idx];
      const key = turn.getAttribute("id") || `idx-${idx}`;
      if (collected.has(key)) continue;

      if (typeof turn.scrollIntoView === "function") {
        turn.scrollIntoView({ block: "center", behavior: "instant" });
      }
      await delay(150);

      // Harvest any newly mounted turns in view
      turns.forEach((candidate, cIdx) => {
        const cKey = candidate.getAttribute("id") || `idx-${cIdx}`;
        if (collected.has(cKey)) return;
        const extracted = extractModernTurn(candidate);
        if (extracted) {
          collected.set(cKey, { idx: cIdx, ...extracted });
        }
      });
    }
  } finally {
    scrollRoot.scrollTop = prevScrollTop;
    if (scrollRoot.style) scrollRoot.style.scrollBehavior = prevBehavior || "";
  }

  return Array.from(collected.values()).sort((a, b) => a.idx - b.idx);
}

function mergeThoughtMessages(rawMessages) {
  const merged = [];
  for (let i = 0; i < rawMessages.length; i++) {
    const current = rawMessages[i];
    if (current.isThought && current.role === "Google AI Studio") {
      const next = rawMessages[i + 1];
      if (next && !next.isThought && next.role === "Google AI Studio") {
        merged.push({
          role: "Google AI Studio",
          thinking: current.content,
          content: `<think>\n${current.content}\n</think>\n\n${next.content}`,
        });
        i++;
        continue;
      }
      merged.push({
        role: "Google AI Studio",
        thinking: current.content,
        content: `<think>\n${current.content}\n</think>`,
      });
      continue;
    }
    merged.push({ role: current.role, content: current.content });
  }
  return merged;
}

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

    let messages = [];

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

    const hasModernTurns = turnElements.some((el) =>
      el.querySelector?.("[data-turn-role]"),
    );

    if (hasModernTurns) {
      const modernTurns = turnElements.filter((el) =>
        el.querySelector?.("[data-turn-role]"),
      );
      const rawMessages = await collectVirtualizedTurns(modernTurns);
      messages = mergeThoughtMessages(rawMessages);
    } else if (turnElements.length > 0) {
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
          const text = cleanTurnContent(aiEl);
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
