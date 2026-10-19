import { isDuckAiUrl } from "../ai/duck_ai.js";
import { isCopilotUrl } from "../ai/copilot.js";

/**
 * AI chat platform domain definitions.
 * Centralised so detection logic and UI (e.g. Decant's tip banner) share the same list.
 */

export const AI_CHAT_DOMAINS = [
  "chatgpt.com",
  "claude.ai",
  "gemini.google.com",
  "chat.deepseek.com",
  "perplexity.ai",
  "chat.qwen.ai",
  "qwen.ai",
  "chat.mistral.ai",
  "copilot.microsoft.com",
  "lumo.proton.me",
  "meta.ai",
  "aistudio.google.com",
  "notebooklm.google.com",
  "notebook.google.com",
  "chat.z.ai",
  "joyland.ai",
  "chub.ai",
  "characterhub.org",
  "grok.com",
  "duck.ai",
];

/**
 * Additional URL patterns that don't fit simple domain matching.
 * Each entry: { test: (url) => boolean, platform: string }
 */
export const URL_PATTERNS = [
  {
    test: isCopilotUrl,
    platform: "copilot",
  },
  {
    test: (url) => /google\.[a-z.]+\/search/.test(url),
    platform: "google-search-ai",
  },
  {
    test: (url) => url.includes("console.cloud.google.com/gemini"),
    platform: "gemini-cloud-assist",
  },
  {
    test: isDuckAiUrl,
    platform: "duck-ai",
  },
];
