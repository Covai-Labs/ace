/**
 * @covai/parser-core — barrel export.
 *
 * Usage:
 *   import { ChatGPTParser, detectPlatform } from '@covai/parser-core';
 *   import { isAiChatUrl, AI_CHAT_DOMAINS } from '@covai/parser-core';
 */

// Base class
export { ChatParser } from "./base.js";

// Individual parsers
export { ChatGPTParser } from "./chatgpt.js";
export { ClaudeParser } from "./claude.js";
export { GeminiParser } from "./gemini.js";
export { CopilotParser } from "./copilot.js";
export { DeepSeekParser } from "./deepseek.js";
export { MetaParser } from "./meta.js";
export { MistralParser } from "./mistral.js";
export { PerplexityParser } from "./perplexity.js";
export { QwenParser } from "./qwen.js";
export { LumoParser } from "./lumo.js";
export { ZAiParser } from "./z_ai.js";
export { GoogleAIStudioParser } from "./google_ai_studio.js";
export { NotebookLMParser } from "./notebooklm.js";
export { GoogleSearchAIParser } from "./google_search_ai.js";
export { GeminiCloudAssistParser } from "./gemini_cloud_assist.js";
export { JoylandParser } from "./joyland.js";
export { ChubParser } from "./chub.js";
export { GrokParser } from "./grok.js";
export { DuckAIParser } from "./duck_ai.js";

// Utilities
export { convertToMarkdown, cleanMarkdown } from "../utils/html-to-markdown.js";
export { normalizeLatexMath, cleanLatexMath } from "../utils/latex-math.js";

// Detection
export {
  detectPlatform,
  isAiChatUrl,
  parsers,
} from "../detection/detect-platform.js";
export { AI_CHAT_DOMAINS } from "../detection/domains.js";

// Web & Article Extraction
export {
  extractArticle,
  extractArticleIntelligent,
  ArticleParser,
} from "../web/article.js";
export { scoreContent, cleanTitle } from "../web/scoring.js";
