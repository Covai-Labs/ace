// Central metadata for all SEO guide pages.
// Used by the guides index and cross-linking.

export type GuideCategory = 'platform' | 'format';

export interface GuideMeta {
  slug: string;
  /** Short link title for cards and cross-links. */
  title: string;
  /** One-line card description. */
  desc: string;
  category: GuideCategory;
  /** Group label used on the guides index. */
  group: string;
}

export const guides: GuideMeta[] = [
  // ── Platforms ──
  {
    slug: 'chatgpt-exporter',
    title: 'ChatGPT Exporter',
    desc: 'Export ChatGPT to Markdown, PDF, JSON & more',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'chatgpt-to-markdown',
    title: 'ChatGPT to Markdown',
    desc: 'Save ChatGPT conversations as .md files',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'chatgpt-to-pdf',
    title: 'ChatGPT to PDF',
    desc: 'Turn ChatGPT chats into polished PDFs',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'claude-exporter',
    title: 'Claude Exporter',
    desc: 'Export Claude conversations & artifacts',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'claude-to-markdown',
    title: 'Claude to Markdown',
    desc: 'Claude conversations as clean .md files',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'claude-to-obsidian',
    title: 'Claude to Obsidian',
    desc: 'Sync Claude chats into your Obsidian vault',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'gemini-exporter',
    title: 'Gemini Exporter',
    desc: 'Export Google Gemini conversations',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'gemini-to-markdown',
    title: 'Gemini to Markdown',
    desc: 'Gemini chats as portable Markdown',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'deepseek-exporter',
    title: 'DeepSeek Exporter',
    desc: 'Export DeepSeek chats with reasoning blocks',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'perplexity-exporter',
    title: 'Perplexity Exporter',
    desc: 'Export Perplexity searches & answers',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'copilot-exporter',
    title: 'Copilot Exporter',
    desc: 'Save Microsoft Copilot conversations',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'duck-ai-exporter',
    title: 'Duck.ai Exporter',
    desc: 'Export DuckDuckGo AI private conversations',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'grok-exporter',
    title: 'Grok Exporter',
    desc: 'Export Grok chats with reasoning & citations',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'meta-ai-exporter',
    title: 'Meta AI Exporter',
    desc: 'Save Meta AI chats & generated images',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'mistral-exporter',
    title: 'Mistral Exporter',
    desc: 'Export Mistral AI & Le Chat conversations',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'lumo-exporter',
    title: 'Proton Lumo Exporter',
    desc: 'Export private Proton Lumo conversations',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'qwen-exporter',
    title: 'Qwen Exporter',
    desc: 'Save Qwen conversations with Monaco code blocks',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'z-ai-exporter',
    title: 'Z.ai Exporter',
    desc: 'Export Zhipu Z.ai and GLM conversations',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'google-ai-studio-exporter',
    title: 'Google AI Studio Exporter',
    desc: 'Save Gemini developer prompts and chats',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'notebooklm-exporter',
    title: 'NotebookLM Exporter',
    desc: 'Export NotebookLM notes, sources & answers',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'joyland-exporter',
    title: 'Joyland Exporter',
    desc: 'Export character chats from Joyland.ai',
    category: 'platform',
    group: 'By platform',
  },
  {
    slug: 'chub-ai-exporter',
    title: 'Chub AI Exporter',
    desc: 'Export character roleplay transcripts from Chub',
    category: 'platform',
    group: 'By platform',
  },

  // ── Formats & workflows ──
  {
    slug: 'markdown-exporter',
    title: 'Markdown Export',
    desc: 'Export any AI chat as Markdown',
    category: 'format',
    group: 'By format or workflow',
  },
  {
    slug: 'pdf-exporter',
    title: 'PDF Export',
    desc: 'Generate PDFs from AI conversations',
    category: 'format',
    group: 'By format or workflow',
  },
  {
    slug: 'json-exporter',
    title: 'JSON Export',
    desc: 'Structured JSON with a strict schema',
    category: 'format',
    group: 'By format or workflow',
  },
  {
    slug: 'png-exporter',
    title: 'PNG Export',
    desc: 'Share AI chats as polished images',
    category: 'format',
    group: 'By format or workflow',
  },
  {
    slug: 'obsidian-export',
    title: 'AI Chat to Obsidian',
    desc: 'Send chats to Obsidian & other PKM apps',
    category: 'format',
    group: 'By format or workflow',
  },
  {
    slug: 'cross-ai-transfer',
    title: 'Cross-AI Transfer',
    desc: 'Continue chats in another AI platform',
    category: 'format',
    group: 'By format or workflow',
  },
  {
    slug: 'ai-chat-backup',
    title: 'AI Chat Backup',
    desc: 'Keep safe, searchable archives',
    category: 'format',
    group: 'By format or workflow',
  },
  {
    slug: 'latex-export',
    title: 'LaTeX Export',
    desc: 'Export math-heavy chats for LaTeX',
    category: 'format',
    group: 'By format or workflow',
  },
];

export const platformGuides = guides.filter((g) => g.category === 'platform');
export const formatGuides = guides.filter((g) => g.category === 'format');

export function guideHref(slug: string): string {
  return `/${slug}.html`;
}

export function getGuide(slug: string): GuideMeta | undefined {
  return guides.find((g) => g.slug === slug);
}
