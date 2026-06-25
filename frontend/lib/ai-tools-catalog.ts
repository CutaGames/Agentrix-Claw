// Agentrix AI tool matrix — P1-#6 SEO landing pages.
// 30+ tool entries used by /tools and /tools/[slug] routes.
// Each entry generates a focused landing page targeting one keyword cluster.

export interface AiTool {
  slug: string;
  category: 'writing' | 'design' | 'data' | 'voice' | 'dev' | 'biz' | 'agent';
  /** Short title for SEO + nav (≤ 30 chars) */
  title: string;
  /** Plain-language tagline (≤ 80 chars) */
  tagline: string;
  /** Full meta description (≤ 160 chars, used in <meta description>) */
  description: string;
  /** What it does, in 2-3 sentences. */
  intro: string;
  /** 3-5 outcome bullets shown on landing. */
  bullets: string[];
  /** Example prompt the user can paste to try it. */
  examplePrompt: string;
  /** Underlying skill / workflow on Agentrix. */
  poweredBy: string;
  /** Optional emoji / unicode icon for cards. */
  icon: string;
}

export const AI_TOOLS: AiTool[] = [
  // ── Writing ──────────────────────────────────────────
  {
    slug: 'ai-resume',
    category: 'writing',
    title: 'AI Resume Builder',
    tagline: 'Generate ATS-friendly resumes in 30 seconds',
    description:
      'Turn your work history into a polished, ATS-friendly resume. Tailor to any job description, get instant rewrites, export to PDF.',
    intro:
      'Agentrix Resume Builder reads the job posting you target and rewrites every bullet to match the keywords ATS scanners look for. Your draft updates as you talk to the agent.',
    bullets: [
      'ATS keyword optimization for any role',
      'One-click rewrites in 6 tones (formal / startup / leadership)',
      'Bilingual: English + Chinese export',
      'PDF export ready for upload',
    ],
    examplePrompt: 'Build me a resume for a senior backend engineer role at Stripe.',
    poweredBy: 'agent + slides_generate skill',
    icon: '📄',
  },
  {
    slug: 'ai-cover-letter',
    category: 'writing',
    title: 'AI Cover Letter Writer',
    tagline: 'Personalized cover letters for any job',
    description:
      'Paste a job link and your resume — Agentrix writes a tailored cover letter that matches the company voice and the role requirements.',
    intro:
      'No more blank-page anxiety. Agentrix analyzes the job posting, learns the company tone, and drafts three versions you can pick and edit.',
    bullets: [
      'Auto-pulls company values from job posting',
      'Three voice options per draft',
      '300-word version for tight applications',
      'Bilingual export',
    ],
    examplePrompt: 'Write a cover letter for the Vercel DX engineer posting at vercel.com/careers.',
    poweredBy: 'agent + research skill',
    icon: '✉️',
  },
  {
    slug: 'ai-pitch-deck',
    category: 'writing',
    title: 'AI Pitch Deck Maker',
    tagline: '10-slide investor decks from a one-liner',
    description:
      'Type your one-line idea and get a 10-slide investor deck with traction, market, business model, and ask — all editable.',
    intro:
      'Built for founders. Agentrix follows the YC pitch template by default but adapts to seed, Series A, or strategic decks. Output is a Marp markdown deck plus an HTML preview.',
    bullets: [
      'YC-style 10-slide template',
      'Auto-generated TAM/SAM/SOM with cited sources',
      'Editable Marp markdown',
      'Brand color customization',
    ],
    examplePrompt: 'Pitch deck for a B2B AI agent that automates expense reports, raising $3M seed.',
    poweredBy: 'slides_generate skill',
    icon: '📊',
  },
  {
    slug: 'ai-blog-writer',
    category: 'writing',
    title: 'AI Blog Writer',
    tagline: 'SEO blog posts with research and citations',
    description:
      'Long-form blog posts with web research, citations, and SEO meta. Pick a topic and target keyword — Agentrix returns 1,500 words ready to publish.',
    intro:
      'Combines web search and writing skills so every claim has a source. Outputs structured Markdown with H2/H3 hierarchy and a meta description.',
    bullets: [
      'Web research with inline citations',
      'SEO meta + slug + keyword density',
      '1,000–3,000 word options',
      'Markdown ready for Ghost / Hashnode / WordPress',
    ],
    examplePrompt: 'Write a 1,500-word post on "best practices for AI agent observability" for SREs.',
    poweredBy: 'research + writing skills',
    icon: '✍️',
  },
  {
    slug: 'ai-email-writer',
    category: 'writing',
    title: 'AI Email Writer',
    tagline: 'Cold emails, follow-ups, and replies that get answered',
    description:
      'Draft cold outreach, follow-ups, or replies in seconds. Agentrix studies the recipient, the context, and recent emails to propose three variants.',
    intro:
      'Stop staring at empty inboxes. Agentrix uses your prompt + optional CRM context to generate professional, friendly, or assertive variants.',
    bullets: [
      'Three tone variants per send',
      'A/B subject line generator',
      'Auto follow-up sequencer',
      'Gmail / Outlook integration',
    ],
    examplePrompt: 'Draft a follow-up email after my call with the head of engineering at Linear.',
    poweredBy: 'writing skill + email integration',
    icon: '📧',
  },
  {
    slug: 'ai-summarizer',
    category: 'writing',
    title: 'AI Summarizer',
    tagline: 'Summarize PDFs, articles, and meetings',
    description:
      'Drop a PDF, paste a URL, or upload a meeting transcript — get a clean summary, key takeaways, and action items in 10 seconds.',
    intro:
      'Handles up to 200-page documents. Outputs TL;DR, bullet summary, and action items. Optional Q&A on the source.',
    bullets: [
      '200-page PDF capacity',
      'TL;DR + bullets + action items',
      'Follow-up Q&A with citations',
      'Export to Notion / Markdown',
    ],
    examplePrompt: 'Summarize the latest GPT-5 paper and list the three biggest implementation insights.',
    poweredBy: 'research skill',
    icon: '📚',
  },

  // ── Design / Slides ──────────────────────────────────
  {
    slug: 'ai-slides',
    category: 'design',
    title: 'AI Slides Generator',
    tagline: 'Beautiful presentations from a single prompt',
    description:
      'One sentence, ten slides. Agentrix generates a full deck — title, bullets, speaker notes — in under 8 seconds. Export to PPTX or HTML.',
    intro:
      'Powered by the slides_generate skill. Pick a theme (default / gaia / uncover), give a topic, and Agentrix writes the outline and renders the deck.',
    bullets: [
      '4–20 slides per request',
      'Marp themes + custom branding',
      'Speaker notes auto-generated',
      'PPTX / PDF / HTML export',
    ],
    examplePrompt: 'Build a 10-slide product launch deck for "Agentrix Plan Runner v2".',
    poweredBy: 'slides_generate skill',
    icon: '🎯',
  },
  {
    slug: 'ai-image',
    category: 'design',
    title: 'AI Image Generator',
    tagline: 'High-res images from text — branded or photoreal',
    description:
      'Generate images for blogs, social, ads, or product mockups. Pick a model (FLUX / SDXL / DALL-E) — same prompt, different aesthetics.',
    intro:
      'Multi-model image generation with one click. Brand kit upload keeps your colors and fonts consistent across all outputs.',
    bullets: [
      'FLUX, SDXL, DALL-E in one chat',
      'Brand kit consistency',
      'Up to 4K upscaling',
      'Image-to-image editing',
    ],
    examplePrompt: 'Create a hero image for an AI agent SaaS landing page, dark mode, neon accents.',
    poweredBy: 'image_generate skill',
    icon: '🎨',
  },
  {
    slug: 'ai-logo',
    category: 'design',
    title: 'AI Logo Maker',
    tagline: 'Brand logos with full kit, instantly',
    description:
      'Describe your brand — Agentrix delivers a primary logo, monochrome variant, favicon, and three color palette options.',
    intro:
      'Built for early-stage founders who need a logo before a designer. Iterate via chat: "more minimal", "rotate 30°", "swap blue for emerald".',
    bullets: [
      'Logo + variants + favicon',
      'Color palette + typography pairing',
      'SVG + PNG + PDF export',
      'Iterative refinement via chat',
    ],
    examplePrompt: 'Make a minimalist logo for a fintech startup called "Cobalt", deep blue palette.',
    poweredBy: 'image_generate + brand skill',
    icon: '🎭',
  },
  {
    slug: 'ai-video',
    category: 'design',
    title: 'AI Video Generator',
    tagline: 'Short videos from a script or storyboard',
    description:
      'Turn a script or product description into a 15–60 second video with voiceover, captions, and stock footage.',
    intro:
      'Combines script writing, voice cloning (optional), and asset selection. Outputs MP4 ready for TikTok, Shorts, Reels.',
    bullets: [
      'Script-to-video automation',
      '11Labs voice cloning option',
      'Auto captions + b-roll selection',
      'Vertical / square / horizontal export',
    ],
    examplePrompt: 'Make a 30-second TikTok introducing the Agentrix Phone Call skill.',
    poweredBy: 'video_compose skill',
    icon: '🎬',
  },

  // ── Voice ────────────────────────────────────────────
  {
    slug: 'ai-phone-call',
    category: 'voice',
    title: 'AI Phone Call',
    tagline: 'Outbound voice calls from your AI agent',
    description:
      'Your agent can place phone calls — book appointments, follow up with leads, or screen support tickets. Real-time voice via Vapi.',
    intro:
      'Agentrix dials the number, plays your assistant, and streams the transcript back to chat. Costs ~$0.10/min and routes through your verified Twilio number.',
    bullets: [
      'Real PSTN calls via Vapi',
      'Custom assistant + voice per call',
      'Real-time transcript streaming',
      'CRM webhook on call end',
    ],
    examplePrompt: 'Call +1-415-555-0123 and ask if they\'re free Tuesday at 3pm for a demo.',
    poweredBy: 'phone_call_place skill (Vapi)',
    icon: '📞',
  },
  {
    slug: 'ai-voice-clone',
    category: 'voice',
    title: 'AI Voice Cloning',
    tagline: 'Clone any voice from 30 seconds of audio',
    description:
      'Upload a 30-second voice sample — Agentrix clones it for narration, podcast intros, or your AI assistant\'s default voice.',
    intro:
      'Powered by 11Labs. Voice clones live in your private library and can be invoked by any skill (slides voiceover, video, phone calls).',
    bullets: [
      '30-second sample is enough',
      'Multilingual (29 languages)',
      'Private to your account',
      'Reusable across all skills',
    ],
    examplePrompt: 'Clone the voice in this sample and read my pitch deck speaker notes aloud.',
    poweredBy: 'voice skill (11Labs)',
    icon: '🎙️',
  },
  {
    slug: 'ai-meeting-notes',
    category: 'voice',
    title: 'AI Meeting Notes',
    tagline: 'Auto-summaries and action items from any meeting',
    description:
      'Drop in a Zoom / Meet recording or live audio — Agentrix returns timestamped notes, action items, and a one-paragraph summary.',
    intro:
      'Works with WAV, MP3, M4A, and live mic input. Identifies speakers, extracts decisions, and assigns action items by name.',
    bullets: [
      'Speaker identification',
      'Decision + action item extraction',
      'Searchable transcript with timestamps',
      'Notion / Slack export',
    ],
    examplePrompt: 'Transcribe this 45-min product review and list every action item with the owner.',
    poweredBy: 'transcription + writing skills',
    icon: '🎧',
  },

  // ── Data ─────────────────────────────────────────────
  {
    slug: 'ai-data-analyst',
    category: 'data',
    title: 'AI Data Analyst',
    tagline: 'Chat with your CSVs and SQL databases',
    description:
      'Connect a CSV or your Postgres — ask questions in plain English, get charts, SQL, and exported reports.',
    intro:
      'Agentrix runs your queries in a sandbox, generates charts, and explains the result. No SQL knowledge required.',
    bullets: [
      'CSV, Postgres, MySQL, BigQuery',
      'Auto-charting (bar / line / heatmap)',
      'SQL transparency for audit',
      'Schedule daily report emails',
    ],
    examplePrompt: 'Show me the top 10 customers by revenue in Q1, with a bar chart.',
    poweredBy: 'sandbox_shell_exec + sql skills',
    icon: '📈',
  },
  {
    slug: 'ai-spreadsheet',
    category: 'data',
    title: 'AI Spreadsheet',
    tagline: 'Excel formulas and tables, generated by chat',
    description:
      'Tell Agentrix what you need in a sheet — it builds the structure, formulas, and pivot tables. Export to .xlsx or Google Sheets.',
    intro:
      'No more wrestling with VLOOKUP or pivot tables. Describe the analysis, Agentrix sets up the sheet correctly the first time.',
    bullets: [
      'Auto-formula generation',
      'Pivot tables and conditional formatting',
      '.xlsx + Google Sheets export',
      'Live data refresh via API connectors',
    ],
    examplePrompt: 'Build a CAC + LTV cohort dashboard from this stripe charges export.',
    poweredBy: 'sandbox + spreadsheet skill',
    icon: '📑',
  },
  {
    slug: 'ai-pdf-chat',
    category: 'data',
    title: 'AI PDF Chat',
    tagline: 'Ask any PDF questions and get sourced answers',
    description:
      'Drop a PDF — academic paper, contract, financial report — and chat with it. Every answer cites a page number.',
    intro:
      'Powered by RAG over your documents. Multi-PDF support: ask a question across 50 contracts at once and get a comparative answer.',
    bullets: [
      'Up to 50 PDFs per workspace',
      'Page-number citations',
      'Comparative cross-document Q&A',
      'OCR for scanned PDFs',
    ],
    examplePrompt: 'In this contract, what are the IP indemnification clauses? Quote the exact language.',
    poweredBy: 'rag skill',
    icon: '📕',
  },

  // ── Dev ──────────────────────────────────────────────
  {
    slug: 'ai-code-review',
    category: 'dev',
    title: 'AI Code Review',
    tagline: 'PR reviews from a senior engineer agent',
    description:
      'Paste a diff or connect a GitHub PR — Agentrix reviews like a senior engineer: security, perf, readability, and tests.',
    intro:
      'Reviews are categorized (must-fix / suggest / nit) and reference specific lines. Optional auto-comment on GitHub PRs.',
    bullets: [
      'Security + perf + readability lens',
      'Categorized severity (must-fix / suggest / nit)',
      'GitHub PR auto-comment integration',
      'Custom team style guides',
    ],
    examplePrompt: 'Review this 200-line PR adding an OAuth flow.',
    poweredBy: 'code_intelligence + sandbox skills',
    icon: '🔍',
  },
  {
    slug: 'ai-debug',
    category: 'dev',
    title: 'AI Debugger',
    tagline: 'Paste an error, get the root cause',
    description:
      'Stack traces, build errors, runtime exceptions — Agentrix diagnoses root cause and proposes a fix you can apply directly.',
    intro:
      'For ambiguous errors, Agentrix can run reproduction commands in a sandbox. Output includes minimal repro, root cause, and a unified diff fix.',
    bullets: [
      'Sandbox reproduction for tricky bugs',
      'Root cause + fix diff',
      'Multi-language (TS / Python / Rust / Go)',
      'Linked test cases for regression',
    ],
    examplePrompt: 'My Next.js build fails with "Cannot find module \'next/router\'" — debug it.',
    poweredBy: 'sandbox + code skill',
    icon: '🐛',
  },
  {
    slug: 'ai-sql',
    category: 'dev',
    title: 'AI SQL Generator',
    tagline: 'Plain English to production SQL',
    description:
      'Connect your schema — Agentrix writes optimized SQL queries from natural language and explains every join.',
    intro:
      'Schema-aware: Agentrix indexes your tables and column types so generated queries actually run. Explains query plans and suggests indexes.',
    bullets: [
      'Schema-aware generation',
      'Query plan explanation',
      'Index suggestions',
      'Postgres / MySQL / SQLite / BigQuery',
    ],
    examplePrompt: 'Show monthly active users by signup channel for the last 6 months.',
    poweredBy: 'sql skill',
    icon: '🗄️',
  },
  {
    slug: 'ai-api-test',
    category: 'dev',
    title: 'AI API Tester',
    tagline: 'Generate test suites from an OpenAPI spec',
    description:
      'Upload an OpenAPI / Swagger file — Agentrix generates a full Jest / Pytest test suite with happy path + edge cases.',
    intro:
      'Includes auth, rate-limit, schema validation, and error path tests. Generated tests run in the Agentrix sandbox so you can validate before committing.',
    bullets: [
      'Jest / Pytest / Postman output',
      'Auth + rate-limit + edge cases',
      'Sandbox execution for validation',
      'CI-ready (GitHub Actions snippet)',
    ],
    examplePrompt: 'Generate a Jest test suite for this Stripe Webhooks OpenAPI spec.',
    poweredBy: 'sandbox + code skill',
    icon: '🧪',
  },

  // ── Business ─────────────────────────────────────────
  {
    slug: 'ai-business-plan',
    category: 'biz',
    title: 'AI Business Plan',
    tagline: 'Investor-grade business plans in 10 minutes',
    description:
      'Describe your idea — Agentrix writes a 20-page business plan with TAM analysis, financial projections, and competitive map.',
    intro:
      'Outputs a Word + PDF business plan. Includes 3-year financials in an editable spreadsheet and a competitive analysis with cited sources.',
    bullets: [
      '20-page Word + PDF',
      '3-year financial model',
      'Cited competitive analysis',
      'Editable in Google Docs',
    ],
    examplePrompt: 'Business plan for a vertical AI agent for dental clinic operations, $2M seed.',
    poweredBy: 'research + writing + slides skills',
    icon: '📋',
  },
  {
    slug: 'ai-market-research',
    category: 'biz',
    title: 'AI Market Research',
    tagline: 'Real-time market reports with sourced insights',
    description:
      'Pick an industry — Agentrix scans 100+ sources, synthesizes the report, and delivers it as a polished Markdown / PDF.',
    intro:
      'Best for go/no-go decisions. Coverage includes market size, top players, recent funding, regulatory landscape, and consumer sentiment.',
    bullets: [
      '100+ sources per report',
      'Inline citations with hyperlinks',
      'Funding + M&A activity tracker',
      'PDF + Notion export',
    ],
    examplePrompt: 'Market research on AI agent platforms in Q4 2026 — funding, share, top 5 players.',
    poweredBy: 'research skill',
    icon: '🔬',
  },
  {
    slug: 'ai-competitor-analysis',
    category: 'biz',
    title: 'AI Competitor Analysis',
    tagline: 'Side-by-side feature, pricing, and positioning matrix',
    description:
      'List your competitors — Agentrix builds a comparison matrix with features, pricing, target customers, and recent product changes.',
    intro:
      'Updates daily by polling competitor sites and changelog feeds. Differentiation suggestions included.',
    bullets: [
      'Daily auto-refresh',
      'Pricing + feature parity matrix',
      'Differentiation suggestions',
      'CSV + Airtable export',
    ],
    examplePrompt: 'Compare Linear, Asana, and Notion for engineering team usage.',
    poweredBy: 'research + scraping skills',
    icon: '🥊',
  },
  {
    slug: 'ai-job-description',
    category: 'biz',
    title: 'AI Job Description',
    tagline: 'Inclusive job posts that attract the right candidates',
    description:
      'Tell Agentrix the role + level — get a job description that follows DEI best practices and includes a salary band benchmark.',
    intro:
      'Built-in bias check, salary benchmarking from public data, and a candidate-facing FAQ. Posts to Greenhouse / Lever via API.',
    bullets: [
      'Bias scanner + rewrite',
      'Salary benchmark per geography',
      'Candidate-facing FAQ',
      'Greenhouse + Lever sync',
    ],
    examplePrompt: 'Job post for a senior product designer remote, fintech, target $180k–$220k base.',
    poweredBy: 'writing + research skills',
    icon: '💼',
  },

  // ── Agent ────────────────────────────────────────────
  {
    slug: 'ai-agent-builder',
    category: 'agent',
    title: 'AI Agent Builder',
    tagline: 'Build your own agent in 5 minutes — no code',
    description:
      'Describe what your agent does — Agentrix wires the skills, knowledge, and tools, deploys it as your own OpenClaw instance.',
    intro:
      'Agent inherits Agentrix\'s skill marketplace. Pick from 200+ skills (slides, phone, browser, sandbox) and Agentrix bundles them.',
    bullets: [
      '200+ pre-built skills',
      'No-code skill chaining',
      'Hosted on your own subdomain',
      'X402 billing built-in',
    ],
    examplePrompt: 'Build me an agent that triages support tickets and drafts replies.',
    poweredBy: 'agent_orchestration + skill_marketplace',
    icon: '🤖',
  },
  {
    slug: 'ai-browser-agent',
    category: 'agent',
    title: 'AI Browser Agent',
    tagline: 'Automate any website with natural-language scripts',
    description:
      'Tell Agentrix what to do on a website — book a flight, fill a form, scrape data — it runs a real browser in a sandbox and screenshots progress.',
    intro:
      'Powered by Playwright in a Docker sandbox. Each action streams a screenshot to chat so you can supervise.',
    bullets: [
      'Real Playwright browser',
      'Live screenshot streaming',
      'Pause / resume mid-flow',
      'Login + 2FA support',
    ],
    examplePrompt: 'Open expedia.com, book the cheapest SFO→JFK flight next Tuesday morning.',
    poweredBy: 'sandbox + browser skill',
    icon: '🌐',
  },
  {
    slug: 'ai-sandbox',
    category: 'agent',
    title: 'AI Cloud Sandbox',
    tagline: 'Run code, terminal commands, and tools in isolation',
    description:
      'Spawn a Docker sandbox per task — Agentrix gets shell, file system, and network. You stay safe; it runs anything.',
    intro:
      'Each sandbox is network-disabled by default, has 256MB RAM, and self-destructs after 600s. Per-user quotas configurable.',
    bullets: [
      'Docker isolation per task',
      'Auto-cleanup after 600s',
      '256MB / 512 CpuShares default',
      'Configurable quotas',
    ],
    examplePrompt: 'Run my Python script in a sandbox and report the output.',
    poweredBy: 'sandbox_shell_exec + fs skills',
    icon: '📦',
  },
  {
    slug: 'ai-task-runner',
    category: 'agent',
    title: 'AI Task Runner',
    tagline: 'Multi-step task plans with live status streaming',
    description:
      'Give Agentrix a goal — it decomposes into steps, asks for approval, runs each step in tools, and streams artifacts to your dashboard.',
    intro:
      'Powered by the Plan-Approval engine. SSE event stream lets the desktop and mobile clients render a live task timeline.',
    bullets: [
      'Auto-decomposition into 3–10 steps',
      'Per-step approval (high-risk only)',
      'Live SSE event stream',
      'Artifact gallery (PDFs, images, code)',
    ],
    examplePrompt: 'Research, write, and publish a launch announcement for "Agentrix Plan Runner v2".',
    poweredBy: 'plan_runner + tool_registry',
    icon: '⚙️',
  },
];

export const TOOL_CATEGORIES: Array<{
  id: AiTool['category'];
  label: string;
  emoji: string;
}> = [
  { id: 'writing', label: 'Writing', emoji: '✍️' },
  { id: 'design', label: 'Design & Slides', emoji: '🎨' },
  { id: 'voice', label: 'Voice & Calls', emoji: '🎙️' },
  { id: 'data', label: 'Data & Docs', emoji: '📊' },
  { id: 'dev', label: 'Developer', emoji: '💻' },
  { id: 'biz', label: 'Business', emoji: '💼' },
  { id: 'agent', label: 'Agent', emoji: '🤖' },
];

export function getToolBySlug(slug: string): AiTool | undefined {
  return AI_TOOLS.find((t) => t.slug === slug);
}

export function getToolsByCategory(cat: AiTool['category']): AiTool[] {
  return AI_TOOLS.filter((t) => t.category === cat);
}
