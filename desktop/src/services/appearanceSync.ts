/**
 * appearanceSync — 外观偏好合同 v1（`shared/types/appearance-preference.ts`，REQ-backend-014）的桌面端。
 *
 * 三端同步"模式 + 主题色"：
 * - 读 `GET /api/users/me/appearance`，写 `PUT /api/users/me/appearance`（部分更新，带
 *   `expectedRevision`）。读到的任何值都先过 `normalizeStoredAppearancePreferenceV1`。
 * - 未登录（或游客）只存本地；本地改动记为"待上传"。登录后以服务端为准，除非本地有
 *   待上传的改动——这时带着上次同步的 revision 上传；409 就用服务端的当前值覆盖本地。
 * - 服务端从没存过（`revision: 0`）时不覆盖本地：桌面默认仍是深色（浅色样式还没清完，
 *   见 appearance.ts），不因为服务端默认"跟随系统"就切换。
 * - "跟随系统"在客户端解析（appearance.ts），这里只同步用户的选择。
 *
 * 错误按合同 v1（`shared/types/api-error.ts`）读：409 的 `current`、400 的 `errors` 由全局
 * 过滤器转发。旧后端会丢掉 `current`，拿不到就重新 GET 一次。
 */
import {
  APPEARANCE_PREFERENCE_PATH,
  APPEARANCE_REVISION_CONFLICT_CODE,
  normalizeStoredAppearancePreferenceV1,
  validateAppearancePreferenceUpdateV1,
  type AppearancePreferenceUpdateV1,
  type AppearancePreferenceV1,
} from "../../../shared/types/appearance-preference";
import {
  readAppearanceAccent,
  readAppearanceMode,
  setAppearanceAccent,
  setAppearanceMode,
  type AppearanceAccent,
  type AppearanceMode,
} from "./appearance";
import { parseApiErrorBodyV1 } from "../../../shared/types/api-error";
import { API_BASE, apiFetch, useAuthStore } from "./store";

export const APPEARANCE_SYNC_KEY = "agentrix_appearance_sync_v1";

interface PendingChange {
  mode?: AppearanceMode;
  accent?: AppearanceAccent;
}

interface SyncState {
  /** 上次和服务端对齐时的 revision；从没对齐过为 0。 */
  revision: number;
  /** 本地改了、还没上传的项。 */
  pending: PendingChange | null;
}

export type AppearanceSyncOutcome =
  | "pulled"
  | "pushed"
  | "conflict_applied"
  | "unchanged"
  | "kept_local"
  | "rejected"
  | "unauthenticated"
  | "offline";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readSyncState(): SyncState {
  try {
    const raw = globalThis.localStorage?.getItem(APPEARANCE_SYNC_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!isRecord(parsed)) return { revision: 0, pending: null };
    const revision = typeof parsed.revision === "number" && Number.isSafeInteger(parsed.revision) && parsed.revision >= 0 ? parsed.revision : 0;
    let pending: PendingChange | null = null;
    if (isRecord(parsed.pending)) {
      const check = validateAppearancePreferenceUpdateV1({
        ...(parsed.pending.mode !== undefined ? { mode: parsed.pending.mode } : {}),
        ...(parsed.pending.accent !== undefined ? { accent: parsed.pending.accent } : {}),
      });
      pending = check.ok ? { mode: check.update.mode, accent: check.update.accent } : null;
    }
    return { revision, pending };
  } catch {
    return { revision: 0, pending: null };
  }
}

