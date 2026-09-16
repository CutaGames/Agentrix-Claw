/**
 * Mobile Pet Phase 6 SDK — minigames / breeding / achievements / memory album.
 */
import { apiFetch } from './api';

export type MinigameKey = 'scratch' | 'feed' | 'code_buddy';

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

export type BreedingStatus =
  | 'invited'
  | 'accepted'
  | 'hatching'
  | 'hatched'
  | 'declined'
  | 'cancelled';

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

export interface PetMemoryItem {
  id: string;
  title: string;
  body: string | null;
  thumbnail_url: string | null;
  category: string | null;
  metadata: Record<string, unknown> | null;
  created_at: number;
}

export const MINIGAME_META: Record<
  MinigameKey,
  { label_zh: string; emoji: string; tagline_zh: string; scoreCap: number; xpRate: number }
> = {
  scratch: { label_zh: '挠挠它', emoji: '🐾', tagline_zh: '点点点 → 攒亲密度', scoreCap: 200, xpRate: 0.5 },
  feed: { label_zh: '喂食', emoji: '🍖', tagline_zh: '投喂能量豆 → 解锁情绪', scoreCap: 150, xpRate: 0.6 },
  code_buddy: { label_zh: '代码伙伴', emoji: '💻', tagline_zh: '宠物陪你写代码', scoreCap: 300, xpRate: 0.4 },
};

// Minigame
export const listMinigameLeaderboard = (gameKey?: MinigameKey) => {
  const qs = gameKey ? `?game_key=${encodeURIComponent(gameKey)}` : '';
  return apiFetch<{ items: MinigameLeaderboardRow[] }>(`/v1/pet/minigames/leaderboard${qs}`);
};
export const listMinigameHistory = (limit = 30) =>
  apiFetch<{ items: MinigameScoreItem[] }>(`/v1/pet/minigames/history?limit=${limit}`);
export const submitMinigameScore = (gameKey: MinigameKey, score: number, metadata?: Record<string, unknown>) =>
  apiFetch<MinigameSubmitResult>('/v1/pet/minigames/submit', {
    method: 'POST',
    body: JSON.stringify({ game_key: gameKey, score, metadata: metadata ?? {} }),
  });

// Breeding
export const listMyBreedingEggs = () => apiFetch<BreedingListResp>('/v1/pet/breeding/mine');
export const inviteBreeding = (payload: {
  partnerUserId: string;
  initiatorPetSkinId: string;
  partnerPetSkinId: string;
}) =>
  apiFetch<BreedingEgg>('/v1/pet/breeding/invite', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
export const acceptBreeding = (id: string) =>
  apiFetch<BreedingEgg>(`/v1/pet/breeding/${encodeURIComponent(id)}/accept`, { method: 'POST', body: '{}' });
export const declineBreeding = (id: string) =>
  apiFetch<BreedingEgg>(`/v1/pet/breeding/${encodeURIComponent(id)}/decline`, { method: 'POST', body: '{}' });
export const cancelBreeding = (id: string) =>
  apiFetch<BreedingEgg>(`/v1/pet/breeding/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' });
export const hatchBreeding = (id: string) =>
  apiFetch<BreedingEgg>(`/v1/pet/breeding/${encodeURIComponent(id)}/hatch`, { method: 'POST', body: '{}' });

// Achievements
export const listAchievements = () =>
  apiFetch<{ items: PetAchievementItem[] }>('/v1/pet/achievements');

// Memories
export const listMemories = (params?: { limit?: number; offset?: number; category?: string }) => {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set('limit', String(params.limit));
  if (params?.offset != null) sp.set('offset', String(params.offset));
  if (params?.category) sp.set('category', params.category);
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  return apiFetch<{ items: PetMemoryItem[]; total: number }>(`/v1/pet/memories${qs}`);
};
export const createMemory = (payload: {
  title: string;
  body?: string;
  thumbnailUrl?: string | null;
  category?: string;
  metadata?: Record<string, unknown>;
}) =>
  apiFetch<PetMemoryItem>('/v1/pet/memories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
export const deleteMemory = (id: string) =>
  apiFetch<{ ok: true }>(`/v1/pet/memories/${encodeURIComponent(id)}`, { method: 'DELETE' });

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

export function formatCountdown(targetMs: number): string {
  const diff = targetMs - Date.now();
  if (diff <= 0) return '可孵化';
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (d > 0) return `${d}天 ${h}小时`;
  if (h > 0) return `${h}小时 ${m}分钟`;
  return `${m} 分钟`;
}
