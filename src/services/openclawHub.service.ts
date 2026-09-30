/**
 * OpenClaw Skill Hub — V3 (Real ClawHub Integration)
 *
 * Queries the Agentrix backend which fetches 5000+ real skills from the
 * official ClawHub API (https://clawhub.ai/api/v1) via incremental sync.
 *
 * The backend:
 *  - Seeds from a committed snapshot JSON on cold start
 *  - Incrementally fetches new skills every 2 min (3 pages/cycle)
 *  - Persists ALL skills to DB
 *  - Serves them via /api/openclaw/bridge/skill-hub/search (paginated)
 *
 * This client-side service:
 *  - Fetches the first page from backend for display
 *  - Delegates search/filter/pagination to the backend
 *  - No more client-side caching of full catalog (too large)
 */
import { apiFetch } from './api';
import type { SkillItem } from './marketplace.api';

// Simple TTL cache: refreshes every 10 min to match backend refresh
let _hubCache: { items: OpenClawHubSkill[]; fetchedAt: number } | null = null;
const HUB_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

export interface OpenClawHubSkill {
  id: string;
  name: string;
  displayName?: string;
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
  package?: string;   // ClawHub slug for deep-linking
  repoUrl?: string;
  icon?: string;
}

export interface OpenClawHubSearchParams {
  q?: string;
  category?: string;
  page?: number;
  limit?: number;
}

export interface OpenClawHubSearchResponse {
  items: any[];     // enriched objects — superset of SkillItem with icon/tokenCost
  total: number;
  page: number;
  totalPages: number;
}

// ── Category normalisation ────────────────────────────────────────────────────
// Backend returns SkillCategory enum values (utility, data, integration, commerce,
// payment, custom) from real ClawHub skills, plus string categories from built-ins.
const CATEGORY_MAP: Record<string, string> = {
  utility:       'Dev Tools',
  data:          'Data',
  integration:   'Integration',
  commerce:      'Commerce',
  payment:       'Finance',
  custom:        'Creative',
  search:        'AI Tools',
  developer:     'Dev Tools',
  memory:        'AI Tools',
  creative:      'Creative',
  analytics:     'Data',
  language:      'AI Tools',
  automation:    'Automation',
  general:       'General',
  ai:            'AI Tools',
  media:         'Creative',
  communication: 'Social',
  productivity:  'Automation',
  finance:       'Finance',
};

function normaliseCategory(raw?: string): string {
  if (!raw) return 'General';
  const lower = raw.toLowerCase();
  return CATEGORY_MAP[lower] ?? raw;
}

// ── Icon map ──────────────────────────────────────────────────────────────────
const FALLBACK_CATEGORY_ICON: Record<string, string> = {
  'Dev Tools': '💻',
  'AI Tools': '🤖',
  Data: '📊',
  Integration: '🔌',
  Commerce: '💰',
  Finance: '💳',
  Creative: '🎨',
  Automation: '⚙️',
  Social: '💬',
  General: '⚡',
};

// ── No more client-side placeholder — backend serves real data from DB ────────

// ── Mapping: OpenClawHubSkill → enriched item for rendering ───────────────────
function toDisplayItem(s: OpenClawHubSkill): any {
  const cat = normaliseCategory(s.category);
  const icon = s.icon || FALLBACK_CATEGORY_ICON[cat] || '⚡';
  const downloads = s.installCount ?? 0;
  return {
    id: s.id,
    name: s.displayName ?? s.name,
    displayName: s.displayName ?? s.name,
    description: s.description,
    author: s.author || 'OpenClaw Community',
    authorId: 'openclaw',
    category: 'skills' as const,
    subCategory: cat,
    price: s.price ?? 0,
    priceUnit: s.priceUnit || 'free',
    rating: s.rating ?? 0,
    reviewCount: Math.min(Math.floor(downloads / 50), 999),
    likeCount: Math.min(Math.floor(downloads / 20), 9999),
    usageCount: downloads,
    callCount: downloads,
    agentCompatible: true,
    tags: s.tags || [],
    isLiked: false,
    isFavorited: false,
    createdAt: new Date('2025-01-01').toISOString(),
    updatedAt: new Date().toISOString(),
    icon,
    tokenCost: 0,
    installCount: downloads,
    hubCategory: cat,
    hubSlug: s.package,
  };
}

// ── Fetch from Agentrix backend bridge (server-side pagination) ───────────────
// The backend now has real ClawHub skills in its DB, served via paginated endpoint.
// We delegate ALL search/filter/pagination to the server.

