// Shared transfer-target registry (12 supported AI chat targets).
// Transfer-only: export/parsing still supports every decant-core platform.
// Imported by background service workers and popup/preview/options UIs.

export const TRANSFER_TARGETS = [
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'claude', label: 'Claude', url: 'https://claude.ai/new' },
  { id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com/app' },
  { id: 'deepseek', label: 'DeepSeek', url: 'https://chat.deepseek.com/' },
  { id: 'perplexity', label: 'Perplexity', url: 'https://www.perplexity.ai/' },
  { id: 'qwen', label: 'Qwen', url: 'https://chat.qwen.ai/' },
  { id: 'mistral', label: 'Mistral', url: 'https://chat.mistral.ai/' },
  { id: 'lumo', label: 'Lumo', url: 'https://lumo.proton.me/' },
  { id: 'copilot', label: 'Copilot', url: 'https://copilot.com/' },
  {
    id: 'meta',
    label: 'Meta AI',
    url: 'https://www.meta.ai/',
    requiresAuth: true,
    authNote: 'Meta AI requires sign-in before the prompt can be submitted.',
  },
  { id: 'z_ai', label: 'Z.ai', url: 'https://chat.z.ai/' },
  { id: 'grok', label: 'Grok', url: 'https://grok.com/' },
];

export const TRANSFER_TARGET_IDS = TRANSFER_TARGETS.map((t) => t.id);

export const PLATFORM_URLS = Object.fromEntries(TRANSFER_TARGETS.map((t) => [t.id, t.url]));

export function getTransferTarget(id) {
  return TRANSFER_TARGETS.find((t) => t.id === id) || null;
}

export function isSupportedTransferTarget(id) {
  return TRANSFER_TARGET_IDS.includes(id);
}
