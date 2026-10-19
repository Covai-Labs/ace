const TURN_SELECTOR =
  'article, [data-testid^="conversation-turn-"], section[data-turn-id], [data-message-author-role], [data-message-role]';
const DEFAULT_RENDER_WAIT_MS = 160;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isScrollable(element) {
  return element && element.scrollHeight > element.clientHeight + 80;
}

function messageKey(message) {
  if (message.key) return message.key;
  return `${message.role}:${message.content.replace(/\s+/g, " ").trim()}`;
}

function publicMessage(message) {
  return {
    role: message.role,
    content: message.content,
  };
}

export function getConversationTurnIndex(turn) {
  if (!turn || typeof turn.getAttribute !== "function")
    return Number.POSITIVE_INFINITY;
  const testId = turn.getAttribute("data-testid") || "";
  const match = testId.match(/^conversation-turn-(\d+)$/);
  if (match) return Number(match[1]);
  const turnId = turn.getAttribute("data-turn-id");
  if (turnId && /^\d+$/.test(turnId)) return Number(turnId);
  return Number.POSITIVE_INFINITY;
}

export function getConversationTurns(doc = document) {
  if (!doc || typeof doc.querySelectorAll !== "function") return [];
  const turns = Array.from(doc.querySelectorAll(TURN_SELECTOR));
  // Filter out nested duplicates and recovery placeholders
  const filtered = turns.filter((el) => {
    if (el.matches?.("[data-conversation-recovery]")) return false;
    return !turns.some((parent) => parent !== el && parent.contains(el));
  });

  return filtered.sort((a, b) => {
    const idxA = getConversationTurnIndex(a);
    const idxB = getConversationTurnIndex(b);
    if (idxA !== idxB) return idxA - idxB;
    if (typeof a.compareDocumentPosition === "function") {
      return a.compareDocumentPosition(b) &
        (doc.defaultView?.Node?.DOCUMENT_POSITION_FOLLOWING || 4)
        ? -1
        : 1;
    }
    return 0;
  });
}

export function findChatGPTScrollRoot(turns, doc = document) {
  const firstTurn = turns.find(Boolean);
  let current = firstTurn?.parentElement || null;

  while (current) {
    if (isScrollable(current)) return current;
    current = current.parentElement;
  }

  const main = doc.querySelector("main");
  if (isScrollable(main)) return main;

  return doc.scrollingElement || doc.documentElement || doc.body;
}

function createProgressOverlay(doc) {
  if (!doc || typeof doc.createElement !== "function" || !doc.body) return null;
  try {
    const overlay = doc.createElement("div");
    overlay.id = "ai-exporter-progress-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "16px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "999999",
      padding: "10px 20px",
      background: "rgba(15, 23, 42, 0.92)",
      color: "#f8fafc",
      borderRadius: "8px",
      fontFamily:
        'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: "14px",
      fontWeight: "500",
      boxShadow:
        "0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
      pointerEvents: "none",
      transition: "opacity 0.2s ease",
    });
    overlay.textContent = "Preparing conversation export...";
    doc.body.appendChild(overlay);
    return overlay;
  } catch {
    return null;
  }
}

function updateProgressOverlay(overlay, current, total) {
  if (!overlay) return;
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  overlay.textContent = `Processing messages (${current}/${total} - ${percentage}%)...`;
}

function removeProgressOverlay(overlay) {
  if (!overlay) return;
  try {
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 200);
  } catch {
    // Ignore cleanup errors
  }
}

export async function collectMountedTurnMessages({
  turns,
  scrollRoot,
  extractMessage,
  waitForRender = delay,
  renderWaitMs = DEFAULT_RENDER_WAIT_MS,
  renderAttempts = 4,
  doc = typeof document !== "undefined" ? document : null,
}) {
  const originalTop = scrollRoot?.scrollTop;
  const originalBehavior = scrollRoot?.style?.scrollBehavior;
  const overlay = createProgressOverlay(doc);

  if (scrollRoot && scrollRoot.style) {
    scrollRoot.style.scrollBehavior = "auto";
  }

  const seen = new Set();
  const messages = [];

  try {
    // Scroll to top first to trigger un-virtualization of earlier turns
    if (scrollRoot && typeof scrollRoot.scrollTop === "number") {
      scrollRoot.scrollTop = 0;
      await waitForRender(renderWaitMs);
    }

    // Accumulate all turns dynamically across scroll passes
    const allTurnElements = new Set(turns || []);
    if (doc) {
      getConversationTurns(doc).forEach((t) => allTurnElements.add(t));
    }

    const orderedTurns = Array.from(allTurnElements).sort((a, b) => {
      return getConversationTurnIndex(a) - getConversationTurnIndex(b);
    });

    const totalTurns = orderedTurns.length;

    for (let idx = 0; idx < totalTurns; idx += 1) {
      const turn = orderedTurns[idx];
      updateProgressOverlay(overlay, idx + 1, totalTurns);

      if (typeof turn.scrollIntoView === "function") {
        turn.scrollIntoView({ block: "center" });
      }

      let message = null;
      for (let attempt = 0; attempt < renderAttempts; attempt += 1) {
        await waitForRender(renderWaitMs);
        message = extractMessage(turn);
        if (message?.content) break;
      }

      if (!message?.content) continue;

      const key = messageKey(message);
      if (seen.has(key)) continue;

      seen.add(key);
      messages.push(publicMessage(message));
    }
  } finally {
    removeProgressOverlay(overlay);

    if (scrollRoot && scrollRoot.style) {
      scrollRoot.style.scrollBehavior = originalBehavior || "";
    }

    if (scrollRoot && Number.isFinite(originalTop)) {
      scrollRoot.scrollTop = originalTop;
    }
  }

  return messages;
}
