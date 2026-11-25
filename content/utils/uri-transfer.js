/**
 * Utility for building URI schemes for PKM & Note-taking apps
 * Supports Obsidian, Logseq, Bear, NotePlan, and Drafts
 */

export function cleanUriTitle(title) {
  if (!title) return 'AI Conversation';
  // Remove Obsidian/Markdown reserved characters (# | ^ [ ]) and OS invalid characters (/ \ : * ? " < > |)
  const cleaned = title
    .replace(/[#|^[\]]/g, '')
    .replace(/[/\\?%*:|"<>]/g, '')
    .trim()
    .slice(0, 245);
  return cleaned || 'AI Conversation';
}

export function cleanObsidianTitle(title) {
  return cleanUriTitle(title);
}

function serializeUriParams(entries) {
  return entries
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

export function buildObsidianUri({ title, content, vault, useClipboard = false }) {
  const cleanTitle = cleanUriTitle(title);
  const entries = [['name', cleanTitle]];

  if (vault && vault.trim().length > 0) {
    entries.push(['vault', vault.trim()]);
  }

  if (useClipboard) {
    entries.push(['clipboard', 'true']);
  } else if (content) {
    entries.push(['content', content]);
  }

  return `obsidian://new?${serializeUriParams(entries)}`;
}

export function buildLogseqUri({ title, content }) {
  const cleanTitle = cleanUriTitle(title);
  return `logseq://x-callback-url/quickCapture?${serializeUriParams([
    ['page', cleanTitle],
    ['content', content],
  ])}`;
}

export function buildBearUri({ title, content }) {
  const cleanTitle = cleanUriTitle(title);
  return `bear://x-callback-url/create?${serializeUriParams([
    ['title', cleanTitle],
    ['text', content],
  ])}`;
}

export function buildNotePlanUri({ title, content }) {
  const cleanTitle = cleanUriTitle(title);
  return `noteplan://x-callback-url/addText?${serializeUriParams([
    ['noteTitle', cleanTitle],
    ['text', content],
  ])}`;
}

export function buildDraftsUri({ title, content }) {
  const cleanTitle = cleanUriTitle(title);
  const fullText = title ? `# ${cleanTitle}\n\n${content || ''}` : content || '';
  return `drafts://x-callback-url/create?${serializeUriParams([['text', fullText]])}`;
}

export function buildAppUri(target, { title, content, vault }) {
  switch (target) {
    case 'obsidian':
      return buildObsidianUri({ title, content, vault });
    case 'logseq':
      return buildLogseqUri({ title, content });
    case 'bear':
      return buildBearUri({ title, content });
    case 'noteplan':
      return buildNotePlanUri({ title, content });
    case 'drafts':
      return buildDraftsUri({ title, content });
    default:
      return null;
  }
}
