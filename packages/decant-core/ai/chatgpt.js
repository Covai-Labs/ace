import { ChatParser } from './base.js';
import { convertToMarkdown } from '../utils/html-to-markdown.js';
import { normalizeLatexMath } from '../utils/latex-math.js';
import {
  collectMountedTurnMessages,
  findChatGPTScrollRoot,
  getConversationTurns,
} from './chatgpt_scroll_collector.js';

function getAccessToken() {
  try {
    const el = typeof document !== 'undefined' && document.getElementById('client-bootstrap');
    if (!el) return null;
    return JSON.parse(el.textContent).session.accessToken;
  } catch {
    return null;
  }
}

function getConversationId() {
  try {
    if (typeof window === 'undefined' || !window.location) return null;
    const path = window.location.pathname || window.location.href || '';
    const match = path.match(/\/(?:c|share|g\/[^/]+\/c)\/([^/?#]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function fetchConversation(convId, token, includeImages) {
  return new Promise((resolve, reject) => {
    const requestId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2) + Date.now().toString(36);

    const handler = (event) => {
      if (event.data?.source !== 'chatgpt-exporter-page') return;
      if (event.data?.requestId !== requestId) return;
      window.removeEventListener('message', handler);
      clearTimeout(timer);
      if (event.data.error) {
        reject(new Error(event.data.error));
      } else {
        resolve({ data: event.data.data, images: event.data.images ?? {} });
      }
    };

    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Request timed out'));
    }, 45000);

    window.addEventListener('message', handler);
    window.postMessage(
      {
        source: 'chatgpt-exporter-ext',
        type: 'fetch_conversation',
        convId,
        token,
        requestId,
        includeImages,
      },
      'https://chatgpt.com',
    );
  });
}

function findLeafFromNode(mapping, startNodeId) {
  let nodeId = startNodeId;
  if (!nodeId || !mapping[nodeId]) return null;
  let node = mapping[nodeId];
  const visited = new Set();
  while (node?.children?.length) {
    if (visited.has(nodeId)) break;
    visited.add(nodeId);
    const lastChildId = node.children[node.children.length - 1];
    if (!mapping[lastChildId]) break;
    node = mapping[lastChildId];
    nodeId = lastChildId;
  }
  return nodeId;
}

function resolveActiveLeafNode(mapping, currentNodeId) {
  // 1. Try DOM elements first (captures branch if user switched turns in UI)
  if (typeof document !== 'undefined' && document.querySelectorAll) {
    const msgEls = Array.from(
      document.querySelectorAll(
        'div[data-message-id], [data-message-author-role][data-message-id], section[data-turn-id], article[data-turn-id]',
      ),
    );
    for (let i = msgEls.length - 1; i >= 0; i--) {
      const el = msgEls[i];
      const id =
        el.dataset?.messageId || el.dataset?.turnId || el.getAttribute?.('data-message-id');
      if (id && mapping[id]) {
        const leaf = findLeafFromNode(mapping, id);
        if (leaf) return leaf;
      }
    }
  }

  // 2. Fall back to currentNodeId from API
  if (currentNodeId && mapping[currentNodeId]) {
    return findLeafFromNode(mapping, currentNodeId);
  }

  return null;
}

export function extractSharedConversationFromDom(
  doc = typeof document !== 'undefined' ? document : null,
) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return null;

  function findMappingInObj(obj, seen = new Set()) {
    if (!obj || typeof obj !== 'object' || seen.has(obj)) return null;
    seen.add(obj);

    if (obj.mapping && typeof obj.mapping === 'object' && Object.keys(obj.mapping).length > 0) {
      return obj;
    }
    if (
      obj.data &&
      obj.data.mapping &&
      typeof obj.data.mapping === 'object' &&
      Object.keys(obj.data.mapping).length > 0
    ) {
      return obj.data;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = findMappingInObj(item, seen);
        if (found) return found;
      }
    } else {
      for (const val of Object.values(obj)) {
        const found = findMappingInObj(val, seen);
        if (found) return found;
      }
    }
    return null;
  }

  const scripts = Array.from(doc.querySelectorAll('script'));
  for (const script of scripts) {
    const text = script.textContent || '';
    if (!text || (!text.includes('"mapping"') && !text.includes('current_node'))) continue;

    try {
      const parsed = JSON.parse(text);
      const convo = findMappingInObj(parsed);
      if (convo) return convo;
    } catch {
      const matches = text.match(/\{[\s\S]*"mapping"[\s\S]*\}/g);
      if (matches) {
        for (const match of matches) {
          try {
            const parsed = JSON.parse(match);
            const convo = findMappingInObj(parsed);
            if (convo) return convo;
          } catch {
            // Ignore JSON parse errors in script segments
          }
        }
      }
    }
  }

  const bootstrapEl = doc.getElementById?.('client-bootstrap');
  if (bootstrapEl) {
    try {
      const parsed = JSON.parse(bootstrapEl.textContent);
      const convo = findMappingInObj(parsed);
      if (convo) return convo;
    } catch {
      // Ignore client-bootstrap JSON parse errors
    }
  }

  return null;
}

