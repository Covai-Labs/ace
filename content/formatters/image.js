import html2canvas from 'html2canvas';
import renderMathInElement from 'katex/dist/contrib/auto-render.mjs';
import { ExportFormatter, getMessageNumbers, shouldIncludeAttribution } from './base.js';
import { markdownToHtml, escapeHtml } from './html.js';

export const THEME_PALETTES = {
  'modern-light': {
    isDark: false,
    bg: '#f8fafc',
    textColor: '#0f172a',
    subtitleColor: '#475569',
    borderColor: '#e2e8f0',
    userBg: '#e2e8f0',
    userBorder: '#cbd5e1',
    assistantBg: '#ffffff',
    assistantBorder: '#e2e8f0',
    inlineCodeBg: '#e2e8f0',
    inlineCodeText: '#0f172a',
    codeBg: '#0f172a',
    codeText: '#f8fafc',
    codeHeaderBg: '#1e293b',
    tableHeaderBg: '#f1f5f9',
    tableBorder: '#cbd5e1',
    thinkingBg: 'rgba(79, 70, 229, 0.04)',
    thinkingText: '#475569',
    accent: '#4f46e5',
    accentLight: '#e0e7ff',
    badgeBg: '#e0e7ff',
    badgeColor: '#4f46e5',
  },
  'modern-dark': {
    isDark: true,
    bg: '#0f172a',
    textColor: '#f8fafc',
    subtitleColor: '#94a3b8',
    borderColor: '#1e293b',
    userBg: '#1e293b',
    userBorder: '#334155',
    assistantBg: '#0f172a',
    assistantBorder: '#1e293b',
    inlineCodeBg: '#1e293b',
    inlineCodeText: '#f8fafc',
    codeBg: '#020617',
    codeText: '#f8fafc',
    codeHeaderBg: '#0f172a',
    tableHeaderBg: '#1e293b',
    tableBorder: '#334155',
    thinkingBg: 'rgba(99, 102, 241, 0.12)',
    thinkingText: '#cbd5e1',
    accent: '#6366f1',
    accentLight: '#312e81',
    badgeBg: 'rgba(99, 102, 241, 0.2)',
    badgeColor: '#818cf8',
  },
  'github-light': {
    isDark: false,
    bg: '#ffffff',
    textColor: '#1f2328',
    subtitleColor: '#656d76',
    borderColor: '#d0d7de',
    userBg: '#f6f8fa',
    userBorder: '#d0d7de',
    assistantBg: '#ffffff',
    assistantBorder: '#d0d7de',
    inlineCodeBg: '#eff1f3',
    inlineCodeText: '#1f2328',
    codeBg: '#f6f8fa',
    codeText: '#1f2328',
    codeHeaderBg: '#eaeef2',
    tableHeaderBg: '#f6f8fa',
    tableBorder: '#d0d7de',
    thinkingBg: 'rgba(9, 105, 218, 0.05)',
    thinkingText: '#656d76',
    accent: '#0969da',
    accentLight: '#ddf4ff',
    badgeBg: '#ddf4ff',
    badgeColor: '#0969da',
  },
  'github-dark': {
    isDark: true,
    bg: '#0d1117',
    textColor: '#e6edf3',
    subtitleColor: '#8d96a0',
    borderColor: '#30363d',
    userBg: '#21262d',
    userBorder: '#30363d',
    assistantBg: '#161b22',
    assistantBorder: '#30363d',
    inlineCodeBg: '#21262d',
    inlineCodeText: '#e6edf3',
    codeBg: '#161b22',
    codeText: '#e6edf3',
    codeHeaderBg: '#21262d',
    tableHeaderBg: '#21262d',
    tableBorder: '#30363d',
    thinkingBg: 'rgba(47, 129, 247, 0.12)',
    thinkingText: '#8d96a0',
    accent: '#2f81f7',
    accentLight: '#101d2e',
    badgeBg: 'rgba(47, 129, 247, 0.15)',
    badgeColor: '#58a6ff',
  },
  nord: {
    isDark: true,
    bg: '#2e3440',
    textColor: '#eceff4',
    subtitleColor: '#d8dee9',
    borderColor: '#4c566a',
    userBg: '#434c5e',
    userBorder: '#4c566a',
    assistantBg: '#3b4252',
    assistantBorder: '#4c566a',
    inlineCodeBg: '#3b4252',
    inlineCodeText: '#eceff4',
    codeBg: '#242933',
    codeText: '#eceff4',
    codeHeaderBg: '#2e3440',
    tableHeaderBg: '#434c5e',
    tableBorder: '#4c566a',
    thinkingBg: 'rgba(136, 192, 208, 0.12)',
    thinkingText: '#d8dee9',
    accent: '#88c0d0',
    accentLight: '#3b4252',
    badgeBg: 'rgba(136, 192, 208, 0.2)',
    badgeColor: '#88c0d0',
  },
  dracula: {
    isDark: true,
    bg: '#282a36',
    textColor: '#f8f8f2',
    subtitleColor: '#6272a4',
    borderColor: '#44475a',
    userBg: '#44475a',
    userBorder: '#6272a4',
    assistantBg: '#343746',
    assistantBorder: '#44475a',
    inlineCodeBg: '#44475a',
    inlineCodeText: '#f8f8f2',
    codeBg: '#1e1f29',
    codeText: '#f8f8f2',
    codeHeaderBg: '#282a36',
    tableHeaderBg: '#44475a',
    tableBorder: '#6272a4',
    thinkingBg: 'rgba(189, 147, 249, 0.12)',
    thinkingText: '#f8f8f2',
    accent: '#bd93f9',
    accentLight: '#3b2d54',
    badgeBg: 'rgba(189, 147, 249, 0.2)',
    badgeColor: '#bd93f9',
  },
  'solarized-light': {
    isDark: false,
    bg: '#fdf6e3',
    textColor: '#657b83',
    subtitleColor: '#93a1a1',
    borderColor: '#d3cbb7',
    userBg: '#eee8d5',
    userBorder: '#d3cbb7',
    assistantBg: '#fdf6e3',
    assistantBorder: '#d3cbb7',
    inlineCodeBg: '#eee8d5',
    inlineCodeText: '#586e75',
    codeBg: '#eee8d5',
    codeText: '#586e75',
    codeHeaderBg: '#e4ddc7',
    tableHeaderBg: '#eee8d5',
    tableBorder: '#d3cbb7',
    thinkingBg: 'rgba(38, 139, 210, 0.08)',
    thinkingText: '#657b83',
    accent: '#268bd2',
    accentLight: '#e0f2fe',
    badgeBg: '#e0f2fe',
    badgeColor: '#268bd2',
  },
  'solarized-dark': {
    isDark: true,
    bg: '#002b36',
    textColor: '#839496',
    subtitleColor: '#586e75',
    borderColor: '#095264',
    userBg: '#073642',
    userBorder: '#095264',
    assistantBg: '#002b36',
    assistantBorder: '#095264',
    inlineCodeBg: '#073642',
    inlineCodeText: '#93a1a1',
    codeBg: '#073642',
    codeText: '#93a1a1',
    codeHeaderBg: '#002b36',
    tableHeaderBg: '#073642',
    tableBorder: '#095264',
    thinkingBg: 'rgba(42, 183, 202, 0.12)',
    thinkingText: '#839496',
    accent: '#2ab7ca',
    accentLight: '#0d3b46',
    badgeBg: 'rgba(42, 183, 202, 0.2)',
    badgeColor: '#2ab7ca',
  },
  catppuccin: {
    isDark: true,
    bg: '#1e1e2e',
    textColor: '#cdd6f4',
    subtitleColor: '#a6adc8',
    borderColor: '#313244',
    userBg: '#313244',
    userBorder: '#45475a',
    assistantBg: '#1e1e2e',
    assistantBorder: '#313244',
    inlineCodeBg: '#313244',
    inlineCodeText: '#cdd6f4',
    codeBg: '#181825',
    codeText: '#cdd6f4',
    codeHeaderBg: '#1e1e2e',
    tableHeaderBg: '#252538',
    tableBorder: '#313244',
    thinkingBg: 'rgba(180, 190, 254, 0.12)',
    thinkingText: '#a6adc8',
    accent: '#b4befe',
    accentLight: '#313244',
    badgeBg: 'rgba(180, 190, 254, 0.2)',
    badgeColor: '#b4befe',
  },
  monokai: {
    isDark: true,
    bg: '#272822',
    textColor: '#f8f8f2',
    subtitleColor: '#75715e',
    borderColor: '#49483e',
    userBg: '#3e3d32',
    userBorder: '#49483e',
    assistantBg: '#272822',
    assistantBorder: '#49483e',
    inlineCodeBg: '#3e3d32',
    inlineCodeText: '#f8f8f2',
    codeBg: '#1e1f1c',
    codeText: '#f8f8f2',
    codeHeaderBg: '#272822',
    tableHeaderBg: '#34352f',
    tableBorder: '#49483e',
    thinkingBg: 'rgba(166, 226, 46, 0.12)',
    thinkingText: '#75715e',
    accent: '#a6e22e',
    accentLight: '#3e3d32',
    badgeBg: 'rgba(166, 226, 46, 0.2)',
    badgeColor: '#a6e22e',
  },
  synthwave: {
    isDark: true,
    bg: '#262335',
    textColor: '#f8f8f2',
    subtitleColor: '#848bbd',
    borderColor: '#493b67',
    userBg: '#44356a',
    userBorder: '#614d85',
    assistantBg: '#262335',
    assistantBorder: '#493b67',
    inlineCodeBg: '#44356a',
    inlineCodeText: '#36f9f6',
    codeBg: '#1e1a2b',
    codeText: '#36f9f6',
    codeHeaderBg: '#262335',
    tableHeaderBg: '#34294f',
    tableBorder: '#493b67',
    thinkingBg: 'rgba(255, 126, 219, 0.12)',
    thinkingText: '#848bbd',
    accent: '#ff7edb',
    accentLight: '#44356a',
    badgeBg: 'rgba(255, 126, 219, 0.2)',
    badgeColor: '#ff7edb',
  },
  gruvbox: {
    isDark: true,
    bg: '#282828',
    textColor: '#ebdbb2',
    subtitleColor: '#a89984',
    borderColor: '#504945',
    userBg: '#504945',
    userBorder: '#665c54',
    assistantBg: '#282828',
    assistantBorder: '#504945',
    inlineCodeBg: '#3c3836',
    inlineCodeText: '#ebdbb2',
    codeBg: '#1d2021',
    codeText: '#ebdbb2',
    codeHeaderBg: '#282828',
    tableHeaderBg: '#3c3836',
    tableBorder: '#504945',
    thinkingBg: 'rgba(254, 128, 25, 0.12)',
    thinkingText: '#a89984',
    accent: '#fe8019',
    accentLight: '#504945',
    badgeBg: 'rgba(254, 128, 25, 0.2)',
    badgeColor: '#fe8019',
  },
};

