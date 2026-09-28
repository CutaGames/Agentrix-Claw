/**
 * appearanceSync — 我的 → 外观 kept in step across surfaces through the
 * backend (REQ-backend-014; contract `shared/types/appearance-preference.ts`,
 * D11 / product doc 11.3).
 *
 * Pure: storage, the applied theme and the HTTP transport are injected, so
 * the whole flow runs under the root jest. `appearanceSyncRuntime.ts` wires it
 * to MMKV, the live theme and the API config.
 *
 * Rules (contract header):
 *   - "跟随系统" is resolved on the device; the server stores the choice only.
 *   - Signed out: local only. Every local change is recorded as not uploaded
 *     (`dirty`) with its time, so it can be sent after sign-in.
 *   - Signed in: the server wins, unless the local value is a newer change
 *     that was not uploaded yet; then it is sent with `expectedRevision`.
 *   - 409: the server's current value replaces the local one, except when the
 *     local change is newer than it; then one retry with the new revision.
 *     The 409 body carries `current` once backend 1661a9f7 (global error
 *     filter forwards `current` / `errors`) is deployed; until then it is
 *     read with a GET instead.
 *   - Anything read goes through `normalizeStoredAppearancePreferenceV1`;
 *     anything written passes `validateAppearancePreferenceUpdateV1` first.
 *   - A failed request never changes the local choice and keeps it marked as
 *     not uploaded.
 */
import type { HttpTransportV1 } from '../../shared/client';
import {
  APPEARANCE_PREFERENCE_PATH,
  APPEARANCE_REVISION_CONFLICT_CODE,
  normalizeStoredAppearancePreferenceV1,
  validateAppearancePreferenceUpdateV1,
  type AppearancePreferenceV1,
} from '../../shared/types/appearance-preference';
import { DEFAULT_APPEARANCE, normalizeAppearance, type Appearance } from '../../shared/design-tokens';

export const APPEARANCE_SYNC_STORAGE_KEY = 'app_appearance_sync_v1' as const;

export interface AppearanceSyncState {
  /** Server revision the local value is based on (0 = never read or stored). */
  revision: number;
  /** A local change that the server has not accepted yet. */
  dirty: boolean;
  /** When that local change was made (ISO), for "is the local one newer". */
  changedAt: string | null;
}

export function sameAppearance(a: Appearance, b: Appearance): boolean {
  return a.mode === b.mode && a.accent === b.accent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Stored sync state. With none stored yet, a local value that differs from
 * the default (for example migrated from the pre-token light / dark switch)
 * counts as a change not uploaded, with no time: it is sent only if the
 * server has nothing stored.
 */
export function readAppearanceSyncState(raw: string | null | undefined, local: Appearance): AppearanceSyncState {
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (isRecord(parsed)) {
        const revision = typeof parsed.revision === 'number' && Number.isSafeInteger(parsed.revision) && parsed.revision >= 0 ? parsed.revision : 0;
        const changedAt = typeof parsed.changedAt === 'string' && !Number.isNaN(Date.parse(parsed.changedAt)) ? parsed.changedAt : null;
        return { revision, dirty: parsed.dirty === true, changedAt };
      }
    } catch {
      /* fall through */
    }
  }
  return { revision: 0, dirty: !sameAppearance(normalizeAppearance(local), DEFAULT_APPEARANCE), changedAt: null };
}

export function serializeAppearanceSyncState(state: AppearanceSyncState): string {
  return JSON.stringify({ revision: state.revision, dirty: state.dirty, changedAt: state.changedAt });
}

/** A local choice was made (signed in or not): remember it as not uploaded. */
export function recordLocalAppearanceChange(state: AppearanceSyncState, now: Date): AppearanceSyncState {
  return { revision: state.revision, dirty: true, changedAt: now.toISOString() };
}

/** The local change is newer than the server's value (a server value never stored is older than anything). */
export function isLocalChangeNewer(changedAt: string | null, serverUpdatedAt: string | null): boolean {
  if (!changedAt) return false;
  const local = Date.parse(changedAt);
  if (!Number.isFinite(local)) return false;
  if (!serverUpdatedAt) return true;
  const server = Date.parse(serverUpdatedAt);
  return !Number.isFinite(server) || local > server;
}

/** A body that is (or wraps) an appearance preference; anything else is `null`, never "the default". */
export function readAppearancePreferenceBody(body: unknown): AppearancePreferenceV1 | null {
  const value = isRecord(body) && body.success === true && isRecord(body.data) ? body.data : body;
  if (!isRecord(value) || typeof value.revision !== 'number') return null;
  return normalizeStoredAppearancePreferenceV1(value);
}

export interface AppearanceSyncDeps {
  getLocal(): Appearance;
  /** Apply and persist a value that came from the server (does not mark it as a local change). */
  applyLocal(next: Appearance): void;
  readState(): AppearanceSyncState;
  writeState(state: AppearanceSyncState): void;
  /** API base including `/api`. */
  baseUrl: string;
  token: string | undefined | null;
  transport: HttpTransportV1;
}

