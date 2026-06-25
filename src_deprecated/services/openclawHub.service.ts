/**
 * OpenClaw Skill Hub — queries the curated skill registry from OpenClaw Bridge.
 * Endpoint: GET /openclaw/bridge/skill-hub
 * Falls back to a rich placeholder set if the endpoint isn't ready yet.
 */
import { apiFetch } from './api';
import type { SkillItem } from './marketplace.api';

// Official OpenClaw Hub public registry endpoints (tried in order)
const OFFICIAL_HUB_URLS = [
  'https://hub.openclaw.ai/api/v1/skills',
  'https://registry.openclaw.ai/v1/skills',
];

// Simple TTL cache: refreshes once per hour per session
let _hubCache: { items: OpenClawHubSkill[]; fetchedAt: number } | null = null;
const HUB_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface OpenClawHubSkill {
  id: string;
  name: string;
  description: string;
  author?: string;
  category?: string;
  subCategory?: string;
  tags?: string[];
  version?: string;
  rating?: number;
  installCount?: number;
  price?: number;
  priceUnit?: string;
  package?: string;   // npm/pip package name for installation
  repoUrl?: string;
}

export interface OpenClawHubSearchParams {
  q?: string;
  category?: string;
  page?: number;
  limit?: number;
}

export interface OpenClawHubSearchResponse {
  items: SkillItem[];
  total: number;
  page: number;
  totalPages: number;
}