function cleanApiPartText(partText) {
  return partText
    .replace(/\u{E0000}[\u{E0000}-\u{E007F}]*/gu, '')
    .replace(/citeturn\d+\w*/g, '')
    .trim();
}

// Linearize the newer backend-api conversation shape, which returns a
// `messages` array instead of a `mapping` tree. Output segments match the
// mapping-based linearize() format ({ type: "text" | "thought" | "image" })
// so both flow through the same formatApiResult().
export function linearizeMessagesArray(apiMessages, includeImages) {
  const messages = [];
  if (!Array.isArray(apiMessages)) return messages;

  const pushOrMerge = (entry, isThoughtMsg) => {
    if (
      entry.role === 'ChatGPT' &&
      messages.length > 0 &&
      messages[messages.length - 1].role === 'ChatGPT'
    ) {
      const prevMsg = messages[messages.length - 1];
      if (isThoughtMsg) {
        prevMsg.segments.unshift(...entry.segments);
      } else {
        prevMsg.segments.push(...entry.segments);
      }
      Object.assign(prevMsg.citeMap, entry.citeMap);
      Object.assign(prevMsg.imageGroupMap, entry.imageGroupMap);
      if (entry.timestamp && !prevMsg.timestamp) {
        prevMsg.timestamp = entry.timestamp;
      }
    } else {
      messages.push(entry);
    }
  };

  for (const msg of apiMessages) {
    if (!msg) continue;
    const role = msg?.author?.role;
    if (role !== 'user' && role !== 'assistant' && role !== 'tool') continue;
    if (msg.metadata?.is_visually_hidden_from_conversation === true) continue;

    const content = msg.content || {};
    const contentType = content.content_type;
    const segments = [];
    // Mirror the mapping path's thought detection (content types plus
    // author/recipient markers).
    const isThoughtMsg =
      msg?.author?.name === 'thought' ||
      msg?.recipient === 'thought' ||
      contentType === 'thought' ||
      contentType === 'thoughts' ||
      contentType === 'reasoning_recap' ||
      msg?.metadata?.reasoning_status === 'is_reasoning';

    // Reasoning summaries: thoughts = [{ summary, content }]
    if (Array.isArray(content.thoughts) && content.thoughts.length > 0) {
      const thoughtParts = content.thoughts
        .map((t) => (t.summary ? `**${t.summary}**\n${t.content || ''}` : t.content || ''))
        .map((t) => t.trim())
        .filter(Boolean);
      if (thoughtParts.length > 0) {
        segments.push({ type: 'thought', content: thoughtParts.join('\n\n') });
      }
    }

    // Reasoning recap (e.g. "Worked for 11s")
    if (
      contentType === 'reasoning_recap' &&
      typeof content.content === 'string' &&
      content.content.trim()
    ) {
      segments.push({ type: 'thought', content: content.content.trim() });
    }

    // Tool invocations (content_type "code", e.g. Deep Research args JSON)
    // and tool-role messages are not user-visible prose — skip them.
    if (contentType !== 'code' && role !== 'tool') {
      const parts = Array.isArray(content.parts) ? content.parts : [];
      for (const part of parts) {
        let partText = '';
        let isThoughtPart = isThoughtMsg;
        if (typeof part === 'string') {
          partText = part;
        } else if (part && typeof part === 'object') {
          if (part.content_type === 'text' && typeof part.text === 'string') {
            partText = part.text;
          } else if (part.content_type === 'thought' && typeof part.text === 'string') {
            partText = part.text;
            isThoughtPart = true;
          } else if (part.content_type === 'audio_transcription' && typeof part.text === 'string') {
            partText = part.text;
          } else if (
            includeImages &&
            part?.content_type === 'image_asset_pointer' &&
            part?.asset_pointer
          ) {
            segments.push({
              type: 'image',
              fileId: part.asset_pointer.split('://')[1],
            });
            continue;
          }
        }
        const text = partText ? cleanApiPartText(partText) : '';
        if (text) {
          segments.push({
            type: isThoughtPart ? 'thought' : 'text',
            content: text,
          });
        }
      }

      // Standalone content.text without parts (plain text / execution
      // output), mirroring the mapping path.
      if (parts.length === 0 && typeof content.text === 'string' && content.text.trim()) {
        segments.push({ type: 'text', content: content.text.trim() });
      }
    }

    // Deep Research reports (widget_state), attachments, and Canvas
    // documents from message metadata, mirroring the mapping path.
    if (role !== 'tool') {
      const widgetRaw =
        msg.metadata?.chatgpt_sdk?.widget_state ||
        msg.metadata?.tool_response_metadata?.venus_widget_state;
      if (widgetRaw) {
        try {
          const widget = typeof widgetRaw === 'string' ? JSON.parse(widgetRaw) : widgetRaw;
          const reportText = widget.report_message?.content?.parts?.[0] || widget.markdown;
          const steering = widget.steering_acknowledgement;
          let researchContent = '';
          if (steering) researchContent += `${steering}\n\n`;
          if (reportText) researchContent += reportText;
          if (researchContent.trim()) {
            segments.push({ type: 'text', content: researchContent.trim() });
          }
        } catch {
          // Ignore widget state JSON parse errors
        }
      }

      if (Array.isArray(msg.metadata?.attachments) && msg.metadata.attachments.length > 0) {
        const fileNames = msg.metadata.attachments.map((att) => att.name).filter(Boolean);
        if (fileNames.length > 0) {
          segments.push({
            type: 'text',
            content: `[Attached: ${fileNames.join(', ')}]`,
          });
        }
      }

      if (msg.metadata?.canvas?.title) {
        segments.push({
          type: 'text',
          content: `[Canvas: ${msg.metadata.canvas.title}]`,
        });
      }
    }

    if (segments.length === 0) continue;

    const displayRole = role === 'user' ? 'User' : 'ChatGPT';
    const timestamp = msg?.create_time ? new Date(msg.create_time * 1000).toLocaleString() : null;
    // Citation / image-group references, mirroring the mapping path.
    const citeMap = {};
    const imageGroupMap = {};
    for (const ref of msg?.metadata?.content_references ?? []) {
      if (ref.matched_text) {
        if (ref.items?.length) citeMap[ref.matched_text] = ref.items;
        if (ref.type === 'image_group' || ref.matched_text.includes('image_group')) {
          imageGroupMap[ref.matched_text] = ref;
        }
      }
    }
    pushOrMerge(
      {
        role: displayRole,
        segments,
        citeMap,
        imageGroupMap,
        timestamp,
      },
      isThoughtMsg,
    );
  }

  return messages;
}

