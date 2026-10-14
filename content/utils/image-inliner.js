/**
 * Image Inliner Utility
 * Fetches authenticated or transient conversation images and converts them
 * into self-contained base64 data URIs so exports (Word .doc, HTML) render
 * reliably offline and outside the AI platform session.
 */

/**
 * Converts a Blob to a base64 Data URI.
 * @param {Blob} blob
 * @returns {Promise<string|null>}
 */
export async function blobToDataUri(blob) {
  if (!blob) return null;

  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Node environment fallback for testing
  if (typeof blob.arrayBuffer === 'function') {
    const buffer = Buffer.from(await blob.arrayBuffer());
    const mimeType = blob.type || 'image/png';
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  }

  return null;
}

/**
 * Fetches an image URL and returns it as a base64 Data URI.
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<string|null>}
 */
export async function fetchUrlAsDataUri(url, timeoutMs = 4000) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('data:image')) return trimmed;

  // Only attempt http, https, blob, or relative /api/... URLs
  if (!/^(?:https?:|blob:|\/|\.\/)/i.test(trimmed)) {
    return null;
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetch(trimmed, {
      credentials: 'include',
      signal: controller ? controller.signal : undefined,
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.startsWith('image/')) {
      return null;
    }

    const blob = await response.blob();
    if (blob && blob.type && !blob.type.startsWith('image/')) {
      return null;
    }

    return await blobToDataUri(blob);
  } catch {
    // Graceful fallback: return null so caller keeps original URL
    return null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Replaces remote/blob image URLs within markdown or HTML content with base64 Data URIs.
 * @param {string} content
 * @param {Function} fetcher
 * @returns {Promise<string>}
 */
export async function inlineImagesInContent(content, fetcher = fetchUrlAsDataUri) {
  if (!content || typeof content !== 'string') return content;

  const urlSet = new Set();

  // 1. Markdown images: ![alt](url)
  const mdImageRegex = /!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
  let match;
  while ((match = mdImageRegex.exec(content)) !== null) {
    const url = match[2];
    if (url && !url.startsWith('data:image')) {
      urlSet.add(url);
    }
  }

  // 2. HTML <img> tags: <img ... src="url" ...> (requires whitespace before src to avoid matching data-src)
  const htmlImgRegex = /<img\b[^>]*?\s+src=["']([^"']+)["'][^>]*>/gi;
  while ((match = htmlImgRegex.exec(content)) !== null) {
    const url = match[1];
    if (url && !url.startsWith('data:image')) {
      urlSet.add(url);
    }
  }

  if (urlSet.size === 0) return content;

  const urls = Array.from(urlSet);
  const dataUris = await Promise.all(
    urls.map(async (url) => {
      try {
        const dataUri = await fetcher(url);
        return { url, dataUri };
      } catch {
        return { url, dataUri: null };
      }
    }),
  );

  const urlMap = new Map();
  for (const { url, dataUri } of dataUris) {
    if (dataUri) {
      urlMap.set(url, dataUri);
    }
  }

  if (urlMap.size === 0) return content;

  // 1. Replace markdown images: ![alt](url)
  let updated = content.replace(
    /!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?((?:\s+["'][^"']*["'])?)\s*\)/g,
    (match, alt, url, title) => {
      const dataUri = urlMap.get(url);
      if (dataUri) {
        return `![${alt}](${dataUri}${title || ''})`;
      }
      return match;
    },
  );

  // 2. Replace HTML <img> tags: <img src="url">
  updated = updated.replace(
    /(<img\b[^>]*?\s+src=["'])([^"']+)(["'][^>]*>)/gi,
    (match, prefix, src, suffix) => {
      const dataUri = urlMap.get(src);
      if (dataUri) {
        return `${prefix}${dataUri}${suffix}`;
      }
      return match;
    },
  );

  return updated;
}

/**
 * Inlines images across all messages in a conversation object.
 * @param {Object} conversation
 * @param {Function} fetcher
 * @returns {Promise<Object>}
 */
export async function inlineConversationImages(conversation, fetcher = fetchUrlAsDataUri) {
  if (!conversation || !Array.isArray(conversation.messages)) return conversation;

  await Promise.all(
    conversation.messages.map(async (msg) => {
      if (msg && msg.content) {
        msg.content = await inlineImagesInContent(msg.content, fetcher);
      }
    }),
  );

  return conversation;
}
