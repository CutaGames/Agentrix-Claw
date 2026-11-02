/**
 * Pet SDK (Phase 6) — Minigame / Breeding / Achievements / Memory Album.
 *
 * 后端契约：
 *   GET  /api/v1/pet/minigames/leaderboard?game_key=
 *   GET  /api/v1/pet/minigames/history
 *   POST /api/v1/pet/minigames/submit         { game_key, score, metadata? }
 *
 *   GET  /api/v1/pet/breeding/mine
 *   POST /api/v1/pet/breeding/invite          { partnerUserId, initiatorPetSkinId, partnerPetSkinId }
 *   POST /api/v1/pet/breeding/:id/accept
 *   POST /api/v1/pet/breeding/:id/decline
 *   POST /api/v1/pet/breeding/:id/cancel
 *   POST /api/v1/pet/breeding/:id/hatch
 *
 *   GET  /api/v1/pet/achievements
 *   POST /api/v1/pet/achievements/_unlock     { key }
 *
 *   GET    /api/v1/pet/memories?limit=&offset=&category=
 *   POST   /api/v1/pet/memories               { title, body?, thumbnailUrl?, category?, metadata? }
 *   DELETE /api/v1/pet/memories/:id
 *
 * Realtime topics (forwarded to window CustomEvent by agentPresence.ts)：
 *   presence:pet.breeding.invited        → agentrix:pet-breeding-invited
 *   presence:pet.breeding.hatching       → agentrix:pet-breeding-hatching
 *   presence:pet.breeding.hatched        → agentrix:pet-breeding-hatched
 *   presence:pet.achievement.unlocked    → agentrix:pet-achievement-unlocked
 *   presence:pet.energy                  → agentrix:pet-energy
 */
import { API_BASE, useAuthStore } from "./store";

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  if (!token) throw new Error("not authenticated");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function asJson<T>(resp: Response, label: string): Promise<T> {
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`${label} failed (${resp.status}): ${body || resp.statusText}`);
  }
  return resp.json() as Promise<T>;
}

// ── Minigame ─────────────────────────────────────────────────────────

export type MinigameKey = "scratch" | "feed" | "code_buddy";

export const MINIGAME_META: Record<MinigameKey, {
  label_zh: string; label_en: string; emoji: string; tagline_zh: string;
  scoreCap: number; xpRate: number;
}> = {
  scratch:    { label_zh: "挠挠它", label_en: "Scratch",    emoji: "🐾", tagline_zh: "点点点 → 攒亲密度", scoreCap: 200, xpRate: 0.5 },
  feed:       { label_zh: "喂食",   label_en: "Feed",       emoji: "🍖", tagline_zh: "投喂能量豆 → 解锁情绪", scoreCap: 150, xpRate: 0.6 },
  code_buddy: { label_zh: "代码伙伴", label_en: "CodeBuddy", emoji: "💻", tagline_zh: "宠物陪你写代码 → 加亲密 + 加经验", scoreCap: 300, xpRate: 0.4 },
};

export interface MinigameScoreItem {
  id: string;
  game_key: MinigameKey;
  score: number;
  intimacy_xp_awarded: number;
  energy_awarded: number;
  metadata: Record<string, unknown> | null;
  created_at: number;
}

export interface MinigameLeaderboardRow {
  id: string;
  game_key: MinigameKey;
  score: number;
  created_at: number;
}

export interface MinigameSubmitResult {
  id: string;
  score_clamped: number;
  intimacy_xp_awarded: number;
  energy_awarded: number;
  level_up: boolean;
  newly_unlocked_achievements: { key: string; label_zh: string; icon: string }[];
}

export async function listMinigameLeaderboard(
  gameKey?: MinigameKey,
): Promise<{ items: MinigameLeaderboardRow[] }> {
  const url = new URL(`${API_BASE}/v1/pet/minigames/leaderboard`);
  if (gameKey) url.searchParams.set("game_key", gameKey);
  const resp = await fetch(url.toString(), { headers: authHeaders() });
  return asJson(resp, "listMinigameLeaderboard");
}

export async function listMinigameHistory(limit = 20): Promise<{ items: MinigameScoreItem[] }> {
  const resp = await fetch(`${API_BASE}/v1/pet/minigames/history?limit=${limit}`, {
    headers: authHeaders(),
  });
  return asJson(resp, "listMinigameHistory");
}

export async function submitMinigameScore(
  gameKey: MinigameKey,
  score: number,
  metadata?: Record<string, unknown>,
): Promise<MinigameSubmitResult> {
  const resp = await fetch(`${API_BASE}/v1/pet/minigames/submit`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ game_key: gameKey, score, metadata: metadata ?? {} }),
  });
  return asJson(resp, "submitMinigameScore");
}

// ── Breeding ─────────────────────────────────────────────────────────

export type BreedingStatus =
  | "invited"
  | "accepted"
  | "hatching"
  | "hatched"
  | "declined"
  | "cancelled";

