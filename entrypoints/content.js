import {
  ChatGPTParser,
  GeminiParser,
  ClaudeParser,
  QwenParser,
  PerplexityParser,
  DeepSeekParser,
  MetaParser,
  MistralParser,
  GoogleSearchAIParser,
  ZAiParser,
  GeminiCloudAssistParser,
  GoogleAIStudioParser,
  NotebookLMParser,
  CopilotParser,
  LumoParser,
  JoylandParser,
  ChubParser,
  ArticleParser,
} from 'decant-core';

import { MarkdownFormatter } from '../content/formatters/markdown.js';
import { JsonFormatter } from '../content/formatters/json.js';
import { HtmlFormatter } from '../content/formatters/html.js';
import { ImageFormatter } from '../content/formatters/image.js';
import { ContinuationFormatter } from '../content/formatters/continuation.js';
import { DocFormatter } from '../content/formatters/doc.js';
import {
  formatFilename,
  resolveConversationTitle,
  DEFAULT_FILENAME_TEMPLATE,
} from '../content/utils/filename.js';
import { stripImages } from '../content/utils/strip-images.js';
import { createLogger } from '../content/utils/logger.js';
import { getAttributionSetting } from '../content/utils/preferences.js';
import { pollTransferInject } from '../content/transfer/injector.js';
import { getTransferTarget } from '../content/transfer/targets.js';
import {
  loadTransferRecord,
  loadTransferRecordByKey,
  clearTransferRecord,
} from '../content/transfer/records.js';

