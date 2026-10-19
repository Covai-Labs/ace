# Supported Platforms

Detailed extraction-strategy breakdown for every parser in `decant-core`. For the quick introduction
and installation, see [README.md](README.md).

| Platform                            | Parser                    | Extraction strategy                        |
| :---------------------------------- | :------------------------ | :----------------------------------------- |
| **ChatGPT**                         | `ChatGPTParser`           | DOM + internal API                         |
| **Claude**                          | `ClaudeParser`            | DOM + internal API + React fiber           |
| **Google Gemini**                   | `GeminiParser`            | DOM + batchexecute RPC                     |
| **Microsoft Copilot**               | `CopilotParser`           | DOM                                        |
| **Perplexity**                      | `PerplexityParser`        | Internal API + DOM                         |
| **DeepSeek**                        | `DeepSeekParser`          | DOM + internal API                         |
| **Qwen**                            | `QwenParser`              | DOM                                        |
| **Meta AI**                         | `MetaParser`              | Internal API + DOM                         |
| **Mistral / Le Chat**               | `MistralParser`           | DOM                                        |
| **Proton Lumo**                     | `LumoParser`              | DOM                                        |
| **Z.ai**                            | `ZAiParser`               | Internal API + DOM                         |
| **Grok**                            | `GrokParser`              | Internal API + DOM                         |
| **Google AI Studio**                | `GoogleAIStudioParser`    | DOM                                        |
| **NotebookLM**                      | `NotebookLMParser`        | DOM                                        |
| **Google Search AI (AI Overviews)** | `GoogleSearchAIParser`    | DOM                                        |
| **Gemini Cloud Assist**             | `GeminiCloudAssistParser` | DOM                                        |
| **Joyland**                         | `JoylandParser`           | DOM                                        |
| **Chub**                            | `ChubParser`              | DOM                                        |
| **Duck.ai (DuckDuckGo AI)**         | `DuckAIParser`            | DOM                                        |
| **Generic Web Article**             | `ArticleParser`           | Readability + Defuddle + Article-Extractor |

## Maintenance model

All parsers extend the base [`ChatParser`](ai/base.js) interface, so they share a consistent
contract — `isAvailable(url)` and a normalized `parse()` result. `ArticleParser`'s `isAvailable(...)`
returns true for any http(s) URL.

"DOM" here means the parser is resilient against layout changes (it targets semantic structure, not
pixel positions). "Internal API" parsers read the same RPC payloads the frontend uses, which keeps
working even when the CSS is redecorated. When a platform changes, one shared fix heals every
exporter built on `decant-core`.

This table is mirrored on the [developer docs site](https://covai-labs.github.io/decant/platforms/).
