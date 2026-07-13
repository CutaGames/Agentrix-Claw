/**
 * Unified Market Search API — Sprint 3 Task 3.7
 *
 * Calls `GET /api/v1/market/search?query=xxx&limit=N` to search across
 * skins, skills, and tasks in a single request.
 */
import { apiFetch } from './api';

// ── Types ────────────────────────────────────────────────────

export interface SkinSearchItem {
  id: string;
  displayName: string;
  thumbnailUrl: string | null;
  clan: string;
  priceUsd: number | null;
  featured: boolean;
}

export interface SkillSearchItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  rating: number;
}

export interface TaskSearchItem {
  id: string;
  title: string;
  type: string;
  budget: number;
  currency: string;
  status: string;
}

export interface UnifiedSearchResponse {
  skins: { items: SkinSearchItem[]; count: number };
  skills: { items: SkillSearchItem[]; count: number };
  tasks: { items: TaskSearchItem[]; count: number };
}

// ── API call ─────────────────────────────────────────────────

export async function fetchMarketSearch(
  query: string,
  limit?: number,
): Promise<UnifiedSearchResponse> {
  const qs = new URLSearchParams();
  qs.set('query', query);
  if (limit != null) qs.set('limit', String(limit));

  return apiFetch<UnifiedSearchResponse>(`/v1/market/search?${qs.toString()}`);
}