function writeSyncState(state: SyncState) {
  try {
    globalThis.localStorage?.setItem(APPEARANCE_SYNC_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: the next sync starts from revision 0 */
  }
}

/** 设置页改了模式或主题色之后调用：先记为待上传（本地已经生效）。 */
export function recordLocalAppearanceChange(change: PendingChange) {
  const state = readSyncState();
  writeSyncState({ ...state, pending: { ...(state.pending || {}), ...change } });
}

/** 把服务端的值写到本地（不产生待上传）。服务端从没存过时不动本地。 */
function applyServerPreference(preference: AppearancePreferenceV1): boolean {
  writeSyncState({ revision: preference.revision, pending: null });
  if (preference.source !== "owner") return false;
  let changed = false;
  if (readAppearanceMode() !== preference.mode) {
    setAppearanceMode(preference.mode);
    changed = true;
  }
  if (readAppearanceAccent() !== preference.accent) {
    setAppearanceAccent(preference.accent);
    changed = true;
  }
  return changed;
}

function url(): string {
  return `${API_BASE}${APPEARANCE_PREFERENCE_PATH}`;
}

function headers(token: string, json = false): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function readBody(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

/** 有的接口包一层 `{ success, data }`，外观接口不包；两种都接受。 */
function unwrap(body: unknown): unknown {
  return isRecord(body) && "data" in body && isRecord(body.data) && "schemaVersion" in body.data ? body.data : body;
}

type Fetched = { kind: "ok"; preference: AppearancePreferenceV1 } | { kind: "auth" } | { kind: "offline" };

async function fetchServerPreference(token: string): Promise<Fetched> {
  try {
    const response = await apiFetch(url(), { method: "GET", headers: headers(token) });
    if (response.status === 401 || response.status === 403) return { kind: "auth" };
    if (!response.ok) return { kind: "offline" };
    return { kind: "ok", preference: normalizeStoredAppearancePreferenceV1(unwrap(await readBody(response))) };
  } catch {
    return { kind: "offline" };
  }
}

let inFlight: Promise<AppearanceSyncOutcome> | null = null;

/**
 * 和服务端对齐一次：有待上传的就上传，否则拉取。同一时间只跑一次，重复调用拿到同一个结果。
 * 游客和未登录不发请求。
 */
export function syncAppearance(token: string | null, options: { isGuest?: boolean } = {}): Promise<AppearanceSyncOutcome> {
  const isGuest = options.isGuest ?? Boolean(useAuthStore.getState?.().isGuest);
  if (!token || isGuest) return Promise.resolve("unauthenticated");
  if (inFlight) return inFlight;
  inFlight = runSync(token).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(token: string): Promise<AppearanceSyncOutcome> {
  const state = readSyncState();
  if (!state.pending) {
    const fetched = await fetchServerPreference(token);
    if (fetched.kind === "auth") return "unauthenticated";
    if (fetched.kind === "offline") return "offline";
    return applyServerPreference(fetched.preference) ? "pulled" : "unchanged";
  }

  const update: AppearancePreferenceUpdateV1 = { ...state.pending, expectedRevision: state.revision };
  const check = validateAppearancePreferenceUpdateV1(update);
  if (!check.ok) {
    // 本地记录坏了：丢掉待上传，以服务端为准。
    writeSyncState({ revision: state.revision, pending: null });
    return "rejected";
  }

  let response: Response;
  try {
    response = await apiFetch(url(), { method: "PUT", headers: headers(token, true), body: JSON.stringify(check.update) });
  } catch {
    return "offline";
  }
  if (response.status === 401 || response.status === 403) return "unauthenticated";
  const body = await readBody(response);

  if (response.ok) {
    const saved = normalizeStoredAppearancePreferenceV1(unwrap(body));
    if (saved.revision === 0) {
      // 成功却读不出合法的结果：保留待上传，下次再试。
      return "offline";
    }
    // 上传期间本地又改了：只清掉已经上传的项。
    const latest = readSyncState();
    const remaining: PendingChange = { ...(latest.pending || {}) };
    if (remaining.mode === check.update.mode) delete remaining.mode;
    if (remaining.accent === check.update.accent) delete remaining.accent;
    writeSyncState({ revision: saved.revision, pending: Object.keys(remaining).length ? remaining : null });
    return "pushed";
  }

  if (response.status === 409) {
    const parsed = parseApiErrorBodyV1(body);
    let current: AppearancePreferenceV1 | null =
      parsed.code === APPEARANCE_REVISION_CONFLICT_CODE && parsed.current
        ? normalizeStoredAppearancePreferenceV1(parsed.current)
        : null;
    if (!current || current.revision === 0) {
      const fetched = await fetchServerPreference(token);
      if (fetched.kind !== "ok") return fetched.kind === "auth" ? "unauthenticated" : "offline";
      current = fetched.preference;
    }
    applyServerPreference(current);
    return "conflict_applied";
  }

  if (response.status === 400) {
    // 服务端不接受这次改动：不再重试，以服务端为准。
    writeSyncState({ revision: state.revision, pending: null });
    const fetched = await fetchServerPreference(token);
    if (fetched.kind === "ok") applyServerPreference(fetched.preference);
    return "rejected";
  }

  return "kept_local";
}

/** 测试用。 */
export function __resetAppearanceSyncForTests() {
  inFlight = null;
}
