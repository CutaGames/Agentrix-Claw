/**
 * stagingSwitch — switching a preview build between production and staging (I-046 item 2).
 *
 * Both directions do the same thing in the same order, and only in a build made with
 * `EXPO_PUBLIC_STAGING_SWITCH=1`:
 *   1. sign out (the same `clearAuth` as 退出登录): the token of the environment being left is deleted;
 *   2. wipe this app's local data (AsyncStorage, MMKV): no cached account data crosses over;
 *   3. write (or delete) the choice and the gate key in SecureStore;
 *   4. reload the JS bundle, so `src/config/env.ts` reads the new choice before any module captures
 *      `API_BASE`.
 * If step 1 or 2 fails, nothing is selected and the app is not reloaded. Even if a token survived,
 * the token's environment tag (`TOKEN_ENV_STORE_KEY`) makes the next start drop it.
 *
 * The native pieces (auth store, storage, reload) are passed in by the screen, so this module stays
 * testable without React Native.
 */
import {
  STAGING_GATE_KEY_STORE_KEY,
  STAGING_SELECTION_STORE_KEY,
  STAGING_SWITCH_BUILD,
  normalizeStagingKey,
  type StagingSelection,
} from '../config/stagingMode';

export interface StagingSwitchDeps {
  clearAuth(): Promise<void>;
  clearLocalData(): Promise<void>;
  secureSet(key: string, value: string): Promise<void>;
  secureDelete(key: string): Promise<void>;
  reload(): Promise<void>;
}

export type StagingSwitchResult = { ok: true } | { ok: false; reason: 'not_a_switch_build' | 'key_invalid' | 'sign_out_failed' | 'store_failed' };

async function leaveCurrentEnvironment(deps: StagingSwitchDeps): Promise<StagingSwitchResult | null> {
  try {
    await deps.clearAuth();
    await deps.clearLocalData();
  } catch {
    return { ok: false, reason: 'sign_out_failed' };
  }
  return null;
}

export async function switchToStaging(rawKey: unknown, deps: StagingSwitchDeps, switchBuild: boolean = STAGING_SWITCH_BUILD): Promise<StagingSwitchResult> {
  if (!switchBuild) return { ok: false, reason: 'not_a_switch_build' };
  const key = normalizeStagingKey(rawKey);
  if (!key) return { ok: false, reason: 'key_invalid' };
  const failed = await leaveCurrentEnvironment(deps);
  if (failed) return failed;
  try {
    await deps.secureSet(STAGING_GATE_KEY_STORE_KEY, key);
    await deps.secureSet(STAGING_SELECTION_STORE_KEY, 'staging');
  } catch {
    // Leave no half choice behind: without the choice the next start is production.
    await deps.secureDelete(STAGING_SELECTION_STORE_KEY).catch(() => undefined);
    await deps.secureDelete(STAGING_GATE_KEY_STORE_KEY).catch(() => undefined);
    return { ok: false, reason: 'store_failed' };
  }
  await deps.reload();
  return { ok: true };
}

export async function switchToProduction(deps: StagingSwitchDeps, switchBuild: boolean = STAGING_SWITCH_BUILD): Promise<StagingSwitchResult> {
  if (!switchBuild) return { ok: false, reason: 'not_a_switch_build' };
  const failed = await leaveCurrentEnvironment(deps);
  if (failed) return failed;
  try {
    await deps.secureDelete(STAGING_SELECTION_STORE_KEY);
    await deps.secureDelete(STAGING_GATE_KEY_STORE_KEY);
  } catch {
    return { ok: false, reason: 'store_failed' };
  }
  await deps.reload();
  return { ok: true };
}

export type StagingGateProbe = 'ok' | 'rejected' | 'unreachable';

/** One read of the staging health route, through the normal network stack (the guard adds the header). */
export async function probeStagingGate(fetchImpl: (url: string) => Promise<{ status: number }>, apiBase: string): Promise<StagingGateProbe> {
  try {
    const response = await fetchImpl(`${apiBase.replace(/\/+$/, '')}/health`);
    if (response.status === 403) return 'rejected';
    return response.status >= 200 && response.status < 300 ? 'ok' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}

export function stagingBadgeText(selection: StagingSelection, probe: StagingGateProbe | null): { en: string; zh: string } {
  if (!selection.key) return { en: 'STAGING · no gate key, nothing is sent', zh: 'STAGING · 缺少门禁 key，不会发请求' };
  if (probe === 'rejected') return { en: 'STAGING · gate key refused', zh: 'STAGING · 门禁 key 被拒' };
  if (probe === 'unreachable') return { en: 'STAGING · cannot reach staging', zh: 'STAGING · 连不上 staging' };
  return { en: 'STAGING', zh: 'STAGING' };
}

export function stagingSwitchFailureText(reason: Exclude<StagingSwitchResult, { ok: true }>['reason']): { en: string; zh: string } {
  switch (reason) {
    case 'key_invalid':
      return { en: 'That does not look like a gate key.', zh: '这不像门禁 key，请检查后重新粘贴。' };
    case 'sign_out_failed':
      return { en: 'Could not sign out, so nothing was switched.', zh: '退出登录失败，没有切换。' };
    case 'store_failed':
      return { en: 'Could not save the choice, so nothing was switched.', zh: '保存选择失败，没有切换。' };
    default:
      return { en: 'This build cannot switch environments.', zh: '这个版本不能切换环境。' };
  }
}
