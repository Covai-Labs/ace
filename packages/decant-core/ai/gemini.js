import { ChatParser } from "./base.js";
import { convertToMarkdown } from "../utils/html-to-markdown.js";
import { normalizeLatexMath } from "../utils/latex-math.js";

const GEMINI_RPC_ID = "hNvQHb";
const DEFAULT_BARD_PATH = "/_/BardChatUi";

function isValidMessageText(str, convoId = "") {
  if (typeof str !== "string") return false;
  const trimmed = str.trim();
  if (!trimmed) return false;
  if (/^(?:c_|rc_|r_)[a-zA-Z0-9_-]+$/.test(trimmed)) return false;
  if (convoId && (trimmed === convoId || trimmed === `c_${convoId}`))
    return false;
  return true;
}

export class GeminiParser extends ChatParser {
  name = "Gemini";

  isAvailable(url) {
    return (
      typeof url === "string" &&
      (url.includes("gemini.google.com") || url.includes("bard.google.com"))
    );
  }

  getPlatformName() {
    return "Gemini";
  }

  getConversationId(url) {
    try {
      const targetUrl =
        url ||
        (typeof window !== "undefined" && window.location
          ? window.location.href
          : "");
      if (!targetUrl) return null;
      const parsed = new URL(
        targetUrl,
        typeof location !== "undefined"
          ? location.origin
          : "https://gemini.google.com",
      );
      const match = parsed.pathname.match(/\/(?:app|share)\/([a-zA-Z0-9_-]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  getGlobalData() {
    try {
      // 1. Try direct window access if present
      if (
        typeof window !== "undefined" &&
        window.WIZ_global_data &&
        typeof window.WIZ_global_data === "object"
      ) {
        return window.WIZ_global_data;
      }

      // 2. Try parsing inline script tags for WIZ_global_data
      if (typeof document !== "undefined" && document.querySelectorAll) {
        const scripts = document.querySelectorAll("script");
        for (let i = 0; i < scripts.length; i++) {
          const content = scripts[i].textContent || "";
          if (content.includes("WIZ_global_data")) {
            const match = content.match(
              /window\.WIZ_global_data\s*=\s*(\{[\s\S]*?\});/,
            );
            if (match && match[1]) {
              try {
                return JSON.parse(match[1]);
              } catch {
                // Continue to next script
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("[Gemini Parser] Error reading global data:", e);
    }
    return null;
  }

  async parse(options = {}) {
    console.log("[Gemini Parser] ========== STARTING PARSE() ==========");
    const currentUrl =
      typeof window !== "undefined" && window.location
        ? window.location.href || ""
        : "";

    const mode = options.parserMode || "auto";

    // 1. Attempt API / RPC extraction first when not explicitly in 'dom' mode
    if (mode !== "dom" && typeof fetch === "function") {
      try {
        const convoId = this.getConversationId(currentUrl);
        const globalData = this.getGlobalData();

        if (convoId && globalData && globalData.SNlM0e && globalData.FdrFJe) {
          console.log(
            "[Gemini Parser] Attempting API extraction for convo:",
            convoId,
          );
          const apiResult = await this.fetchFromApi(
            convoId,
            globalData,
            currentUrl,
            options,
          );
          if (
            apiResult &&
            apiResult.messages &&
            apiResult.messages.length > 0 &&
            apiResult.messages.some((m) =>
              isValidMessageText(m.content, convoId),
            )
          ) {
            console.log(
              `[Gemini Parser] Successfully parsed ${apiResult.messages.length} messages via API`,
            );
            return apiResult;
          }
        }
      } catch (err) {
        console.warn(
          "[Gemini Parser] API extraction failed, falling back to DOM:",
          err,
        );
      }
    }

    // 2. Fall back to robust DOM parsing
    return this.parseFromDom(currentUrl, options);
  }

  async fetchFromApi(convoId, globalData, currentUrl, options = {}) {
    const fSid = globalData.FdrFJe || "";
    const bl = globalData.cfb2h || "";
    const prefix = globalData.Im6cmf || DEFAULT_BARD_PATH;
    const atToken = globalData.SNlM0e || "";

    const reqId = String(Math.floor(9e6 * Math.random()) + 1e6);
    const sourcePath =
      typeof window !== "undefined" && window.location
        ? window.location.pathname
        : `/app/${convoId}`;

    const endpoint =
      `https://gemini.google.com${prefix}/data/batchexecute` +
      `?rpcids=${encodeURIComponent(GEMINI_RPC_ID)}` +
      `&source-path=${encodeURIComponent(sourcePath)}` +
      `&bl=${encodeURIComponent(bl)}` +
      `&f.sid=${encodeURIComponent(fSid)}` +
      `&hl=en` +
      `&_reqid=${encodeURIComponent(reqId)}` +
      `&rt=c`;

    const formattedConvoId = convoId.startsWith("c_")
      ? convoId
      : `c_${convoId}`;
    const allItems = [];
    let cursor = null;
    let pageCount = 0;

    while (pageCount < 250) {
      pageCount++;
      const payloadArg = JSON.stringify([
        formattedConvoId,
        100,
        cursor,
        1,
        [0],
        [4],
        null,
        1,
      ]);

      const formParams = new URLSearchParams();
      formParams.append(
        "f.req",
        JSON.stringify([[[GEMINI_RPC_ID, payloadArg, null, "generic"]]]),
      );
      formParams.append("at", atToken);

      const resp = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: formParams.toString(),
      });

      if (!resp.ok) {
        throw new Error(
          `Gemini RPC request failed: ${resp.status} ${resp.statusText}`,
        );
      }

      const rawText = await resp.text();
      const parsedBatch = this.parseBatchExecuteLines(rawText);
      const rpcEntry = this.findRpcEntry(parsedBatch.arrays, GEMINI_RPC_ID);

      if (!rpcEntry || !rpcEntry[2]) {
        break;
      }

      const payload = JSON.parse(rpcEntry[2]);
      const items = Array.isArray(payload[0]) ? payload[0] : [];
      const continueCursor = payload[1] || null;

      if (items.length > 0) {
        // Items are in reverse chronological order from API; reverse to maintain oldest-first order
        allItems.unshift(...items.slice().reverse());
      }

      if (!continueCursor) {
        break;
      }
      cursor = continueCursor;
    }

    if (allItems.length === 0) {
      return null;
    }

    return this.formatApiResult(allItems, currentUrl, options);
  }

  enrichMessagesWithDomAttachments(messages) {
    try {
      if (typeof document === "undefined" || !document.querySelectorAll) {
        return messages;
      }
      const parentContainers = document.querySelectorAll(
        ".conversation-container",
      );
      const domTurns = [];

      if (parentContainers.length > 0) {
        parentContainers.forEach((container, idx) => {
          const rawId = (container.id || "").replace(/^r_/, "");
          const fileElements = container.querySelectorAll(
            "user-query-file-preview, .file-preview, .attachment-preview, [data-testid='file-preview']",
          );
          const fileNames = [];
          fileElements.forEach((fe) => {
            const name = (fe.textContent || "").trim();
            if (name && !fileNames.includes(name)) fileNames.push(name);
          });

          const userQuery = container.querySelector("user-query") || container;
          const clone = userQuery.cloneNode(true);
          clone
            .querySelectorAll(
              "user-query-file-preview, .file-preview, .attachment-preview, button, .edit-button, model-response",
            )
            .forEach((el) => el.remove());
          const queryText = (
            clone.innerText !== undefined
              ? clone.innerText
              : clone.textContent || ""
          )
            .replace(/^You said\s*/i, "")
            .trim();

          if (fileNames.length > 0) {
            domTurns.push({
              turnId: rawId,
              queryText,
              domIndex: idx,
              totalDom: parentContainers.length,
              fileNames,
            });
          }
        });
      } else {
        const userQueries = document.querySelectorAll("user-query");
        userQueries.forEach((uq, idx) => {
          const fileElements = uq.querySelectorAll(
            "user-query-file-preview, .file-preview, .attachment-preview, [data-testid='file-preview']",
          );
          const fileNames = [];
          fileElements.forEach((fe) => {
            const name = (fe.textContent || "").trim();
            if (name && !fileNames.includes(name)) fileNames.push(name);
          });

          const clone = uq.cloneNode(true);
          clone
            .querySelectorAll(
              "user-query-file-preview, .file-preview, .attachment-preview, button, .edit-button",
            )
            .forEach((el) => el.remove());
          const queryText = (
            clone.innerText !== undefined
              ? clone.innerText
              : clone.textContent || ""
          )
            .replace(/^You said\s*/i, "")
            .trim();

          if (fileNames.length > 0) {
            domTurns.push({
              domIndex: idx,
              queryText,
              totalDom: userQueries.length,
              fileNames,
            });
          }
        });
      }

      if (domTurns.length === 0) return messages;

      const userMessages = messages.filter((m) => m.role === "User");

      for (const domTurn of domTurns) {
        let matchedMsg = null;

        // 1. Match by exact turnId if present
        if (domTurn.turnId) {
          matchedMsg = userMessages.find((m) => m.turnId === domTurn.turnId);
        }

        // 2. Fallback: match by queryText if present and non-empty
        if (!matchedMsg && domTurn.queryText) {
          matchedMsg = userMessages.find(
            (m) =>
              m.content &&
              (m.content.includes(domTurn.queryText) ||
                domTurn.queryText.includes(m.content)),
          );
        }

        // 3. Fallback: match by trailing turn ordinal (mounted DOM elements align with latest turns)
        if (!matchedMsg && typeof domTurn.domIndex === "number") {
          const offset = userMessages.length - domTurn.totalDom;
          const targetIndex =
            offset >= 0 ? offset + domTurn.domIndex : domTurn.domIndex;
          matchedMsg = userMessages[targetIndex];
        }

        if (matchedMsg) {
          const attachBlock =
            `\n\n**Attachments:**\n` +
            domTurn.fileNames.map((fn) => `- ${fn}`).join("\n");
          if (!matchedMsg.content.includes("**Attachments:**")) {
            matchedMsg.content = matchedMsg.content
              ? `${matchedMsg.content}${attachBlock}`
              : `**Attachments:**\n` +
                domTurn.fileNames.map((fn) => `- ${fn}`).join("\n");
          }
        }
      }
    } catch (e) {
      console.warn(
        "[Gemini Parser] Failed to enrich messages with DOM attachments:",
        e,
      );
    } finally {
      // Clean internal turnId tracking before returning messages
      for (const m of messages) {
        delete m.turnId;
      }
    }

    return messages;
  }

  formatApiResult(allItems, currentUrl, options = {}) {
    if (!Array.isArray(allItems) || allItems.length === 0) {
      return null;
    }

    const messages = this.convertApiItemsToMessages(allItems, options);
    this.enrichMessagesWithDomAttachments(messages);

    let title = this.extractTitleFromPage();
    if (!title || title === "Gemini Conversation") {
      const firstUserMsg = messages.find((m) => m.role === "User");
      if (firstUserMsg && firstUserMsg.content) {
        title = firstUserMsg.content.slice(0, 50).split("\n")[0].trim();
      }
    }

    return {
      title: title || "Gemini Conversation",
      messages,
      url: currentUrl,
      metadata: {
        Source: "Gemini",
        Date: new Date().toLocaleString(),
        Link: currentUrl,
        Method: "API",
      },
    };
  }

  parseBatchExecuteLines(raw) {
    const cleaned = String(raw || "").replace(/^\)\]\}'\s*\n/, "");
    const lines = cleaned
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const arrays = [];
    for (const line of lines) {
      if (!/^\d+$/.test(line) && line.startsWith("[") && line.endsWith("]")) {
        try {
          arrays.push(JSON.parse(line));
        } catch {
          // Ignore non-JSON lines
        }
      }
    }
    return { arrays, rawData: cleaned };
  }

  findRpcEntry(arrays, rpcId, envelope = "wrb.fr") {
    if (!Array.isArray(arrays)) return null;
    if (arrays[0] === envelope && arrays[1] === rpcId && arrays[2]) {
      return arrays;
    }
    for (const item of arrays) {
      if (Array.isArray(item)) {
        const found = this.findRpcEntry(item, rpcId, envelope);
        if (found) return found;
      }
    }
    return null;
  }

  extractTurnId(item) {
    try {
      const raw = item[0]?.[1] || item[1]?.[1] || "";
      return String(raw).replace(/^r_/, "");
    } catch {
      return "";
    }
  }

  convertApiItemsToMessages(items, options = {}) {
    const messages = [];

    for (const item of items) {
      if (!Array.isArray(item)) continue;

      const turnId = this.extractTurnId(item);
      const userText = this.findUserTextInApiItem(item);
      if (userText) {
        messages.push({
          role: "User",
          content: userText.trim(),
          turnId,
        });
      }

      const modelText = this.findModelTextInApiItem(item, options);
      const researchExtras = this.extractDeepResearchExtras(item);
      const combined = [modelText, researchExtras]
        .map((t) => this.stripChipPlaceholders(t))
        .filter((t) => t && t.trim())
        .join("\n\n");
      if (combined.trim()) {
        messages.push({
          role: "Model",
          content: normalizeLatexMath(combined.trim()),
          turnId,
        });
      }
    }

    return messages;
  }

  // Deep-research turns render a short summary plus placeholder chip links
  // (e.g. http://googleusercontent.com/immersive_entry_chip/0) whose real
  // content — research plan, full report, citation map — lives in adjacent
  // candidate slots. Only the known chip placeholders are stripped; every
  // other URL (including googleusercontent subdomains hosting real images
  // and links inside markdown) is left intact.
  stripChipPlaceholders(text) {
    if (typeof text !== "string" || !text) return text;
    const chipPattern =
      /<?https?:\/\/googleusercontent\.com\/(?:immersive_entry_chip|deep_research_confirmation_content)(?:\/\d*)?>?/;
    const chipPatternGlobal = new RegExp(chipPattern.source, "g");
    return text
      .split("\n")
      .filter((line) => {
        if (!chipPattern.test(line)) return true;
        return line.replace(chipPatternGlobal, "").trim() !== "";
      })
      .map((line) => line.replace(chipPatternGlobal, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
  }

  getApiCandidates(item) {
    try {
      if (!Array.isArray(item[3])) return [];
      const candidates = Array.isArray(item[3][0]) ? item[3][0] : item[3];
      return candidates.filter((cand) => Array.isArray(cand));
    } catch {
      return [];
    }
  }

  buildDeepResearchCiteMap(citeGroups) {
    const map = new Map();
    try {
      const groups = Array.isArray(citeGroups) ? citeGroups : [citeGroups];
      for (const group of groups) {
        if (!group || typeof group !== "object" || Array.isArray(group))
          continue;
        for (const entries of Object.values(group)) {
          if (!Array.isArray(entries)) continue;
          for (const entry of entries) {
            if (!Array.isArray(entry) || !Array.isArray(entry[1])) continue;
            for (const source of entry[1]) {
              // Source shape: [null, null, null,
              //   [detail, number, ...]] where detail = [favicon, url, title].
              if (!Array.isArray(source) || !Array.isArray(source[3])) continue;
              const detail = source[3][0];
              const url = Array.isArray(detail) ? detail[1] : null;
              const number = source[3][1];
              if (
                typeof url === "string" &&
                url.startsWith("http") &&
                typeof number === "number" &&
                !map.has(number)
              ) {
                map.set(number, {
                  url,
                  title:
                    typeof detail[2] === "string" && detail[2]
                      ? detail[2]
                      : url,
                });
              }
            }
          }
        }
      }
    } catch {
      // Ignore malformed citation maps
    }
    return map;
  }

  resolveDeepResearchCites(markdown, citeMap) {
    if (typeof markdown !== "string" || !(citeMap instanceof Map)) {
      return markdown;
    }
    return markdown.replace(/ ?\[cite: ([\d,\s]+)\]/g, (match, nums) => {
      const numbers = [
        ...new Set(
          nums
            .split(",")
            .map((n) => parseInt(n.trim(), 10))
            .filter((n) => Number.isFinite(n)),
        ),
      ];
      if (numbers.length === 0) return "";
      const links = numbers.map((n) => {
        const cite = citeMap.get(n);
        return cite ? `[[${n}]](${cite.url})` : `[${n}]`;
      });
      return ` ${links.join(" ")}`;
    });
  }

  extractImmersiveDocFromCandidate(cand) {
    try {
      if (!Array.isArray(cand[30]) || cand[30].length === 0) return "";
      const doc = cand[30][0];
      if (!Array.isArray(doc)) return "";
      // Guard: immersive research documents carry this task marker.
      if (doc[3] !== "agency-placeholder-task-id") return "";
      if (typeof doc[4] !== "string" || doc[4].trim().length < 100) return "";
      const title = typeof doc[2] === "string" && doc[2] ? doc[2] : "Report";
      const citeMap = this.buildDeepResearchCiteMap(doc[5]);
      const markdown = this.resolveDeepResearchCites(doc[4].trim(), citeMap);
      return `## ${title}\n\n${markdown}`;
    } catch {
      return "";
    }
  }

  extractResearchPlanFromCandidate(cand) {
    try {
      if (!Array.isArray(cand[12])) return "";
      for (const annotation of cand[12]) {
        if (
          !annotation ||
          typeof annotation !== "object" ||
          Array.isArray(annotation) ||
          !Array.isArray(annotation["56"])
        ) {
          continue;
        }
        const [planTitle, steps] = annotation["56"];
        if (!Array.isArray(steps) || steps.length === 0) continue;
        const lines = steps.map((step, idx) => {
          if (!Array.isArray(step)) return null;
          const stepTitle = step[1] || `Step ${idx + 1}`;
          const desc =
            typeof step[2] === "string" && step[2].trim()
              ? `: ${step[2].trim()}`
              : "";
          return `${idx + 1}. **${stepTitle}**${desc}`;
        });
        const valid = lines.filter(Boolean);
        if (valid.length === 0) continue;
        const heading =
          typeof planTitle === "string" && planTitle
            ? `### ${planTitle} — research plan`
            : "### Research plan";
        return `${heading}\n${valid.join("\n")}`;
      }
    } catch {
      // Ignore malformed plan annotations
    }
    return "";
  }

  extractActivitySources(item, limit = 40) {
    const seen = new Map();
    try {
      const trail = item[3]?.[4];
      if (!Array.isArray(trail)) return [];
      for (const entry of trail) {
        const detail = entry?.[4]?.[2];
        const url = Array.isArray(detail) ? detail[1] : null;
        if (typeof url !== "string" || !url.startsWith("http")) continue;
        if (seen.has(url)) continue;
        const title =
          typeof detail[2] === "string" && detail[2] ? detail[2] : url;
        seen.set(url, title);
      }
    } catch {
      // Ignore malformed activity trails
    }
    const all = [...seen.entries()];
    const shown = all.slice(0, limit);
    const lines = shown.map(([url, title]) => `- [${title}](${url})`);
    if (all.length > shown.length) {
      lines.push(`- …and ${all.length - shown.length} more`);
    }
    return lines;
  }

  extractDeepResearchExtras(item) {
    const parts = [];
    try {
      // Extras must come from the same candidate that supplied the visible
      // text (findModelTextInApiItem uses the first candidate with text),
      // never mixed in from alternate drafts.
      const candidates = this.getApiCandidates(item);
      let anchorIdx = candidates.findIndex(
        (cand) =>
          (Array.isArray(cand[1]) && typeof cand[1][0] === "string") ||
          typeof cand[1] === "string" ||
          (typeof cand[0] === "string" && cand[0].length > 50),
      );
      if (anchorIdx === -1) anchorIdx = 0;
      const anchor = candidates[anchorIdx];
      if (anchor) {
        const plan = this.extractResearchPlanFromCandidate(anchor);
        if (plan) parts.push(plan);
        const doc = this.extractImmersiveDocFromCandidate(anchor);
        if (doc) parts.push(doc);
      }
      const sourceLines = this.extractActivitySources(item);
      if (sourceLines.length > 0) {
        parts.push(`**Sources consulted:**\n${sourceLines.join("\n")}`);
      }
    } catch {
      // Never let research extras break the base message
    }
    return parts.filter(Boolean).join("\n\n");
  }

  findUserTextInApiItem(item) {
    try {
      if (typeof item[2]?.[0]?.[0] === "string") return item[2][0][0];
      if (typeof item[2]?.[0] === "string") return item[2][0];
      if (typeof item[1]?.[0] === "string" && !Array.isArray(item[1][0]))
        return item[1][0];
      if (typeof item[0]?.[0] === "string") return item[0][0];
    } catch {
      // Fall through
    }
    return "";
  }

  findModelTextInApiItem(item) {
    try {
      // 1. Candidate responses in item[3]
      if (Array.isArray(item[3])) {
        const candidates = Array.isArray(item[3][0]) ? item[3][0] : item[3];
        for (const cand of candidates) {
          if (!Array.isArray(cand)) continue;
          // Shape: ["rc_...", ["markdown text", ...], ...]
          if (Array.isArray(cand[1]) && typeof cand[1][0] === "string") {
            return cand[1][0];
          }
          if (typeof cand[1] === "string") {
            return cand[1];
          }
          if (typeof cand[0] === "string" && cand[0].length > 50) {
            return cand[0];
          }
        }
      }

      // 2. Fallback candidate in item[1]
      if (Array.isArray(item[1])) {
        const candidate = item[1][0];
        if (typeof candidate === "string") return candidate;
        if (Array.isArray(candidate)) {
          if (typeof candidate[1]?.[0] === "string") return candidate[1][0];
          if (typeof candidate[0] === "string") return candidate[0];
        }
      }
    } catch {
      // Fall through
    }
    return "";
  }

  extractTitleFromPage() {
    if (typeof document !== "undefined" && document.title) {
      const cleanedDocTitle = document.title
        .replace(/Google/g, "")
        .replace(/Gemini/g, "")
        .replace(/Advanced/g, "")
        .replace(/- /g, "")
        .replace(/—/g, "")
        .trim();

      const isGeneric =
        !cleanedDocTitle ||
        cleanedDocTitle.toLowerCase() === "new chat" ||
        cleanedDocTitle.toLowerCase() === "help" ||
        cleanedDocTitle.toLowerCase() === "settings";

      if (cleanedDocTitle && !isGeneric && cleanedDocTitle.length > 2) {
        return cleanedDocTitle;
      }
    }

    if (typeof document !== "undefined" && document.querySelector) {
      const activeNav = document.querySelector(
        'a[aria-current="page"], .selected',
      );
      if (activeNav) {
        const navText = (activeNav.textContent || activeNav.innerText || "")
          .replace(/more_vert/g, "")
          .replace(/\n/g, " ")
          .trim();
        if (
          navText &&
          navText.length > 2 &&
          !navText.toLowerCase().includes("new chat")
        ) {
          return navText;
        }
      }

      const deepResearchTitle = document.querySelector(
        'h1, .title, .conversation-title, [data-testid="title"]',
      );
      if (deepResearchTitle && !this.isInsideMessage(deepResearchTitle)) {
        const text = (
          deepResearchTitle.textContent ||
          deepResearchTitle.innerText ||
          ""
        ).trim();
        if (
          text.length > 5 &&
          !text.includes("Gemini") &&
          !text.includes("Help") &&
          !text.includes("Settings")
        ) {
          return text;
        }
      }
    }

    return "Gemini Conversation";
  }

  isInsideMessage(el) {
    return !!el.closest?.(
      "user-query, model-response, .conversation-container, message-content, .query-text, .markdown",
    );
  }

  parseFromDom(currentUrl) {
    console.log("[Gemini Parser] Running DOM content extraction...");
    const title = this.extractTitleFromPage();
    const messages = [];
    const seenTexts = new Set();

    if (typeof document === "undefined" || !document.querySelectorAll) {
      return {
        title,
        messages: [],
        url: currentUrl,
        metadata: {
          Source: "Gemini",
          Date: new Date().toLocaleString(),
          Link: currentUrl,
          Method: "DOM",
        },
      };
    }

    // Strategy 1: Conversation containers or individual query/response tags
    const conversationContainers = document.querySelectorAll(
      ".conversation-container, user-query, model-response",
    );

    if (conversationContainers.length > 0) {
      const parentContainers = document.querySelectorAll(
        ".conversation-container",
      );
      const targetContainers =
        parentContainers.length > 0 ? parentContainers : [document.body];

      targetContainers.forEach((container) => {
        // 1. Extract User Queries
        const userQueries =
          container.tagName === "USER-QUERY"
            ? [container]
            : container.querySelectorAll("user-query, .user-query-container");

        userQueries.forEach((userQuery) => {
          const queryTextEl =
            userQuery.querySelector(".query-text") ||
            userQuery.querySelector("user-query-content") ||
            userQuery;

          if (queryTextEl) {
            const clone = queryTextEl.cloneNode(true);
            clone
              .querySelectorAll(
                '.cdk-visually-hidden, [class*="screen-reader"], h5.cdk-visually-hidden, user-query-file-carousel',
              )
              .forEach((el) => el.remove());

            // Extract file attachments if any
            const attachments = [];
            userQuery
              .querySelectorAll("user-query-file-preview")
              .forEach((fp) => {
                const fileName = fp.textContent?.trim();
                if (fileName) attachments.push(fileName);
              });

            // Use innerText if available, with textContent fallback so detached nodes are never blank
            let userText = (
              clone.innerText !== undefined && clone.innerText !== ""
                ? clone.innerText
                : clone.textContent || ""
            ).trim();
            // Clean out leading "You said" if still present
            userText = userText.replace(/^You said\s*/i, "").trim();

            if (attachments.length > 0) {
              userText +=
                `\n\n**Attachments:**\n` +
                attachments.map((a) => `- ${a}`).join("\n");
            }

            if (userText && !seenTexts.has(userText)) {
              seenTexts.add(userText);
              messages.push({
                role: "User",
                content: userText,
              });
            }
          }
        });

        // 2. Extract Model Responses
        const modelResponses =
          container.tagName === "MODEL-RESPONSE"
            ? [container]
            : container.querySelectorAll("model-response");

        modelResponses.forEach((modelResponse) => {
          const messageContent =
            modelResponse.querySelector("message-content") || modelResponse;
          const markdownDiv =
            messageContent.querySelector(
              ".markdown.markdown-main-panel, .markdown",
            ) || messageContent;

          if (markdownDiv) {
            const clone = markdownDiv.cloneNode(true);

            // Remove UI buttons, thought overlays, follow-up suggestion
            // widgets, and interactive toolbars.
            // Note: .hide-from-message-actions is NOT removed — it wraps
            // deep-research plan widgets whose text must be kept (buttons
            // inside are still stripped above).
            clone
              .querySelectorAll(
                "button, follow-up, .follow-up-container, .thoughts-container, .thoughts-wrapper, model-thoughts, .table-footer, message-actions, election-info-disclaimer, finance-info-disclaimer, .sources-list",
              )
              .forEach((el) => el.remove());

            // Unwrap response-element wrappers and message-action guards
            clone
              .querySelectorAll("response-element, .hide-from-message-actions")
              .forEach((el) => {
                while (el.firstChild) {
                  el.parentNode.insertBefore(el.firstChild, el);
                }
                el.remove();
              });

            const text = convertToMarkdown(clone);
            const trimmed = text.trim();
            if (trimmed && !seenTexts.has(trimmed)) {
              seenTexts.add(trimmed);
              messages.push({
                role: "Model",
                content: trimmed,
              });
            }
          }
        });
      });
    }

    // Strategy 2: Deep Research immersive panel (full report document).
    // Runs even when chat shells were found above — the panel holds the
    // report body, which never appears in the chat transcript.
    const immersiveSections = this.extractImmersivePanelMessages(document);
    immersiveSections.forEach((section) => {
      if (!section.content || seenTexts.has(section.content)) return;
      // The panel body passes through a different conversion path than chat
      // messages, so exact-match dedup never fires. Skip the section when a
      // Model message already carries the report (e.g. panel content also
      // rendered inside a chat model-response).
      const body = section.content.replace(/^## .*\n\n/, "");
      const probe = body.slice(0, 300);
      const alreadyExported =
        probe.length > 0 &&
        messages.some((m) => m.role === "Model" && m.content.includes(probe));
      if (!alreadyExported) {
        seenTexts.add(section.content);
        messages.push(section);
      }
    });

    if (messages.length === 0) {
      const deepResearchPanel = document.querySelector(
        "deep-research-immersive-panel",
      );
      if (deepResearchPanel) {
        const panelContent =
          this.extractDeepResearchPanelContent(deepResearchPanel);
        panelContent.forEach((section) => {
          if (section.content && !seenTexts.has(section.content)) {
            seenTexts.add(section.content);
            messages.push({
              role: section.role,
              content: section.content,
            });
          }
        });
      }
    }

    // Strategy 3: General content container fallback
    if (messages.length === 0) {
      const contentSelectors = [
        "main",
        "article",
        ".content",
        ".main-content",
        '[role="main"]',
        ".chat-window-content",
      ];

      for (const selector of contentSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const text = (el.textContent || "").trim();
          if (text.length > 100) {
            const sections = this.extractDeepResearchSections(el);
            if (sections.length > 0) {
              sections.forEach((s) => {
                if (s.content && !seenTexts.has(s.content)) {
                  seenTexts.add(s.content);
                  messages.push(s);
                }
              });
              break;
            }
          }
        }
      }
    }

    console.log(
      `[Gemini Parser] Total DOM messages extracted: ${messages.length}`,
    );
    return {
      title,
      messages,
      url: currentUrl,
      metadata: {
        Source: "Gemini",
        Date: new Date().toLocaleString(),
        Link: currentUrl,
        Method: "DOM",
      },
    };
  }

  extractDeepResearchSections(contentElement) {
    const sections = [];
    const text = contentElement.innerText || contentElement.textContent || "";

    const patterns = [
      {
        promptRegex:
          /(?:Prompt|You said)[:\s]*\n*([\s\S]*?)(?=\n\s*(?:Response|I've completed|Generating|Start research)|$)/i,
        responseRegex:
          /(?:Response|I've completed|Generating|Start research)[:\s]*\n*([\s\S]*?)(?=\n\s*(?:Prompt|You said)|$)/i,
      },
      {
        promptRegex:
          /(?:Question|Q)[:\s]*\n*([\s\S]*?)(?=\n\s*(?:Answer|A|Response)|$)/i,
        responseRegex:
          /(?:Answer|A|Response)[:\s]*\n*([\s\S]*?)(?=\n\s*(?:Question|Q)|$)/i,
      },
    ];

    for (const pattern of patterns) {
      const promptMatches = text.match(pattern.promptRegex);
      const responseMatches = text.match(pattern.responseRegex);

      if (promptMatches && promptMatches[1]) {
        const promptContent = promptMatches[1].trim();
        if (promptContent.length > 20) {
          sections.push({
            role: "User",
            content: promptContent,
          });
        }
      }

      if (responseMatches && responseMatches[1]) {
        const responseContent = responseMatches[1].trim();
        if (responseContent.length > 50) {
          sections.push({
            role: "Model",
            content: responseContent,
          });
        }
      }

      if (sections.length > 0) return sections;
    }

    return sections;
  }

  // Extracts the open Deep Research immersive panel (the full report
  // document). Returns [] when no panel is rendered in the DOM.
  extractImmersivePanelMessages(doc) {
    const sections = [];
    try {
      if (!doc || typeof doc.querySelector !== "function") return sections;
      const panel =
        doc.querySelector("immersive-panel deep-research-immersive-panel") ||
        doc.querySelector("deep-research-immersive-panel");
      if (!panel) return sections;

      const titleEl =
        panel.querySelector("toolbar .title-text") ||
        panel.querySelector(".title-text");
      const title = (titleEl?.textContent || "").trim();

      const bodyRoot =
        panel.querySelector('[data-test-id="message-content"] .markdown') ||
        panel.querySelector("#extended-response-markdown-content") ||
        panel.querySelector("message-content .markdown") ||
        panel.querySelector("message-content");
      if (!bodyRoot) return sections;

      const clone = bodyRoot.cloneNode(true);
      // Inline citation footnotes carry only a source index — render it as
      // text so references survive markdown conversion.
      clone.querySelectorAll("sup[data-turn-source-index]").forEach((sup) => {
        const idx = sup.getAttribute("data-turn-source-index");
        if (idx && sup.parentNode) {
          sup.parentNode.replaceChild(doc.createTextNode(`[${idx}]`), sup);
        }
      });
      clone
        .querySelectorAll(
          "button, toolbar, toc-menu, mat-menu, message-actions, follow-up, .follow-up-container, .hide-from-message-actions button",
        )
        .forEach((el) => el.remove());
      clone.querySelectorAll("response-element").forEach((el) => {
        while (el.firstChild) {
          el.parentNode.insertBefore(el.firstChild, el);
        }
        el.remove();
      });

      const body = convertToMarkdown(clone)
        .trim()
        // Turndown escapes the [N] citation markers inserted above;
        // restore them (they render identically either way).
        .replace(/\\\[(\d+)\\\]/g, "[$1]");
      if (body && body.length > 100) {
        sections.push({
          role: "Model",
          content: title ? `## ${title}\n\n${body}` : body,
        });
      }
    } catch (error) {
      console.error("[Gemini Parser] Error extracting immersive panel:", error);
    }
    return sections;
  }

  extractDeepResearchPanelContent(panelElement) {
    const sections = [];
    try {
      const contentElements = panelElement.querySelectorAll(
        ".markdown, .content, .research-content, .panel-content",
      );
      contentElements.forEach((element) => {
        const text = (element.innerText || element.textContent || "").trim();
        if (text.length > 100) {
          sections.push({
            role: "Model",
            content: text,
          });
        }
      });

      if (sections.length === 0) {
        const panelText = (
          panelElement.innerText ||
          panelElement.textContent ||
          ""
        ).trim();
        if (panelText.length > 200) {
          sections.push({
            role: "Model",
            content: panelText,
          });
        }
      }
    } catch (error) {
      console.error("[Gemini Parser] Error extracting panel content:", error);
    }
    return sections;
  }
}
