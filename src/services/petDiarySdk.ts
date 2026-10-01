/**
 * Mobile Pet Diary SDK (Phase C / C-7).
 *
 * Backend: backend/src/modules/living-pet/pet-diary.{controller,service}.ts
 *   GET /v1/pet/diary               today (or ?date=YYYY-MM-DD)
 *   GET /v1/pet/diary/recent?limit  last N days
 */
import { apiFetch } from './api';

export interface PetDiaryEntry {
  date: string;
  emotion: string;
  intimacy_level: number;
  text_zh: string;
  text_en: string;
  generated_at: number;
}

export async function getTodayDiary(date?: string): Promise<PetDiaryEntry | null> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  const res = await apiFetch<{ entry: PetDiaryEntry | null }>(`/v1/pet/diary${qs}`);
  return res?.entry ?? null;
}

export async function getRecentDiary(limit: number = 7): Promise<PetDiaryEntry[]> {
  const res = await apiFetch<{ items: PetDiaryEntry[] }>(`/v1/pet/diary/recent?limit=${limit}`);
  return res?.items ?? [];
}
