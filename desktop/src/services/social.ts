/**
 * Social client (Desktop) — co-raising + greeting + photo-mimic.
 * Sprint DC per docs/DESKTOP_AUDIT_AND_REFACTOR_PLAN_2026-05.
 */
import { API_BASE, apiFetch } from "./store";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${body}`.slice(0, 300));
  }
  return res.json();
}

// ── Co-Raising ─────────────────────────────────────────────

export interface CoRaisingInvite {
  id: string;
  inviter_id: string;
  agent_account_id: string;
  token: string;
  split_bps: number;
  max_feeders: number;
  feeders_count: number;
  total_feeds: number;
  status: "active" | "paused" | "cancelled" | "expired";
  expires_at: number | null;
  created_at: number;
  share_url: string;
}

export async function createCoRaisingInvite(input: {
  agent_account_id: string;
  split_bps?: number;
  max_feeders?: number;
}): Promise<CoRaisingInvite> {
  const res = await apiFetch(`${API_BASE}/v1/pet/coraising/invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return json(res);
}

export async function listMyCoRaisingInvites(limit = 20): Promise<{ items: CoRaisingInvite[] }> {
  const res = await apiFetch(`${API_BASE}/v1/pet/coraising/invites?limit=${limit}`);
  return json(res);
}

// ── Greeting Cards ─────────────────────────────────────────

export interface GreetingTemplate {
  key: string;
  label_zh: string;
  label_en: string;
  category: string;
  axp_cost: number;
  premium: boolean;
}

export async function fetchGreetingCatalog(): Promise<{ templates: GreetingTemplate[] }> {
  const res = await apiFetch(`${API_BASE}/v1/pet/greeting/catalog`);
  return json(res);
}

export interface GreetingCard {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  template_key: string;
  custom_text: string | null;
  status: string;
  created_at: number;
}

export async function fetchGreetingInbox(limit = 20): Promise<{ items: GreetingCard[] }> {
  const res = await apiFetch(`${API_BASE}/v1/pet/greeting/inbox?limit=${limit}`);
  return json(res);
}

// ── Photo Mimic ────────────────────────────────────────────

export interface PhotoMimicSeason {
  id: string;
  theme_code: string;
  theme_title_en: string;
  theme_title_zh: string;
  theme_desc_en: string | null;
  theme_desc_zh: string | null;
  submit_open_at: string;
  submit_close_at: string;
  vote_close_at: string;
  status: "upcoming" | "submitting" | "voting" | "settled";
  prize_pool_axp: number;
  champion_entry_id: string | null;
}

export interface PhotoMimicEntry {
  id: string;
  seasonId: string;
  userId: string;
  sourceImageUrl: string;
  caption: string | null;
  voteCount: number;
  status: string;
  finalRank: number | null;
  createdAt: string;
}

export async function fetchCurrentSeason(): Promise<PhotoMimicSeason | null> {
  const res = await apiFetch(`${API_BASE}/v1/games/photo-mimic/seasons/current`);
  if (res.status === 404) return null;
  return json<PhotoMimicSeason | null>(res);
}

export async function fetchLeaderboard(seasonId: string, limit = 20): Promise<{ items: PhotoMimicEntry[]; total: number }> {
  const res = await apiFetch(`${API_BASE}/v1/games/photo-mimic/seasons/${seasonId}/leaderboard?limit=${limit}`);
  return json(res);
}

export async function submitMimicEntry(input: {
  season_id: string;
  source_image_url: string;
  caption?: string;
}): Promise<PhotoMimicEntry> {
  const res = await apiFetch(`${API_BASE}/v1/games/photo-mimic/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return json(res);
}

export async function castMimicVote(entryId: string): Promise<{ daily_votes_remaining: number }> {
  const res = await apiFetch(`${API_BASE}/v1/games/photo-mimic/votes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entry_id: entryId }),
  });
  return json(res);
}
