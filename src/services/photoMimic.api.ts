/**
 * Photo Mimic Game client — per docs/G1_PHOTO_MIMIC_GAME_2026-05.zh-CN.md §4.
 */
import { apiFetch } from './api';

export type SeasonStatus = 'upcoming' | 'submitting' | 'voting' | 'settled';

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
  settled_at: string | null;
  status: SeasonStatus;
  prize_pool_axp: number;
  champion_entry_id: string | null;
}

export interface PhotoMimicEntry {
  id: string;
  seasonId: string;
  userId: string;
  sourceImageUrl: string;
  generatedThumbnailUrl: string | null;
  generatedModelUrl: string | null;
  caption: string | null;
  voteCount: number;
  status: string;
  finalRank: number | null;
  createdAt: string;
}

export async function fetchCurrentSeason(): Promise<PhotoMimicSeason | null> {
  return apiFetch<PhotoMimicSeason | null>('/v1/games/photo-mimic/seasons/current');
}

export async function fetchLeaderboard(
  seasonId: string,
  limit = 20,
  offset = 0,
): Promise<{ items: PhotoMimicEntry[]; total: number }> {
  return apiFetch(`/v1/games/photo-mimic/seasons/${seasonId}/leaderboard?limit=${limit}&offset=${offset}`);
}

export async function submitMimicEntry(input: {
  season_id: string;
  source_image_url: string;
  caption?: string;
  provider?: string;
}): Promise<PhotoMimicEntry> {
  return apiFetch('/v1/games/photo-mimic/entries', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchEntry(entryId: string): Promise<PhotoMimicEntry> {
  return apiFetch(`/v1/games/photo-mimic/entries/${entryId}`);
}

export async function fetchMyMimicEntries(limit = 20): Promise<{ items: PhotoMimicEntry[] }> {
  return apiFetch(`/v1/games/photo-mimic/entries/mine?limit=${limit}`);
}

export async function castMimicVote(entryId: string): Promise<{
  ok: boolean;
  daily_votes_used: number;
  daily_votes_remaining: number;
}> {
  return apiFetch('/v1/games/photo-mimic/votes', {
    method: 'POST',
    body: JSON.stringify({ entry_id: entryId }),
  });
}

export async function fetchTodayVotes(): Promise<{ used: number; remaining: number }> {
  return apiFetch('/v1/games/photo-mimic/votes/mine/today');
}
