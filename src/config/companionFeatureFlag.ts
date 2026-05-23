/**
 * companionFeatureFlag — mobile client for `GET /v1/feature-flag/pet_companion_redesign`
 * (P-9 wave 16 T24.3).
 *
 * Phase 1 strategy: the bundle that lands on every device contains BOTH
 * the legacy IA AND the P-9 IA. Boot path queries this flag once, caches
 * the answer in MMKV for the session, and the renderer chooses which IA
 * to mount.
 *
 * Why not gate everything via per-component checks: the 4-tab IA, ball
 * placement, ConversationBubble routing, etc. are all deeply structural.
 * It's much cheaper to do one check at App.tsx and branch the navigator
 * tree once than to scatter `if (companionRedesignEnabled)` everywhere.
 *
 * Spec: requirements.md R12.9.
 */
import { mmkv } from '../stores/mmkvStorage';
import { addVoiceDiagnostic } from '../services/voiceDiagnostics';
import { apiFetch } from '../services/api';

const CACHE_KEY = 'pet_companion_redesign_flag/v1';
const CACHE_TTL_MS = 6 * 3600 * 1000; // 6h

interface CompanionFlagState {
  enabled: boolean;
  rolloutPercentage: number;
  cohort: 'denylist' | 'allowlist' | 'cohort' | 'master-off';
  fetchedAtMs: number;
}

interface FlagResponse {
  enabled: boolean;
  rolloutPercentage: number;
  cohort: CompanionFlagState['cohort'];
}

let _cachedFlag: CompanionFlagState | null = null;

function readCachedFlag(): CompanionFlagState | null {
  try {
    const raw = mmkv.getString(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CompanionFlagState;
  } catch {
    return null;
  }
}

function persistFlag(state: CompanionFlagState): void {
  try {
    mmkv.set(CACHE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/**
 * Synchronous read — used by render-tree gates after boot has primed
 * the cache. Returns false (legacy IA) when uncached so first cold
 * launch defaults to safe legacy behavior; subsequent renders pick up
 * the freshly-fetched value.
 */
export function isCompanionRedesignEnabledSync(): boolean {
  if (_cachedFlag) return _cachedFlag.enabled;
  const persisted = readCachedFlag();
  if (persisted) {
    _cachedFlag = persisted;
    return persisted.enabled;
  }
  return false;
}

export function getCompanionFlagSync(): CompanionFlagState | null {
  if (_cachedFlag) return _cachedFlag;
  const persisted = readCachedFlag();
  if (persisted) {
    _cachedFlag = persisted;
    return persisted;
  }
  return null;
}

/**
 * Fetch + persist the flag. Called from App.tsx after auth, with a
 * fast-path that returns cached value when fresh (TTL).
 */
export async function fetchCompanionFlag(force = false): Promise<CompanionFlagState> {
  if (!force) {
    const cached = readCachedFlag();
    if (cached && Date.now() - cached.fetchedAtMs < CACHE_TTL_MS) {
      _cachedFlag = cached;
      return cached;
    }
  }
  try {
    const res = await apiFetch<FlagResponse>('/v1/feature-flag/pet_companion_redesign');
    const next: CompanionFlagState = {
      enabled: !!res.enabled,
      rolloutPercentage: res.rolloutPercentage ?? 0,
      cohort: res.cohort ?? 'cohort',
      fetchedAtMs: Date.now(),
    };
    _cachedFlag = next;
    persistFlag(next);
    addVoiceDiagnostic('companion-feature-flag', 'fetched', next);
    return next;
  } catch (err) {
    addVoiceDiagnostic('companion-feature-flag', 'fetch-failed', {
      error: (err as Error).message,
    });
    // On failure return the last-known good cached value (or default to false).
    const cached = readCachedFlag();
    if (cached) {
      _cachedFlag = cached;
      return cached;
    }
    return {
      enabled: false,
      rolloutPercentage: 0,
      cohort: 'master-off',
      fetchedAtMs: Date.now(),
    };
  }
}

/**
 * Test / reset hook.
 */
export function _setCompanionFlagForTests(state: CompanionFlagState): void {
  _cachedFlag = state;
}
