/**
 * appearanceSyncRuntime — wires `appearanceSync` to the phone: MMKV for the
 * sync state, the live theme (`src/theme/colors.ts`) for the value, and the
 * API config for the token.
 *
 * Only in token-themed builds (four-zone IA, `EXPO_PUBLIC_MOBILE_FOUR_ZONE_IA`):
 * the shipped build keeps its local light / dark switch and never calls the
 * endpoint. Runs are serialised: a change made while a sync is in flight
 * triggers one more run afterwards instead of a parallel request.
 */
import { getAppearance, isTokenThemed, setAppearance } from '../theme/colors';
import { mmkv } from '../stores/mmkvStorage';
import { getApiConfig } from './api';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import {
  APPEARANCE_SYNC_STORAGE_KEY,
  readAppearanceSyncState,
  recordLocalAppearanceChange,
  serializeAppearanceSyncState,
  syncAppearanceWithServer,
  type AppearanceSyncOutcome,
  type AppearanceSyncState,
} from './appearanceSync';
import type { Appearance } from '../../shared/design-tokens';

function readState(): AppearanceSyncState {
  let raw: string | undefined;
  try {
    raw = mmkv.getString(APPEARANCE_SYNC_STORAGE_KEY);
  } catch {
    raw = undefined;
  }
  return readAppearanceSyncState(raw, getAppearance());
}

function writeState(state: AppearanceSyncState): void {
  try {
    mmkv.set(APPEARANCE_SYNC_STORAGE_KEY, serializeAppearanceSyncState(state));
  } catch {
    /* best-effort persistence */
  }
}

let inflight: Promise<AppearanceSyncOutcome> | null = null;
let again = false;

/** Pull (or push a pending local change). Safe to call often. */
export function syncAppearanceNow(): Promise<AppearanceSyncOutcome | null> {
  if (!isTokenThemed()) return Promise.resolve(null);
  if (inflight) {
    again = true;
    return inflight;
  }
  const config = getApiConfig();
  inflight = syncAppearanceWithServer({
    getLocal: getAppearance,
    applyLocal: (next) => void setAppearance(next),
    readState,
    writeState,
    baseUrl: config.baseUrl ?? '',
    token: config.token,
    transport: mobileV6HttpTransport,
  }).finally(() => {
    inflight = null;
    if (again) {
      again = false;
      void syncAppearanceNow();
    }
  });
  return inflight;
}

/** The owner picked a mode or accent on 我的 → 外观: apply now, remember it, upload when possible. */
export function changeAppearance(next: Appearance): Appearance {
  const applied = setAppearance(next);
  if (isTokenThemed()) {
    writeState(recordLocalAppearanceChange(readState(), new Date()));
    void syncAppearanceNow();
  }
  return applied;
}
