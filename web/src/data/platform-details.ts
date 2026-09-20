export interface FeatureCard {
  title: string;
  desc: string;
}

export interface PlatformFAQItem {
  q: string;
  a: string;
}

export interface DynamicPlatformGuide {
  slug: string;
  platformName: string;
  title: string;
  description: string;
  heroTitle: string;
  heroSubtitle: string;
  badge: string;
  whyExport: string[];
  parsingHighlightsTitle: string;
  parsingHighlightsDesc: string;
  features: FeatureCard[];
  faqs: PlatformFAQItem[];
}

export const DYNAMIC_PLATFORMS: DynamicPlatformGuide[] = [
  {
    slug: 'duck-ai-exporter',
    platformName: 'Duck.ai',
    title: 'Duck.ai Exporter',
    description: 'Export Duck.ai (DuckDuckGo AI) conversations to Markdown, PDF, JSON & more',
    heroTitle: 'Duck.ai Exporter — Save & Archive DuckDuckGo AI Chats',
    heroSubtitle:
      'Export Duck.ai private chats with math, code, tables, and citations intact. Since Duck.ai chats are not stored in the cloud, export them locally before they disappear.',
    badge: '100% Client-Side Privacy',
    whyExport: [
      'Duck.ai (DuckDuckGo AI Chat) is built from the ground up for privacy. Conversations are never stored on DuckDuckGo servers or tied to a user account. This means once your browser session ends or cache clears, your conversation is gone forever.',
      'AI Chat Exporter operates entirely locally inside your browser with zero network transmission. It extracts the complete conversation turn-by-turn with model badges, KaTeX formulas, tables, and search citations directly from the DOM, ensuring your private chats stay private on your own disk.',
    ],
    parsingHighlightsTitle: 'Duck.ai-Specific Extraction',
    parsingHighlightsDesc:
      'AI Chat Exporter integrates decant-core with dedicated selectors and sanitization built specifically for Duck.ai:',
    features: [
      {
        title: 'Model Badge Preservation',
        desc: 'Captures the specific model used for each turn (e.g. Gemma 4 31B, gpt-oss 120B) directly in the exported metadata.',
      },
      {
        title: 'KaTeX Math Equations',
        desc: 'Standardizes Duck.ai mathematical formulas into clean Markdown math delimiters ($...$ and $$...$$) compatible with Obsidian and LaTeX.',
      },
      {
        title: 'Streamdown Code Fencing',
        desc: 'Extracts Shiki-highlighted code blocks with their detected language tags, preserving indentation and structure.',
      },
      {
        title: 'Clean Source Citations',
        desc: 'Sanitizes DuckDuckGo favicon icons and formats web search citations into clean, clickable Markdown links.',
      },
    ],
    faqs: [
      {
        q: 'Does Duck.ai store my chats on its servers?',
        a: 'No. DuckDuckGo does not save chat histories on its backend. Exporting with AI Chat Exporter is the safest way to preserve your important research notes.',
      },
      {
        q: 'Can I export chats to Obsidian or Markdown?',
        a: 'Yes! You can download clean .md files, copy dual-MIME rich text to your clipboard, or trigger direct export into Obsidian using <code>obsidian://new</code> URIs.',
      },
      {
        q: 'Does this extension track or upload my Duck.ai prompts?',
        a: 'Never. AI Chat Exporter has zero analytics, zero external servers, and zero telemetry. Everything runs 100% client-side in your browser.',
      },
    ],
  },
  {
    slug: 'grok-exporter',
    platformName: 'Grok',
    title: 'Grok Exporter',
    description: 'Export Grok conversations with real-time web search and thinking blocks',
    heroTitle: 'Grok Exporter — Save xAI Grok Conversations',
    heroSubtitle:
      'Export Grok chats with thinking blocks, real-time web citations, and code blocks preserved across seven clean formats.',
    badge: 'Supports Grok Reasoning & Web Citations',
    whyExport: [
      'Grok by xAI provides real-time access to current events, search results, and deep reasoning models. Researchers, analysts, and developers rely on Grok for live data analysis and code generation.',
      'AI Chat Exporter captures the full conversation tree in Grok, preserving reasoning steps, citations, and multi-turn discussions into clean, portable files.',
    ],
    parsingHighlightsTitle: 'Grok-Specific Extraction',
    parsingHighlightsDesc:
      'Our engine connects with Grok internal response trees and semantic DOM fallbacks:',
    features: [
      {
        title: 'Reasoning & Thinking Blocks',
        desc: 'Preserves Grok step-by-step thinking processes formatted cleanly without UI clutter.',
      },
      {
        title: 'Web Citations & Real-Time Sources',
        desc: 'Retains reference links and real-time news sources cited during the conversation.',
      },
      {
        title: 'Code Syntax Highlighting',
        desc: 'Extracts syntax-highlighted code snippets with appropriate language tags for documentation.',
      },
      {
        title: 'Chat Continuation',
        desc: 'Seamlessly hand off Grok discussions to Claude, ChatGPT, or Gemini with full context preserved.',
      },
    ],
    faqs: [
      {
        q: 'Can I export Grok conversations to PDF or Markdown?',
        a: 'Yes. AI Chat Exporter supports Markdown, formatted Word documents (.doc), print-ready PDF, structured JSON, and high-resolution PNG images.',
      },
      {
        q: 'Does it support Grok reasoning models?',
        a: 'Yes, thinking and reasoning blocks are retained and formatted as clear blockquotes in Markdown and tagged in JSON.',
      },
    ],
  },
  {
    slug: 'meta-ai-exporter',
    platformName: 'Meta AI',
    title: 'Meta AI Exporter',
    description: 'Export Meta AI chats, search results, and generated images',
    heroTitle: 'Meta AI Exporter — Archive Conversations from Meta.ai',
    heroSubtitle:
      'Export Meta AI discussions to clean Markdown, JSON, and PDF with full turn ordering, media, and formatting intact.',
    badge: 'GraphQL & DOM Extraction',
    whyExport: [
      'Meta AI powers conversational search, code assistance, and creative writing. Having offline, searchable backups ensures you never lose critical project prompts or creative ideas.',
      'AI Chat Exporter reads Meta AI threads locally, outputting well-structured documents ready for note-taking apps like Obsidian, Notion, and Logseq.',
    ],
    parsingHighlightsTitle: 'Meta AI Extraction Features',
    parsingHighlightsDesc:
      'Engineered specifically for Meta AI GraphQL payloads and dynamic web interfaces:',
    features: [
      {
        title: 'Complete Thread Pagination',
        desc: 'Captures full historical message threads beyond what is currently visible on the screen.',
      },
      {
        title: 'Clean Markdown & Tables',
        desc: 'Converts responses into standard GitHub-Flavored Markdown tables, lists, and headers.',
      },
      {
        title: 'Zero Cloud Storage',
        desc: 'Conversations are converted entirely in your local browser sandbox.',
      },
      {
        title: 'One-Click Copy & Download',
        desc: 'Copy rich formatted text directly to your clipboard or download files in your chosen format.',
      },
    ],
    faqs: [
      {
        q: 'How do I save a Meta AI conversation as a PDF?',
        a: 'Open any chat on meta.ai, click the AI Chat Exporter extension, select the PDF format tab in preview, and click Export PDF.',
      },
      {
        q: 'Can I send Meta AI chats to Obsidian?',
        a: 'Yes, click the Obsidian export button or enable direct PKM export in settings to send chats straight to your vault.',
      },
    ],
  },
  {
    slug: 'mistral-exporter',
    platformName: 'Mistral / Le Chat',
    title: 'Mistral Exporter',
    description: 'Export Mistral AI and Le Chat conversations to Markdown and PDF',
    heroTitle: 'Mistral Exporter — Save Conversations from Le Chat',
    heroSubtitle:
      'Export Mistral AI conversations with code, math, and documents intact. Local-first, private, and compatible with Obsidian and Notion.',
    badge: 'European AI Privacy Compatible',
    whyExport: [
      'Mistral AI and Le Chat are popular open-weight models and enterprise assistants used across Europe and worldwide for coding, translation, and analysis.',
      'Exporting conversations lets you archive your prompts, build personal knowledge bases, and document technical solutions without relying on browser tab persistence.',
    ],
    parsingHighlightsTitle: 'Mistral & Le Chat Parsing',
    parsingHighlightsDesc: 'Extracts clean semantic markdown directly from chat.mistral.ai:',
    features: [
      {
        title: 'Code Blocks & Language Fences',
        desc: 'Retains syntax formatting and language labels across all programming languages.',
      },
      {
        title: 'LaTeX Math Formatting',
        desc: 'Standardizes inline and block math delimiters for seamless rendering in Obsidian and Overleaf.',
      },
      {
        title: 'Chat Continuation',
        desc: 'Take any Mistral conversation and continue it directly in Claude, ChatGPT, or DeepSeek.',
      },
      {
        title: 'Seven Export Formats',
        desc: 'Choose between Markdown, JSON, PDF, HTML, Word (.doc), PNG, and plain text.',
      },
    ],
    faqs: [
      {
        q: 'Does it work with Mistral Large and Codestral?',
        a: 'Yes. AI Chat Exporter parses all model outputs rendered on chat.mistral.ai regardless of model tier.',
      },
      {
        q: 'Can I export long conversations?',
        a: 'Yes. The parser traverses all turns in the chat thread in chronological order.',
      },
    ],
  },
  {
    slug: 'lumo-exporter',
    platformName: 'Proton Lumo',
    title: 'Proton Lumo Exporter',
    description: 'Export private Proton Lumo AI conversations to Markdown, PDF & JSON',
    heroTitle: 'Proton Lumo Exporter — Backup Your Private Lumo Chats',
    heroSubtitle:
      'Because Proton Lumo uses end-to-end encryption, our parser extracts the rendered DOM locally on your machine with zero privacy compromise.',
    badge: 'Zero-Knowledge & Privacy First',
    whyExport: [
      'Proton Lumo offers privacy-first AI assistance with end-to-end encrypted storage. Because API payloads are encrypted, third-party cloud archivers cannot read your data.',
      'AI Chat Exporter operates strictly inside your authenticated browser session on the client side, reading the decrypted DOM after you view it. Your private conversations never leave your device.',
    ],
    parsingHighlightsTitle: 'Lumo-Specific Extraction',
    parsingHighlightsDesc: 'Tailored for lumo.proton.me DOM structure and code syntax blocks:',
    features: [
      {
        title: 'Local Decrypted DOM Extraction',
        desc: 'Parses decrypted conversation items cleanly without needing your Proton private keys.',
      },
      {
        title: 'Syntax Highlighter Preprocessing',
        desc: 'Converts Lumo custom syntax highlighter blocks into standard Markdown code blocks.',
      },
      {
        title: 'Continuation to Other LLMs',
        desc: 'Transfer your Lumo prompts into Claude, Gemini, or ChatGPT in one click.',
      },
      {
        title: 'Clean Markdown Export',
        desc: 'Outputs clean, portable Markdown ready for Obsidian, Logseq, or local text editors.',
      },
    ],
    faqs: [
      {
        q: 'Does this compromise Proton Lumo encryption?',
        a: 'No. The extension runs entirely in your local browser window and does not transmit data over the network.',
      },
      {
        q: 'Can I save Lumo conversations as PDF?',
        a: 'Yes. You can generate print-ready PDFs with syntax highlighting and formatting preserved.',
      },
    ],
  },
  {
    slug: 'qwen-exporter',
    platformName: 'Qwen',
    title: 'Qwen Exporter',
    description: 'Export Alibaba Qwen AI conversations, Monaco code blocks, and artifacts',
    heroTitle: 'Qwen Exporter — Save & Archive Qwen AI Chats',
    heroSubtitle:
      'Export Alibaba Qwen conversations with Monaco editor code blocks, tables, and multi-turn discussions preserved across seven formats.',
    badge: 'Supports Monaco Editor & Artifacts',
    whyExport: [
      'Alibaba Qwen (Tongyi Qianwen) is an open and powerful multilingual model used widely for complex coding, math, and data analysis.',
      'Qwen uses Monaco editor code views that generic exporters fail to capture properly. AI Chat Exporter reconstructs full multi-line code blocks from Monaco view-lines cleanly.',
    ],
    parsingHighlightsTitle: 'Qwen-Specific Extraction',
    parsingHighlightsDesc:
      'Engineered to extract complex DOM trees and Monaco editor code views from chat.qwen.ai:',
    features: [
      {
        title: 'Monaco Editor Reconstruction',
        desc: 'Faithfully extracts indented code from Qwen Monaco editor spans and headers.',
      },
      {
        title: 'LaTeX Math Delimiters',
        desc: 'Normalizes mathematical notation into standard $...$ and $$...$$ syntax.',
      },
      {
        title: 'Cross-AI Continuation',
        desc: 'Hand off Qwen chat context directly into ChatGPT, Claude, or Gemini.',
      },
      {
        title: 'Obsidian & PKM Integration',
        desc: 'Send Qwen conversations straight into your Obsidian vault with frontmatter metadata.',
      },
    ],
    faqs: [
      {
        q: 'Does it preserve code formatting from Qwen?',
        a: 'Yes. Our specialized parser extracts full code from Monaco editor elements, preserving indentation and line breaks.',
      },
      {
        q: 'What formats can I export to?',
        a: 'Markdown, JSON, HTML, Word (.doc), PDF, PNG snapshots, and plain text.',
      },
    ],
  },
  {
    slug: 'z-ai-exporter',
    platformName: 'Z.ai',
    title: 'Z.ai Exporter',
    description: 'Export Zhipu Z.ai and GLM conversations to Markdown, PDF and JSON',
    heroTitle: 'Z.ai Exporter — Archive Conversations from Chat.z.ai',
    heroSubtitle:
      'Export Z.ai (GLM-4) discussions with code, reasoning, and multi-turn context preserved cleanly.',
    badge: 'API & DOM Extraction',
    whyExport: [
      'Z.ai provides access to the powerful GLM model family for coding, research, and multilingual tasks.',
      'AI Chat Exporter extracts full conversation branches from chat.z.ai and formats them into organized Markdown documents and archives.',
    ],
    parsingHighlightsTitle: 'Z.ai Parsing Capabilities',
    parsingHighlightsDesc:
      'Combines internal skeleton ordering with DOM fallbacks for reliable exports:',
    features: [
      {
        title: 'Turn Ordering & Branch Walking',
        desc: 'Extracts parent-linked message chains accurately to represent conversation branches.',
      },
      {
        title: 'Code & Formula Preservation',
        desc: 'Retains programming language identifiers and mathematical equations.',
      },
      {
        title: 'Local Privacy',
        desc: 'No chats are routed through external proxy servers.',
      },
      {
        title: 'Structured JSON Export',
        desc: 'Exports clean JSON adhering to open Export Schema v1 for developers.',
      },
    ],
    faqs: [
      {
        q: 'Can I export Z.ai conversations to Obsidian?',
        a: 'Yes, one-click export into Obsidian with custom frontmatter is supported.',
      },
      {
        q: 'Are my Z.ai chats private during export?',
        a: 'Yes. The conversion is performed 100% locally in your browser memory.',
      },
    ],
  },
  {
    slug: 'google-ai-studio-exporter',
    platformName: 'Google AI Studio',
    title: 'Google AI Studio Exporter',
    description:
      'Export developer system prompts, test chats, and parameters from Google AI Studio',
    heroTitle: 'Google AI Studio Exporter — Save Developer Prompts & Chats',
    heroSubtitle:
      'Export Gemini developer prompts, system instructions, and multi-turn test sessions directly from aistudio.google.com.',
    badge: 'Developer Workflow Ready',
    whyExport: [
      'Google AI Studio is the premier testing ground for Gemini developers crafting system prompts, fine-tuning parameters, and testing function calling.',
      'Exporting sessions into Markdown or JSON lets developers version-control prompt experiments in Git and share test runs with colleagues easily.',
    ],
    parsingHighlightsTitle: 'AI Studio Extraction Highlights',
    parsingHighlightsDesc: 'Tailored for developer sessions on aistudio.google.com:',
    features: [
      {
        title: 'Developer Prompts & Responses',
        desc: 'Extracts user inputs, system prompts, and model responses in clean sequence.',
      },
      {
        title: 'Git-Ready Markdown',
        desc: 'Export conversations as Markdown files ideal for committing to Git repositories.',
      },
      {
        title: 'JSON Schema Compliance',
        desc: 'Structured JSON output ready for automated testing and dataset creation.',
      },
      {
        title: 'LaTeX Math & Code Blocks',
        desc: 'Preserves technical notation and code fences across all Gemini models.',
      },
    ],
    faqs: [
      {
        q: 'Can I export Gemini 1.5 Pro and Flash prompts?',
        a: 'Yes, any active chat session in Google AI Studio can be exported immediately.',
      },
      {
        q: 'Does it work with system instructions?',
        a: 'Yes, prompt text and conversation turns are captured in full fidelity.',
      },
    ],
  },
  {
    slug: 'notebooklm-exporter',
    platformName: 'NotebookLM',
    title: 'NotebookLM Exporter',
    description: 'Export Google NotebookLM conversation notes, citations, and source syntheses',
    heroTitle: 'NotebookLM Exporter — Save NotebookLM Chats & Notes',
    heroSubtitle:
      'Export research notes, source citations, and question-answering sessions from Google NotebookLM to Markdown and PDF.',
    badge: 'Research & Source Synthesis',
    whyExport: [
      'Google NotebookLM grounds Gemini in your uploaded PDFs and documents. Researchers use it to synthesize books, papers, and complex documentation.',
      'AI Chat Exporter allows you to save these synthesized research discussions into your permanent PKM system (Obsidian, Notion, Logseq) with citations preserved.',
    ],
    parsingHighlightsTitle: 'NotebookLM Extraction Highlights',
    parsingHighlightsDesc:
      'Extracts clean research notes and discussions from notebooklm.google.com:',
    features: [
      {
        title: 'Citation & Source Preservation',
        desc: 'Captures references and answers grounded in your notebook sources.',
      },
      {
        title: 'PKM & Obsidian Integration',
        desc: 'Direct one-click export into Obsidian vaults with frontmatter.',
      },
      {
        title: 'Print-Ready PDF Reports',
        desc: 'Turn your research synthesis into professional, formatted PDF documents.',
      },
      {
        title: 'Structured JSON Archives',
        desc: 'Keep raw structured data for data pipelines and personal archiving.',
      },
    ],
    faqs: [
      {
        q: 'Can I export NotebookLM chats to Markdown?',
        a: 'Yes! Click the extension on NotebookLM to download a clean .md file or copy it directly to your clipboard.',
      },
      {
        q: 'Are my uploaded documents sent to third-party servers?',
        a: 'No. The extension only reads the rendered conversation locally in your browser and transmits zero data externally.',
      },
    ],
  },
  {
    slug: 'joyland-exporter',
    platformName: 'Joyland',
    title: 'Joyland Exporter',
    description: 'Export Joyland.ai character conversations and roleplay logs to Markdown & PDF',
    heroTitle: 'Joyland Exporter — Save Character Chats from Joyland.ai',
    heroSubtitle:
      'Export interactive character chats and creative roleplay sessions from Joyland.ai into formatted Markdown, PDF, and JSON.',
    badge: 'Character Chat Archiving',
    whyExport: [
      'Joyland.ai hosts vibrant character conversations and creative storytelling. Preserving these transcripts ensures you never lose collaborative stories and roleplay logs.',
      'AI Chat Exporter converts character dialogues into readable formatted transcripts with speaker labels and timestamps.',
    ],
    parsingHighlightsTitle: 'Joyland Extraction Highlights',
    parsingHighlightsDesc: 'Extracts dialogue streams from joyland.ai sessions cleanly:',
    features: [
      {
        title: 'Character & User Roles',
        desc: 'Maintains clear distinction between character responses and user messages.',
      },
      {
        title: 'Multiple Export Formats',
        desc: 'Save as Markdown for archiving, PDF for reading, or PNG for visual sharing.',
      },
      {
        title: 'Local Privacy',
        desc: 'Creative stories and chats remain stored exclusively on your local computer.',
      },
      {
        title: 'Instant Clipboard Copy',
        desc: 'Copy rich formatted text directly into Discord, Google Docs, or text files.',
      },
    ],
    faqs: [
      {
        q: 'Can I export Joyland chats to a single file?',
        a: 'Yes. The full conversation history is compiled into a single clean Markdown, PDF, or HTML document.',
      },
    ],
  },
  {
    slug: 'chub-ai-exporter',
    platformName: 'Chub AI',
    title: 'Chub AI Exporter',
    description: 'Export Chub.ai character chats and roleplay transcripts to Markdown & JSON',
    heroTitle: 'Chub AI Exporter — Save Character Chats from Chub.ai',
    heroSubtitle:
      'Export character roleplay transcripts and creative writing from Chub.ai and characterhub.org to clean Markdown, JSON, and PDF.',
    badge: 'Roleplay & Lore Archiving',
    whyExport: [
      'Chub AI (and CharacterHub) is a central hub for character definitions and interactive roleplay. Preserving long-form roleplay logs is essential for writers and creative communities.',
      'AI Chat Exporter allows writers to export long roleplay threads into clean Markdown files for offline reading, story editing, and archiving.',
    ],
    parsingHighlightsTitle: 'Chub AI Extraction Highlights',
    parsingHighlightsDesc: 'Built for chub.ai and characterhub.org chat interfaces:',
    features: [
      {
        title: 'Long-Form Transcript Capture',
        desc: 'Extracts extended roleplay threads in sequence with dialogue formatting.',
      },
      {
        title: 'JSON & Markdown Formats',
        desc: 'Export structured JSON for character engines or Markdown for writing tools.',
      },
      {
        title: 'Local Storage Only',
        desc: 'Zero external telemetry. Your creative stories stay private on your device.',
      },
      {
        title: 'Word & PDF Documents',
        desc: 'Generate printable documents formatted like scripts or novel manuscripts.',
      },
    ],
    faqs: [
      {
        q: 'Does it work on characterhub.org as well as chub.ai?',
        a: 'Yes. Both domains are supported by the dedicated parser.',
      },
      {
        q: 'Can I export long multi-turn roleplays?',
        a: 'Yes. The parser traverses all rendered message bubbles in the active chat.',
      },
    ],
  },
];