export class ImageFormatter extends ExportFormatter {
  getFileExtension() {
    return 'png';
  }

  getMimeType() {
    return 'image/png';
  }

  /**
   * Resolves options to a concrete theme palette.
   * @param {Object} [options]
   * @returns {Object}
   */
  resolveThemePalette(options = {}) {
    let themeKey = options.theme;

    // Direct isDark boolean fallback if theme is omitted
    if (!themeKey) {
      if (options.isDark === true) {
        return THEME_PALETTES['modern-dark'];
      }
      if (options.isDark === false) {
        return THEME_PALETTES['modern-light'];
      }
    }

    if (!themeKey || themeKey === 'system') {
      const isSystemDark =
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      themeKey = isSystemDark ? 'modern-dark' : 'modern-light';
    } else if (themeKey === 'dark') {
      themeKey = 'modern-dark';
    } else if (themeKey === 'light') {
      themeKey = 'modern-light';
    }

    return (
      THEME_PALETTES[themeKey] ||
      (options.isDark ? THEME_PALETTES['modern-dark'] : THEME_PALETTES['modern-light'])
    );
  }

  /**
   * Generates a styled HTML container for the conversation
   * @param {Object} conversation
   * @param {Object} [options]
   * @returns {HTMLElement}
   */
  createScreenshotContainer(conversation, options = {}) {
    const palette = this.resolveThemePalette(options);
    const { title, messages } = conversation;
    const messageNumbers = getMessageNumbers(messages, options?.messageNumbering);
    const now = new Date();
    const formattedDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${now.toLocaleTimeString('en-US', { hour12: false })}`;
    const platform = conversation.metadata?.Source || 'AI';
    const model = conversation.metadata?.Model || '';

    const container = document.createElement('div');
    container.className = 'ai-exporter-png-container';
    container.style.cssText = `
      position: absolute;
      left: -9999px;
      top: 0;
      width: 800px;
      padding: 40px;
      box-sizing: border-box;
      background-color: ${palette.bg};
      color: ${palette.textColor};
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      line-height: 1.6;
    `;

    const formattedMessages = (messages || [])
      .map((msg, idx) => {
        const isUser = msg.role === 'User';
        const roleName = isUser ? 'User' : platform;
        const msgNumber = messageNumbers[idx];
        const displayName = msgNumber !== null ? `${roleName} [${msgNumber}]` : roleName;
        const avatarBg = isUser ? palette.accent : '#0ea5e9';
        const avatarText = isUser ? 'U' : platform[0] || 'A';
        const htmlContent = markdownToHtml(msg.content);

        return `
          <div style="margin-bottom: 24px; display: flex; flex-direction: column; align-items: ${isUser ? 'flex-end' : 'flex-start'};">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <div style="width: 24px; height: 24px; border-radius: 50%; background-color: ${avatarBg}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;">
                ${escapeHtml(avatarText)}
              </div>
              <span style="font-size: 13px; font-weight: 600; color: ${palette.subtitleColor};">${escapeHtml(displayName)}</span>
            </div>
            <div style="max-width: 90%; background-color: ${isUser ? palette.userBg : palette.assistantBg}; border: 1px solid ${isUser ? palette.userBorder : palette.assistantBorder}; border-radius: 12px; padding: 16px 20px; font-size: 14px; color: ${palette.textColor}; word-break: break-word;">
              ${htmlContent}
            </div>
          </div>
        `;
      })
      .join('');

    container.innerHTML = `
      <style>
        .ai-exporter-png-container .copy-code-btn,
        .ai-exporter-png-container .copy-msg-btn { display: none !important; }
        .ai-exporter-png-container .code-card { margin: 12px 0; border-radius: 8px; overflow: hidden; background: ${palette.codeBg}; color: ${palette.codeText}; border: 1px solid ${palette.borderColor}; }
        .ai-exporter-png-container .code-card-header { background: ${palette.codeHeaderBg}; color: ${palette.subtitleColor}; padding: 6px 14px; font-family: 'Fira Code', monospace; font-size: 12px; display: flex; justify-content: space-between; align-items: center; }
        .ai-exporter-png-container .code-lang { text-transform: lowercase; font-weight: 600; }
        .ai-exporter-png-container pre { background: ${palette.codeBg}; color: ${palette.codeText}; padding: 12px 16px; margin: 0; border-radius: 0; overflow-x: auto; font-family: 'Fira Code', monospace; font-size: 13px; }
        .ai-exporter-png-container code { background: ${palette.inlineCodeBg}; color: ${palette.inlineCodeText}; padding: 2px 6px; border-radius: 4px; font-family: 'Fira Code', monospace; font-size: 13px; }
        .ai-exporter-png-container pre code { background: none; color: inherit; padding: 0; }
        .ai-exporter-png-container table { border-collapse: collapse; width: 100%; margin: 12px 0; }
        .ai-exporter-png-container th, .ai-exporter-png-container td { border: 1px solid ${palette.tableBorder}; padding: 8px 12px; text-align: left; }
        .ai-exporter-png-container th { background: ${palette.tableHeaderBg}; font-weight: 600; }
        .ai-exporter-png-container img { max-width: 100%; height: auto; border-radius: 8px; }
        .ai-exporter-png-container blockquote { border-left: 4px solid ${palette.accent}; margin: 12px 0; padding-left: 16px; color: ${palette.subtitleColor}; }
        .ai-exporter-png-container hr { border: 0; border-top: 1px solid ${palette.borderColor}; margin: 24px 0; }
        .ai-exporter-png-container .thinking-block { margin: 12px 0; border: 1px solid ${palette.borderColor}; border-left: 4px solid ${palette.accent}; border-radius: 8px; background: ${palette.thinkingBg}; overflow: hidden; }
        .ai-exporter-png-container .thinking-summary { padding: 8px 12px; font-weight: 600; font-size: 13px; color: ${palette.accent}; display: flex; align-items: center; gap: 6px; }
        .ai-exporter-png-container .thinking-content { padding: 10px 14px; border-top: 1px solid ${palette.borderColor}; font-size: 13px; color: ${palette.thinkingText}; }
        .ai-exporter-png-container ul.task-list { list-style: none; padding-left: 0; }
        .ai-exporter-png-container .task-list-item { list-style: none; display: flex; align-items: baseline; gap: 6px; margin: 4px 0; }
        .ai-exporter-png-container .task-checkbox { accent-color: ${palette.accent}; width: 14px; height: 14px; margin: 0; }
      </style>

      <!-- Header -->
      <div style="border-bottom: 2px solid ${palette.borderColor}; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 8px;">
            <span style="display: inline-block; background-color: ${palette.badgeBg}; color: ${palette.badgeColor}; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 10px; border-radius: 9999px;">
              ${escapeHtml(platform)}
            </span>
            ${model ? `<span style="display: inline-block; background-color: ${palette.userBg}; color: ${palette.subtitleColor}; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 9999px;">Model: ${escapeHtml(model)}</span>` : ''}
          </div>
          <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: ${palette.textColor}; line-height: 1.3;">
            ${escapeHtml(title || 'AI Conversation')}
          </h1>
        </div>
        <div style="font-size: 12px; color: ${palette.subtitleColor}; text-align: right; white-space: nowrap; margin-left: 16px;">
          <div>${escapeHtml(formattedDate)}</div>
          ${shouldIncludeAttribution(options) ? `<div style="margin-top: 2px;"><a href="https://ace.covai.org" target="_blank" style="color: ${palette.subtitleColor}; text-decoration: none;">AI Chat Exporter</a></div>` : ''}
        </div>
      </div>

      <!-- Messages Body -->
      <div>
        ${formattedMessages}
      </div>

      ${
        shouldIncludeAttribution(options)
          ? `
      <!-- Footer Watermark -->
      <div style="margin-top: 40px; border-top: 1px solid ${palette.borderColor}; padding-top: 16px; text-align: center; font-size: 12px; color: ${palette.subtitleColor};">
        Exported with <strong>AI Chat Exporter</strong> • <span style="color: ${palette.accent};">https://ace.covai.org/</span>
      </div>`
          : ''
      }
    `;

    return container;
  }

  /**
   * Pre-loads image sources inside the container so html2canvas captures them cleanly
   * and converts cross-origin images to Data URLs to prevent canvas tainting ("The operation is insecure").
   */
  async preloadImages(container) {
    const images = Array.from(container.querySelectorAll('img'));
    if (images.length === 0) return;

    const processImage = async (img) => {
      const src = img.getAttribute('src') || '';
      if (!src || src.startsWith('data:')) return;

      // 1. Try fetching as Blob and converting to Data URL
      try {
        if (typeof fetch !== 'undefined') {
          const response = await fetch(src, { mode: 'cors' });
          if (response.ok) {
            const blob = await response.blob();
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            img.setAttribute('src', dataUrl);
            return;
          }
        }
      } catch {
        // Fetch failed due to CORS or network error
      }

      // 2. Try using Image element with crossOrigin = 'anonymous' and offscreen canvas
      try {
        if (typeof Image !== 'undefined' && typeof document !== 'undefined') {
          const safeDataUrl = await new Promise((resolve, reject) => {
            const tempImg = new Image();
            tempImg.crossOrigin = 'anonymous';
            const timer = setTimeout(() => reject(new Error('Image load timeout')), 2500);
            tempImg.onload = () => {
              clearTimeout(timer);
              try {
                const c = document.createElement('canvas');
                c.width = tempImg.naturalWidth || tempImg.width || 100;
                c.height = tempImg.naturalHeight || tempImg.height || 100;
                const ctx = c.getContext('2d');
                ctx.drawImage(tempImg, 0, 0);
                resolve(c.toDataURL('image/png'));
              } catch (err) {
                reject(err);
              }
            };
            tempImg.onerror = () => {
              clearTimeout(timer);
              reject(new Error('Image load error'));
            };
            tempImg.src = src;
          });
          img.setAttribute('src', safeDataUrl);
          return;
        }
      } catch {
        // Canvas drawing failed or crossOrigin was blocked by browser
      }

      // 3. Fallback: Replace image with safe placeholder to prevent tainting the canvas
      const altText = img.getAttribute('alt') || 'External Image';
      const placeholder = document.createElement('span');
      placeholder.className = 'ai-exporter-img-placeholder';
      placeholder.style.cssText =
        'display: inline-block; padding: 4px 8px; background: #f1f5f9; color: #64748b; border-radius: 4px; font-size: 12px; border: 1px dashed #cbd5e1; margin: 4px 0;';
      placeholder.textContent = `🖼️ [${altText}]`;
      img.replaceWith(placeholder);
    };

    await Promise.all(images.map((img) => processImage(img)));
  }

  /**
   * Calculates a safe scale factor to prevent CanvasRenderingContext2D dimension/memory limit errors
   * ("Canvas exceeds max size" in Firefox/Chrome).
   * @param {HTMLElement} container
   * @param {number} requestedScale
   * @returns {number}
   */
  calculateSafeScale(container, requestedScale = 2) {
    const containerHeight = Math.max(
      container.offsetHeight || 0,
      container.scrollHeight || 0,
      container.clientHeight || 0,
      100,
    );
    const containerWidth = Math.max(
      container.offsetWidth || 0,
      container.scrollWidth || 0,
      container.clientWidth || 0,
      800,
    );

    // Max safe dimensions across desktop/mobile browsers (Gecko/Firefox caps at 16,384px or 32,767px)
    const MAX_SAFE_DIMENSION = 16384;
    const MAX_SAFE_AREA = 16384 * 8192; // ~134 megapixels

    const maxScaleByWidth = MAX_SAFE_DIMENSION / containerWidth;
    const maxScaleByHeight = MAX_SAFE_DIMENSION / containerHeight;
    const maxScaleByArea = Math.sqrt(MAX_SAFE_AREA / (containerWidth * containerHeight));

    let safeScale = Math.min(requestedScale, maxScaleByWidth, maxScaleByHeight, maxScaleByArea);
    safeScale = Math.max(0.2, Math.min(safeScale, requestedScale));
    return Math.floor(safeScale * 100) / 100;
  }

  /**
   * Captures a DOM container element (such as from a preview iframe) to a PNG Blob
   * @param {HTMLElement} container
   * @param {Object} [options]
   * @returns {Promise<Blob>}
   */
  async captureElement(container, options = {}) {
    await this.preloadImages(container);

    try {
      if (typeof renderMathInElement === 'function') {
        renderMathInElement(container, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\[', right: '\\]', display: true },
            { left: '\\(', right: '\\)', display: false },
          ],
          throwOnError: false,
        });
      }
    } catch (e) {
      console.warn('[ImageFormatter] KaTeX math rendering failed:', e);
    }

    const html2canvasFn =
      (options && options.html2canvas) ||
      (typeof window !== 'undefined' && window.html2canvas) ||
      (typeof globalThis !== 'undefined' && globalThis.html2canvas) ||
      (typeof html2canvas === 'function' ? html2canvas : null);

    if (!html2canvasFn) {
      throw new Error('html2canvas library is not loaded');
    }

    const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const win = (doc && doc.defaultView) || (typeof window !== 'undefined' ? window : null);

    let backgroundColor = options.backgroundColor;
    if (!backgroundColor && win && win.getComputedStyle) {
      const containerBg = win.getComputedStyle(container).backgroundColor;
      const bodyBg = doc && doc.body ? win.getComputedStyle(doc.body).backgroundColor : null;
      if (containerBg && containerBg !== 'rgba(0, 0, 0, 0)' && containerBg !== 'transparent') {
        backgroundColor = containerBg;
      } else if (bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)' && bodyBg !== 'transparent') {
        backgroundColor = bodyBg;
      }
    }
    if (
      !backgroundColor ||
      backgroundColor === 'rgba(0, 0, 0, 0)' ||
      backgroundColor === 'transparent'
    ) {
      const palette = this.resolveThemePalette(options);
      backgroundColor = palette.bg;
    }

    const isHighQuality = options ? options.highQuality !== false : true;
    const requestedScale = isHighQuality ? 2 : 1;
    const safeScale = this.calculateSafeScale(container, requestedScale);

    const prevScrollX = win ? win.scrollX || 0 : 0;
    const prevScrollY = win ? win.scrollY || 0 : 0;
    if (win && typeof win.scrollTo === 'function') {
      try {
        win.scrollTo(0, 0);
      } catch {
        // Ignore scroll reset error
      }
    }

    try {
      const renderWithScale = async (scale) => {
        return await html2canvasFn(container, {
          backgroundColor,
          scale,
          useCORS: true,
          allowTaint: false,
          logging: false,
          imageTimeout: 3000,
          scrollX: 0,
          scrollY: 0,
          ignoreElements: (el) => {
            if (options.includeImages === false && el.tagName === 'IMG') {
              return true;
            }
            return (
              el.classList?.contains('copy-code-btn') ||
              el.classList?.contains('copy-msg-btn') ||
              el.classList?.contains('theme-switch-wrapper')
            );
          },
        });
      };

      let canvas;
      try {
        canvas = await renderWithScale(safeScale);
      } catch (err) {
        console.warn(`[ImageFormatter] Initial canvas render failed with scale ${safeScale}:`, err);
        if (safeScale > 1.0) {
          try {
            canvas = await renderWithScale(1.0);
          } catch (retryErr1) {
            console.warn(
              '[ImageFormatter] Retry at scale 1.0 failed, trying scale 0.5:',
              retryErr1,
            );
            canvas = await renderWithScale(0.5);
          }
        } else if (safeScale > 0.5) {
          console.warn('[ImageFormatter] Retrying with safe scale 0.5:', err);
          canvas = await renderWithScale(0.5);
        } else {
          throw err;
        }
      }

      return await new Promise((resolve, reject) => {
        try {
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to generate PNG blob from canvas'));
            }
          }, 'image/png');
        } catch (err) {
          reject(err);
        }
      });
    } finally {
      if (win && typeof win.scrollTo === 'function') {
        try {
          win.scrollTo(prevScrollX, prevScrollY);
        } catch {
          // Ignore scroll restore error
        }
      }
    }
  }

  /**
   * Formats the conversation into a PNG Blob
   * @param {Object} conversation
   * @param {Object} [options]
   * @returns {Promise<Blob>}
   */
  async format(conversation, options = {}) {
    const container = this.createScreenshotContainer(conversation, options);
    document.body.appendChild(container);

    try {
      return await this.captureElement(container, options);
    } finally {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }
  }
}
