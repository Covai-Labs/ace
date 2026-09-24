import { ExportFormatter, shouldIncludeAttribution } from './base.js';
import { getMessageNumber, normalizeMessageNumbering } from './base.js';
import { sanitizeHtml } from '../utils/sanitizer.js';
import { katexCss, katexJs, autoRenderJs, prismCss, prismJs } from '../lib/assets.js';

export class HtmlFormatter extends ExportFormatter {
  format(conversation, options = {}) {
    const { title, messages } = conversation;
    const now = new Date();
    const formattedDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${now.toLocaleTimeString('en-US', { hour12: false })}`;

    const platform = conversation.metadata?.Source || 'AI';
    const link = conversation.url || conversation.metadata?.Link || '';
    const model = conversation.metadata?.Model || '';
    const method = conversation.metadata?.Method || '';
    const selectedTheme = options?.theme || conversation?.theme || '';
    const themeAttr =
      selectedTheme && selectedTheme !== 'system'
        ? ` data-theme="${escapeHtml(selectedTheme)}"`
        : '';

    const isWebArticle = platform === 'Web Article' || platform === 'WebArticle';

    // Table of Contents
    let tocHtml = '';
    if (options?.includeToc && messages && messages.length > 0) {
      const numberingMode = normalizeMessageNumbering(options?.messageNumbering);
      const tocItems = messages
        .map((m, i) => {
          const isUser = m.role === 'User';
          const label = isUser ? 'User' : m.role && m.role !== 'Assistant' ? m.role : platform;
          const msgNumber = getMessageNumber(messages, i, numberingMode);
          const numberPrefix = msgNumber !== null ? `[${msgNumber}] ` : '';
          const snippet = (m.content || '')
            .replace(/<[^>]*>/g, '')
            .replace(/\[(?:x|X|\s)\]/g, '')
            .replace(/[`#*_~]/g, '')
            .trim()
            .substring(0, 60);
          return `<li><a href="#msg-card-${i}"><strong>${escapeHtml(numberPrefix + label)}:</strong> ${escapeHtml(snippet || 'Message')}</a></li>`;
        })
        .join('\n');
      tocHtml = `
        <nav class="toc-card" aria-label="Table of Contents">
          <div class="toc-title">📑 Table of Contents</div>
          <ol class="toc-list">
            ${tocItems}
          </ol>
        </nav>
      `;
    }

    // Convert messages
    const formattedMessages = isWebArticle
      ? messages
          .map((msg, idx) => {
            const htmlContent = sanitizeHtml(markdownToHtml(msg.content));
            return `
        <article id="msg-card-${idx}" class="article-card">
          <div class="message-content">
            ${htmlContent}
          </div>
        </article>
      `;
          })
          .join('\n')
      : messages
          .map((msg, idx) => {
            const isUser = msg.role === 'User';
            const roleClass = isUser ? 'role-user' : 'role-assistant';
            const roleName = isUser
              ? 'User'
              : msg.role && msg.role !== 'Assistant'
                ? msg.role
                : platform;
            const avatarText = isUser ? 'U' : roleName[0] || 'A';
            const msgNumber = getMessageNumber(
              messages,
              idx,
              normalizeMessageNumbering(options?.messageNumbering),
            );
            const displayName = msgNumber !== null ? `${roleName} [${msgNumber}]` : roleName;
            const htmlContent = sanitizeHtml(markdownToHtml(msg.content));

            return `
        <div id="msg-card-${idx}" class="message-card ${roleClass}">
          <div class="message-header">
            <div class="message-header-info">
              <div class="message-avatar">${avatarText}</div>
              <span>${escapeHtml(displayName)}</span>
            </div>
            <button class="copy-msg-btn" title="Copy message text">
              <svg class="copy-icon" viewBox="0 0 24 24" width="13" height="13"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
              <span>Copy</span>
            </button>
          </div>
          <div class="message-content">
            ${htmlContent}
          </div>
        </div>
      `;
          })
          .join('\n');

    const katexHeaders = `
  <style>
${katexCss}
${prismCss}
  </style>
  <script>
${katexJs}
  </script>
  <script>
${autoRenderJs}
  </script>
  <script>
${prismJs}
  </script>
  <script>
    function renderMath() {
      if (window.renderMathInElement) {
        renderMathInElement(document.body, {
          delimiters: [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false},
            {left: '\\\\[', right: '\\\\]', display: true},
            {left: '\\\\(', right: '\\\\)', display: false}
          ],
          throwOnError: false
        });
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', renderMath);
    } else {
      renderMath();
    }
  </script>
    `;

    return `<!DOCTYPE html>
<html lang="en"${themeAttr}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title || 'AI Chat Export')}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@600;700&family=Fira+Code:wght@400;500&display=swap');

    :root, [data-theme="modern-light"] {
      --bg-app: #f8fafc;
      --bg-card: #ffffff;
      --bg-bubble-user: #e2e8f0;
      --bg-bubble-ai: #ffffff;
      --text-primary: #0f172a;
      --text-secondary: #475569;
      --accent: #4f46e5;
      --accent-light: #e0e7ff;
      --border: #e2e8f0;
      --code-bg: #0f172a;
      --code-text: #f8fafc;
      --code-header-bg: #1e293b;
      --scrollbar-thumb: #cbd5e1;
    }

    [data-theme="modern-dark"], [data-theme="dark"] {
      --bg-app: #0f172a;
      --bg-card: #1e293b;
      --bg-bubble-user: #334155;
      --bg-bubble-ai: #1e293b;
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --accent: #6366f1;
      --accent-light: #312e81;
      --border: #334155;
      --code-bg: #020617;
      --code-text: #f8fafc;
      --code-header-bg: #0f172a;
      --scrollbar-thumb: #475569;
    }

    [data-theme="github-light"] {
      --bg-app: #ffffff;
      --bg-card: #ffffff;
      --bg-bubble-user: #f6f8fa;
      --bg-bubble-ai: #ffffff;
      --text-primary: #1f2328;
      --text-secondary: #656d76;
      --accent: #0969da;
      --accent-light: #ddf4ff;
      --border: #d0d7de;
      --code-bg: #f6f8fa;
      --code-text: #1f2328;
      --code-header-bg: #eaeef2;
      --scrollbar-thumb: #d0d7de;
    }

    [data-theme="github-dark"] {
      --bg-app: #0d1117;
      --bg-card: #161b22;
      --bg-bubble-user: #21262d;
      --bg-bubble-ai: #161b22;
      --text-primary: #e6edf3;
      --text-secondary: #8d96a0;
      --accent: #2f81f7;
      --accent-light: #101d2e;
      --border: #30363d;
      --code-bg: #161b22;
      --code-text: #e6edf3;
      --code-header-bg: #21262d;
      --scrollbar-thumb: #30363d;
    }

    [data-theme="nord"] {
      --bg-app: #2e3440;
      --bg-card: #3b4252;
      --bg-bubble-user: #434c5e;
      --bg-bubble-ai: #3b4252;
      --text-primary: #eceff4;
      --text-secondary: #d8dee9;
      --accent: #88c0d0;
      --accent-light: #3b4252;
      --border: #4c566a;
      --code-bg: #242933;
      --code-text: #eceff4;
      --code-header-bg: #2e3440;
      --scrollbar-thumb: #4c566a;
    }

    [data-theme="dracula"] {
      --bg-app: #282a36;
      --bg-card: #343746;
      --bg-bubble-user: #44475a;
      --bg-bubble-ai: #343746;
      --text-primary: #f8f8f2;
      --text-secondary: #6272a4;
      --accent: #bd93f9;
      --accent-light: #3b2d54;
      --border: #44475a;
      --code-bg: #1e1f29;
      --code-text: #f8f8f2;
      --code-header-bg: #282a36;
      --scrollbar-thumb: #6272a4;
    }

    [data-theme="solarized-light"] {
      --bg-app: #fdf6e3;
      --bg-card: #eee8d5;
      --bg-bubble-user: #eee8d5;
      --bg-bubble-ai: #fdf6e3;
      --text-primary: #657b83;
      --text-secondary: #93a1a1;
      --accent: #268bd2;
      --accent-light: #e0f2fe;
      --border: #d3cbb7;
      --code-bg: #073642;
      --code-text: #839496;
      --code-header-bg: #002b36;
      --scrollbar-thumb: #93a1a1;
    }

    [data-theme="solarized-dark"] {
      --bg-app: #002b36;
      --bg-card: #073642;
      --bg-bubble-user: #073642;
      --bg-bubble-ai: #002b36;
      --text-primary: #839496;
      --text-secondary: #586e75;
      --accent: #2ab7ca;
      --accent-light: #0d3b46;
      --border: #095264;
      --code-bg: #073642;
      --code-text: #93a1a1;
      --code-header-bg: #002b36;
      --scrollbar-thumb: #586e75;
    }

    [data-theme="catppuccin"] {
      --bg-app: #1e1e2e;
      --bg-card: #252538;
      --bg-bubble-user: #313244;
      --bg-bubble-ai: #252538;
      --text-primary: #cdd6f4;
      --text-secondary: #a6adc8;
      --accent: #b4befe;
      --accent-light: #313244;
      --border: #313244;
      --code-bg: #181825;
      --code-text: #cdd6f4;
      --code-header-bg: #1e1e2e;
      --scrollbar-thumb: #45475a;
    }

    [data-theme="monokai"] {
      --bg-app: #272822;
      --bg-card: #34352f;
      --bg-bubble-user: #3e3d32;
      --bg-bubble-ai: #34352f;
      --text-primary: #f8f8f2;
      --text-secondary: #75715e;
      --accent: #a6e22e;
      --accent-light: #3e3d32;
      --border: #49483e;
      --code-bg: #1e1f1c;
      --code-text: #f8f8f2;
      --code-header-bg: #272822;
      --scrollbar-thumb: #75715e;
    }

    [data-theme="synthwave"] {
      --bg-app: #262335;
      --bg-card: #34294f;
      --bg-bubble-user: #44356a;
      --bg-bubble-ai: #34294f;
      --text-primary: #f8f8f2;
      --text-secondary: #848bbd;
      --accent: #ff7edb;
      --accent-light: #44356a;
      --border: #493b67;
      --code-bg: #1e1a2b;
      --code-text: #36f9f6;
      --code-header-bg: #262335;
      --scrollbar-thumb: #614d85;
    }

    [data-theme="gruvbox"] {
      --bg-app: #282828;
      --bg-card: #3c3836;
      --bg-bubble-user: #504945;
      --bg-bubble-ai: #3c3836;
      --text-primary: #ebdbb2;
      --text-secondary: #a89984;
      --accent: #fe8019;
      --accent-light: #504945;
      --border: #504945;
      --code-bg: #1d2021;
      --code-text: #ebdbb2;
      --code-header-bg: #282828;
      --scrollbar-thumb: #665c54;
    }

    html, body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background-color: var(--bg-app);
      color: var(--text-primary);
      margin: 0;
      padding: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      transition: background-color 0.3s ease, color 0.3s ease;
    }

    .container {
      width: 100%;
      max-width: 800px;
      box-sizing: border-box;
      padding: 2rem 1.5rem;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
    }

    .header-title-section {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    h1 {
      font-family: 'Outfit', sans-serif;
      font-size: 1.75rem;
      font-weight: 700;
      margin: 0;
    }

    .metadata {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      font-size: 0.85rem;
      color: var(--text-secondary);
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .badge {
      background-color: var(--accent-light);
      color: var(--accent);
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
      font-weight: 500;
      font-size: 0.75rem;
    }

    .theme-switch-wrapper {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .theme-switch {
      position: relative;
      display: inline-block;
      width: 48px;
      height: 24px;
    }

    .theme-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #cbd5e1;
      transition: .3s;
      border-radius: 34px;
    }

    .slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .3s;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    input:checked + .slider {
      background-color: var(--accent);
    }

    input:checked + .slider:before {
      transform: translateX(24px);
    }

    .toc-card {
      background-color: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.1rem 1.35rem;
      margin-bottom: 0.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
    }

    .toc-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 0.6rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .toc-list {
      margin: 0;
      padding-left: 1.25rem;
      list-style-type: decimal;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .toc-list li {
      font-size: 0.85rem;
      color: var(--text-secondary);
      line-height: 1.45;
    }

    .toc-list a {
      color: var(--accent);
      text-decoration: none;
      transition: color 0.15s ease;
    }

    .toc-list a:hover {
      text-decoration: underline;
    }

    .message-list {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .message-card {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 1.25rem 1.5rem;
      border-radius: 1rem;
      border: 1px solid var(--border);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
      transition: transform 0.2s ease, border-color 0.3s ease, background-color 0.3s ease;
    }

    .message-card:hover {
      transform: translateY(-2px);
    }

    .message-card.role-user {
      background-color: var(--bg-bubble-user);
      align-self: flex-end;
      max-width: 85%;
    }

    .message-card.role-assistant {
      background-color: var(--bg-bubble-ai);
      align-self: flex-start;
      width: 100%;
    }

    .message-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .message-header-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .copy-msg-btn {
      background: none;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      padding: 0.2rem 0.45rem;
      border-radius: 0.375rem;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.75rem;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      transition: all 0.2s ease;
      opacity: 0.8;
    }

    .copy-msg-btn:hover {
      opacity: 1;
      border-color: var(--accent);
      color: var(--accent);
      background-color: var(--accent-light);
    }

    .message-avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .message-card.role-user .message-avatar {
      background-color: var(--accent);
      color: white;
    }

    .message-card.role-assistant .message-avatar {
      background-color: #10b981;
      color: white;
    }

    .message-content {
      font-size: 0.95rem;
      line-height: 1.6;
    }

    .message-content p:first-child {
      margin-top: 0;
    }

    .message-content p:last-child {
      margin-bottom: 0;
    }

    .table-wrapper {
      overflow-x: auto;
      margin: 1rem 0;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    th, td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border);
    }

    th {
      background-color: var(--bg-app);
      font-weight: 600;
    }

    tr:last-child td {
      border-bottom: none;
    }

    .code-card {
      margin: 1rem 0;
      border-radius: 0.5rem;
      overflow: hidden;
      background-color: var(--code-bg);
      color: var(--code-text);
      border: 1px solid var(--border);
    }

    .code-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 1rem;
      background-color: var(--code-header-bg);
      border-bottom: 1px solid var(--border);
      font-family: 'Fira Code', monospace;
      font-size: 0.8rem;
      color: #94a3b8;
    }

    .code-lang {
      text-transform: lowercase;
    }

    .copy-code-btn {
      background: none;
      border: 1px solid var(--border);
      color: #94a3b8;
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.25rem;
      transition: all 0.2s ease;
    }

    .copy-code-btn:hover {
      background-color: rgba(255, 255, 255, 0.05);
      color: var(--code-text);
    }

    .copy-icon {
      fill: currentColor;
    }

    pre {
      margin: 0;
      padding: 1rem;
      overflow-x: auto;
    }

    code {
      font-family: 'Fira Code', Consolas, Monaco, monospace;
      font-size: 0.875rem;
    }

    :not(pre) > code {
      background-color: var(--bg-bubble-user);
      color: var(--text-primary);
      padding: 0.15rem 0.3rem;
      border-radius: 0.25rem;
      font-size: 0.85em;
    }

    blockquote {
      margin: 1rem 0;
      padding-left: 1rem;
      border-left: 4px solid var(--accent);
      color: var(--text-secondary);
      font-style: italic;
    }

    .math-block {
      display: block;
      margin: 1rem 0;
      text-align: center;
      overflow-x: auto;
    }

    .math-inline {
      padding: 0 0.15rem;
    }

    h2, h3, h4 {
      font-family: 'Outfit', sans-serif;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
    }

    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    ::-webkit-scrollbar-track {
      background: transparent;
    }

    ::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb);
      border-radius: 4px;
    }

    ul.task-list {
      list-style: none;
      padding-left: 0.25rem;
    }

    .task-list-item {
      list-style: none;
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      margin: 0.35rem 0;
    }

    .task-checkbox {
      accent-color: var(--accent);
      width: 1rem;
      height: 1rem;
      cursor: default;
      margin: 0;
      flex-shrink: 0;
    }

    .thinking-block {
      margin: 1rem 0;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      background-color: rgba(79, 70, 229, 0.04);
      overflow: hidden;
      transition: background-color 0.2s ease;
    }

    [data-theme="dark"] .thinking-block {
      background-color: rgba(99, 102, 241, 0.06);
    }

    .thinking-summary {
      padding: 0.6rem 0.9rem;
      font-weight: 600;
      font-size: 0.85rem;
      color: var(--text-secondary);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      user-select: none;
    }

    .thinking-summary:hover {
      color: var(--accent);
    }

    .thinking-icon {
      fill: currentColor;
      flex-shrink: 0;
    }

    .thinking-content {
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--border);
      font-size: 0.9rem;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    /* Prism Syntax Highlighting Tokens (Offline-ready) */
    .token.comment, .token.prolog, .token.doctype, .token.cdata { color: #64748b; font-style: italic; }
    .token.punctuation { color: #94a3b8; }
    .token.property, .token.tag, .token.boolean, .token.number, .token.constant, .token.symbol, .token.deleted { color: #f43f5e; }
    .token.selector, .token.attr-name, .token.string, .token.char, .token.builtin, .token.inserted { color: #10b981; }
    .token.operator, .token.entity, .token.url { color: #38bdf8; }
    .token.atrule, .token.attr-value, .token.keyword { color: #818cf8; font-weight: 600; }
    .token.function, .token.class-name { color: #fbbf24; }
    .token.regex, .token.important, .token.variable { color: #f59e0b; }

    .export-footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border);
      text-align: center;
      font-size: 0.85rem;
      color: var(--text-secondary);
      width: 100%;
    }

    .export-footer a {
      color: var(--accent);
      text-decoration: none;
      font-weight: 600;
      transition: color 0.2s ease;
    }

    .export-footer a:hover {
      text-decoration: underline;
    }

    @media print {
      @page {
        margin: 12mm 15mm;
        size: auto;
      }
      body {
        background-color: var(--bg-app) !important;
        color: var(--text-primary) !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .container {
        padding: 0 !important;
        max-width: 100% !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      .copy-code-btn,
      .copy-msg-btn,
      .theme-switch-wrapper {
        display: none !important;
      }
      .message-card {
        max-width: 100% !important;
        width: 100% !important;
        box-sizing: border-box !important;
        page-break-inside: auto;
        break-inside: auto;
        box-shadow: none !important;
        border: 1px solid var(--border) !important;
      }
      .message-card.role-user {
        background-color: var(--bg-bubble-user) !important;
        color: var(--text-primary) !important;
      }
      .message-card.role-assistant {
        background-color: var(--bg-bubble-ai) !important;
        color: var(--text-primary) !important;
      }
      .article-card {
        background-color: var(--bg-card) !important;
        border: 1px solid var(--border) !important;
        color: var(--text-primary) !important;
      }
      .message-header,
      h1, h2, h3, h4, h5, h6 {
        page-break-after: avoid;
        break-after: avoid;
        color: var(--text-primary) !important;
      }
      .thinking-block {
        background-color: rgba(99, 102, 241, 0.08) !important;
        border-color: var(--border) !important;
      }
      .thinking-summary {
        color: var(--accent) !important;
      }
      .thinking-content {
        color: var(--text-secondary) !important;
        border-top-color: var(--border) !important;
        display: block !important;
      }
      details.thinking-block .thinking-content {
        display: block !important;
      }
      .code-card {
        max-width: 100% !important;
        box-sizing: border-box !important;
        page-break-inside: avoid;
        break-inside: avoid;
        background-color: var(--code-bg) !important;
        color: var(--code-text) !important;
        border-color: var(--border) !important;
      }
      .code-card-header {
        background-color: var(--code-header-bg) !important;
        color: var(--text-secondary) !important;
        border-bottom-color: var(--border) !important;
      }
      pre, code {
        white-space: pre-wrap !important;
        word-break: break-word !important;
        overflow-wrap: break-word !important;
      }
      .table-wrapper {
        overflow-x: visible !important;
      }
      table {
        width: 100% !important;
        table-layout: fixed !important;
        word-break: break-word !important;
      }
      thead {
        display: table-header-group;
      }
      tr {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      th, td {
        word-break: break-word !important;
        border-color: var(--border) !important;
      }
      th {
        background-color: var(--bg-bubble-user) !important;
        color: var(--text-primary) !important;
      }
      img {
        max-width: 100% !important;
        height: auto !important;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .export-footer {
        margin-top: 1.5rem !important;
        border-top: none !important;
        color: var(--text-secondary) !important;
      }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  </style>
  ${katexHeaders}
</head>
<body>
  <div class="container">
    <header>
      <div class="header-title-section">
        <div class="metadata">
          <span class="badge">${escapeHtml(platform)}</span>
          <span class="meta-item">Exported: ${formattedDate}</span>
          ${shouldIncludeAttribution(options) ? `<span class="meta-item"><a href="https://ace.covai.org/" target="_blank" style="color: inherit;">AI Chat Exporter</a></span>` : ''}
          ${link ? `<span class="meta-item"><a href="${escapeHtml(link)}" target="_blank" style="color: inherit;">Original Link</a></span>` : ''}
          ${model ? `<span class="meta-item">Model: ${escapeHtml(model)}</span>` : ''}
          ${method ? `<span class="meta-item">Method: ${escapeHtml(method)}</span>` : ''}
        </div>
        <h1>${escapeHtml(title || 'AI Chat Export')}</h1>
      </div>
    </header>

    <main class="message-list">
      ${tocHtml}
      ${formattedMessages}
    </main>

    ${
      shouldIncludeAttribution(options)
        ? `
    <footer class="export-footer">
      <p>Exported with <a href="https://ace.covai.org/" target="_blank" rel="noopener noreferrer">AI Chat Exporter</a></p>
    </footer>`
        : ''
    }
  </div>

  <script>
    function applyDocumentTheme(theme) {
      if (theme && theme !== 'system') {
        document.documentElement.setAttribute('data-theme', theme);
      } else {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', isDark ? 'modern-dark' : 'modern-light');
      }
    }

    window.addEventListener('message', (event) => {
      if (event.data && event.data.action === 'setTheme') {
        applyDocumentTheme(event.data.theme);
      }
    });

    document.addEventListener('click', (e) => {
      const codeBtn = e.target.closest('.copy-code-btn');
      if (codeBtn) {
        copyCode(codeBtn);
        return;
      }
      const msgBtn = e.target.closest('.copy-msg-btn');
      if (msgBtn) {
        copyMessage(msgBtn);
        return;
      }
    });

    async function copyCode(button) {
      const codeBlock = button.closest('.code-card').querySelector('code');
      const originalBtnText = button.querySelector('span').textContent;
      
      try {
        await navigator.clipboard.writeText(codeBlock.textContent);
        button.querySelector('span').textContent = 'Copied!';
        button.style.borderColor = '#10b981';
        button.style.color = '#10b981';
        
        setTimeout(() => {
          button.querySelector('span').textContent = originalBtnText;
          button.style.borderColor = '';
          button.style.color = '';
        }, 2000);
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
    }

    async function copyMessage(button) {
      const card = button.closest('.message-card');
      const content = card ? card.querySelector('.message-content') : null;
      if (!content) return;
      const text = content.innerText || content.textContent || '';
      const span = button.querySelector('span');
      const originalText = span ? span.textContent : 'Copy';
      
      try {
        await navigator.clipboard.writeText(text.trim());
        if (span) span.textContent = 'Copied!';
        button.style.borderColor = '#10b981';
        button.style.color = '#10b981';
        
        setTimeout(() => {
          if (span) span.textContent = originalText;
          button.style.borderColor = '';
          button.style.color = '';
        }, 2000);
      } catch (err) {
        console.error('Failed to copy message text: ', err);
      }
    }

    function highlightFallbackCode() {
      const kwRegex = new RegExp('\\b(const|let|var|function|return|if|else|for|while|import|export|from|class|extends|async|await|try|catch|def|self|print|public|private|static|void|int|string|boolean|type|interface|struct)\\b', 'g');
      const strRegex = new RegExp('("([^"\\\\]|\\\\.)*"|\x27([^\x27\\\\]|\\\\.)*\x27)', 'g');
      const comRegex = new RegExp('//[^\\n]*|/\\*[\\s\\S]*?\\*/|#[^\\n]*', 'g');
      const numRegex = new RegExp('\\b\\d+(\\.\\d+)?\\b', 'g');

      document.querySelectorAll('pre code').forEach((codeBlock) => {
        let html = codeBlock.innerHTML;
        if (html.includes('class="token')) return;
        html = html
          .replace(comRegex, '<span class="token comment">$1</span>')
          .replace(strRegex, (m) => (m.startsWith('<span') ? m : '<span class="token string">' + m + '</span>'))
          .replace(kwRegex, '<span class="token keyword">$1</span>')
          .replace(numRegex, '<span class="token number">$1</span>');
        codeBlock.innerHTML = html;
      });
    }

    window.addEventListener('DOMContentLoaded', () => {
      if (window.Prism) {
        Prism.highlightAll();
      } else {
        highlightFallbackCode();
      }
    });

    window.addEventListener('message', (event) => {
      if (event.data && event.data.action === 'print') {
        window.print();
      }
    });
  </script>
</body>
</html>`;
  }

  getFileExtension() {
    return 'html';
  }

  getMimeType() {
    return 'text/html';
  }
}

