import JSZip from 'jszip';
import { isAiChatUrl } from 'decant-core';
import { createLogger } from './logger.js';

const logger = createLogger('BatchExporter');

export const RESTRICTED_SCHEMES = [
  'chrome://',
  'edge://',
  'about:',
  'chrome-extension://',
  'moz-extension://',
  'view-source:',
  'javascript:',
  'data:',
  'devtools://',
];

export const RESTRICTED_HOSTS = ['chromewebstore.google.com', 'addons.mozilla.org'];

/**
 * Checks if a tab URL is a valid extractable page (optionally filtering for AI chat URLs).
 * @param {{ url?: string, discarded?: boolean }} tab
 * @param {boolean} [aiOnly=false]
 * @returns {boolean}
 */
export function isExtractableTab(tab, aiOnly = false) {
  if (!tab || !tab.url || typeof tab.url !== 'string') return false;
  if (tab.discarded) return false;
  const url = tab.url.trim();
  if (RESTRICTED_SCHEMES.some((scheme) => url.startsWith(scheme))) {
    return false;
  }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    if (RESTRICTED_HOSTS.includes(parsed.hostname.toLowerCase())) {
      return false;
    }
  } catch {
    return false;
  }

  if (aiOnly) {
    return isAiChatUrl(url);
  }
  return true;
}

/**
 * Ensures all results have unique filenames by appending index numbers to duplicates.
 * @param {Array<{ filename?: string, baseFilename?: string, [key: string]: any }>} results
 * @returns {Array<{ filename: string, [key: string]: any }>}
 */
export function deduplicateFilenames(results) {
  const used = new Set();
  return results.map((item, index) => {
    let name = item.filename || `${item.baseFilename || `chat-${index + 1}`}.md`;
    if (!name.endsWith('.md')) {
      name = `${name}.md`;
    }

    const base = name.slice(0, -3);
    let counter = 0;
    while (used.has(name)) {
      counter++;
      name = `${base}-${counter}.md`;
    }
    used.add(name);

    return {
      ...item,
      filename: name,
    };
  });
}

/**
 * Builds a ZIP archive as a Blob or base64 Data URL.
 * @param {Array<{ filename: string, content: string }>} results
 * @returns {Promise<Blob|string>}
 */
export async function generateZipArchive(results) {
  const zip = new JSZip();
  const deduped = deduplicateFilenames(results);

  for (const item of deduped) {
    zip.file(item.filename, item.content || item.markdown || '');
  }

  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    return await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
  }

  const base64 = await zip.generateAsync({
    type: 'base64',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return `data:application/zip;base64,${base64}`;
}

/**
 * Generates a combined Markdown document with a Table of Contents.
 * @param {Array<{ title: string, content?: string, markdown?: string, url?: string }>} results
 * @param {string} [dateStr]
 * @returns {string}
 */
export function formatCombinedMarkdown(results, dateStr = new Date().toISOString().split('T')[0]) {
  if (!results || results.length === 0) return '';

  const toc = results
    .map((r, i) => `${i + 1}. [${r.title || `Chat ${i + 1}`}](#chat-${i + 1})`)
    .join('\n');

  const sections = results
    .map((r, i) => {
      const anchor = `<a id="chat-${i + 1}"></a>`;
      let text = r.content || r.markdown || '';
      const prefix = `c${i + 1}-`;

      // Namespace only image reference links emitted for base64 images:
      // First find all image reference labels actually used: ![alt][label]
      const imgLabels = new Set();
      text = text.replace(/!\[([^\]]*)\]\[([^\]]+)\]/g, (match, alt, label) => {
        imgLabels.add(label);
        return `![${alt}][${prefix}${label}]`;
      });

      // Rewrite only matching definitions for those image labels
      if (imgLabels.size > 0) {
        text = text.replace(/^\[([^\]]+)\]:\s*(\S.*)$/gm, (match, label, target) => {
          return imgLabels.has(label) ? `[${prefix}${label}]: ${target}` : match;
        });
      }

      return `${anchor}\n\n${text}`;
    })
    .join('\n\n---\n\n');

  return `---
title: Exported AI Chats (${dateStr})
date: ${dateStr}
total_chats: ${results.length}
generator: AI Chat Exporter
---

# Exported AI Chats (${dateStr})

## Table of Contents

${toc}

---

${sections}
`;
}

/**
 * Formats multiple chat tabs into a structured prompt suitable for cross-analysis by an LLM.
 * @param {Array<{ title: string, content?: string, markdown?: string, url?: string }>} results
 * @param {string} [customInstruction]
 * @returns {string}
 */
export function buildBatchAiPrompt(results, customInstruction = '') {
  if (!results || results.length === 0) return '';
  const instruction =
    customInstruction && customInstruction.trim().length > 0
      ? customInstruction.trim()
      : 'Please analyze and synthesize the web pages / discussions across the following AI chat conversations. Highlight key insights, agreements, and discrepancies:';

  const formattedChats = results
    .map((item, index) => {
      const title = item.title || `Conversation ${index + 1}`;
      const url = item.url ? `Source: ${item.url}\n` : '';
      const text = item.content || item.markdown || '';
      return `### Conversation ${index + 1}: ${title}\n${url}\n${text}`;
    })
    .join('\n\n---\n\n');

  return `${instruction}\n\n---\n\n${formattedChats}`;
}