const logger = createLogger('ContentScript');

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  main() {
    const isTopFrame = typeof window === 'undefined' || window.self === window.top;
    logger.debug(`Script initialized on: ${window.location.href} (isTopFrame: ${isTopFrame})`);

    const continuationFormatter = new ContinuationFormatter();

    function enrichConversation(conversation) {
      if (!conversation) return conversation;
      const platformName =
        typeof activeParser?.getPlatformName === 'function'
          ? activeParser.getPlatformName()
          : activeParser?.name || activeParser?.constructor?.name?.replace('Parser', '') || 'AI';
      conversation.title = resolveConversationTitle(
        conversation.title,
        platformName,
        typeof document !== 'undefined' ? document : null,
      );
      return conversation;
    }

    let transferInjectRunning = false;

    function transferInjectEnv() {
      return {
        document,
        isTopFrame: typeof window === 'undefined' || window.self === window.top,
        clipboardWrite: async (text) => {
          const ok = await copyToClipboard(text);
          if (!ok) throw new Error('clipboard write failed');
        },
      };
    }

    async function runTransferInject(exactKey) {
      if (transferInjectRunning) return;
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
      // Top frame only: iframes must never consume the payload.
      if (typeof window !== 'undefined' && window.self !== window.top) return;

      // Acquire before any await: the background nudge can otherwise overlap the
      // document_idle pickup and inject the same prompt twice.
      transferInjectRunning = true;
      try {
        let loaded;
        try {
          loaded = exactKey
            ? await loadTransferRecordByKey(
                chrome.storage.local,
                exactKey,
                window.location,
                Date.now(),
              )
            : await loadTransferRecord(chrome.storage.local, window.location, Date.now());
        } catch (e) {
          logger.warn('Continuation injection read failed:', e);
          return;
        }
        // No record for this page (wrong site, expired, or already consumed).
        if (!loaded) return;
        const { keys, record: data, payload } = loaded;

        const target = getTransferTarget(data.targetPlatform);
        const label = target?.label || data.targetPlatform || 'target chat';
        // Login-walled targets (Meta AI) get prefill only — never auto-send.
        const autoSend = data.autoSend !== false && target?.requiresAuth !== true;
        const result = await pollTransferInject(
          transferInjectEnv(),
          {
            payload,
            targetPlatform: data.targetPlatform,
            autoSend,
          },
          {
            onAttempt: (r, n) => logger.debug(`Transfer inject attempt ${n}:`, r.reason),
          },
        );

        if (result.ok) {
          let msg = `✅ Prompt placed on ${label} — review & send`;
          if (result.autoSent) msg = `✅ Prompt placed and sent on ${label}`;
          else if (target?.requiresAuth) msg = `✅ Prompt placed on ${label} — sign in to send`;
          else if (data.truncated)
            msg = `✅ Prompt placed on ${label} (truncated — too large to transfer in full)`;
          else if (result.autoSendSkipped === 'send-unconfirmed')
            msg = `✅ Prompt placed on ${label} — if it didn't send, press Enter`;
          await clearTransferRecord(chrome.storage.local, keys);
          showExporterToast(msg, 'success');
          logger.info('Auto-injected transferred conversation context.');
        } else {
          const hint =
            result.reason === 'blocked'
              ? `dismiss any pop-up on ${label}, then press Ctrl+V`
              : `press Ctrl+V in the ${label} chat box`;
          await clearTransferRecord(chrome.storage.local, keys);
          showExporterToast(`⚠️ Couldn't auto-fill ${label} — prompt copied, ${hint}`, 'error');
          logger.warn('Transfer inject failed:', result);
        }
      } finally {
        transferInjectRunning = false;
      }
    }

    async function checkAndInjectContinuation() {
      try {
        await runTransferInject();
      } catch (e) {
        logger.warn('Continuation injection check failed:', e);
      }
    }

    const parsers = [
      new ChatGPTParser(),
      new GeminiParser(),
      new ClaudeParser(),
      new QwenParser(),
      new PerplexityParser(),
      new DeepSeekParser(),
      new MetaParser(),
      new MistralParser(),
      new GoogleSearchAIParser(),
      new ZAiParser(),
      new GeminiCloudAssistParser(),
      new GoogleAIStudioParser(),
      new NotebookLMParser(),
      new CopilotParser(),
      new LumoParser(),
      new JoylandParser(),
      new ChubParser(),
      new ArticleParser(),
    ];

    const formatters = {
      markdown: new MarkdownFormatter(),
      json: new JsonFormatter(),
      html: new HtmlFormatter(),
      png: new ImageFormatter(),
      doc: new DocFormatter(),
    };

    async function ensureHtml2CanvasLoaded() {
      if (typeof window !== 'undefined' && window.html2canvas) return;
      try {
        const scriptUrl = chrome.runtime.getURL('content/lib/html2canvas.min.js');
        await import(scriptUrl);
      } catch (e) {
        console.warn(
          '[AI Exporter ContentScript] Dynamic import of html2canvas failed, attempting script injection:',
          e,
        );
        return new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = chrome.runtime.getURL('content/lib/html2canvas.min.js');
          s.onload = resolve;
          s.onerror = reject;
          (document.head || document.documentElement).appendChild(s);
        });
      }
    }

    let activeParser = null;

    function detectParser() {
      const currentUrl = window.location.href;
      logger.debug('Detecting parser for URL:', currentUrl);
      const isTop = typeof window === 'undefined' || window.self === window.top;
      activeParser = parsers.find((p) => {
        if (!isTop && (p.name === 'WebArticle' || p.constructor?.name === 'ArticleParser')) {
          return false;
        }
        return p.isAvailable(currentUrl);
      });
      if (activeParser) {
        const platformName =
          typeof activeParser.getPlatformName === 'function'
            ? activeParser.getPlatformName()
            : activeParser.name || activeParser.constructor.name.replace('Parser', '');
        logger.debug('Matched active parser:', platformName);
      } else {
        logger.debug('No parser matched for URL:', currentUrl);
      }
    }

    const PARSE_CACHE_TTL_MS = 90 * 1000;
    let parseCache = null;
    let isPopupOpen = false;
    let domObserver = null;
    let mutationDebounceTimer = null;

    if (typeof chrome !== 'undefined' && chrome.runtime?.onConnect) {
      chrome.runtime.onConnect.addListener((port) => {
        if (port && port.name === 'popup-tab-session') {
          isPopupOpen = true;
          port.onDisconnect.addListener(() => {
            isPopupOpen = false;
          });
        }
      });
    }

    function isCacheValid(requestedMode) {
      if (!parseCache || parseCache.dirty || !parseCache.report) return false;
      if (parseCache.url !== window.location.href) return false;
      if (requestedMode && parseCache.parserMode && parseCache.parserMode !== requestedMode) {
        return false;
      }
      const age = Date.now() - parseCache.timestamp;
      return age < PARSE_CACHE_TTL_MS;
    }

    function setupDomObserver() {
      if (
        typeof MutationObserver === 'undefined' ||
        typeof document === 'undefined' ||
        !document.body
      ) {
        return;
      }
      if (domObserver) return;

      function isToastNode(node) {
        if (!node) return false;
        if (node.nodeType === 1) {
          return (
            node.id === 'ai-chat-exporter-toast' ||
            Boolean(node.closest?.('#ai-chat-exporter-toast'))
          );
        }
        return Boolean(node.parentElement?.closest?.('#ai-chat-exporter-toast'));
      }

      domObserver = new MutationObserver((mutations) => {
        let hasRelevantMutation = false;
        for (const m of mutations) {
          if (m.type === 'characterData') {
            if (!isToastNode(m.target)) {
              hasRelevantMutation = true;
              break;
            }
          } else if (m.type === 'childList') {
            const nodes = [...(m.addedNodes || []), ...(m.removedNodes || [])];
            for (const node of nodes) {
              if (!isToastNode(node)) {
                hasRelevantMutation = true;
                break;
              }
            }
            if (hasRelevantMutation) break;
          }
        }

        if (hasRelevantMutation) {
          if (parseCache) {
            parseCache.dirty = true;
          }
          clearTimeout(mutationDebounceTimer);
          mutationDebounceTimer = setTimeout(() => {
            logger.debug('Chat DOM mutation detected and debounced');
          }, 600);
        }
      });

      try {
        domObserver.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      } catch (e) {
        logger.debug('DOM MutationObserver registration failed:', e);
      }
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        const currentFrameIsTop = typeof window === 'undefined' || window.self === window.top;
        logger.debug(
          `Message received: action=${request.action} on frame=${currentFrameIsTop ? 'TOP' : 'IFRAME'}`,
        );

        if (request.action === 'CLEAR_CACHE') {
          parseCache = null;
          sendResponse({ success: true });
          return true;
        }

        if (request.action === 'SHOW_TOAST') {
          showExporterToast(request.message, request.toastType || 'success');
          sendResponse({ success: true });
          return true;
        }

        if (request.action === 'TRY_TRANSFER_INJECT') {
          // Background nudge fired when the target tab finishes loading —
          // retries injection for late-hydrating SPA composers. The nudge
          // carries the exact record key so same-target concurrent transfers
          // can never pick each other's payload.
          runTransferInject(request.key).then(
            () => sendResponse({ acknowledged: true }),
            (e) => sendResponse({ acknowledged: false, error: e?.message || String(e) }),
          );
          return true;
        }

        if (request.action === 'DISCOVER_FRAMES') {
          detectParser();
          setupDomObserver();
          const queryId = request.queryId;
          const isForce = Boolean(request.force);
          const parserMode = request.parserMode || 'auto';

          if (activeParser) {
            (async () => {
              try {
                if (!isForce && isCacheValid(parserMode)) {
                  logger.debug('DISCOVER_FRAMES returning cached report');
                  chrome.runtime.sendMessage({
                    action: 'FRAME_REPORT',
                    queryId,
                    data: parseCache.report,
                  });
                  return;
                }

                const startTime = Date.now();
                const conversation = enrichConversation(
                  await activeParser.parse({ full: false, parserMode }),
                );
                const count = conversation?.messages?.length || 0;
                if (!currentFrameIsTop && count === 0) {
                  return;
                }
                const isDedicatedAi =
                  activeParser.name !== 'WebArticle' &&
                  activeParser.constructor?.name !== 'ArticleParser';
                const platformName =
                  typeof activeParser.getPlatformName === 'function'
                    ? activeParser.getPlatformName()
                    : activeParser.name || activeParser.constructor.name.replace('Parser', '');

                const reportData = {
                  available: true,
                  platform: platformName,
                  isDedicatedAi,
                  count,
                  title: conversation?.title || '',
                  isTopFrame: currentFrameIsTop,
                };

                parseCache = {
                  url: window.location.href,
                  timestamp: Date.now(),
                  parserMode,
                  report: reportData,
                  conversation,
                  dirty: false,
                };

                chrome.runtime.sendMessage({
                  action: 'FRAME_REPORT',
                  queryId,
                  data: reportData,
                });

                const elapsed = Date.now() - startTime;
                if (!isPopupOpen && currentFrameIsTop && count > 0 && elapsed > 250) {
                  const toastMsg =
                    chrome.i18n?.getMessage('toastChatReady', [platformName, String(count)]) ||
                    `⚡ ${platformName} chat ready to export (${count} messages)`;
                  showExporterToast(toastMsg);
                }
              } catch (e) {
                logger.error('Discover frames parse error:', e);
                if (currentFrameIsTop) {
                  chrome.runtime.sendMessage({
                    action: 'FRAME_REPORT',
                    queryId,
                    data: {
                      available: false,
                      platform: '',
                      isDedicatedAi: false,
                      count: 0,
                      title: '',
                      isTopFrame: true,
                    },
                  });
                }
              }
            })();
          } else if (currentFrameIsTop) {
            chrome.runtime.sendMessage({
              action: 'FRAME_REPORT',
              queryId,
              data: {
                available: false,
                platform: '',
                isDedicatedAi: false,
                count: 0,
                title: '',
                isTopFrame: true,
              },
            });
          }
          sendResponse({ acknowledged: true });
          return true;
        }

        if (request.action === 'CHECK_AVAILABILITY') {
          detectParser();
          setupDomObserver();
          const isForce = Boolean(request.force);
          const parserMode = request.parserMode || 'auto';

          if (activeParser) {
            (async () => {
              try {
                if (!isForce && isCacheValid(parserMode)) {
                  logger.debug('CHECK_AVAILABILITY returning cached report');
                  sendResponse(parseCache.report);
                  return;
                }

                const startTime = Date.now();
                logger.debug('Executing activeParser.parse({ full: false, parserMode })...');
                const conversation = enrichConversation(
                  await activeParser.parse({ full: false, parserMode }),
                );
                const count = conversation?.messages?.length || 0;
                logger.debug(
                  `Availability check parsed ${count} messages, title: "${conversation?.title || ''}"`,
                );
                if (!currentFrameIsTop && count === 0) {
                  logger.debug('Subframe has 0 messages, ignoring subframe response');
                  return;
                }
                const platformName =
                  typeof activeParser.getPlatformName === 'function'
                    ? activeParser.getPlatformName()
                    : activeParser.name || activeParser.constructor.name.replace('Parser', '');
                const responseData = {
                  available: true,
                  platform: platformName,
                  count,
                  title: conversation?.title || '',
                  isDedicatedAi:
                    activeParser.name !== 'WebArticle' &&
                    activeParser.constructor?.name !== 'ArticleParser',
                  isTopFrame: currentFrameIsTop,
                };

                parseCache = {
                  url: window.location.href,
                  timestamp: Date.now(),
                  parserMode,
                  report: responseData,
                  conversation,
                  dirty: false,
                };

                logger.debug('Sending CHECK_AVAILABILITY response:', responseData);
                sendResponse(responseData);

                const elapsed = Date.now() - startTime;
                if (!isPopupOpen && currentFrameIsTop && count > 0 && elapsed > 250) {
                  const toastMsg =
                    chrome.i18n?.getMessage('toastChatReady', [platformName, String(count)]) ||
                    `⚡ ${platformName} chat ready to export (${count} messages)`;
                  showExporterToast(toastMsg);
                }
              } catch (e) {
                logger.error('Check availability parse threw error:', e);
                if (currentFrameIsTop) {
                  const platformName =
                    typeof activeParser.getPlatformName === 'function'
                      ? activeParser.getPlatformName()
                      : activeParser.name || activeParser.constructor.name.replace('Parser', '');
                  sendResponse({
                    available: true,
                    platform: platformName,
                    count: 0,
                    title: '',
                  });
                }
              }
            })();
            return true;
          } else if (currentFrameIsTop) {
            logger.debug('No active parser on top frame, sending available: false');
            sendResponse({ available: false });
          }
        }

        if (request.action === 'EXPORT_CHAT') {
          if (!activeParser) {
            detectParser();
          }
          if (!activeParser) {
            sendResponse({ success: false, error: 'No parser available' });
            return true;
          }

          const formatter = formatters[request.format];
          if (!formatter) {
            sendResponse({ success: false, error: 'Invalid format' });
            return true;
          }

          (async () => {
            try {
              const conversation = enrichConversation(
                await activeParser.parse({
                  full: true,
                  parserMode: request.parserMode || 'auto',
                  includeImages: request.includeImages !== false,
                }),
              );
              if (
                !currentFrameIsTop &&
                (!conversation || !conversation.messages || conversation.messages.length === 0)
              ) {
                logger.debug('Subframe has 0 messages, ignoring subframe export');
                return;
              }
              if (request.includeImages === false) {
                conversation.messages.forEach((msg) => {
                  if (msg.content) {
                    msg.content = stripImages(msg.content);
                  }
                });
              }
              if (request.format === 'png') {
                await ensureHtml2CanvasLoaded();
              }
              const options = {
                highQuality: request.highQualityPng !== false,
                theme: request.theme,
                includeAttribution: await getAttributionSetting(),
              };
              const formattedResult = await formatter.format(conversation, options);
              const mimeType = formatter.getMimeType();
              const blob =
                formattedResult instanceof Blob
                  ? formattedResult
                  : new Blob(
                      formatter.getFileExtension() === 'doc'
                        ? ['\ufeff', formattedResult]
                        : [formattedResult],
                      { type: `${mimeType};charset=utf-8` },
                    );

              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;

              let downloadName;
              if (request.customFilename && request.customFilename.trim().length > 0) {
                const userCustom = request.customFilename.trim().replace(/[\\/:*?"<>|]/g, '');
                downloadName = userCustom.endsWith(`.${formatter.getFileExtension()}`)
                  ? userCustom
                  : `${userCustom}.${formatter.getFileExtension()}`;
              } else {
                let filenameTemplate = DEFAULT_FILENAME_TEMPLATE;
                try {
                  const syncData = await chrome.storage.sync.get('filenameTemplate');
                  if (syncData && syncData.filenameTemplate) {
                    filenameTemplate = syncData.filenameTemplate;
                  }
                } catch {
                  // Fallback to default
                }
                const platformName =
                  typeof activeParser.getPlatformName === 'function'
                    ? activeParser.getPlatformName()
                    : activeParser.name || activeParser.constructor.name.replace('Parser', '');
                const formattedName = formatFilename(filenameTemplate, {
                  platform: platformName,
                  title: conversation.title || 'Conversation',
                });
                downloadName = `${formattedName}.${formatter.getFileExtension()}`;
              }

              a.download = downloadName;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);

              sendResponse({ success: true });
            } catch (e) {
              logger.error('Export failed:', e);
              if (currentFrameIsTop) {
                sendResponse({ success: false, error: e.message });
              }
            }
          })();
          return true;
        }

        if (request.action === 'COPY_CHAT') {
          if (!activeParser) {
            detectParser();
          }
          if (!activeParser) {
            sendResponse({ success: false, error: 'No parser available' });
            return true;
          }

          const formatter = formatters[request.format];
          if (!formatter) {
            sendResponse({ success: false, error: 'Invalid format' });
            return true;
          }

          (async () => {
            try {
              const conversation = enrichConversation(
                await activeParser.parse({
                  full: true,
                  parserMode: request.parserMode || 'auto',
                  includeImages: request.includeImages !== false,
                }),
              );
              if (
                !currentFrameIsTop &&
                (!conversation || !conversation.messages || conversation.messages.length === 0)
              ) {
                logger.debug('Subframe has 0 messages, ignoring subframe copy');
                return;
              }
              if (request.includeImages === false) {
                conversation.messages.forEach((msg) => {
                  if (msg.content) {
                    msg.content = stripImages(msg.content);
                  }
                });
              }
              logger.debug('Parsed conversation with', conversation.messages.length, 'messages');
              const formatOptions = {
                theme: request.theme,
                includeAttribution: await getAttributionSetting(),
              };
              const primaryContent = formatter.format(conversation, formatOptions);
              const htmlFormatter = formatters.html;
              const richHtmlContent = htmlFormatter
                ? htmlFormatter.format(conversation, formatOptions)
                : null;

              sendResponse({
                success: true,
                content: primaryContent,
                htmlContent: richHtmlContent,
                conversation: conversation,
              });
            } catch (e) {
              logger.error('Copy chat failed:', e);
              if (currentFrameIsTop) {
                sendResponse({ success: false, error: e.message });
              }
            }
          })();
          return true;
        }

        if (request.action === 'GET_CONTINUATION_PAYLOAD') {
          if (!activeParser) {
            detectParser();
          }
          if (!activeParser) {
            sendResponse({ success: false, error: 'No parser available' });
            return true;
          }

          (async () => {
            try {
              const conversation = enrichConversation(
                await activeParser.parse({
                  full: true,
                  parserMode: request.parserMode || 'auto',
                  includeImages: request.includeImages !== false,
                }),
              );
              if (
                !currentFrameIsTop &&
                (!conversation || !conversation.messages || conversation.messages.length === 0)
              ) {
                logger.debug('Subframe has 0 messages, ignoring subframe continuation');
                return;
              }
              if (request.includeImages === false) {
                conversation.messages.forEach((msg) => {
                  if (msg.content) {
                    msg.content = stripImages(msg.content);
                  }
                });
              }
              const platformName =
                typeof activeParser.getPlatformName === 'function'
                  ? activeParser.getPlatformName()
                  : activeParser.name || activeParser.constructor.name.replace('Parser', '');
              conversation.metadata = { ...conversation.metadata, Source: platformName };
              const isArticle =
                activeParser.name === 'WebArticle' ||
                activeParser.constructor?.name === 'ArticleParser';
              let template;
              if (!isArticle) {
                try {
                  const syncData = await chrome.storage.sync.get('transferPromptTemplate');
                  if (
                    syncData &&
                    typeof syncData.transferPromptTemplate === 'string' &&
                    syncData.transferPromptTemplate.includes('{history}')
                  ) {
                    template = syncData.transferPromptTemplate;
                  }
                } catch {
                  // Fall back to formatter default
                }
              }
              const payload = continuationFormatter.format(
                conversation,
                request.instruction || '',
                { template, isArticle },
              );

              sendResponse({ success: true, payload });
            } catch (e) {
              logger.error('Get continuation payload failed:', e);
              if (currentFrameIsTop) {
                sendResponse({ success: false, error: e.message });
              }
            }
          })();
          return true;
        }

        if (request.action === 'EXECUTE_SHORTCUT') {
          const isTopFrame = typeof window === 'undefined' || window.self === window.top;
          if (!activeParser) {
            detectParser();
          }
          if (!activeParser) {
            if (isTopFrame) {
              showExporterToast('⚠️ No supported AI chat found on this tab', 'error');
            }
            sendResponse({ success: false, error: 'No parser available' });
            return true;
          }

          const shortcut = request.shortcutAction;

          (async () => {
            try {
              const conversation = enrichConversation(
                await activeParser.parse({
                  full: true,
                  parserMode: 'auto',
                  includeImages: true,
                }),
              );

              if (!conversation || !conversation.messages || conversation.messages.length === 0) {
                if (isTopFrame) {
                  showExporterToast('⚠️ No messages found in conversation', 'error');
                }
                sendResponse({ success: false, error: 'No messages found' });
                return;
              }

              const formatter = formatters.markdown;
              const markdownContent = formatter.format(conversation, {
                includeAttribution: await getAttributionSetting(),
              });

              if (shortcut === 'copy_markdown') {
                const copied = await copyToClipboard(markdownContent);
                if (copied && isTopFrame) {
                  showExporterToast('📋 Markdown copied to clipboard!');
                }
                sendResponse({ success: copied });
              } else if (shortcut === 'download_markdown') {
                const mimeType = formatter.getMimeType();
                const blob = new Blob([markdownContent], { type: `${mimeType};charset=utf-8` });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;

                let filenameTemplate = DEFAULT_FILENAME_TEMPLATE;
                try {
                  const syncData = await chrome.storage.sync.get('filenameTemplate');
                  if (syncData && syncData.filenameTemplate) {
                    filenameTemplate = syncData.filenameTemplate;
                  }
                } catch {
                  // Fallback to default
                }
                const platformName =
                  typeof activeParser.getPlatformName === 'function'
                    ? activeParser.getPlatformName()
                    : activeParser.name || activeParser.constructor.name.replace('Parser', '');
                const formattedName = formatFilename(filenameTemplate, {
                  platform: platformName,
                  title: conversation.title || 'Conversation',
                });
                a.download = `${formattedName}.${formatter.getFileExtension()}`;

                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                if (isTopFrame) {
                  showExporterToast('📥 Markdown file downloaded!');
                }
                sendResponse({ success: true });
              } else {
                sendResponse({ success: false, error: 'Unknown shortcut action' });
              }
            } catch (e) {
              logger.error('Shortcut action failed:', e);
              if (isTopFrame) {
                showExporterToast('⚠️ Failed to export conversation', 'error');
              }
              sendResponse({ success: false, error: e.message });
            }
          })();
          return true;
        }
      });
    }

    async function copyToClipboard(text) {
      try {
        if (
          typeof navigator !== 'undefined' &&
          navigator.clipboard &&
          navigator.clipboard.writeText
        ) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (err) {
        logger.warn('navigator.clipboard failed, attempting fallback:', err);
      }
      try {
        if (typeof document !== 'undefined') {
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.style.position = 'fixed';
          textarea.style.left = '-9999px';
          textarea.style.top = '-9999px';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          const successful = document.execCommand('copy');
          document.body.removeChild(textarea);
          if (successful) return true;
        }
      } catch (err) {
        logger.error('execCommand fallback failed:', err);
      }
      return false;
    }

    function showExporterToast(message, type = 'success') {
      if (typeof document === 'undefined' || !document.body) return;
      const isTopFrame = typeof window === 'undefined' || window.self === window.top;
      if (!isTopFrame) return;

      const existingToast = document.getElementById('ai-chat-exporter-toast');
      if (existingToast) {
        existingToast.remove();
      }

      const toast = document.createElement('div');
      toast.id = 'ai-chat-exporter-toast';
      toast.textContent = message;
      Object.assign(toast.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: '2147483647',
        padding: '10px 16px',
        backgroundColor: type === 'error' ? '#ef4444' : '#0f172a',
        color: '#ffffff',
        fontSize: '13px',
        fontWeight: '500',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        borderRadius: '8px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(8px)',
        opacity: '0',
        transform: 'translateY(-8px)',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
        pointerEvents: 'none',
      });

      (document.body || document.documentElement).appendChild(toast);

      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => {
          toast.style.opacity = '1';
          toast.style.transform = 'translateY(0)';
        });
      } else {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
      }

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-8px)';
        setTimeout(() => {
          if (toast.parentNode) {
            toast.remove();
          }
        }, 250);
      }, 2500);
    }

    detectParser();
    checkAndInjectContinuation();
  },
});