export function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function sanitizeUrl(url, isImage = false) {
  if (!url || typeof url !== 'string') return '';
  let trimmed = url.trim().replace(/^<|>$/g, '');
  trimmed = trimmed.replace(/&amp;/g, '&');
  if (isImage) {
    if (/^(?:https?:|data:image(?:\/|\\\/)|blob:|\/|\.\/)/i.test(trimmed)) {
      return trimmed
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
    return '';
  }
  if (/^(?:https?:|mailto:|tel:|#|\/|\.\/)/i.test(trimmed)) {
    return trimmed
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  return '';
}

function cleanLatexMath(latex) {
  if (!latex || typeof latex !== 'string') return '';
  return latex.replace(/\\\\([a-zA-Z]+)/g, '\\$1').replace(/\\([_\][*])/g, '$1');
}

function inlineParse(text, mathBlockPlaceholders = null, referenceDefs = null) {
  const placeholders = [];
  let tokenCounter = 0;

  // 1. Extract block math $$...$$ and \[...\]
  text = text.replace(/\\\[([\s\S]+?)\\\](?!\()/g, (match, math) => {
    const id = `{{MATHBLOCK${tokenCounter++}}}`;
    placeholders.push({
      id,
      html: `<span class="math-block">$$${cleanLatexMath(math)}$$</span>`,
    });
    return id;
  });

  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (match, math) => {
    const id = `{{MATHBLOCK${tokenCounter++}}}`;
    placeholders.push({
      id,
      html: `<span class="math-block">$$${cleanLatexMath(math)}$$</span>`,
    });
    return id;
  });

  // 2. Extract inline math $...$ and \(...\)
  text = text.replace(/\\\(([\s\S]+?)\\\)(?!\()/g, (match, math) => {
    const id = `{{MATHINLINE${tokenCounter++}}}`;
    placeholders.push({
      id,
      html: `<span class="math-inline">$${cleanLatexMath(math)}$</span>`,
    });
    return id;
  });

  text = text.replace(/\$([^$]+?)\$/g, (match, math) => {
    const id = `{{MATHINLINE${tokenCounter++}}}`;
    placeholders.push({
      id,
      html: `<span class="math-inline">$${cleanLatexMath(math)}$</span>`,
    });
    return id;
  });

  // 3. Extract inline code `...`
  text = text.replace(/`([^`]+?)`/g, (match, code) => {
    const id = `{{INLINECODE${tokenCounter++}}}`;
    const escapedCode = escapeHtml(code);
    placeholders.push({
      id,
      html: `<code>${escapedCode}</code>`,
    });
    return id;
  });

  // 3.5. Extract backslash escapes to prevent them from being formatted as markdown
  const escapePlaceholders = [];
  text = text.replace(/\\([\\`*_#+[\]()!.-])/g, (match, char) => {
    const id = `{{ESCAPECHAR${tokenCounter++}}}`;
    escapePlaceholders.push({ id, char });
    return id;
  });

  // 4. HTML escape remaining text
  text = escapeHtml(text);

  // 5. Replace bold **...** or __...__
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // 6. Replace italic *...* or _..._
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  text = text.replace(/_(.*?)_/g, '<em>$1</em>');

  // 6.5 Replace images ![alt](url)
  text = text.replace(/!\[(.*?)\]\((.*?)\)/g, (match, altText, url) => {
    const safeUrl = sanitizeUrl(url, true);
    if (!safeUrl) return '';
    return `<img src="${safeUrl}" alt="${altText}" style="max-width: 350px; width: 100%; height: auto; border-radius: 8px; margin: 0.5rem 0; display: block;" />`;
  });

  // Reference-style images ![alt][label]
  if (referenceDefs && referenceDefs.size > 0) {
    text = text.replace(/!\[(.*?)\]\[(.*?)\]/g, (match, altText, refId) => {
      const key = (refId || altText).trim().toLowerCase();
      const url = referenceDefs.get(key);
      if (url) {
        const safeUrl = sanitizeUrl(url, true);
        if (!safeUrl) return '';
        return `<img src="${safeUrl}" alt="${altText}" style="max-width: 350px; width: 100%; height: auto; border-radius: 8px; margin: 0.5rem 0; display: block;" />`;
      }
      return match;
    });
  }

  // 7. Replace links [text](url)
  text = text.replace(/\[(.*?)\]\((.*?)\)/g, (match, linkText, url) => {
    const safeUrl = sanitizeUrl(url, false);
    if (!safeUrl) return linkText;
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
  });

  // Reference-style links [text][label]
  if (referenceDefs && referenceDefs.size > 0) {
    text = text.replace(/\[(.*?)\]\[(.*?)\]/g, (match, linkText, refId) => {
      const key = (refId || linkText).trim().toLowerCase();
      const url = referenceDefs.get(key);
      if (url) {
        const safeUrl = sanitizeUrl(url, false);
        if (!safeUrl) return linkText;
        return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
      }
      return match;
    });
  }

  // 8. Restore escape placeholders first
  escapePlaceholders.forEach(({ id, char }) => {
    text = text.replace(id, () => escapeHtml(char));
  });

  // 9. Restore placeholders
  placeholders.forEach(({ id, html }) => {
    text = text.replace(id, () => html);
  });

  // 10. Restore outer block math placeholders if present
  if (mathBlockPlaceholders && mathBlockPlaceholders.size > 0) {
    for (const [id, mathHtml] of mathBlockPlaceholders.entries()) {
      if (text.includes(id)) {
        text = text.replaceAll(id, mathHtml);
      }
    }
  }

  return text;
}

function renderTable(rows, mathBlockPlaceholders = null, referenceDefs = null) {
  if (rows.length === 0) return '';

  const isSeparator = (r) => /^[|\s:-]+$/.test(r);

  const parsedRows = rows.map((r) => {
    const cells = r.split('|').map((c) => c.trim());
    if (cells[0] === '') cells.shift();
    if (cells[cells.length - 1] === '') cells.pop();
    return cells;
  });

  const bodyRows = [];
  let headerCells = [];
  let alignments = [];

  for (let i = 0; i < parsedRows.length; i++) {
    const rawRow = rows[i];
    const cells = parsedRows[i];

    if (i === 0) {
      headerCells = cells;
    } else if (isSeparator(rawRow)) {
      alignments = cells.map((cell) => {
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        if (left && right) return 'center';
        if (right) return 'right';
        return 'left';
      });
    } else {
      bodyRows.push(cells);
    }
  }

  let tableHtml = '<div class="table-wrapper"><table>\n';

  if (headerCells.length > 0) {
    tableHtml += '<thead><tr>\n';
    headerCells.forEach((cell, idx) => {
      const align = alignments[idx] ? ` style="text-align: ${alignments[idx]};"` : '';
      tableHtml += `  <th${align}>${inlineParse(cell, mathBlockPlaceholders, referenceDefs)}</th>\n`;
    });
    tableHtml += '</tr></thead>\n';
  }

  if (bodyRows.length > 0) {
    tableHtml += '<tbody>\n';
    bodyRows.forEach((row) => {
      tableHtml += '<tr>\n';
      row.forEach((cell, idx) => {
        const align = alignments[idx] ? ` style="text-align: ${alignments[idx]};"` : '';
        tableHtml += `  <td${align}>${inlineParse(cell, mathBlockPlaceholders, referenceDefs)}</td>\n`;
      });
      tableHtml += '</tr>\n';
    });
    tableHtml += '</tbody>\n';
  }

  tableHtml += '</table></div>\n';
  return tableHtml;
}

export function markdownToHtml(mdText) {
  if (!mdText) return '';

  // Process <think>...</think> reasoning blocks into collapsible details
  mdText = mdText.replace(/<think>([\s\S]*?)<\/think>/gi, (match, thinkContent) => {
    return `\n\n<details class="thinking-block"><summary class="thinking-summary"><svg class="thinking-icon" viewBox="0 0 24 24" width="14" height="14"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.5h-2v-2h2zm0-4h-2V7h2z"/></svg> Thinking Process</summary><div class="thinking-content">\n\n${thinkContent.trim()}\n\n</div></details>\n\n`;
  });

  // 1. Protect fenced code blocks (``` ... ``` or ~~~ ... ~~~)
  const codeBlockPlaceholders = [];
  let codeBlockCounter = 0;
  mdText = mdText.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, (match) => {
    const id = `@@HTML_CODE_BLOCK_${codeBlockCounter++}@@`;
    codeBlockPlaceholders.push({ id, content: match });
    return id;
  });

  // 2. Protect inline code (`...`)
  const inlineCodePlaceholders = [];
  let inlineCodeCounter = 0;
  mdText = mdText.replace(/`([^`\n]+?)`/g, (match) => {
    const id = `@@HTML_INLINE_CODE_${inlineCodeCounter++}@@`;
    inlineCodePlaceholders.push({ id, content: match });
    return id;
  });

  // 3. Convert multi-line or bracket display math \[ ... \] or \\[ ... \\] to $$ ... $$
  mdText = mdText.replace(/(?:\\{1,2}\[)([\s\S]+?)(?:\\{1,2}\])(?!\()/g, (match, math) => {
    return `\n\n$$${math}$$\n\n`;
  });

  // 4. Convert inline math \( ... \) or \\( ... \\) to $ ... $
  mdText = mdText.replace(/(?:\\{1,2}\()([\s\S]+?)(?:\\{1,2}\))(?!\()/g, (match, math) => {
    return `$${math}$`;
  });

  // 5. Pre-extract display math blocks ($$ ... $$) so multi-line equations are preserved as single blocks
  const mathBlockPlaceholders = new Map();
  let mathBlockCounter = 0;
  mdText = mdText.replace(/\$\$([\s\S]+?)\$\$/g, (match, math, offset, fullText) => {
    const isMultiLine = math.includes('\n');
    let isStandalone = isMultiLine;
    if (!isStandalone) {
      const lineStart = fullText.lastIndexOf('\n', offset - 1);
      const before = fullText.substring(lineStart + 1, offset);
      const end = offset + match.length;
      const lineEnd = fullText.indexOf('\n', end);
      const after = lineEnd === -1 ? fullText.substring(end) : fullText.substring(end, lineEnd);
      isStandalone = before.trim() === '' && after.trim() === '';
    }

    if (isStandalone) {
      const id = `@@HTML_MATH_BLOCK_${mathBlockCounter++}@@`;
      const cleanMath = isMultiLine ? cleanLatexMath(math).trim() : cleanLatexMath(math);
      mathBlockPlaceholders.set(id, `<span class="math-block">$$${cleanMath}$$</span>`);
      return `\n\n${id}\n\n`;
    }

    // Inline math: convert to $...$ so it does not inject blank lines or break surrounding prose
    return `$${cleanLatexMath(math)}$`;
  });

  // 6. Restore code blocks
  for (let i = inlineCodePlaceholders.length - 1; i >= 0; i--) {
    const { id, content } = inlineCodePlaceholders[i];
    mdText = mdText.replace(id, () => content);
  }
  for (let i = codeBlockPlaceholders.length - 1; i >= 0; i--) {
    const { id, content } = codeBlockPlaceholders[i];
    mdText = mdText.replace(id, () => content);
  }

  // 7. Extract reference link / image definitions: [label]: url or [label]: <url>
  const referenceDefs = new Map();
  mdText = mdText.replace(
    /^\s*\[([^\]]+)\]:\s*<?(\S+?)>?(?:\s+["'(].*?["')])?\s*$/gm,
    (match, label, url) => {
      referenceDefs.set(label.trim().toLowerCase(), url.trim());
      return '';
    },
  );

  const parseInline = (text) => inlineParse(text, mathBlockPlaceholders, referenceDefs);

  const lines = mdText.split(/\r?\n/);
  let html = '';

  let inCodeBlock = false;
  let codeLines = [];
  let codeLang = '';

  let inList = false;
  let listType = '';

  let inTable = false;
  let tableRows = [];

  let inBlockquote = false;
  let blockquoteContent = [];

  let inParagraph = false;
  let paragraphContent = [];

  function closeAllBlocks() {
    if (inCodeBlock) {
      const codeText = codeLines.join('\n');
      const escapedCode = escapeHtml(codeText);
      const displayLang = escapeHtml(codeLang || 'code');
      html += `<div class="code-card">
  <div class="code-card-header">
    <span class="code-lang">${displayLang}</span>
    <button class="copy-code-btn">
      <svg class="copy-icon" viewBox="0 0 24 24" width="14" height="14"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
      <span>Copy</span>
    </button>
  </div>
  <pre><code class="language-${displayLang}">${escapedCode}</code></pre>