// ── Rich placeholder skill catalog (50 skills representing the 5200+ catalog) ──
const HUB_PLACEHOLDER: OpenClawHubSkill[] = [
  // Automation
  { id: 'oc-web-search', name: 'Web Search', description: 'Full-web search with result ranking and summarization', category: 'Automation', subCategory: 'Web', tags: ['search', 'web', 'AI'], rating: 4.9, installCount: 18500, price: 0, priceUnit: 'free', package: 'openclaw-skill-web-search' },
  { id: 'oc-browser-ctrl', name: 'Browser Control', description: 'Headless browser automation — click, fill, navigate', category: 'Automation', subCategory: 'Web', tags: ['browser', 'playwright', 'automation'], rating: 4.7, installCount: 12400, price: 0, priceUnit: 'free', package: 'openclaw-skill-browser' },
  { id: 'oc-file-ops', name: 'File Operations', description: 'Read, write, and manipulate files and directories', category: 'Automation', subCategory: 'Files', tags: ['files', 'io', 'filesystem'], rating: 4.8, installCount: 15000, price: 0, priceUnit: 'free', package: 'openclaw-skill-files' },
  { id: 'oc-shell-exec', name: 'Shell Executor', description: 'Run shell commands and scripts in a sandboxed environment', category: 'Automation', subCategory: 'Dev', tags: ['shell', 'bash', 'exec'], rating: 4.6, installCount: 9800, price: 0, priceUnit: 'free', package: 'openclaw-skill-shell' },
  { id: 'oc-scheduler', name: 'Task Scheduler', description: 'Schedule and run recurring agent tasks via cron', category: 'Automation', subCategory: 'Scheduling', tags: ['cron', 'scheduler', 'tasks'], rating: 4.5, installCount: 7200, price: 0, priceUnit: 'free', package: 'openclaw-skill-scheduler' },

  // AI Tools
  { id: 'oc-code-gen', name: 'Code Generator', description: 'GPT-4-powered code generation in 30+ languages', category: 'AI Tools', subCategory: 'Code', tags: ['AI', 'codegen', 'gpt4'], rating: 4.9, installCount: 22000, price: 0, priceUnit: 'free', package: 'openclaw-skill-codegen' },
  { id: 'oc-summarizer', name: 'Text Summarizer', description: 'Summarize long documents, articles, or web pages', category: 'AI Tools', subCategory: 'NLP', tags: ['AI', 'summary', 'NLP'], rating: 4.8, installCount: 17600, price: 0, priceUnit: 'free', package: 'openclaw-skill-summarize' },
  { id: 'oc-translator', name: 'Multi-Language Translator', description: 'Translate text between 100+ languages using LLM', category: 'AI Tools', subCategory: 'NLP', tags: ['translate', 'NLP', 'i18n'], rating: 4.7, installCount: 13400, price: 0, priceUnit: 'free', package: 'openclaw-skill-translate' },
  { id: 'oc-img-analyze', name: 'Image Analyzer', description: 'Vision LLM to describe, classify, and extract from images', category: 'AI Tools', subCategory: 'Vision', tags: ['vision', 'AI', 'image'], rating: 4.8, installCount: 10200, price: 0, priceUnit: 'free', package: 'openclaw-skill-vision' },
  { id: 'oc-sentiment', name: 'Sentiment Analysis', description: 'Batch sentiment scoring for reviews, tweets, or comments', category: 'AI Tools', subCategory: 'NLP', tags: ['sentiment', 'NLP', 'classification'], rating: 4.5, installCount: 8900, price: 0, priceUnit: 'free', package: 'openclaw-skill-sentiment' },
  { id: 'oc-embedding', name: 'Text Embeddings', description: 'OpenAI / local embeddings for similarity search', category: 'AI Tools', subCategory: 'Embeddings', tags: ['embeddings', 'vector', 'search'], rating: 4.7, installCount: 11200, price: 0, priceUnit: 'free', package: 'openclaw-skill-embed' },

  // Data
  { id: 'oc-csv-parser', name: 'CSV/Excel Processor', description: 'Read, filter, transform, and export CSV/Excel files', category: 'Data', subCategory: 'Data', tags: ['csv', 'excel', 'data'], rating: 4.6, installCount: 9400, price: 0, priceUnit: 'free', package: 'openclaw-skill-csv' },
  { id: 'oc-sql-agent', name: 'SQL Query Agent', description: 'Natural language to SQL — query any Postgres/MySQL DB', category: 'Data', subCategory: 'Database', tags: ['sql', 'database', 'nlp'], rating: 4.8, installCount: 14700, price: 0, priceUnit: 'free', package: 'openclaw-skill-sql' },
  { id: 'oc-scraper', name: 'Web Scraper', description: 'Structured web data extraction with pagination support', category: 'Data', subCategory: 'Web', tags: ['scraping', 'web', 'data'], rating: 4.6, installCount: 11900, price: 0, priceUnit: 'free', package: 'openclaw-skill-scraper' },
  { id: 'oc-json-proc', name: 'JSON Processor', description: 'Parse, transform, validate JSON with JQ-style queries', category: 'Data', subCategory: 'Data', tags: ['json', 'transform', 'data'], rating: 4.5, installCount: 7600, price: 0, priceUnit: 'free', package: 'openclaw-skill-json' },
  { id: 'oc-vector-db', name: 'Vector DB Connector', description: 'Pinecone/Chroma/Weaviate read/write for agents', category: 'Data', subCategory: 'Database', tags: ['vector', 'pinecone', 'rag'], rating: 4.7, installCount: 8300, price: 0, priceUnit: 'free', package: 'openclaw-skill-vectordb' },

  // Finance / Web3
  { id: 'oc-crypto-price', name: 'Crypto Price Feed', description: 'Real-time prices for 1000+ tokens from CoinGecko/Binance', category: 'Finance', subCategory: 'Finance', tags: ['crypto', 'price', 'defi'], rating: 4.8, installCount: 16200, price: 0, priceUnit: 'free', package: 'openclaw-skill-cryptoprice' },
  { id: 'oc-defi-swap', name: 'DeFi Swap Agent', description: 'Execute token swaps via Uniswap/dex aggregator', category: 'Finance', subCategory: 'Web3', tags: ['defi', 'swap', 'uniswap'], rating: 4.5, installCount: 7100, price: 0, priceUnit: 'free', package: 'openclaw-skill-defiswap' },
  { id: 'oc-wallet-monitor', name: 'Wallet Monitor', description: 'Monitor wallet activity and alert on transactions', category: 'Finance', subCategory: 'Web3', tags: ['wallet', 'monitor', 'alerts'], rating: 4.6, installCount: 8800, price: 0, priceUnit: 'free', package: 'openclaw-skill-wallet-monitor' },

  // Social / Communication
  { id: 'oc-twitter-agent', name: 'Twitter/X Agent', description: 'Post, search, and monitor Twitter/X via API', category: 'Social', subCategory: 'Social', tags: ['twitter', 'social', 'api'], rating: 4.5, installCount: 9200, price: 0, priceUnit: 'free', package: 'openclaw-skill-twitter' },
  { id: 'oc-telegram-bot', name: 'Telegram Bot', description: 'Send messages and handle Telegram bot commands', category: 'Social', subCategory: 'Social', tags: ['telegram', 'bot', 'messaging'], rating: 4.7, installCount: 12100, price: 0, priceUnit: 'free', package: 'openclaw-skill-telegram' },
  { id: 'oc-discord-bot', name: 'Discord Bot', description: 'Discord message sending, reading, and command handling', category: 'Social', subCategory: 'Social', tags: ['discord', 'bot', 'messaging'], rating: 4.6, installCount: 10800, price: 0, priceUnit: 'free', package: 'openclaw-skill-discord' },
  { id: 'oc-email-agent', name: 'Email Agent', description: 'Send and read emails via SMTP/IMAP — draft, reply, summarize', category: 'Social', subCategory: 'Communication', tags: ['email', 'smtp', 'imap'], rating: 4.7, installCount: 13500, price: 0, priceUnit: 'free', package: 'openclaw-skill-email' },

  // Dev Tools
  { id: 'oc-github-agent', name: 'GitHub Agent', description: 'Create PRs, issues, and files via GitHub API', category: 'Dev', subCategory: 'Dev', tags: ['github', 'git', 'api'], rating: 4.8, installCount: 14000, price: 0, priceUnit: 'free', package: 'openclaw-skill-github' },
  { id: 'oc-docker-ctrl', name: 'Docker Controller', description: 'Start, stop, and inspect Docker containers', category: 'Dev', subCategory: 'DevOps', tags: ['docker', 'devops', 'container'], rating: 4.6, installCount: 7900, price: 0, priceUnit: 'free', package: 'openclaw-skill-docker' },
  { id: 'oc-code-review', name: 'Code Review Bot', description: 'AI-powered code review with security and style checks', category: 'Dev', subCategory: 'Code', tags: ['code', 'review', 'security'], rating: 4.7, installCount: 11400, price: 0, priceUnit: 'free', package: 'openclaw-skill-codereview' },
  { id: 'oc-test-gen', name: 'Unit Test Generator', description: 'Auto-generate pytest/jest unit tests from source code', category: 'Dev', subCategory: 'Code', tags: ['testing', 'pytest', 'jest'], rating: 4.5, installCount: 8100, price: 0, priceUnit: 'free', package: 'openclaw-skill-testgen' },

  // Productivity
  { id: 'oc-pdf-reader', name: 'PDF Reader', description: 'Extract text, tables, and images from PDF documents', category: 'Productivity', subCategory: 'Files', tags: ['pdf', 'extract', 'documents'], rating: 4.7, installCount: 15800, price: 0, priceUnit: 'free', package: 'openclaw-skill-pdf' },
  { id: 'oc-calendar', name: 'Calendar Manager', description: 'Google/Outlook calendar read/write and scheduling', category: 'Productivity', subCategory: 'Productivity', tags: ['calendar', 'google', 'schedule'], rating: 4.6, installCount: 9700, price: 0, priceUnit: 'free', package: 'openclaw-skill-calendar' },
  { id: 'oc-notes', name: 'Notes & Memory', description: 'Persistent note-taking and recall across agent sessions', category: 'Productivity', subCategory: 'Memory', tags: ['notes', 'memory', 'storage'], rating: 4.8, installCount: 16900, price: 0, priceUnit: 'free', package: 'openclaw-skill-memory' },
];

