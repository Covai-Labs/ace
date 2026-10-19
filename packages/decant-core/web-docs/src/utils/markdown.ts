// Minimal Markdown subset renderer for release notes and changelogs.
// Covers the constructs generated changelogs use: fenced code, ## / ###
// headings, unordered lists, links, bold, and inline code. Keep in sync with
// the client-side copy embedded in release-notes pages that fetch GitHub
// Releases at runtime.

export function escapeHtml(source: string): string {
  return source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderInline(source: string): string {
  let out = escapeHtml(source);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(
    /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  out = out.replace(
    /(^|[\s(>])(https?:\/\/[^\s<)]+)/g,
    '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>',
  );
  return out;
}

export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let inList = false;
  let inCode = false;

  function closeList(): void {
    if (inList) {
      html += '</ul>';
      inList = false;
    }
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('```')) {
      closeList();
      html += inCode ? '</code></pre>' : '<pre><code>';
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      html += `${escapeHtml(raw)}\n`;
      continue;
    }
    if (line.startsWith('### ')) {
      closeList();
      html += `<h3>${renderInline(line.slice(4))}</h3>`;
    } else if (line.startsWith('## ')) {
      closeList();
      html += `<h2>${renderInline(line.slice(3))}</h2>`;
    } else if (line.startsWith('* ') || line.startsWith('- ')) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${renderInline(line.slice(2))}</li>`;
    } else if (line === '' || line === '---') {
      closeList();
    } else if (line.startsWith('# ')) {
      closeList();
      html += `<h2>${renderInline(line.slice(2))}</h2>`;
    } else {
      closeList();
      html += `<p>${renderInline(line)}</p>`;
    }
  }
  closeList();
  if (inCode) html += '</code></pre>';
  return html;
}
