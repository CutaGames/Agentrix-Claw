/**
 * World Engagement client — 游戏周榜(分数权威)+ 事件预测市场(parimutuel,AXP)。
 * 后端:backend/src/modules/world-engagement。
 */
import { apiFetch } from './api';

// ── Arena / Leaderboard ──────────────────────────────────────
export interface LeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  score: number;
  isMe?: boolean;
}

export async function submitGameScore(
  creationId: string,
  score: number,
  state?: Record<string, unknown>,
): Promise<{ ok: boolean; score: number; best: number; rank: number; awardedAxp: number }> {
  return apiFetch(`/v1/arena/creations/${creationId}/score`, {
    method: 'POST',
    body: JSON.stringify({ score, state }),
  });
}

export async function fetchLeaderboard(
  creationId: string,
  period: 'week' | 'all' = 'week',
  limit = 20,
): Promise<{ items: LeaderboardRow[]; me?: LeaderboardRow }> {
  return apiFetch(`/v1/arena/creations/${creationId}/leaderboard?period=${period}&limit=${limit}`);
}

// ── Prediction Market ────────────────────────────────────────
export type PredictionStatus = 'open' | 'locked' | 'settled' | 'cancelled';
export interface PredictionOption { id: string; label: string }
export interface PredictionMarket {
  id: string;
  title: string;
  category: string;
  subtitle: string | null;
  options: PredictionOption[];
  status: PredictionStatus;
  winningOptionId: string | null;
  poolByOption: Record<string, number>;
  totalPool: number;
  rakeBps: number;
  locksAt: string | null;
  impliedOdds: Record<string, number>;
  myStakes?: { optionId: string; amount: number; payout: number | null }[];
  createdAt: string;
}

export async function listPredictions(category?: string, status?: PredictionStatus): Promise<{ items: PredictionMarket[] }> {
  const qs = new URLSearchParams();
  if (category) qs.set('category', category);
  if (status) qs.set('status', status);
  const q = qs.toString();
  return apiFetch(`/v1/predictions${q ? `?${q}` : ''}`);
}

export async function getPrediction(id: string): Promise<PredictionMarket> {
  return apiFetch(`/v1/predictions/${id}`);
}

export async function stakePrediction(
  id: string,
  optionId: string,
  amount: number,
): Promise<{ ok: boolean; amount: number; totalPool: number; myTotalOnOption: number }> {
  return apiFetch(`/v1/predictions/${id}/stake`, {
    method: 'POST',
    body: JSON.stringify({ optionId, amount }),
  });
}

export async function predictionIsAdmin(): Promise<{ isAdmin: boolean }> {
  return apiFetch(`/v1/predictions/admin/is-admin`);
}

// ── Arena tournaments (skill prize pools) ────────────────────
export interface ArenaTournament {
  id: string;
  creationId: string;
  title: string;
  entryFeeAxp: number;
  rakeBps: number;
  payoutSplits: number[];
  status: 'open' | 'settled' | 'cancelled';
  prizePool: number;
  endsAt: string | null;
  entrants?: number;
  joined?: boolean;
}

export async function listTournaments(creationId?: string): Promise<{ items: ArenaTournament[] }> {
  return apiFetch(`/v1/arena/tournaments${creationId ? `?creationId=${creationId}` : ''}`);
}
export async function joinTournament(id: string): Promise<{ ok: boolean; entrants: number; prizePool: number }> {
  return apiFetch(`/v1/arena/tournaments/${id}/join`, { method: 'POST' });
}

// ── AI Coach / commentary ────────────────────────────────────
export async function coachGame(
  creationId: string,
  title: string,
  state?: string | null,
  history?: string[],
): Promise<{ tip: string; byModel: string | null }> {
  return apiFetch(`/v1/arena/coach`, {
    method: 'POST',
    body: JSON.stringify({ creationId, title, state, history }),
  });
}

// Admin (运营):
export async function settlePrediction(id: string, winningOptionId: string) {
  return apiFetch(`/v1/predictions/${id}/settle`, { method: 'POST', body: JSON.stringify({ winningOptionId }) });
}
export async function lockPrediction(id: string) {
  return apiFetch(`/v1/predictions/${id}/lock`, { method: 'POST' });
}