// ── Get hub skills (cached, with progressive loading) ─────────────────────────
// Light cache for the "all skills" quick browse (first 100 by downloads)
async function getHubSkills(): Promise<OpenClawHubSkill[]> {
  if (_hubCache && Date.now() - _hubCache.fetchedAt < HUB_CACHE_TTL_MS) {
    return _hubCache.items;
  }

  try {
    const resp = await apiFetch<any>(
      '/openclaw/bridge/skill-hub/search?limit=250&sortBy=callCount&sortOrder=DESC',
    );
    const raw: any[] =
      resp?.items || resp?.skills || resp?.data || (Array.isArray(resp) ? resp : []);
    if (raw.length > 0) {
      const skills = raw.map(mapRawToSkill);
      console.log(`[OpenClawHub] Loaded ${skills.length} of ${resp?.total ?? '?'} total skills`);
      _hubCache = { items: skills, fetchedAt: Date.now() };
      return skills;
    }
    console.warn('[OpenClawHub] Bridge returned 0 skills');
  } catch (err) {
    console.error('[OpenClawHub] getHubSkills failed:', err instanceof Error ? err.message : String(err));
  }

  return [];
}

function mapRawToSkill(s: any): OpenClawHubSkill {
  return {
    id: s.id ?? s.key ?? `oc-${Math.random().toString(36).slice(2, 8)}`,
    name: s.name ?? s.displayName ?? 'Unknown Skill',
    displayName: s.displayName ?? s.name,
    description: s.description ?? 'OpenClaw community skill',
    author: s.author ?? 'OpenClaw Community',
    category: s.category ?? 'utility',
    subCategory: s.subCategory,
    tags: s.tags ?? [],
    version: s.version,
    rating: typeof s.rating === 'number' ? s.rating : parseFloat(s.rating) || 0,
    installCount: s.callCount ?? s.installCount ?? 0,
    price: s.price ?? 0,
    priceUnit: s.priceUnit ?? 'free',
    package: s.hubSlug ?? s.key ?? s.name,
    repoUrl: s.repoUrl,
    icon: s.icon,
  };
}
// ── Public API ────────────────────────────────────────────────────────────────

export async function searchOpenClawHub(
  params: OpenClawHubSearchParams,
): Promise<OpenClawHubSearchResponse> {
  // Delegate search to backend for server-side filtering + pagination
  try {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.category && params.category !== 'All') {
      // Map display category back to backend enum
      const backendCat = Object.entries(CATEGORY_MAP).find(([, v]) => v === params.category)?.[0];
      if (backendCat) qs.set('category', backendCat);
    }
    qs.set('page', String(params.page || 1));
    qs.set('limit', String(params.limit || 30));
    qs.set('sortBy', 'callCount');
    qs.set('sortOrder', 'DESC');

    const resp = await apiFetch<any>(`/openclaw/bridge/skill-hub/search?${qs.toString()}`);
    const raw: any[] = resp?.items ?? [];
    const total = resp?.total ?? raw.length;
    const page = resp?.page ?? params.page ?? 1;
    const limit = params.limit || 30;

    return {
      items: raw.map(s => toDisplayItem(mapRawToSkill(s))),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  } catch (err) {
    console.error('[OpenClawHub] searchOpenClawHub backend call failed:', err instanceof Error ? err.message : String(err));
  }

  // Fallback: use cached top skills
  const allSkills = await getHubSkills();
  let list = [...allSkills];

  // Text search (name + description + tags)
  if (params.q) {
    const q = params.q.toLowerCase();
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.displayName ?? '').toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        (s.tags ?? []).some((t) => t.toLowerCase().includes(q)),
    );
  }

  // Category filter — compare against the NORMALISED display category
  if (params.category && params.category !== 'All') {
    const cat = params.category;
    list = list.filter((s) => normaliseCategory(s.category) === cat);
  }

  // Sort by popularity (downloads desc)
  list.sort((a, b) => (b.installCount ?? 0) - (a.installCount ?? 0));

  // Paginate
  const page = params.page || 1;
  const limit = params.limit || 30;
  const start = (page - 1) * limit;
  const items = list.slice(start, start + limit).map(toDisplayItem);

  return {
    items,
    total: list.length,
    page,
    totalPages: Math.ceil(list.length / limit),
  };
}

export async function getHubSkillDetail(id: string): Promise<any | null> {
  // Try the new slug endpoint first (returns live detail from ClawHub)
  try {
    const slug = id.replace(/^clawhub-/, '');
    const resp = await apiFetch<any>(`/openclaw/bridge/skill-hub/skills/${encodeURIComponent(slug)}`);
    if (resp && (resp.id || resp.key)) {
      return toDisplayItem({
        id: resp.id ?? resp.key,
        name: resp.displayName ?? resp.name,
        displayName: resp.displayName,
        description: resp.description ?? '',
        author: resp.author,
        category: resp.category,
        tags: resp.tags,
        version: resp.version,
        rating: resp.rating,
        installCount: resp.callCount ?? resp.installCount ?? 0,
        price: resp.price ?? 0,
        icon: resp.icon,
        package: resp.hubSlug ?? resp.key,
      });
    }
  } catch { /* fallback to cache */ }

  // Check cache / placeholder
  const allSkills = await getHubSkills();
  const skill = allSkills.find((s) => s.id === id || s.package === id || s.name === id);
  if (!skill) return null;
  return toDisplayItem(skill);
}

/** Force refresh hub cache (e.g. on pull-to-refresh) */
export function invalidateHubCache(): void {
  _hubCache = null;
}