export function linearize(mapping, includeImages, currentNodeId) {
  let path = [];
  const leafId = resolveActiveLeafNode(mapping, currentNodeId);

  if (leafId) {
    let id = leafId;
    const visited = new Set();
    while (id && mapping[id] && !visited.has(id)) {
      visited.add(id);
      path.push(mapping[id]);
      id = mapping[id].parent;
    }
    path.reverse();
  } else {
    const root = Object.values(mapping).find((n) => !n.parent || !mapping[n.parent]);
    if (!root) return [];

    const subtreeSize = {};
    function size(id) {
      if (id in subtreeSize) return subtreeSize[id];
      const node = mapping[id];
      if (!node) return (subtreeSize[id] = 0);
      const childSizes = (node.children ?? []).map((cid) => size(cid));
      return (subtreeSize[id] = 1 + (childSizes.length ? Math.max(...childSizes) : 0));
    }
    for (const id of Object.keys(mapping)) size(id);

    let node = root;
    const visited = new Set();
    while (node && !visited.has(node.id)) {
      visited.add(node.id);
      path.push(node);
      const validChildren = (node.children ?? []).filter((cid) => cid in mapping);
      node = validChildren.length
        ? mapping[
            validChildren.reduce((best, cid) => (subtreeSize[cid] > subtreeSize[best] ? cid : best))
          ]
        : null;
    }
  }

  const messages = [];

  for (const node of path) {
    const msg = node.message;
    if (!msg) continue;
    if (msg.metadata?.is_visually_hidden_from_conversation === true) continue;

    const role = msg?.author?.role;
    const authorName = msg?.author?.name;
    const isThoughtMsg =
      authorName === 'thought' ||
      msg?.recipient === 'thought' ||
      msg?.content?.content_type === 'thought' ||
      msg?.content?.content_type === 'thoughts' ||
      msg?.metadata?.reasoning_status === 'is_reasoning';

    if (role === 'user' || role === 'assistant' || role === 'tool' || isThoughtMsg) {
      const segments = [];
      const parts = msg?.content?.parts ?? [];
      // Tool-invocation payloads (content_type "code") are not user-visible
      // prose, whether carried as standalone text or inside parts.
      const isToolInvocation = msg?.content?.content_type === 'code';

      for (const part of parts) {
        if (isToolInvocation) {
          if (!(
            includeImages &&
            part?.content_type === 'image_asset_pointer' &&
            part?.asset_pointer
          )) {
            continue;
          }
        }
        let partText = '';
        let isThoughtPart = isThoughtMsg;

        if (typeof part === 'string') {
          partText = part;
        } else if (part && typeof part === 'object') {
          if (part.content_type === 'text' && typeof part.text === 'string') {
            partText = part.text;
          } else if (part.content_type === 'thought' && typeof part.text === 'string') {
            partText = part.text;
            isThoughtPart = true;
          } else if (part.content_type === 'audio_transcription' && typeof part.text === 'string') {
            partText = part.text;
          }
        }

        if (partText && role !== 'tool') {
          const text = partText
            .replace(/\u{E0000}[\u{E0000}-\u{E007F}]*/gu, '')
            .replace(/citeturn\d+\w*/g, '')
            .trim();
          if (text) {
            if (isThoughtPart) {
              segments.push({ type: 'thought', content: text });
            } else {
              segments.push({ type: 'text', content: text });
            }
          }
        } else if (
          includeImages &&
          part?.content_type === 'image_asset_pointer' &&
          part?.asset_pointer
        ) {
          segments.push({
            type: 'image',
            fileId: part.asset_pointer.split('://')[1],
          });
        }
      }

      // Handle standalone content.text (e.g. execution_output or plain text).
      // Tool-invocation payloads (content_type "code", e.g. Deep Research
      // "/Deep Research App/start" args JSON) are not user-visible prose —
      // the site renders a status card instead — so never dump them as text.
      if (
        typeof msg.content?.text === 'string' &&
        msg.content.text.trim() &&
        parts.length === 0 &&
        msg.content?.content_type !== 'code'
      ) {
        segments.push({ type: 'text', content: msg.content.text.trim() });
      }

      // Handle o1/o3/o4 reasoning thoughts array: content.thoughts = [{ summary, content }]
      if (Array.isArray(msg.content?.thoughts) && msg.content.thoughts.length > 0) {
        const thoughtParts = msg.content.thoughts
          .map((t) => (t.summary ? `**${t.summary}**\n${t.content || ''}` : t.content || ''))
          .filter(Boolean);
        if (thoughtParts.length > 0) {
          segments.push({
            type: 'thought',
            content: thoughtParts.join('\n\n'),
          });
        }
      }

      // Handle reasoning recap
      if (
        (msg.content?.content_type === 'reasoning_recap' || msg.content?.content) &&
        typeof msg.content.content === 'string' &&
        msg.content.content.trim()
      ) {
        segments.push({ type: 'thought', content: msg.content.content.trim() });
      }

      // Handle Deep Research reports (widget_state)
      const widgetRaw =
        msg.metadata?.chatgpt_sdk?.widget_state ||
        msg.metadata?.tool_response_metadata?.venus_widget_state;
      if (widgetRaw) {
        try {
          const widget = typeof widgetRaw === 'string' ? JSON.parse(widgetRaw) : widgetRaw;
          const reportText = widget.report_message?.content?.parts?.[0] || widget.markdown;
          const steering = widget.steering_acknowledgement;
          let researchContent = '';
          if (steering) researchContent += `${steering}\n\n`;
          if (reportText) researchContent += reportText;
          if (researchContent.trim()) {
            segments.push({ type: 'text', content: researchContent.trim() });
          }
        } catch {
          // Ignore widget state JSON parse errors
        }
      }

      // Handle attachments
      if (Array.isArray(msg.metadata?.attachments) && msg.metadata.attachments.length > 0) {
        const fileNames = msg.metadata.attachments.map((att) => att.name).filter(Boolean);
        if (fileNames.length > 0) {
          segments.push({
            type: 'text',
            content: `[Attached: ${fileNames.join(', ')}]`,
          });
        }
      }

      // Handle Canvas documents
      if (msg.metadata?.canvas?.title) {
        segments.push({
          type: 'text',
          content: `[Canvas: ${msg.metadata.canvas.title}]`,
        });
      }

      const displayRole = role === 'user' ? 'User' : 'ChatGPT';
      const timestamp = msg?.create_time ? new Date(msg.create_time * 1000).toLocaleString() : null;

      if (segments.length) {
        const citeMap = {};
        const imageGroupMap = {};
        for (const ref of msg?.metadata?.content_references ?? []) {
          if (ref.matched_text) {
            if (ref.items?.length) citeMap[ref.matched_text] = ref.items;
            if (ref.type === 'image_group' || ref.matched_text.includes('image_group')) {
              imageGroupMap[ref.matched_text] = ref;
            }
          }
        }

        // If previous message is also ChatGPT, merge segments (thoughts in front, content in back)
        if (
          displayRole === 'ChatGPT' &&
          messages.length > 0 &&
          messages[messages.length - 1].role === 'ChatGPT'
        ) {
          const prevMsg = messages[messages.length - 1];
          if (isThoughtMsg) {
            prevMsg.segments.unshift(...segments);
          } else {
            prevMsg.segments.push(...segments);
          }
          Object.assign(prevMsg.citeMap, citeMap);
          Object.assign(prevMsg.imageGroupMap, imageGroupMap);
          if (timestamp && !prevMsg.timestamp) {
            prevMsg.timestamp = timestamp;
          }
        } else {
          messages.push({
            role: displayRole,
            segments,
            citeMap,
            imageGroupMap,
            timestamp,
          });
        }
      }
    }
  }

  return messages;
}