export type AppearanceSyncOutcome =
  | { kind: 'local_only'; reason: 'signed_out' }
  | { kind: 'pulled'; changed: boolean; revision: number }
  | { kind: 'pushed'; revision: number }
  /** The server had a newer value; it replaced the local one. */
  | { kind: 'conflict_adopted'; revision: number }
  /** The server refused the local value (400); its own value replaced it. */
  | { kind: 'rejected_adopted'; revision: number }
  | { kind: 'failed'; reason: string; retryable: boolean };

function clean(pref: AppearancePreferenceV1): AppearanceSyncState {
  return { revision: pref.revision, dirty: false, changedAt: null };
}

function appearanceOf(pref: AppearancePreferenceV1): Appearance {
  return { mode: pref.mode, accent: pref.accent };
}

function failure(status: number): AppearanceSyncOutcome {
  if (status === 401 || status === 403) return { kind: 'failed', reason: status === 401 ? 'unauthorized' : 'forbidden', retryable: false };
  return { kind: 'failed', reason: `http_${status}`, retryable: status >= 500 || status === 429 };
}

export async function syncAppearanceWithServer(deps: AppearanceSyncDeps): Promise<AppearanceSyncOutcome> {
  if (!deps.token) return { kind: 'local_only', reason: 'signed_out' };
  const url = `${deps.baseUrl.replace(/\/+$/, '')}${APPEARANCE_PREFERENCE_PATH}`;
  const headers = { Accept: 'application/json', Authorization: `Bearer ${deps.token}`, 'X-Agentrix-Surface': 'mobile' };

  const request = async (method: 'GET' | 'PUT', body?: unknown): Promise<{ status: number; body: unknown } | null> => {
    try {
      const response = await deps.transport.request({
        method,
        path: url,
        headers: body !== undefined ? { ...headers, 'Content-Type': 'application/json' } : headers,
        ...(body !== undefined ? { body } : {}),
      });
      return { status: response.status, body: response.body };
    } catch {
      return null;
    }
  };

  const readServer = async (): Promise<AppearancePreferenceV1 | AppearanceSyncOutcome> => {
    const response = await request('GET');
    if (!response) return { kind: 'failed', reason: 'network', retryable: true };
    if (response.status < 200 || response.status >= 300) return failure(response.status);
    return readAppearancePreferenceBody(response.body) ?? { kind: 'failed', reason: 'response_malformed', retryable: false };
  };
  const isOutcome = (value: AppearancePreferenceV1 | AppearanceSyncOutcome): value is AppearanceSyncOutcome => 'kind' in value;

  const adopt = (pref: AppearancePreferenceV1): boolean => {
    const changed = !sameAppearance(deps.getLocal(), appearanceOf(pref));
    if (changed) deps.applyLocal(appearanceOf(pref));
    deps.writeState(clean(pref));
    return changed;
  };

  const state = deps.readState();
  if (!state.dirty) {
    const server = await readServer();
    if (isOutcome(server)) return server;
    return { kind: 'pulled', changed: adopt(server), revision: server.revision };
  }

  const local = normalizeAppearance(deps.getLocal());
  let expectedRevision = state.revision;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const validated = validateAppearancePreferenceUpdateV1({ mode: local.mode, accent: local.accent, expectedRevision });
    // `in` narrows under the app's strict:false tsconfig; `ok` does not.
    if ('errors' in validated) return { kind: 'failed', reason: 'invalid_local_value', retryable: false };
    const response = await request('PUT', validated.update);
    if (!response) return { kind: 'failed', reason: 'network', retryable: true };

    if (response.status >= 200 && response.status < 300) {
      const saved = readAppearancePreferenceBody(response.body);
      if (!saved) return { kind: 'failed', reason: 'response_malformed', retryable: false };
      adopt(saved);
      return { kind: 'pushed', revision: saved.revision };
    }

    if (response.status === 409) {
      const conflictBody = isRecord(response.body) ? response.body : {};
      if (conflictBody.code !== undefined && conflictBody.code !== APPEARANCE_REVISION_CONFLICT_CODE) return failure(409);
      const fromBody = readAppearancePreferenceBody(conflictBody.current);
      const current = fromBody ?? (await readServer());
      if (isOutcome(current)) return current;
      if (attempt === 0 && isLocalChangeNewer(state.changedAt, current.updatedAt)) {
        expectedRevision = current.revision;
        continue;
      }
      adopt(current);
      return { kind: 'conflict_adopted', revision: current.revision };
    }

    if (response.status === 400) {
      // The server refuses what the phone holds: take the server's value instead of retrying forever.
      const current = await readServer();
      if (isOutcome(current)) return current;
      adopt(current);
      return { kind: 'rejected_adopted', revision: current.revision };
    }

    return failure(response.status);
  }
  // Not reached (the second attempt always returns); kept so the result is still the server's value.
  const current = await readServer();
  if (isOutcome(current)) return current;
  adopt(current);
  return { kind: 'conflict_adopted', revision: current.revision };
}
