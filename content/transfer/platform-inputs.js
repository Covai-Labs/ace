// Per-platform composer selectors, derived from DOM snapshots in
// Scratch/new chat tab for continuation/ (*-clean.html, empty new-chat pages).
// Ordered by specificity; the injector picks the first VISIBLE + EDITABLE match.

export const COMPOSER_SELECTORS = {
  chatgpt: [
    'div#prompt-textarea.ProseMirror[contenteditable="true"]',
    '#prompt-textarea[contenteditable="true"]',
    'div.ProseMirror[role="textbox"][contenteditable="true"]',
  ],
  claude: [
    'div[data-testid="chat-input"][contenteditable="true"]',
    'div[data-cds="ChatComposerEditor"] [contenteditable="true"]',
    'div.tiptap.ProseMirror[contenteditable="true"]',
  ],
  gemini: [
    'rich-textarea div.ql-editor[contenteditable="true"]',
    'div.ql-editor[role="textbox"][contenteditable="true"]',
    '#chat-window-input-container [contenteditable="true"]',
  ],
  deepseek: ['textarea[placeholder="Message DeepSeek"]', 'form textarea'],
  perplexity: [
    'div#ask-input[data-lexical-editor="true"]',
    'div[data-ask-input-container="true"] [contenteditable="true"]',
    '#ask-input[contenteditable="true"]',
  ],
  qwen: ['textarea.message-input-textarea', 'textarea[placeholder="Ask Qwen"]'],
  mistral: [
    'div.ProseMirror[contenteditable="true"][data-placeholder]',
    'div.ProseMirror[contenteditable="true"]',
    'form [contenteditable="true"]',
  ],
  lumo: [
    'textarea.composer',
    'textarea.tiptap.ProseMirror',
    'textarea[placeholder^="Ask anything"]',
  ],
  copilot: [
    'span#m365-chat-editor-target-element[contenteditable="true"]',
    'span[data-lexical-editor="true"][contenteditable="true"]',
    'span.fai-BebopLiteChatInput__editor [contenteditable="true"]',
  ],
  meta: [
    'div[data-testid="composer-input"][contenteditable="true"]',
    'div[data-lexical-editor="true"][contenteditable="true"]',
  ],
  z_ai: [
    'textarea#chat-input',
    'textarea[placeholder="How can I help you today?"]',
    'form textarea',
  ],
  grok: [
    'div[data-testid="chat-input"] [contenteditable="true"]',
    'div.query-bar-editor[contenteditable="true"]',
    'div.tiptap.ProseMirror[role="textbox"]',
  ],
};

// Last-resort generics (visible + editable filter still applies).
export const GENERIC_COMPOSER_SELECTORS = [
  'div[contenteditable="true"][role="textbox"]',
  'div[contenteditable="true"]',
  'textarea:not([aria-hidden="true"]):not([tabindex="-1"])',
];

export function getComposerSelectors(targetId) {
  const specific = COMPOSER_SELECTORS[targetId] || [];
  return [...specific, ...GENERIC_COMPOSER_SELECTORS];
}

// Send-button selectors for auto-send. Targets without an entry use Enter key.
export const SEND_SELECTORS = {
  claude: ['button[data-testid="chat-input-send"]'],
  meta: ['button[data-testid="composer-send-button"]', 'button[aria-label="Send"]'],
  z_ai: ['div[aria-label="Send Message"]', 'button[aria-label="Send Message"]'],
  mistral: ['form button[type="submit"]'],
};

export function getSendSelectors(targetId) {
  return SEND_SELECTORS[targetId] || [];
}

// Overlays that can cover the composer and swallow a paste.
export const BLOCKER_SELECTORS = [
  'div[role="dialog"][aria-modal="true"]',
  '#onetrust-banner-sdk',
  '#onetrust-pc-sdk:not([hidden])',
  '#cf-overlay:not([style*="display: none"])',
];