function cleanMarkdownFromApi(text, citeMap, imageGroupMap) {
  if (!text) return '';

  // 1. Remove specific character ranges (like some PUA ranges)
  text = text
    .replace(/\u{E0000}[\u{E0000}-\u{E007F}]*/gu, '')
    .replace(/citeturn\d+\w*/g, '')
    .trim();

  // 2. Replace ChatGPT PUA URL annotations: url{label}{href}
  text = text.replace(
    /\uE200url\uE202([^\uE202\uE201]+)\uE202([^\uE201]+)\uE201/g,
    (_, label, href) => `[${label.trim()}](${href.trim()})`,
  );

  // 3. Replace ChatGPT PUA entity annotations: entity[\"type\",\"name\",...]
  text = text.replace(/\uE200entity\uE202([^\uE201]+)\uE201/g, (_, json) => {
    try {
      const arr = JSON.parse(json.replace(/\\"/g, '"'));
      const name = Array.isArray(arr) && arr[1] ? arr[1] : json;
      return name;
    } catch {
      return json;
    }
  });

  // 3.5. Clean/replace ChatGPT PUA image_group annotations: image_group{json}
  text = text.replace(/\uE200image_group\uE202[^\uE201]+\uE201/g, (match) => {
    const ref = imageGroupMap?.[match];
    if (ref) {
      if (Array.isArray(ref.images) && ref.images.length > 0) {
        const markdownImgs = ref.images
          .map((imgObj) => {
            const res = imgObj.image_result || {};
            const title = res.title || imgObj.image_search_query || 'Image';
            const src = res.content_url || res.thumbnail_url || res.original_content_url;
            if (src) {
              return `![${title}](${src})`;
            }
            return '';
          })
          .filter(Boolean);
        if (markdownImgs.length > 0) {
          return '\n\n' + markdownImgs.join('\n\n') + '\n\n';
        }
      }
      if (ref.safe_urls && Array.isArray(ref.safe_urls) && ref.safe_urls.length > 0) {
        return (
          '\n\n' + ref.safe_urls.map((url, i) => `![Image ${i + 1}](${url})`).join('\n\n') + '\n\n'
        );
      }
      if (ref.alt) {
        return '\n\n' + ref.alt + '\n\n';
      }
    }
    return '';
  });

  // 4. Replace ChatGPT PUA cite annotations
  text = text.replace(/\uE200cite(?:\uE202[^\uE202\uE201]+)+\uE201/g, (match) => {
    const items = citeMap?.[match] ?? [];
    if (!items.length) return '';
    const formatted = items.map((item) => {
      const label = item.attribution || item.title || 'Source';
      return `[${label}](${item.url})`;
    });
    return ` (${formatted.join(', ')})`;
  });

  text = normalizeLatexMath(text);

  return text;
}

export class ChatGPTParser extends ChatParser {
  name = 'ChatGPT';
  constructor() {
    super();
    this.lastFetch = null;
  }

  isAvailable(url) {
    return url.includes('chatgpt.com');
  }

  getRoleElement(container) {
    if (container.matches?.('[data-message-author-role], [data-message-role]')) {
      return container;
    }
    return container.querySelector?.('[data-message-author-role], [data-message-role]') || null;
  }

  getRoleElements(container) {
    if (container.matches?.('[data-message-author-role], [data-message-role]')) {
      return [container];
    }
    return Array.from(
      container.querySelectorAll?.('[data-message-author-role], [data-message-role]') || [],
    );
  }

  getMessageRole(container, roleElement) {
    const roleAttr =
      roleElement?.getAttribute('data-message-author-role') ||
      roleElement?.getAttribute('data-message-role');
    if (roleAttr) return roleAttr === 'user' ? 'User' : 'ChatGPT';

    const text = container.innerText || '';
    if (text.startsWith('You\n') || text.includes('\nYou\n')) return 'User';

    return 'ChatGPT';
  }

  getContentElement(container, roleElement) {
    const role =
      roleElement?.getAttribute('data-message-author-role') ||
      roleElement?.getAttribute('data-message-role');

    if (role === 'user') {
      const bubble = container.querySelector?.(
        '[data-user-message-bubble], [data-user-message-copy]',
      );
      if (bubble) return bubble;
      return roleElement;
    }

    const selectors = [
      '[data-assistant-markdown]',
      '[data-assistant-markdown-root]',
      '.markdown',
      '.prose',
      '.whitespace-pre-wrap',
    ];
    for (const selector of selectors) {
      const contentElement = container.querySelector?.(selector);
      if (contentElement) return contentElement;
    }

    return roleElement || (container.matches?.('article') ? container : null);
  }

  getContentElements(container, roleElements) {
    const contentElements = [];

    roleElements.forEach((roleElement) => {
      const contentElement = this.getContentElement(roleElement, roleElement);
      if (contentElement) contentElements.push(contentElement);
    });

    if (contentElements.length > 0) return contentElements;

    const fallback = this.getContentElement(container, roleElements[0]);
    return fallback ? [fallback] : [];
  }

  cleanContent(content) {
    return content
      .replace(/^Show moreShow less$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  getMessageKey(container, roleElement, role, content) {
    const idElement =
      roleElement?.closest?.('[data-message-id]') || container.querySelector?.('[data-message-id]');
    const messageId = idElement?.getAttribute('data-message-id');
    if (messageId) return messageId;

    const containerId = container.getAttribute?.('id');
    if (containerId) return `${containerId}:${role}`;

    const turnId = container.getAttribute?.('data-testid');
    if (turnId) return `${turnId}:${role}`;

    return `${role}:${content.replace(/\s+/g, ' ').trim()}`;
  }

  extractAttachments(container) {
    const attachments = [];
    const rawContent = container.textContent || container.innerText || '';
    const filePatterns = [
      /([a-zA-Z0-9_-]+\.tex)/g,
      /([a-zA-Z0-9_-]+\.txt)/g,
      /([a-zA-Z0-9_-]+\.md)/g,
      /([a-zA-Z0-9_-]+\.pdf)/g,
      /([a-zA-Z0-9_-]+\.doc)/g,
    ];
    const foundFiles = new Set();

    filePatterns.forEach((pattern) => {
      const matches = rawContent.match(pattern);
      if (matches) matches.forEach((match) => foundFiles.add(match));
    });

    foundFiles.forEach((fileName) => {
      const fileExt = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();
      const typeMap = {
        tex: 'LaTeX',
        txt: 'Text',
        md: 'Markdown',
        pdf: 'PDF',
        doc: 'Document',
        docx: 'Document',
      };
      attachments.push({ name: fileName, type: typeMap[fileExt] || 'File' });
    });

    return attachments;
  }

  extractImages(container) {
    const seenSrcs = new Set();
    const capturedImages = [];

    container.querySelectorAll?.('img').forEach((img) => {
      const src = img.getAttribute('src');
      const alt = img.getAttribute('alt') || 'Image';
      const isContentImage =
        src?.includes('backend-api') ||
        src?.includes('files') ||
        src?.startsWith('blob:') ||
        alt.includes('Uploaded') ||
        alt.includes('Generated');

      if (src && !seenSrcs.has(src) && isContentImage) {
        seenSrcs.add(src);
        capturedImages.push(`![${alt}](${src})`);
      }
    });

    return capturedImages;
  }

  appendAttachments(content, attachments, capturedImages) {
    const attachmentLines = [];
    const groupedAttachments = {};

    attachments.forEach((attachment) => {
      groupedAttachments[attachment.type] ||= [];
      groupedAttachments[attachment.type].push(attachment.name);
    });

    Object.entries(groupedAttachments).forEach(([type, files]) => {
      attachmentLines.push(`**${type} Files:**`);
      files.forEach((file) => attachmentLines.push(`- ${file}`));
      attachmentLines.push('');
    });

    if (capturedImages.length > 0) {
      if (attachmentLines.length > 0) attachmentLines.push('');
      attachmentLines.push('**Images:**');
      capturedImages.forEach((image) => attachmentLines.push(`- ${image}`));
    }

    if (attachmentLines.length === 0) return content;
    return `${content}\n\n**Attachments & Images:**\n${attachmentLines.join('\n')}`;
  }

  convertContentElement(contentElement) {
    return convertToMarkdown(contentElement);
  }

  extractMessage(container) {
    const roleElements = this.getRoleElements(container);
    const roleElement = roleElements[0] || this.getRoleElement(container);
    const contentElements = this.getContentElements(container, roleElements);
    if (contentElements.length === 0) return null;

    const role = this.getMessageRole(container, roleElement);
    const noiseSelectors = [
      '.flex.gap-2:not(.caption-panel):not(.caption-panel *)',
      'button',
      '.sr-only',
      '[role="button"]',
      '.control-panel',
      '[data-input-selector-group]',
      '[data-input-selector-variable]',
      '[role="slider"]',
      '.AxvpHG_visualizationLayer',
      '[data-message-attribution]',
    ];
    const contentParts = contentElements
      .map((contentElement) => {
        const clone = contentElement.cloneNode(true);
        clone.querySelectorAll('button').forEach((button) => {
          const img = button.querySelector('img');
          if (!img) return;

          let caption = 'Image';
          const ariaLabel = button.getAttribute('aria-label') || '';
          if (ariaLabel.toLowerCase().includes('open image details for')) {
            caption = ariaLabel.replace(/^Open image details for\s*/i, '').trim();
          } else if (img.getAttribute('alt') && !img.getAttribute('alt').startsWith('http')) {
            caption = img.getAttribute('alt').trim();
          }

          const alt = img.getAttribute('alt') || '';
          const src = img.getAttribute('src') || '';
          const imageUrl = alt.startsWith('http://') || alt.startsWith('https://') ? alt : src;

          if (imageUrl) {
            const newImg = clone.ownerDocument.createElement('img');
            newImg.setAttribute('src', imageUrl);
            newImg.setAttribute('alt', caption);
            button.parentNode.replaceChild(newImg, button);
          }
        });

        clone
          .querySelectorAll('[data-testid="webpage-citation-pill"], [data-testid*="citation-pill"]')
          .forEach((pill) => {
            pill.querySelectorAll('img').forEach((img) => img.remove());
            pill.querySelectorAll('span').forEach((span) => {
              if (/^\+\d+$/.test(span.textContent.trim())) {
                span.remove();
              }
            });
          });

        noiseSelectors.forEach((selector) => {
          clone.querySelectorAll(selector).forEach((node) => node.remove());
        });
        return this.cleanContent(this.convertContentElement(clone));
      })
      .filter(Boolean);

    let content = contentParts.join('\n\n');
    content = this.appendAttachments(
      content,
      this.extractAttachments(container),
      this.extractImages(container),
    );

    if (!content) return null;

    return {
      role,
      content,
      key: this.getMessageKey(container, roleElement, role, content),
    };
  }

  extractMountedMessages() {
    const turns = getConversationTurns(document);
    const containers =
      turns.length > 0
        ? turns
        : Array.from(
            document.querySelectorAll('article, [data-message-author-role], [data-message-role]'),
          ).filter((el) => !el.matches?.('[data-conversation-recovery]'));

    return containers
      .map((container) => this.extractMessage(container))
      .filter(Boolean)
      .map(({ role, content }) => ({ role, content }));
  }

  async extractAllConversationTurns() {
    const turns = getConversationTurns(document);
    if (turns.length === 0) return [];

    return collectMountedTurnMessages({
      turns,
      scrollRoot: findChatGPTScrollRoot(turns, document),
      extractMessage: (turn) => this.extractMessage(turn),
    });
  }

  formatApiResult(convoData, apiMessages, fallbackTitle, images = {}, method = 'API') {
    const messages = [];
    for (const msg of apiMessages) {
      let content = '';
      let thinking = '';
      for (const seg of msg.segments) {
        if (seg.type === 'text') {
          content += cleanMarkdownFromApi(seg.content, msg.citeMap, msg.imageGroupMap) + '\n\n';
        } else if (seg.type === 'thought') {
          const thoughtText = cleanMarkdownFromApi(seg.content, msg.citeMap, msg.imageGroupMap);
          if (thoughtText) {
            thinking += (thinking ? '\n\n' : '') + thoughtText;
          }
        } else if (seg.type === 'image') {
          const src = images[seg.fileId];
          if (src) {
            content += `![Image](${src})\n\n`;
          }
        }
      }
      let fullContent = '';
      if (thinking) {
        fullContent += `<think>\n${thinking}\n</think>\n\n`;
      }
      if (content.trim()) {
        fullContent += content.trim();
      }
      fullContent = fullContent.trim();
      if (fullContent) {
        const msgObj = {
          role: msg.role,
          content: fullContent,
        };
        if (thinking) {
          msgObj.thinking = thinking;
        }
        if (msg.timestamp) {
          msgObj.timestamp = msg.timestamp;
        }
        messages.push(msgObj);
      }
    }

    const currentUrl =
      typeof window !== 'undefined' && window.location ? window.location.href || '' : '';
    const convTitle = convoData?.title || fallbackTitle;
    const metadata = {
      Source: 'ChatGPT',
      Date: new Date().toLocaleString(),
      Link: currentUrl,
      Model:
        convoData?.model_slug ||
        convoData?.default_model_slug ||
        (typeof document !== 'undefined' && document.querySelector
          ? document.querySelector('[data-testid="model-selector-dropdown"]')?.innerText
          : null) ||
        'ChatGPT',
      Method: method,
    };

    return { title: convTitle, messages, url: currentUrl, metadata };
  }

  async parse(options = {}) {
    const title = document.title || 'ChatGPT Session';
    const messages = [];

    const token = getAccessToken();
    const convId = getConversationId();
    const parserMode = options.parserMode || 'auto';
    const includeImages = options.includeImages !== false;

    // 1. If on shared chat URL (/share/...) or SSR conversation data exists in DOM, try SSR data first
    const isShareUrl =
      typeof window !== 'undefined' &&
      window.location &&
      (window.location.pathname || '').startsWith('/share/');
    const sharedData = extractSharedConversationFromDom(
      typeof document !== 'undefined' ? document : null,
    );

    if (isShareUrl && sharedData?.mapping && parserMode !== 'prefer_dom') {
      const apiMessages = linearize(sharedData.mapping, includeImages, sharedData.current_node);
      if (apiMessages.length > 0) {
        return this.formatApiResult(sharedData, apiMessages, title, {}, 'SSR');
      }
    }

    // 2. Try fetching from ChatGPT backend API
    if (token && convId && parserMode !== 'prefer_dom') {
      try {
        const now = Date.now();
        let result;

        if (
          this.lastFetch &&
          this.lastFetch.convId === convId &&
          this.lastFetch.includeImages === includeImages &&
          now - this.lastFetch.timestamp < 20000
        ) {
          result = this.lastFetch.result;
        } else {
          if (!document.getElementById('ai-export-chatgpt-helper')) {
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('content/chatgpt_helper.js');
            script.id = 'ai-export-chatgpt-helper';
            script.onload = function () {
              this.remove();
            };
            (document.head || document.documentElement).appendChild(script);
            await new Promise((r) => setTimeout(r, 100));
          }

          result = await fetchConversation(convId, token, includeImages);
          this.lastFetch = {
            convId,
            includeImages,
            timestamp: now,
            result,
          };
        }

        // The backend returns either the legacy `mapping` tree or the newer
        // `messages` array shape — support both.
        let apiMessages = [];
        if (result.data.mapping) {
          apiMessages = linearize(result.data.mapping, includeImages, result.data.current_node);
        }
        if (apiMessages.length === 0 && Array.isArray(result.data.messages)) {
          apiMessages = linearizeMessagesArray(result.data.messages, includeImages);
        }
        if (apiMessages.length > 0) {
          return this.formatApiResult(result.data, apiMessages, title, result.images, 'API');
        }
      } catch (e) {
        console.error('[AI Exporter] API parse failed, falling back to SSR/DOM:', e);
      }
    }

    // 3. If API failed or was not available, check if SSR shared/embedded conversation data exists
    if (sharedData?.mapping && parserMode !== 'prefer_dom') {
      const apiMessages = linearize(sharedData.mapping, includeImages, sharedData.current_node);
      if (apiMessages.length > 0) {
        return this.formatApiResult(sharedData, apiMessages, title, {}, 'SSR');
      }
    }

    // Check if we have iframe-based content (deep research feature)
    const iframes = document.querySelectorAll('iframe[src*="oaiusercontent.com"]');
    if (iframes.length > 0) {
      console.log('Detected iframe-based content, attempting extraction...');

      // Try multiple strategies to extract content
      let extractedContent = '';

      // Strategy 1: Look for data in script tags or window objects
      try {
        // Check if any conversation data is exposed globally
        if (window.conversationData || window.chatData) {
          extractedContent = JSON.stringify(window.conversationData || window.chatData);
        }
      } catch (e) {
        console.log('Global data access failed:', e);
      }

      // Strategy 2: Look for preloaded content in hidden elements
      if (!extractedContent) {
        const hiddenSelectors = [
          '[data-conversation]',
          '[data-messages]',
          '.conversation-data',
          '.chat-transcript',
          'pre[data-conversation]',
        ];

        for (const selector of hiddenSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent) {
            extractedContent = element.textContent;
            break;
          }
        }
      }

      // Strategy 3: Enhanced text extraction from main content
      if (!extractedContent) {
        const mainContent =
          document.querySelector('main') ||
          document.querySelector('[role="main"]') ||
          document.querySelector('.conversation') ||
          document.body;

        if (mainContent) {
          const textContent = mainContent.textContent || mainContent.innerText;
          if (textContent && textContent.trim()) {
            const lines = textContent.split('\n').filter((line) => line.trim());

            // Look for conversation patterns
            const conversationLines = lines.filter(
              (line) =>
                line.length > 20 && // Substantial content
                !line.includes('ChatGPT') &&
                !line.includes('Regenerate') &&
                !line.includes('Copy code') &&
                !line.includes('Continue') &&
                !line.includes('Share') &&
                !line.includes('Thumb') &&
                !line.includes('New chat') &&
                !line.includes('Menu') &&
                !line.includes('Settings') &&
                !line.includes('History'),
            );

            if (conversationLines.length > 0) {
              extractedContent = conversationLines.join('\n\n');
            }
          }
        }
      }

      // Strategy 4: Last resort - check for any meaningful content
      if (!extractedContent) {
        const allText = document.body.textContent || document.body.innerText;
        if (allText && allText.trim().length > 100) {
          extractedContent = allText.trim();
        }
      }

      // If we found content, try to structure it
      if (extractedContent) {
        // Try to identify user vs assistant messages
        const lines = extractedContent.split('\n').filter((line) => line.trim());

        lines.forEach((line) => {
          if (line.length > 10) {
            // Simple heuristic: shorter lines are often user prompts
            if (
              line.length < 200 ||
              line.includes('?') ||
              line.includes('write') ||
              line.includes('tell')
            ) {
              messages.push({
                role: 'User',
                content: line.trim(),
              });
            } else {
              messages.push({
                role: 'ChatGPT',
                content: line.trim(),
              });
            }
          }
        });
      }

      // Add note about extraction method
      if (messages.length > 0) {
        messages.push({
          role: 'ChatGPT',
          content:
            '*Note: Content extracted from iframe-based ChatGPT interface. Some formatting may be lost.*',
        });
      } else {
        // Last resort - add a message explaining the limitation
        messages.push({
          role: 'ChatGPT',
          content:
            '*Note: ChatGPT is using iframe-based content that cannot be accessed by browser extensions. Please try exporting from a standard ChatGPT conversation.*',
        });
      }

      const currentUrl =
        typeof window !== 'undefined' && window.location ? window.location.href || '' : '';
      const metadata = {
        Source: 'ChatGPT',
        Date: new Date().toLocaleString(),
        Link: currentUrl,
        Method: 'DOM',
      };

      return { title, messages, url: currentUrl, metadata };
    }

    const fullExport = options.full !== false;
    const extractedMessages = fullExport
      ? await this.extractAllConversationTurns()
      : this.extractMountedMessages();
    messages.push(
      ...(extractedMessages.length > 0 ? extractedMessages : this.extractMountedMessages()),
    );

    const currentUrl =
      typeof window !== 'undefined' && window.location ? window.location.href || '' : '';
    const metadata = {
      Source: 'ChatGPT',
      Date: new Date().toLocaleString(),
      Link: currentUrl,
      Model:
        document.querySelector('[data-testid="model-selector-dropdown"]')?.innerText || 'ChatGPT',
      Method: 'DOM',
    };

    return { title, messages, url: currentUrl, metadata };
  }
}
