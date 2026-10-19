import { ChatParser } from "./base.js";
import { convertToMarkdown } from "../utils/html-to-markdown.js";
import { pickTimestamp } from "../utils/timestamps.js";

async function getOrganizationId() {
  try {
    const response = await fetch("https://claude.ai/api/organizations", {
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) return null;
    const orgs = await response.json();
    if (Array.isArray(orgs) && orgs.length > 0) {
      const chatOrg = orgs.find(
        (org) => org.capabilities && org.capabilities.includes("chat"),
      );
      return chatOrg ? chatOrg.uuid : orgs[0].uuid;
    }
  } catch (e) {
    console.error("[AI Exporter] Failed to detect org ID:", e);
  }
  return null;
}

function getConversationId() {
  try {
    if (typeof window === "undefined" || !window.location) return null;
    return window.location.pathname.match(/\/chat\/([^/?#]+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

async function fetchConversation(orgId, conversationId) {
  const url = `https://claude.ai/api/organizations/${orgId}/chat_conversations/${conversationId}?tree=True&rendering_mode=messages&render_all_tools=true`;
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Claude conversation: ${response.status}`);
  }
  return response.json();
}

function getCurrentBranch(data) {
  if (!data.chat_messages || !data.current_leaf_message_uuid) {
    return [];
  }
  const messageMap = new Map();
  data.chat_messages.forEach((msg) => {
    if (msg && msg.uuid) {
      messageMap.set(msg.uuid, msg);
    }
  });

  const branch = [];
  let currentUuid = data.current_leaf_message_uuid;
  while (currentUuid && messageMap.has(currentUuid)) {
    const message = messageMap.get(currentUuid);
    branch.unshift(message);
    currentUuid = message.parent_message_uuid;
    if (!messageMap.has(currentUuid)) {
      break;
    }
  }
  return branch;
}

const EXT_TO_LANG = {
  py: "python",
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  md: "markdown",
  html: "html",
  css: "css",
  json: "json",
  sh: "bash",
  bash: "bash",
  yml: "yaml",
  yaml: "yaml",
  sql: "sql",
  java: "java",
  rb: "ruby",
  go: "go",
  rs: "rust",
  c: "c",
  cpp: "cpp",
  txt: "text",
};

const MIME_TO_LANG = {
  "application/vnd.ant.react": "jsx",
  "text/html": "html",
  "image/svg+xml": "svg",
  "application/vnd.ant.mermaid": "mermaid",
  "text/markdown": "markdown",
  "application/vnd.ant.code": "text",
};

// Binary archives cannot be inlined as text in any export format; they are
// listed by name so they at least appear in markdown/html/json exports.
const BINARY_ARCHIVE_MIMES = new Set([
  "application/x-tar",
  "application/gzip",
  "application/zip",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
]);

function formatFileSize(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return "";
  }
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function basenameOfPath(filePath) {
  if (typeof filePath !== "string" || !filePath) return "file";
  const base = filePath.split("/").pop();
  return base || "file";
}

function isBinaryArchive(mimeType, filePath) {
  if (mimeType && BINARY_ARCHIVE_MIMES.has(mimeType)) return true;
  return /\.(tar\.gz|tgz|tar|zip|gz|7z|rar)$/i.test(filePath || "");
}

// Collect files surfaced via the `present_files` tool (File Creation
// integration). The tool_use block carries `input.filepaths`; the matching
// tool_result block (joined via tool_use_id) carries display names + mime
// types as `local_resource` entries. Either side may be missing, so resolve
// metadata when available and fall back to bare paths otherwise.
function collectPresentedFiles(branch) {
  const pathsByToolUseId = new Map();
  const resourcesByToolUseId = new Map();
  for (const msg of branch) {
    if (!Array.isArray(msg?.content)) continue;
    for (const block of msg.content) {
      if (block?.type === "tool_use" && block?.name === "present_files") {
        const filepaths = block?.input?.filepaths;
        if (Array.isArray(filepaths) && filepaths.length > 0 && block.id) {
          pathsByToolUseId.set(block.id, filepaths);
        }
      } else if (
        block?.type === "tool_result" &&
        Array.isArray(block.content)
      ) {
        const resources = block.content.filter(
          (item) => item && item.type === "local_resource" && item.file_path,
        );
        if (resources.length > 0) {
          const toolUseId = block.tool_use_id || block.id;
          if (toolUseId) resourcesByToolUseId.set(toolUseId, resources);
        }
      }
    }
  }

  const filesByToolUseId = new Map();
  const seenPaths = new Set();
  const toEntry = (resource, fallbackPath) => {
    const filePath = resource?.file_path || fallbackPath || "";
    const name = resource?.name || basenameOfPath(filePath);
    return {
      key: resource?.uuid || filePath || `${name}`,
      name,
      path: filePath,
      mime: resource?.mime_type || "",
    };
  };

  for (const [toolUseId, resources] of resourcesByToolUseId.entries()) {
    const entries = [];
    for (const resource of resources) {
      // Skip the inline "say they are below" helper text item (type: text).
      if (!resource.file_path) continue;
      if (seenPaths.has(resource.file_path)) continue;
      seenPaths.add(resource.file_path);
      entries.push(toEntry(resource));
    }
    if (entries.length > 0) filesByToolUseId.set(toolUseId, entries);
  }

  for (const [toolUseId, filepaths] of pathsByToolUseId.entries()) {
    const existing = filesByToolUseId.get(toolUseId) || [];
    const entries = [...existing];
    for (const filePath of filepaths) {
      if (typeof filePath !== "string" || !filePath) continue;
      if (seenPaths.has(filePath)) continue;
      seenPaths.add(filePath);
      entries.push(toEntry(null, filePath));
    }
    if (entries.length > 0) filesByToolUseId.set(toolUseId, entries);
  }

  return filesByToolUseId;
}

function formatGeneratedFilesSection(files) {
  if (!Array.isArray(files) || files.length === 0) return "";
  const lines = files.map((file) => {
    const displayName = file.name || basenameOfPath(file.path);
    const meta = [];
    if (file.mime) meta.push(file.mime);
    if (isBinaryArchive(file.mime, file.path || displayName)) {
      meta.push("binary archive — download from Claude UI");
    }
    const suffix = meta.length > 0 ? ` _(${meta.join(", ")})_` : "";
    const pathSuffix =
      file.path && file.path !== displayName ? ` — \`${file.path}\`` : "";
    return `- \`${displayName}\`${suffix}${pathSuffix}`;
  });
  const label = files.length === 1 ? "Generated file:" : "Generated files:";
  return `\n\n**${label}**\n${lines.join("\n")}\n\n`;
}

function extractArtifactsFromText(text) {
  const artifactRegex = /<antArtifact[^>]*>([\s\S]*?)<\/antArtifact>/g;
  const artifacts = [];
  let match;
  while ((match = artifactRegex.exec(text)) !== null) {
    const fullTag = match[0];
    const content = match[1];

    const titleMatch = fullTag.match(/title="([^"]*)"/);
    const languageMatch = fullTag.match(/language="([^"]*)"/);

    artifacts.push({
      title: titleMatch ? titleMatch[1] : "Artifact",
      language: languageMatch ? languageMatch[1] : "text",
      content: content.trim(),
    });
  }
  return artifacts;
}

function collectArtifacts(messages) {
  const artifacts = new Map();
  for (const m of messages) {
    if (!Array.isArray(m?.content)) continue;
    for (const block of m.content) {
      if (block.type !== "tool_use" || block.name !== "artifacts") continue;
      const input = block.input || {};
      const id = input.id || "__artifact__";
      let a = artifacts.get(id);
      if (!a) {
        a = { content: "" };
        artifacts.set(id, a);
      }

      if (input.command === "update") {
        if (
          typeof input.old_str === "string" &&
          typeof input.new_str === "string"
        ) {
          if (a.content.includes(input.old_str)) {
            a.content = a.content.replace(input.old_str, () => input.new_str);
          } else {
            console.warn(
              `[AI Exporter] Artifact "${a.title || id}": update could not be applied (source text not found).`,
            );
          }
        }
      } else if (typeof input.content === "string") {
        a.content = input.content;
      }

      if (input.title) a.title = input.title;
      if (input.type) a.type = input.type;
      if (input.language) a.language = input.language;
      a.lastBlock = block;
      if (input.version_uuid) a.lastVersionUuid = input.version_uuid;
    }
  }
  return artifacts;
}

function extractArtifacts(message, foldedArtifacts = new Map()) {
  const artifacts = [];
  if (message.content && Array.isArray(message.content)) {
    for (const content of message.content) {
      if (content.type === "tool_use") {
        const input = content.input || {};
        if (content.name === "artifacts") {
          const id = input.id || "__artifact__";
          const folded = foldedArtifacts.get(id);

          // Only emit at the final edit block for this artifact
          if (folded && folded.lastBlock && folded.lastBlock !== content) {
            continue;
          }
          if (
            folded &&
            folded.lastVersionUuid &&
            input.version_uuid &&
            input.version_uuid !== folded.lastVersionUuid
          ) {
            continue;
          }

          const title = input.title || (folded && folded.title) || "Artifact";
          const lang =
            input.language ||
            (folded && folded.language) ||
            MIME_TO_LANG[input.type || (folded && folded.type)] ||
            "text";
          const code =
            (folded && folded.content) || input.content || input.new_str || "";
          if (code) {
            artifacts.push({
              title,
              language: lang,
              content: code.trim(),
            });
          }
        } else if (content.name === "create_file") {
          let code = "";
          let filename = "file";
          let lang = "";

          if (typeof input.file_text === "string" && input.file_text) {
            code = input.file_text.trim();
            filename = String(input.path || "file")
              .split("/")
              .pop();
            const ext = filename.includes(".")
              ? filename.split(".").pop().toLowerCase()
              : "";
            lang = EXT_TO_LANG[ext] || ext || "text";
          } else if (content.display_content) {
            const displayContent = content.display_content;
            if (displayContent.type === "code_block" && displayContent.code) {
              filename = displayContent.filename || "artifact";
              code = displayContent.code.trim();
              lang = displayContent.language || "text";
            } else if (
              displayContent.type === "json_block" &&
              displayContent.json_block
            ) {
              try {
                const data = JSON.parse(displayContent.json_block);
                if (data.filename) {
                  filename = data.filename;
                  code = (data.code || "").trim();
                  lang = data.language || "text";
                }
              } catch (e) {
                console.warn(
                  "[AI Exporter] Failed to parse tool use artifact json:",
                  e,
                );
              }
            }
          }

          if (code) {
            const title = filename
              .split("/")
              .pop()
              .replace(/\.[^.]+$/, "");
            artifacts.push({
              title: title || "Artifact",
              language: lang,
              content: code,
            });
          }
        }
      }

      if (content.text) {
        artifacts.push(...extractArtifactsFromText(content.text));
      }
    }
  }
  if (message.text) {
    artifacts.push(...extractArtifactsFromText(message.text));
  }
  return artifacts;
}

// File cards rendered for generated files (markdown docs, tarballs, …).
// They carry no text content for convertToMarkdown, so extract their display
// names (aria-label="View <name>") and drop the nodes to avoid button noise.
function extractFileCards(root) {
  if (!root || typeof root.querySelectorAll !== "function") return [];
  const names = [];
  const cards = root.querySelectorAll('[data-testid="file-card-open"]');
  for (const card of cards) {
    const label = card.getAttribute && card.getAttribute("aria-label");
    const match = typeof label === "string" && label.match(/^View\s+(.+)$/i);
    const name = match ? match[1].trim() : "";
    // No name-based dedup: two cards may legitimately share a display name
    // (same basename in different directories). Each card element is visited
    // exactly once, so nothing is double-counted here.
    if (name) {
      names.push(name);
    }
    // Remove the whole card element so download buttons / type badges
    // don't leak into the markdown conversion — but only when the parent
    // is a dedicated card wrapper. If the button shares its parent with
    // other prose, remove just the button to avoid deleting message text.
    const parent =
      card.parentElement && card.parentElement !== root
        ? card.parentElement
        : null;
    const isDedicatedCard =
      !!parent &&
      parent.querySelectorAll('[data-testid="file-card-open"]').length === 1;
    const target = isDedicatedCard ? parent : card;
    if (target && typeof target.remove === "function") {
      target.remove();
    } else if (card.parentNode) {
      card.parentNode.removeChild(card);
    }
  }
  return names;
}

function unrollInteractiveElements(root, doc) {
  if (!root || !doc) return;

  // Group slide titles by their common card container
  const titleEls = Array.from(root.querySelectorAll(".text-title"));
  if (titleEls.length > 0) {
    const containerMap = new Map();
    for (const titleEl of titleEls) {
      let container = titleEl.parentElement;
      while (container && container !== root) {
        if (
          container.classList.contains("@container") ||
          container.classList.contains("bg-surface-2") ||
          container.querySelector(
            '[aria-label*="Go to step"], [aria-current="step"]',
          )
        ) {
          break;
        }
        container = container.parentElement;
      }
      if (container && container !== root) {
        if (!containerMap.has(container)) {
          containerMap.set(container, []);
        }
        containerMap.get(container).push(titleEl);
      }
    }

    for (const [container, titles] of containerMap.entries()) {
      const slides = [];
      titles.forEach((titleEl, idx) => {
        const title = titleEl.textContent.trim();
        const bodyEl =
          titleEl.nextElementSibling ||
          titleEl.parentElement.querySelector(".text-body");
        const body = bodyEl ? bodyEl.textContent.trim() : "";
        if (title) slides.push({ index: idx + 1, title, body });
      });

      if (slides.length > 0) {
        const replacement = doc.createElement("div");
        replacement.className = "unrolled-interactive-steps";
        slides.forEach((slide) => {
          const h3 = doc.createElement("h3");
          h3.textContent = `${slide.index}. ${slide.title}`;
          replacement.appendChild(h3);
          if (slide.body) {
            const p = doc.createElement("p");
            p.textContent = slide.body;
            replacement.appendChild(p);
          }
        });
        container.replaceWith(replacement);
      }
    }
  }

  // Remove any remaining buttons
  root.querySelectorAll("button").forEach((btn) => btn.remove());
}

export class ClaudeParser extends ChatParser {
  name = "Claude";
  constructor() {
    super();
    this.lastFetch = null;
  }

  isAvailable(url) {
    return url.includes("claude.ai");
  }

  async parse(options = {}) {
    const title = document.title || "Claude Chat";
    const messages = [];

    const conversationId = getConversationId();
    const parserMode = options.parserMode || "auto";

    if (conversationId && parserMode !== "prefer_dom") {
      const orgId = await getOrganizationId();
      if (orgId) {
        try {
          const now = Date.now();
          let data;

          if (
            this.lastFetch &&
            this.lastFetch.conversationId === conversationId &&
            now - this.lastFetch.timestamp < 20000
          ) {
            data = this.lastFetch.data;
          } else {
            data = await fetchConversation(orgId, conversationId);
            this.lastFetch = {
              conversationId,
              timestamp: now,
              data,
            };
          }

          const branch = getCurrentBranch(data);
          const foldedArtifacts = collectArtifacts(branch);
          const presentedFilesByToolUseId = collectPresentedFiles(branch);
          const emittedFileKeys = new Set();

          const toolResultMap = new Map();
          for (const msg of branch) {
            if (Array.isArray(msg?.content)) {
              for (const block of msg.content) {
                if (block.type === "tool_result") {
                  const toolUseId = block.tool_use_id || block.id;
                  let answers = block.toolUseResult?.answers || {};
                  if (
                    (!answers || Object.keys(answers).length === 0) &&
                    typeof block.content === "string"
                  ) {
                    try {
                      const parsed = JSON.parse(block.content);
                      answers = parsed.answers || parsed;
                    } catch {
                      answers = { result: block.content };
                    }
                  }
                  toolResultMap.set(toolUseId, answers);
                }
              }
            }
          }

          const convTitle = data.name || title;

          for (const message of branch) {
            const role = message.sender === "human" ? "User" : "Claude";

            let contentStr = "";
            let thinkingStr = "";

            // Construct content
            if (message.content && Array.isArray(message.content)) {
              for (const block of message.content) {
                if (block.type === "thinking") {
                  let thoughtText = "";
                  if (
                    typeof block.thinking === "string" &&
                    block.thinking.trim()
                  ) {
                    thoughtText = block.thinking.trim();
                  } else if (Array.isArray(block.summaries)) {
                    thoughtText = block.summaries
                      .map((s) =>
                        typeof s === "string" ? s : s?.summary || "",
                      )
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .join("\n");
                  }
                  if (thoughtText) {
                    thinkingStr += (thinkingStr ? "\n\n" : "") + thoughtText;
                  }
                } else if (block.type === "text" && block.text) {
                  const cleanText = block.text
                    .replace(/<antArtifact[^>]*>[\s\S]*?<\/antArtifact>/g, "")
                    .trim();
                  if (cleanText) {
                    contentStr += `${cleanText}\n\n`;
                  }
                } else if (block.type === "tool_use") {
                  const input = block.input || {};
                  if (
                    block.name === "visualize:show_widget" &&
                    input.widget_code
                  ) {
                    const widgetTitle = input.title || "Interactive Widget";
                    contentStr += `> **Interactive Widget: ${widgetTitle}**\n\n\`\`\`jsx\n${input.widget_code.trim()}\n\`\`\`\n\n`;
                  } else if (block.name === "repl" && input.code) {
                    contentStr += `**Analyzed data**\n\n\`\`\`javascript\n${input.code.trim()}\n\`\`\`\n\n`;
                  } else if (
                    block.name === "AskUserQuestion" &&
                    Array.isArray(input.questions) &&
                    input.questions.length > 0
                  ) {
                    const qCount = input.questions.length;
                    const countLabel =
                      qCount === 1
                        ? "Asked 1 question"
                        : `Asked ${qCount} questions`;
                    let qStr = `> **${countLabel}:**\n`;
                    const answers = toolResultMap.get(block.id) || {};
                    for (const q of input.questions) {
                      const qText = q.question || q.text || "";
                      const ans = answers[qText];
                      let ansStr = "";
                      if (typeof ans === "string") {
                        ansStr = ans;
                      } else if (Array.isArray(ans)) {
                        ansStr = ans.join(", ");
                      } else if (ans && typeof ans === "object") {
                        ansStr = JSON.stringify(ans);
                      } else if (ans != null) {
                        ansStr = String(ans);
                      }
                      qStr += ansStr
                        ? `> - **${qText}** — ${ansStr}\n`
                        : `> - ${qText}\n`;
                    }
                    contentStr += `${qStr}\n`;
                  } else if (
                    block.name === "present_files" &&
                    presentedFilesByToolUseId.has(block.id)
                  ) {
                    // Files surfaced via the File Creation integration
                    // (markdown docs, tarball, …). Without this they are
                    // silently dropped from every export format.
                    const files = presentedFilesByToolUseId.get(block.id);
                    const fresh = files.filter(
                      (file) => !emittedFileKeys.has(file.key),
                    );
                    fresh.forEach((file) => emittedFileKeys.add(file.key));
                    if (fresh.length > 0) {
                      contentStr += formatGeneratedFilesSection(fresh);
                    }
                  }
                } else if (
                  block.type === "tool_result" &&
                  Array.isArray(block.content)
                ) {
                  // Orphan file presentation: the matching tool_use block may
                  // sit outside the current branch, so emit unseen
                  // local_resource entries directly from the result.
                  const toolUseId = block.tool_use_id || block.id;
                  const files = presentedFilesByToolUseId.get(toolUseId) || [];
                  const fresh = files.filter(
                    (file) => !emittedFileKeys.has(file.key),
                  );
                  fresh.forEach((file) => emittedFileKeys.add(file.key));
                  if (fresh.length > 0) {
                    contentStr += formatGeneratedFilesSection(fresh);
                  }
                }
              }
            } else if (message.text) {
              const cleanText = message.text
                .replace(/<antArtifact[^>]*>[\s\S]*?<\/antArtifact>/g, "")
                .trim();
              if (cleanText) {
                contentStr += `${cleanText}\n\n`;
              }
            }

            // Append attachments (for user messages)
            if (message.attachments && message.attachments.length > 0) {
              for (const attachment of message.attachments) {
                if (attachment.file_name) {
                  let header = `### Attachment: ${attachment.file_name}`;
                  const meta = [];
                  const sizeLabel = formatFileSize(attachment.file_size);
                  if (sizeLabel) {
                    meta.push(sizeLabel);
                  }
                  if (attachment.file_type) {
                    meta.push(attachment.file_type);
                  }
                  if (meta.length > 0) {
                    header += ` _(${meta.join(", ")})_`;
                  }
                  contentStr += `\n\n${header}\n`;
                  if (attachment.extracted_content) {
                    contentStr += `\`\`\`\`\n${attachment.extracted_content}\n\`\`\`\`\n\n`;
                  }
                } else if (attachment.extracted_content) {
                  const sizeLabel = formatFileSize(attachment.file_size);
                  const sizeSuffix = sizeLabel ? ` _(${sizeLabel})_` : "";
                  contentStr += `\n\n### Pasted content${sizeSuffix}\n\`\`\`\`\n${attachment.extracted_content}\n\`\`\`\`\n\n`;
                }
              }
            }

            // Append files (images/documents)
            if (message.files && Array.isArray(message.files)) {
              for (const file of message.files) {
                const name = file.file_name || "file";
                if (
                  file.file_kind === "image" &&
                  (file.preview_url || file.preview_asset?.url)
                ) {
                  const url = file.preview_url || file.preview_asset.url;
                  contentStr += `\n\n**Attachment: ${name}**\n\n![${name}](${url})\n\n`;
                } else if (
                  file.file_kind === "document" &&
                  file.document_asset?.url
                ) {
                  const url = file.document_asset.url;
                  const pages = file.document_asset.page_count;
                  const pageInfo = pages
                    ? ` · ${pages} page${pages === 1 ? "" : "s"}`
                    : "";
                  contentStr += `\n\n**Attachment: [${name}](${url})** _(document${pageInfo})_\n\n`;
                }
              }
            }

            if (thinkingStr) {
              contentStr = `<think>\n${thinkingStr}\n</think>\n\n` + contentStr;
            }

            contentStr = contentStr.trim();
            if (contentStr) {
              const msgObj = { role, content: contentStr };
              if (thinkingStr) {
                msgObj.thinking = thinkingStr;
              }
              const timestamp = pickTimestamp(message, [
                "created_at",
                "updated_at",
              ]);
              if (timestamp) {
                msgObj.timestamp = timestamp;
              }
              messages.push(msgObj);
            }

            // Extract and push artifacts
            const artifacts = extractArtifacts(message, foldedArtifacts);
            for (const artifact of artifacts) {
              let artContent = "";
              const artTitle = artifact.title || "Artifact";
              const artText = artifact.content || "";
              const artLang = artifact.language || "text";

              if (artLang === "markdown" || artLang === "text") {
                const quotedContent = artText
                  .split("\n")
                  .map((line) => `> ${line}`)
                  .join("\n");
                artContent = `\n\n> **Artifact: ${artTitle}**\n\n${quotedContent}\n\n`;
              } else {
                artContent = `\n\n> **Artifact: ${artTitle}**\n\`\`\`${artLang}\n${artText}\n\`\`\`\n\n`;
              }

              messages.push({
                role: "Claude Artifact",
                content: artContent.trim(),
                ...(pickTimestamp(message, ["created_at", "updated_at"])
                  ? {
                      timestamp: pickTimestamp(message, [
                        "created_at",
                        "updated_at",
                      ]),
                    }
                  : {}),
              });
            }
          }

          const currentUrl =
            typeof window !== "undefined" && window.location
              ? window.location.href || ""
              : "";
          const metadata = {
            Source: "Claude",
            Date: new Date().toLocaleString(),
            Link: currentUrl,
            Model: data.model || "Claude",
            Method: "API",
          };

          return { title: convTitle, messages, url: currentUrl, metadata };
        } catch (e) {
          console.error(
            "[AI Exporter] Claude API parse failed, falling back to DOM:",
            e,
          );
        }
      }
    }

    // Inject the React reader script if not already injected (DOM Fallback)
    if (!document.getElementById("ai-export-claude-reader")) {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("content/claude_react_reader.js");
      script.id = "ai-export-claude-reader";
      script.onload = function () {
        this.remove(); // Clean up script tag
      };
      (document.head || document.documentElement).appendChild(script);
      // Give it a moment to initialize
      await new Promise((r) => setTimeout(r, 100));
    }

    // Helper to get artifact info
    const getArtifactInfo = (index) => {
      return new Promise((resolve) => {
        const handler = (event) => {
          if (event.data.type === "RspAtftInfo" && event.data.idx === index) {
            window.removeEventListener("message", handler);
            resolve(event.data.atftInfo);
          }
        };
        window.addEventListener("message", handler);
        window.postMessage(
          { type: "ReqAtftInfo", idx: index },
          window.location.origin,
        );

        // Timeout fallback
        setTimeout(() => {
          window.removeEventListener("message", handler);
          resolve(null);
        }, 1000); // 1s timeout
      });
    };

    const strictSelectors = [
      '[data-testid="user-message"]',
      ".font-claude-message",
      ".font-claude-response",
      ".artifact-block-cell",
    ].join(", ");

    const fallbackSelectors = ["div.font-serif"].join(", ");

    const strictCandidates = Array.from(
      document.querySelectorAll(strictSelectors),
    );
    const fallbackCandidates = Array.from(
      document.querySelectorAll(fallbackSelectors),
    );

    const validFallbacks = fallbackCandidates.filter((fallback) => {
      const overlapsWithError = strictCandidates.some(
        (strict) => strict.contains(fallback) || fallback.contains(strict),
      );
      return !overlapsWithError;
    });

    const combinedSet = new Set([...strictCandidates, ...validFallbacks]);
    const allElements = Array.from(
      document.querySelectorAll(`${strictSelectors}, ${fallbackSelectors}`),
    ).filter((el) => combinedSet.has(el));

    const artifactElements = document.querySelectorAll(".artifact-block-cell");
    const artifactMap = new Map();
    artifactElements.forEach((el, index) => artifactMap.set(el, index));

    for (const el of allElements) {
      let role = "Unknown";
      let content = "";

      if (el.matches('[data-testid="user-message"]')) {
        role = "User";
        const clone = el.cloneNode(true);
        unrollInteractiveElements(clone, el.ownerDocument || document);
        content = convertToMarkdown(clone);
      } else if (
        el.matches(".font-claude-message") ||
        el.matches(".font-claude-response") ||
        el.matches("div.font-serif")
      ) {
        role = "Claude";
        const clone = el.cloneNode(true);
        // Extract file cards first: unrollInteractiveElements strips all
        // buttons, which would destroy the card markers.
        const fileCardNames = extractFileCards(clone);
        unrollInteractiveElements(clone, el.ownerDocument || document);
        content = convertToMarkdown(clone);
        if (fileCardNames.length > 0) {
          content += formatGeneratedFilesSection(
            fileCardNames.map((name) => ({ name, path: "", mime: "" })),
          );
        }
      } else if (el.matches(".artifact-block-cell")) {
        role = "Claude Artifact";

        const index = artifactMap.get(el);
        if (index !== undefined) {
          const info = await getArtifactInfo(index);
          if (info) {
            const artTitle = info.title || "Artifact";
            const artContent = info.content || "";
            const artLang = info.language || "text";
            if (artLang === "markdown" || artLang === "text") {
              const quotedContent = artContent
                .split("\n")
                .map((line) => `> ${line}`)
                .join("\n");
              content = `\n\n> **Artifact: ${artTitle}**\n\n${quotedContent}\n\n`;
            } else {
              content = `\n\n> **Artifact: ${artTitle}**\n\`\`\`${artLang}\n${artContent}\n\`\`\`\n\n`;
            }
          } else {
            const header =
              el.querySelector(".flex.items-center.gap-2") ||
              el.querySelector(".font-bold");
            const fallbackTitle = header
              ? header.innerText.split("\n")[0]
              : "Unknown Artifact";
            content = `\n> [Artifact: ${fallbackTitle} - content extraction failed]\n`;
          }
        }
      }

      if (content) {
        const msgObj = { role, content };
        // Best-effort DOM timestamp. <time datetime> usually lives in the
        // sibling MessageActions toolbar inside the same transcript row —
        // not inside the message element itself. Scope to the closest row
        // so we never borrow the previous/next turn's timestamp. Sparse in
        // practice (hover-only on some turns) — absent stays absent.
        try {
          let timeEl =
            typeof el.querySelector === "function"
              ? el.querySelector("time[datetime]")
              : null;
          if (!timeEl && typeof el.closest === "function") {
            // Narrow containers only: transcript-row holds one turn, so its
            // time belongs to this message. Never fall back to broad
            // containers like article (many turns) — wrong date is worse
            // than no date.
            const row = el.closest(
              '[data-testid="transcript-row"], .group\\/message-row',
            );
            timeEl = row?.querySelector?.("time[datetime]") || null;
          }
          const datetime = timeEl?.getAttribute?.("datetime");
          const timestamp = pickTimestamp({ datetime }, ["datetime"]);
          if (timestamp) {
            msgObj.timestamp = timestamp;
          }
        } catch {
          // Ignore DOM timestamp lookup errors
        }
        messages.push(msgObj);
      }
    }

    const currentUrl =
      typeof window !== "undefined" && window.location
        ? window.location.href || ""
        : "";
    const metadata = {
      Source: "Claude",
      Date: new Date().toLocaleString(),
      Link: currentUrl,
      Model: "Claude",
      Method: "DOM",
    };

    return { title, messages, url: currentUrl, metadata };
  }
}
