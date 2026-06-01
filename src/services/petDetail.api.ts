/**
 * petDetail.api — P1a (2026-05-30): real data aggregator for PetDetailSheet.
 *
 * Before P1a the PetDetailSheet hero / wallet / skills / devices were all
 * HARDCODED placeholders (Lv 12 / 心情😊 / 能量 78% / USDC — / 三个写死技能).
 * This module fetches the real backend state so the sheet reflects the
 * actual pet. Each fetch is independent + best-effort: a failure in one
 * (e.g. energy) doesn't blank the whole sheet — the section just shows a
 * graceful fallback.
 *
 * Backend contracts (all already shipped):
 *   GET /v1/pet/state      → LivingPet dto (intimacy_level/xp, emotion, ...)
 *   GET /v1/pet/snapshot   → { pet, active_skin, energy, achievements }
 *   GET /v1/axp/balance    → { balance, usd_value_cents, ... }
 *   GET /v1/pet/skins      → { skins: PetSkinSummary[] } (owned skins)
 *
 * `presence:device.list` does NOT exist yet (per T0 audit) — cross-device
 * falls back to authStore.openClawInstances in the component.
 */
import { apiFetch } from './api';
import type { PetState } from '../../shared/types/agentrix-presence';
import { fetchAxpBalance, type AxpBalanceView } from './axp.api';
import { listSkins, type PetSkinSummary } from './mobilePetSdk';

// ─── Energy (from /v1/pet/snapshot) ─────────────────────────────────────

export interface PetEnergyView {
  energy: number; // 0-100
  paused: boolean;
  paused_reason: string | null;
  updated_at: number | null;
}

export interface PetSnapshot {
  pet: PetState;
  active_skin: unknown | null;
  energy: PetEnergyView | null;
  achievements: unknown[];
  server_time: number;
}

/** Unified snapshot — one round-trip for pet + energy + active skin. */
export async function fetchPetSnapshot(): Promise<PetSnapshot> {
  return apiFetch<PetSnapshot>('/v1/pet/snapshot');
}

// ─── Aggregated detail used by PetDetailSheet ───────────────────────────

export interface PetDetailData {
  /** Real living-pet state (level / xp / emotion). Null if fetch failed. */
  pet: PetState | null;
  /** 0-100 energy, or null when unavailable. */
  energy: number | null;
  /** AXP balance, or null when unavailable. */
  axp: AxpBalanceView | null;
  /** Owned skins (used to surface real "installed" capability pills). */
  skins: PetSkinSummary[];
  /** Installed skills (capabilities/tools), unioned across user + claw scope. */
  skills: InstalledSkillSummary[];
}

export interface InstalledSkillSummary {
  id: string;
  name: string;
  displayName?: string;
  category?: string;
}

/** Installed skills for the logged-in user (unioned user + claw scope). */
export async function listInstalledSkills(): Promise<InstalledSkillSummary[]> {
  try {
    const json = await apiFetch<{ items?: any[] }>('/skills/installed');
    const items = json?.items ?? [];
    return items.map((s: any) => ({
      id: s.id,
      name: s.displayName || s.name || '技能',
      displayName: s.displayName,
      category: s.category,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch everything the PetDetailSheet needs in parallel. Each piece is
 * independently guarded so a single failing endpoint never blanks the
 * whole sheet. Returns nulls/empties for the parts that failed.
 */
export async function fetchPetDetailData(): Promise<PetDetailData> {
  const [snapRes, axpRes, skinsRes, skillsRes] = await Promise.allSettled([
    fetchPetSnapshot(),
    fetchAxpBalance(),
    listSkins(),
    listInstalledSkills(),
  ]);

  const snap = snapRes.status === 'fulfilled' ? snapRes.value : null;

  return {
    pet: snap?.pet ?? null,
    energy: snap?.energy?.energy ?? null,
    axp: axpRes.status === 'fulfilled' ? axpRes.value : null,
    skins: skinsRes.status === 'fulfilled' ? skinsRes.value : [],
    skills: skillsRes.status === 'fulfilled' ? skillsRes.value : [],
  };
}

// ─── XP / level helpers (mirror backend `addIntimacyXp` curve) ──────────
// Backend: level n needs `100 * 2^n` xp in that band; intimacy_level is
// already computed server-side. We only need within-level progress for the
// XP bar, so derive the band boundaries with the same formula.

const MAX_LEVEL = 10;

/** Cumulative XP required to *reach* the start of each level (0..MAX_LEVEL). */
function levelFloors(): number[] {
  const floors: number[] = [0];
  let need = 100;
  let acc = 0;
  for (let lv = 0; lv < MAX_LEVEL; lv++) {
    acc += need;
    floors.push(acc);
    need = 100 * Math.pow(2, lv + 1);
  }
  return floors;
}

const LEVEL_FLOORS = levelFloors();

/**
 * Returns 0-100 progress within the current level for the XP bar, plus the
 * xp-into-level / xp-needed numbers for an optional "120 / 400 XP" label.
 */
export function xpProgress(level: number, xp: number): {
  pct: number;
  intoLevel: number;
  neededForNext: number | null;
} {
  const lv = Math.max(0, Math.min(MAX_LEVEL, level));
  if (lv >= MAX_LEVEL) {
    return { pct: 100, intoLevel: 0, neededForNext: null };
  }
  const floor = LEVEL_FLOORS[lv] ?? 0;
  const ceil = LEVEL_FLOORS[lv + 1] ?? floor + 100;
  const band = Math.max(1, ceil - floor);
  const intoLevel = Math.max(0, xp - floor);
  const pct = Math.max(0, Math.min(100, Math.round((intoLevel / band) * 100)));
  return { pct, intoLevel, neededForNext: band };
}

// ─── Emotion → emoji (display only) ─────────────────────────────────────

const EMOTION_EMOJI: Record<string, string> = {
  happy: '😄',
  excited: '🤩',
  focused: '🧐',
  calm: '😌',
  concerned: '😟',
  tired: '😪',
  sleepy: '😴',
  love: '🥰',
  sad: '😢',
  angry: '😠',
};

export function emotionEmoji(emotion?: string | null): string {
  if (!emotion) return '😊';
  return EMOTION_EMOJI[emotion] ?? '😊';
}
