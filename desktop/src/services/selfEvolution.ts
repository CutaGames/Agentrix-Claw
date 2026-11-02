// Sprint Post-launch P-2 (2026-05-24) — Self-Evolution Dashboard.
//
// Aggregates the three already-shipped backend modules that together
// constitute Agentrix's "self-evolution system":
//
//   - /api/dreaming/stats         — overnight memory consolidation runs
//   - /api/v1/memory/stats        — 4-tier memory size (Session / Working / LongTerm / Wiki)
//   - /api/memory-wiki/graph      — wiki page graph (nodes + links)
//
// Goal: give Standard / Pro Mode users a visible "your agent is getting
// smarter" panel — one of the differentiation pillars in
// `docs/agentrix-positioning-2026-05.zh-CN.md` §3.2 (A_Path).

import { apiFetch, API_BASE } from "./store";

// ── Types ───────────────────────────────────────────────────────────────

export interface DreamingStats {
  /** Total dream sessions ever for the user. */
  total: number;
  /** Last 7 day count (server-computed). */
  last7d?: number;
  /** Status histogram. */
  byStatus?: Record<string, number>;
  /** Most recent session timestamp ISO. */
  lastRunAt?: string | null;
}

export interface MemoryTierStats {
  /** Tier name -> count of items. Backend tier keys: session/working/longterm/wiki. */
  byTier: Record<string, number>;
  /** Total entries across all tiers. */
  total: number;
}

export interface WikiGraph {
  /** Number of wiki pages. */
  nodeCount: number;
  /** Number of [[wikilink]] edges. */
  linkCount: number;
  /** Top-N most-linked pages (server-truncated). */
  topPages?: Array<{ slug: string; title: string; linkInCount: number }>;
}

export interface SelfEvolutionSnapshot {
  dreaming: DreamingStats | null;
  memory: MemoryTierStats | null;
  wiki: WikiGraph | null;
  fetchedAt: number;
  /** Whether at least one source returned data. */
  hasAnyData: boolean;
}

// ── Internal helpers ────────────────────────────────────────────────────

async function safeFetch<T>(token: string, path: string): Promise<T | null> {
  try {
    const res = await apiFetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function normalizeMemory(raw: unknown): MemoryTierStats | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  // Backend may return either `{ session: 12, working: 5, ... }` directly
  // or `{ stats: { ... } }`; try both shapes.
  const inner = (r.stats && typeof r.stats === "object")
    ? (r.stats as Record<string, unknown>)
    : r;
  const byTier: Record<string, number> = {};
  let total = 0;
  for (const [key, value] of Object.entries(inner)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      byTier[key] = value;
      total += value;
    }
  }
  if (Object.keys(byTier).length === 0) return null;
  return { byTier, total };
}

function normalizeWiki(raw: unknown): WikiGraph | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const nodes = Array.isArray(r.nodes) ? r.nodes : [];
  const links = Array.isArray(r.links) ? r.links : (Array.isArray(r.edges) ? r.edges : []);
  if (nodes.length === 0 && links.length === 0) return null;
  // Build a quick top-pages list by counting incoming links.
  const inboundCount = new Map<string, number>();
  for (const link of links as any[]) {
    const target = link?.target ?? link?.to;
    if (typeof target === "string") {
      inboundCount.set(target, (inboundCount.get(target) ?? 0) + 1);
    }
  }
  const topPages = (nodes as any[])
    .map((node) => ({
      slug: String(node?.slug ?? node?.id ?? ""),
      title: String(node?.title ?? node?.slug ?? node?.id ?? ""),
      linkInCount: inboundCount.get(node?.slug ?? node?.id ?? "") ?? 0,
    }))
    .filter((p) => p.slug.length > 0)
    .sort((a, b) => b.linkInCount - a.linkInCount)
    .slice(0, 5);
  return {
    nodeCount: nodes.length,
    linkCount: links.length,
    topPages: topPages.length > 0 ? topPages : undefined,
  };
}

function normalizeDreaming(raw: unknown): DreamingStats | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const total = typeof r.total === "number" ? r.total : 0;
  const last7d = typeof r.last7d === "number" ? r.last7d : undefined;
  const byStatus = (r.byStatus && typeof r.byStatus === "object")
    ? (r.byStatus as Record<string, number>)
    : undefined;
  const lastRunAt = typeof r.lastRunAt === "string" ? r.lastRunAt : null;
  return { total, last7d, byStatus, lastRunAt };
}

// ── Public API ─────────────────────────────────────────────────────────

export async function fetchDreamingStats(token: string): Promise<DreamingStats | null> {
  const raw = await safeFetch<unknown>(token, "/dreaming/stats");
  return normalizeDreaming(raw);
}

export async function fetchMemoryStats(token: string): Promise<MemoryTierStats | null> {
  const raw = await safeFetch<unknown>(token, "/v1/memory/stats");
  return normalizeMemory(raw);
}

export async function fetchWikiGraph(token: string): Promise<WikiGraph | null> {
  const raw = await safeFetch<unknown>(token, "/memory-wiki/graph");
  return normalizeWiki(raw);
}

/**
 * Fan-out fetch all three sources in parallel and return a unified snapshot.
 * Each source falls back to `null` independently — partial data is fine.
 */
export async function fetchSelfEvolutionSnapshot(token: string): Promise<SelfEvolutionSnapshot> {
  const [dreaming, memory, wiki] = await Promise.all([
    fetchDreamingStats(token),
    fetchMemoryStats(token),
    fetchWikiGraph(token),
  ]);
  return {
    dreaming,
    memory,
    wiki,
    fetchedAt: Date.now(),
    hasAnyData: Boolean(dreaming || memory || wiki),
  };
}
