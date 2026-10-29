import DOMPurifyFactory from '../lib/purify.es.js';

let purifyInstance = null;

function getPurifyInstance() {
  if (purifyInstance) return purifyInstance;

  if (typeof window !== 'undefined' && window.document) {
    if (typeof DOMPurifyFactory === 'function') {
      try {
        purifyInstance = DOMPurifyFactory(window);
      } catch {
        purifyInstance = DOMPurifyFactory;
      }
    } else if (DOMPurifyFactory && typeof DOMPurifyFactory.sanitize === 'function') {
      purifyInstance = DOMPurifyFactory;
    }
  }

  return purifyInstance;
}

/**
 * Sanitizes HTML string using DOMPurify to prevent XSS.
 * @param {string} html Raw HTML content
 * @returns {string} Sanitized HTML string
 */
export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';

  const purify = getPurifyInstance();

  if (purify && typeof purify.sanitize === 'function') {
    const sanitized = purify.sanitize(html, {
      USE_PROFILES: { html: true, svg: true, mathMl: true },
      ADD_TAGS: ['details', 'summary', 'input'],
      ADD_ATTR: ['target', 'rel', 'class', 'style', 'disabled', 'checked', 'type'],
    });
    if (sanitized !== undefined) {
      return sanitized;
    }
  }

  // Fallback regex sanitizer for Node test runner / non-browser environments
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"');
}