</div>\n`;
      inCodeBlock = false;
      codeLines = [];
      codeLang = '';
    }

    if (inList) {
      html += `</${listType}>\n`;
      inList = false;
      listType = '';
    }

    if (inTable) {
      html += renderTable(tableRows, mathBlockPlaceholders, referenceDefs);
      inTable = false;
      tableRows = [];
    }

    if (inBlockquote) {
      html += `<blockquote>${blockquoteContent.map((l) => parseInline(l)).join('<br>\n')}</blockquote>\n`;
      inBlockquote = false;
      blockquoteContent = [];
    }

    if (inParagraph) {
      html += `<p>${paragraphContent.map((l) => parseInline(l)).join('<br>\n')}</p>\n`;
      inParagraph = false;
      paragraphContent = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (
      trimmed.startsWith('<details class="thinking-block">') ||
      trimmed.startsWith('<summary class="thinking-summary">') ||
      trimmed.startsWith('<div class="thinking-content">') ||
      trimmed === '</div>' ||
      trimmed === '</details>'
    ) {
      closeAllBlocks();
      html += line + '\n';
      continue;
    }

    if (mathBlockPlaceholders.has(trimmed)) {
      closeAllBlocks();
      html += `<p>${mathBlockPlaceholders.get(trimmed)}</p>\n`;
      continue;
    }

    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        closeAllBlocks();
      } else {
        closeAllBlocks();
        inCodeBlock = true;
        codeLang = trimmed.substring(3).trim().toLowerCase();
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (trimmed === '') {
      closeAllBlocks();
      continue;
    }

    if (line.startsWith('>')) {
      if (!inBlockquote) {
        closeAllBlocks();
        inBlockquote = true;
      }
      const content = line.substring(1).replace(/^\s/, '');
      blockquoteContent.push(content);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeAllBlocks();
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      html += `<h${level}>${parseInline(text)}</h${level}>\n`;
      continue;
    }

    if (trimmed === '* * *' || trimmed === '***' || trimmed === '---' || trimmed === '___') {
      closeAllBlocks();
      html += `<hr>\n`;
      continue;
    }

    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        closeAllBlocks();
        inTable = true;
      }
      tableRows.push(line);
      continue;
    } else if (inTable) {
      closeAllBlocks();
    }

    const ulMatch = line.match(/^([*\-+])\s+(.*)$/);
    const olMatch = line.match(/^(\d+)\.\s+(.*)$/);

    if (ulMatch) {
      let itemContent = ulMatch[2];
      let isTask = false;
      let isChecked = false;

      const taskMatch = itemContent.match(/^\[([ xX])\]\s+(.*)$/);
      if (taskMatch) {
        isTask = true;
        isChecked = taskMatch[1].toLowerCase() === 'x';
        itemContent = taskMatch[2];
      }

      if (inList && listType !== 'ul') {
        closeAllBlocks();
      }
      if (!inList) {
        closeAllBlocks();
        inList = true;
        listType = 'ul';
        html += `<ul${isTask ? ' class="task-list"' : ''}>\n`;
      }
      if (isTask) {
        html += `<li class="task-list-item"><input type="checkbox" class="task-checkbox" disabled${isChecked ? ' checked' : ''}><span>${parseInline(itemContent)}</span></li>\n`;
      } else {
        html += `<li>${parseInline(itemContent)}</li>\n`;
      }
      continue;
    }

    if (olMatch) {
      if (inList && listType !== 'ol') {
        closeAllBlocks();
      }
      if (!inList) {
        closeAllBlocks();
        inList = true;
        listType = 'ol';
        html += `<ol>\n`;
      }
      html += `<li>${parseInline(olMatch[2])}</li>\n`;
      continue;
    }

    if (inList || inBlockquote || inTable) {
      closeAllBlocks();
    }

    if (!inParagraph) {
      inParagraph = true;
    }
    paragraphContent.push(trimmed);
  }

  closeAllBlocks();

  return html;
}