export interface BreedingEgg {
  id: string;
  initiator_user_id: string;
  partner_user_id: string;
  initiator_pet_skin_id: string;
  partner_pet_skin_id: string;
  status: BreedingStatus;
  hatch_at: number | null;
  child_skin_id_initiator: string | null;
  child_skin_id_partner: string | null;
  metadata: Record<string, unknown> | null;
  created_at: number;
  updated_at: number;
}

export interface BreedingListResp {
  initiated: BreedingEgg[];
  received: BreedingEgg[];
}

export async function listMyBreedingEggs(): Promise<BreedingListResp> {
  const resp = await fetch(`${API_BASE}/v1/pet/breeding/mine`, { headers: authHeaders() });
  return asJson(resp, "listMyBreedingEggs");
}

export async function inviteBreeding(payload: {
  partnerUserId: string;
  initiatorPetSkinId: string;
  partnerPetSkinId: string;
}): Promise<BreedingEgg> {
  const resp = await fetch(`${API_BASE}/v1/pet/breeding/invite`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return asJson(resp, "inviteBreeding");
}

export async function acceptBreeding(eggId: string): Promise<BreedingEgg> {
  const resp = await fetch(`${API_BASE}/v1/pet/breeding/${encodeURIComponent(eggId)}/accept`, {
    method: "POST",
    headers: authHeaders(),
  });
  return asJson(resp, "acceptBreeding");
}

export async function declineBreeding(eggId: string): Promise<BreedingEgg> {
  const resp = await fetch(`${API_BASE}/v1/pet/breeding/${encodeURIComponent(eggId)}/decline`, {
    method: "POST",
    headers: authHeaders(),
  });
  return asJson(resp, "declineBreeding");
}

export async function cancelBreeding(eggId: string): Promise<BreedingEgg> {
  const resp = await fetch(`${API_BASE}/v1/pet/breeding/${encodeURIComponent(eggId)}/cancel`, {
    method: "POST",
    headers: authHeaders(),
  });
  return asJson(resp, "cancelBreeding");
}

export async function hatchBreeding(eggId: string): Promise<BreedingEgg> {
  const resp = await fetch(`${API_BASE}/v1/pet/breeding/${encodeURIComponent(eggId)}/hatch`, {
    method: "POST",
    headers: authHeaders(),
  });
  return asJson(resp, "hatchBreeding");
}

// ── Achievements ─────────────────────────────────────────────────────

export interface PetAchievementItem {
  key: string;
  label_zh: string;
  label_en: string;
  desc_zh: string;
  icon: string;
  threshold: number | null;
  unlocked: boolean;
  unlocked_at: number | null;
}

export async function listAchievements(): Promise<{ items: PetAchievementItem[] }> {
  const resp = await fetch(`${API_BASE}/v1/pet/achievements`, { headers: authHeaders() });
  return asJson(resp, "listAchievements");
}

// ── Memory Album ─────────────────────────────────────────────────────

export interface PetMemoryItem {
  id: string;
  title: string;
  body: string | null;
  thumbnail_url: string | null;
  category: string | null;
  metadata: Record<string, unknown> | null;
  created_at: number;
}

export async function listMemories(opts: {
  limit?: number;
  offset?: number;
  category?: string;
} = {}): Promise<{ items: PetMemoryItem[]; total: number }> {
  const url = new URL(`${API_BASE}/v1/pet/memories`);
  if (opts.limit != null) url.searchParams.set("limit", String(opts.limit));
  if (opts.offset != null) url.searchParams.set("offset", String(opts.offset));
  if (opts.category) url.searchParams.set("category", opts.category);
  const resp = await fetch(url.toString(), { headers: authHeaders() });
  return asJson(resp, "listMemories");
}

export async function createMemory(payload: {
  title: string;
  body?: string;
  thumbnailUrl?: string | null;
  category?: string;
  metadata?: Record<string, unknown>;
}): Promise<PetMemoryItem> {
  const resp = await fetch(`${API_BASE}/v1/pet/memories`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return asJson(resp, "createMemory");
}

export async function deleteMemory(id: string): Promise<{ ok: true }> {
  const resp = await fetch(`${API_BASE}/v1/pet/memories/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return asJson(resp, "deleteMemory");
}

// ── Living Pet (intimacy / state) — used by PetGrowthDashboard ─────────

export interface LivingPetState {
  id: string;
  user_id: string;
  emotion: string;
  emotion_intensity: number;
  intimacy_xp: number;
  intimacy_level: number;
  primary_agent_id: string | null;
  soul_template_id: string | null;
  active_skin_id: string | null;
  energy?: number | null;
  energy_max?: number | null;
  last_active_at?: number | null;
}

export async function getLivingPetState(): Promise<LivingPetState> {
  const resp = await fetch(`${API_BASE}/v1/pet/state`, { headers: authHeaders() });
  return asJson(resp, "getLivingPetState");
}

// ── Format helpers ───────────────────────────────────────────────────

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return new Date(ts).toLocaleDateString("zh-CN");
}

export function formatCountdown(targetMs: number): string {
  const diff = targetMs - Date.now();
  if (diff <= 0) return "可孵化";
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (d > 0) return `${d}天 ${h}小时`;
  if (h > 0) return `${h}小时 ${m}分钟`;
  return `${m} 分钟`;
}