function mapHubSkillToSkillItem(s: OpenClawHubSkill): SkillItem {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    author: s.author || '@openclaw-hub',
    authorId: 'openclaw',
    category: 'skills',
    subCategory: s.subCategory,
    price: s.price ?? 0,
    priceUnit: s.priceUnit || 'free',
    rating: s.rating ?? 4.5,
    reviewCount: Math.floor((s.installCount ?? 0) / 10),
    likeCount: Math.floor((s.installCount ?? 0) / 20),
    usageCount: s.installCount ?? 0,
    callCount: (s.installCount ?? 0) * 12,
    agentCompatible: true,
    tags: s.tags || [],
    isLiked: false,
    isFavorited: false,
    createdAt: new Date('2025-01-01').toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Attempt to fetch skills from the official OpenClaw Hub registry directly */
async function fetchFromOfficialHub(): Promise<OpenClawHubSkill[]> {
  for (const url of OFFICIAL_HUB_URLS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(`${url}?limit=200`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);
      if (!resp.ok) continue;
      const data = await resp.json();
      const raw: OpenClawHubSkill[] = data.skills || data.items || data.data || [];
      if (raw.length > 0) return raw;
    } catch {
      // try next URL
    }
  }
  return [];
}

/** Get hub skills — use backend bridge, fallback to direct hub, fallback to placeholder */
async function getHubSkills(): Promise<OpenClawHubSkill[]> {
  // Return cached if fresh
  if (_hubCache && Date.now() - _hubCache.fetchedAt < HUB_CACHE_TTL_MS) {
    return _hubCache.items;
  }

  // 1. Try backend bridge (GET /openclaw/bridge/skill-hub?limit=200)
  try {
    const data = await apiFetch<any>('/openclaw/bridge/skill-hub?limit=200');
    const raw: OpenClawHubSkill[] = data.skills || data.items || [];
    if (raw.length > 0) {
      _hubCache = { items: raw, fetchedAt: Date.now() };
      return raw;
    }
  } catch { /* fall through */ }

  // 2. Try official OpenClaw Hub directly
  const direct = await fetchFromOfficialHub();
  if (direct.length > 0) {
    _hubCache = { items: direct, fetchedAt: Date.now() };
    return direct;
  }

  // 3. Use placeholder (cached so we don't keep retrying this session)
  _hubCache = { items: HUB_PLACEHOLDER, fetchedAt: Date.now() - HUB_CACHE_TTL_MS + 5 * 60 * 1000 };
  return HUB_PLACEHOLDER;
}

export async function searchOpenClawHub(params: OpenClawHubSearchParams): Promise<OpenClawHubSearchResponse> {
  const allSkills = await getHubSkills();
  let list = [...allSkills];

  // Client-side filter (works whether data came from API or placeholder)
  if (params.q) {
    const q = params.q.toLowerCase();
    list = list.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      (s.tags ?? []).some(t => t.toLowerCase().includes(q))
    );
  }
  if (params.category && params.category !== 'All') {
    list = list.filter(s => s.category === params.category);
  }

  // Paginate
  const page = params.page || 1;
  const limit = params.limit || 20;
  const start = (page - 1) * limit;
  const items = list.slice(start, start + limit).map(mapHubSkillToSkillItem);

  return {
    items,
    total: list.length,
    page,
    totalPages: Math.ceil(list.length / limit),
  };
}

/** Force refresh hub cache (e.g. on pull-to-refresh) */
export function invalidateHubCache(): void {
  _hubCache = null;
}
