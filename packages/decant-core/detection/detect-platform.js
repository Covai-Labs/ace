import { AI_CHAT_DOMAINS, URL_PATTERNS } from "./domains.js";
import { ChatGPTParser } from "../ai/chatgpt.js";
import { ClaudeParser } from "../ai/claude.js";
import { GeminiParser } from "../ai/gemini.js";
import { CopilotParser } from "../ai/copilot.js";
import { DeepSeekParser } from "../ai/deepseek.js";
import { MetaParser } from "../ai/meta.js";
import { MistralParser } from "../ai/mistral.js";
import { PerplexityParser } from "../ai/perplexity.js";
import { QwenParser } from "../ai/qwen.js";
import { LumoParser } from "../ai/lumo.js";
import { ZAiParser } from "../ai/z_ai.js";
import { GoogleAIStudioParser } from "../ai/google_ai_studio.js";
import { NotebookLMParser } from "../ai/notebooklm.js";
import { GoogleSearchAIParser } from "../ai/google_search_ai.js";
import { GeminiCloudAssistParser } from "../ai/gemini_cloud_assist.js";
import { JoylandParser } from "../ai/joyland.js";
import { ChubParser } from "../ai/chub.js";
import { GrokParser } from "../ai/grok.js";
import { DuckAIParser } from "../ai/duck_ai.js";

/**
 * Ordered list of parsers. First match wins.
 * The order roughly reflects platform popularity / specificity.
 */
export const parsers = [
  new ChatGPTParser(),
  new ClaudeParser(),
  new GeminiParser(),
  new CopilotParser(),
  new PerplexityParser(),
  new DeepSeekParser(),
  new QwenParser(),
  new MetaParser(),
  new MistralParser(),
  new DuckAIParser(),
  new LumoParser(),
  new ZAiParser(),
  new GoogleAIStudioParser(),
  new NotebookLMParser(),
  new GoogleSearchAIParser(),
  new GeminiCloudAssistParser(),
  new JoylandParser(),
  new ChubParser(),
  new GrokParser(),
];

/**
 * Detect whether a URL belongs to a known AI chat platform.
 *
 * @param {string} url
 * @returns {{ type: 'ai-chat', platform: string, parser: import('../ai/base.js').ChatParser } | null}
 */
export function detectPlatform(url) {
  if (!url) return null;

  // Try simple domain matching first
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const domainMatch = AI_CHAT_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
    if (domainMatch) {
      const parser = parsers.find((p) => p.isAvailable(url));
      if (parser) {
        return { type: "ai-chat", platform: parser.getPlatformName(), parser };
      }
    }
  } catch {
    // Invalid URL
  }

  // Try regex / complex URL patterns
  for (const pattern of URL_PATTERNS) {
    if (pattern.test(url)) {
      const parser = parsers.find((p) => p.isAvailable(url));
      if (parser) {
        return { type: "ai-chat", platform: parser.getPlatformName(), parser };
      }
    }
  }

  return null;
}

/**
 * Quick check: is this URL an AI chat page?
 * Faster than detectPlatform() when you only need a boolean.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isAiChatUrl(url) {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (
      AI_CHAT_DOMAINS.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
      )
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return URL_PATTERNS.some((pattern) => pattern.test(url));
}