async function sendMessageToTab(tabId, message, maxRetries = 2, retryDelay = 100) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, { frameId: 0 }, (response) => {
        if (chrome.runtime?.lastError) {
          chrome.tabs.sendMessage(tabId, message, (fallbackRes) => {
            if (chrome.runtime?.lastError) {
              resolve(null);
            } else {
              resolve(fallbackRes);
            }
          });
        } else {
          resolve(response);
        }
      });
    });
    if (res) return res;
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
  return null;
}

/**
 * Downloads a file or triggers Save As in Chrome/Firefox extension.
 * @param {string|Blob} content
 * @param {string} filename
 * @param {string} [mimeType='text/markdown']
 */
export async function downloadFile(content, filename, mimeType = 'text/markdown') {
  let downloadUrl;
  let isObjectUrl = false;

  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
      downloadUrl = URL.createObjectURL(blob);
      isObjectUrl = true;
    } catch {
      // Fallback
    }
  }

  if (!downloadUrl) {
    if (typeof content === 'string' && content.startsWith('data:')) {
      downloadUrl = content;
    } else {
      downloadUrl = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
    }
  }

  let downloadId = null;
  if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
    downloadId = await chrome.downloads.download({
      url: downloadUrl,
      filename,
      saveAs: false,
    });
  } else if (typeof document !== 'undefined' && document.createElement) {
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else {
    throw new Error('Downloads API and DOM are both unavailable in this context.');
  }

  if (isObjectUrl) {
    setTimeout(() => {
      try {
        URL.revokeObjectURL(downloadUrl);
      } catch (err) {
        logger.warn('Failed to revoke object URL:', err);
      }
    }, 60000);
  }

  return downloadId;
}

/**
 * Extracts all tabs without initiating downloads.
 * @param {Object} options
 * @param {number|null} [windowId=null]
 * @param {Function|null} [onProgress=null]
 * @returns {Promise<{ validTabs: any[], results: any[] }>}
 */
export async function extractAllTabsData(options = {}, windowId = null, onProgress = null) {
  const queryInfo = windowId ? { windowId } : { currentWindow: true };
  const tabs = await chrome.tabs.query(queryInfo);
  const validTabs = tabs.filter((t) => isExtractableTab(t, false));

  if (validTabs.length === 0) {
    throw new Error('No compatible tabs found in this window.');
  }

  const concurrencyLimit = 4;
  const results = new Array(validTabs.length).fill(null);
  let processed = 0;

  async function processTab(tab, tabIndex) {
    try {
      let res = await sendMessageToTab(
        tab.id,
        {
          action: 'COPY_CHAT',
          format: 'markdown',
          includeImages: options.includeImages !== false,
        },
        1,
        100,
      );

      if (!res && chrome.scripting?.executeScript) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content-scripts/content.js'],
          });
          res = await sendMessageToTab(
            tab.id,
            {
              action: 'COPY_CHAT',
              format: 'markdown',
              includeImages: options.includeImages !== false,
            },
            3,
            150,
          );
        } catch (injectErr) {
          logger.warn(`Script injection failed for tab ${tab.id}:`, injectErr);
        }
      }

      if (res && res.success && res.content) {
        const title = res.conversation?.title || tab.title || `Chat ${tab.id}`;
        results[tabIndex] = {
          title,
          content: res.content,
          markdown: res.content,
          url: tab.url,
          filename: `${
            title
              .replace(/[/\\?%*:|"<>]/g, '')
              .trim()
              .slice(0, 80) || `chat-${tab.id}`
          }.md`,
        };
      }
    } catch (err) {
      logger.warn(`Failed extracting tab ${tab.id} (${tab.title}):`, err);
    } finally {
      processed++;
      if (typeof onProgress === 'function') {
        onProgress(processed, validTabs.length, tab.title || '');
      }
    }
  }

  for (let i = 0; i < validTabs.length; i += concurrencyLimit) {
    const chunk = validTabs.slice(i, i + concurrencyLimit);
    await Promise.all(chunk.map((t, offset) => processTab(t, i + offset)));
  }

  const extractedResults = results.filter(Boolean);

  if (extractedResults.length === 0) {
    throw new Error('Could not extract conversation content from any open tabs.');
  }

  return { validTabs, results: extractedResults };
}

/**
 * Extracts and batch exports open AI chat tabs in the active window.
 * @param {Object} options
 * @param {'zip' | 'combined' | 'ai'} [mode='zip']
 * @param {number|null} [windowId=null]
 * @param {Function|null} [onProgress=null]
 * @returns {Promise<{ total: number, extracted: number, failed: number, results?: any[] }>}
 */
export async function batchExportTabs(
  options = {},
  mode = 'zip',
  windowId = null,
  onProgress = null,
) {
  const { validTabs, results } = await extractAllTabsData(options, windowId, onProgress);
  const timestamp = new Date().toISOString().split('T')[0];

  if (mode === 'zip') {
    const zipData = await generateZipArchive(results);
    await downloadFile(zipData, `ai-chats-${timestamp}.zip`, 'application/zip');
  } else if (mode === 'combined') {
    const combinedDoc = formatCombinedMarkdown(results, timestamp);
    await downloadFile(combinedDoc, `ai-all-chats-${timestamp}.md`, 'text/markdown');
  }

  return {
    total: validTabs.length,
    extracted: results.length,
    failed: validTabs.length - results.length,
    results,
  };
}
