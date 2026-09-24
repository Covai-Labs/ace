import { ExportFormatter, shouldIncludeAttribution } from './base.js';
import { getMessageNumber, normalizeMessageNumbering } from './base.js';
import { markdownToHtml, escapeHtml } from './html.js';

export class DocFormatter extends ExportFormatter {
  format(conversation, options = {}) {
    const { title, messages } = conversation;
    const now = new Date();
    const formattedDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${now.toLocaleTimeString('en-US', { hour12: false })}`;

    const platform = conversation.metadata?.Source || 'AI';
    const link = conversation.url || conversation.metadata?.Link || '';
    const model = conversation.metadata?.Model || '';
    const method = conversation.metadata?.Method || '';

    const metaParts = [`Exported from ${escapeHtml(platform)}`, formattedDate];
    if (shouldIncludeAttribution(options)) {
      metaParts.push(
        '<a href="https://ace.covai.org/" style="color: #64748b;">AI Chat Exporter</a>',
      );
    }
    if (link) {
      metaParts.push(`<a href="${escapeHtml(link)}" style="color: #64748b;">Original Link</a>`);
    }
    if (model) {
      metaParts.push(`Model: ${escapeHtml(model)}`);
    }
    if (method) {
      metaParts.push(`Method: ${escapeHtml(method)}`);
    }

    const isWebArticle = platform === 'Web Article' || platform === 'WebArticle';

    const formattedMessages = isWebArticle
      ? messages
          .map((msg) => {
            const rawHtmlContent = markdownToHtml(msg.content);
            const htmlContent = rawHtmlContent
              .replace(/<button[^>]*>[\s\S]*?<\/button>/gi, '')
              .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '');

            return `
        <div class="message-card role-assistant">
          <div class="message-content">
            ${htmlContent}
          </div>
        </div>
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
            const rawHtmlContent = markdownToHtml(msg.content);
            // Strip copy buttons and inline SVGs which cause LibreOffice HTML import filter errors
            const htmlContent = rawHtmlContent
              .replace(/<button[^>]*>[\s\S]*?<\/button>/gi, '')
              .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '');

            return `
        <div class="message-card ${roleClass}">
          <div class="message-header">
            <span class="message-avatar">${avatarText}</span>
            <span>${escapeHtml(displayName)}</span>
          </div>
          <div class="message-content">
            ${htmlContent}
          </div>
        </div>
      `;
          })
          .join('\n');

    return `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title || 'AI Chat Export')}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Normal</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    body {
      font-family: 'Calibri', 'Arial', sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #0f172a;
      margin: 1in;
    }
    h1, h2, h3, h4, h5, h6 {
      color: #1e293b;
      font-family: 'Calibri', 'Arial', sans-serif;
      margin-top: 1em;
      margin-bottom: 0.5em;
    }
    .header-box {
      border-bottom: 2pt solid #4f46e5;
      padding-bottom: 12px;
      margin-bottom: 24px;
    }
    .chat-title {
      font-size: 20pt;
      font-weight: bold;
      color: #1e293b;
      margin: 0 0 6px 0;
    }
    .meta-info {
      font-size: 9.5pt;
      color: #64748b;
    }
    .message-card {
      margin-bottom: 16px;
      padding: 12px 16px;
      border: 1pt solid #cbd5e1;
      background-color: #ffffff;
    }
    .role-user {
      background-color: #f8fafc;
      border-left: 4pt solid #4f46e5;
    }
    .role-assistant {
      background-color: #ffffff;
      border-left: 4pt solid #10b981;
    }
    .message-header {
      font-weight: bold;
      font-size: 11pt;
      color: #334155;
      margin-bottom: 8px;
    }
    .message-avatar {
      display: inline-block;
      width: 18px;
      height: 18px;
      background-color: #4f46e5;
      color: #ffffff;
      text-align: center;
      font-weight: bold;
      margin-right: 6px;
    }
    .message-content {
      font-size: 10.5pt;
      color: #1e293b;
    }
    pre, code {
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 9.5pt;
      background-color: #f1f5f9;
    }
    pre {
      padding: 10px;
      border: 1pt solid #cbd5e1;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 12px 0;
    }
    th, td {
      border: 1pt solid #cbd5e1;
      padding: 6px 10px;
      text-align: left;
    }
    th {
      background-color: #f1f5f9;
      font-weight: bold;
    }
    blockquote {
      border-left: 3pt solid #cbd5e1;
      margin-left: 0;
      padding-left: 10px;
      color: #475569;
      font-style: italic;
    }
    .copy-code-btn,
    .copy-msg-btn {
      display: none !important;
    }
    .code-card {
      margin: 12px 0;
      border: 1pt solid #cbd5e1;
      background-color: #0f172a;
      color: #f8fafc;
    }
    .code-card-header {
      background-color: #1e293b;
      color: #94a3b8;
      padding: 6px 12px;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 9pt;
      font-weight: bold;
      border-bottom: 1pt solid #334155;
    }
    .code-lang {
      text-transform: lowercase;
    }
    .thinking-block {
      margin: 12px 0;
      border: 1pt solid #cbd5e1;
      border-left: 3pt solid #6366f1;
      background-color: #f8fafc;
      padding: 10px 14px;
    }
    .thinking-summary {
      font-weight: bold;
      color: #4f46e5;
      font-size: 10pt;
      margin-bottom: 4px;
    }
    .thinking-icon {
      display: none;
    }
    .thinking-content {
      color: #475569;
      font-size: 10pt;
    }
    ul.task-list {
      list-style-type: none;
      padding-left: 0;
    }
    .task-list-item {
      list-style-type: none;
      margin: 4px 0;
    }
    .task-checkbox {
      margin-right: 6px;
    }
  </style>
</head>
<body>
  <div class="header-box">
    <div class="chat-title">${escapeHtml(title || 'AI Chat Export')}</div>
    <div class="meta-info">${metaParts.join(' • ')}</div>
  </div>
  ${formattedMessages}
</body>
</html>`;
  }

  getFileExtension() {
    return 'doc';
  }

  getMimeType() {
    return 'application/msword';
  }
}
