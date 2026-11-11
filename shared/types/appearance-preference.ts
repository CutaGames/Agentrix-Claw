/**
 * 外观偏好（合同 v1 草案，CONTRACTS.md；产品文档 11.3，D11）。
 *
 * 取值（模式、主题色）由 web 负责的设计 token 定义（`shared/design-tokens/tokens.ts`），这里只定
 * "怎么在三端之间同步"：
 * - 读：`GET /api/users/me/appearance` → `AppearancePreferenceV1`。没存过时返回默认值，`source: 'default'`。
 * - 写：`PUT /api/users/me/appearance`，请求体 `AppearancePreferenceUpdateV1`（只能带 `mode`、`accent`、
 *   `expectedRevision`），部分更新；未知键或未知取值返回 400，不静默纠正。
 * - 并发：每次写入 `revision + 1`。带了 `expectedRevision` 且和服务端不一致时返回 409
 *   `APPEARANCE_REVISION_CONFLICT`，响应体里带当前值；客户端用当前值覆盖本地再决定要不要重试。
 * - "跟随系统"在客户端解析（`resolveColorScheme`），服务端只存用户的选择。
 * - 未登录时各端只存本地；登录后以服务端为准，除非本地是更晚的一次、还没上传的修改（由客户端带着
 *   `expectedRevision` 重试）。
 * - 游客 token 不能读写（403）。
 */
import {
  ACCENT_IDS,
  APPEARANCE_MODES,
  DEFAULT_APPEARANCE,
  type AccentId,
  type AppearanceMode,
} from '../design-tokens/tokens';

export type { AccentId, AppearanceMode } from '../design-tokens/tokens';

export const APPEARANCE_PREFERENCE_SCHEMA_VERSION = 1 as const;
export const APPEARANCE_PREFERENCE_PATH = '/users/me/appearance' as const;
export const APPEARANCE_REVISION_CONFLICT_CODE = 'APPEARANCE_REVISION_CONFLICT' as const;
export const APPEARANCE_PREFERENCE_INVALID_CODE = 'APPEARANCE_PREFERENCE_INVALID' as const;

export interface AppearancePreferenceV1 {
  schemaVersion: typeof APPEARANCE_PREFERENCE_SCHEMA_VERSION;
  mode: AppearanceMode;
  accent: AccentId;
  /** 0 = 从没存过（默认值）；每次成功写入 +1。 */
  revision: number;
  /** ISO 时间；没存过时为 null。 */
  updatedAt: string | null;
  source: 'default' | 'owner';
}

export interface AppearancePreferenceUpdateV1 {
  mode?: AppearanceMode;
  accent?: AccentId;
  /** 客户端以为的当前 revision；不一致返回 409。不带则无条件覆盖。 */
  expectedRevision?: number;
}

export interface AppearanceRevisionConflictV1 {
  code: typeof APPEARANCE_REVISION_CONFLICT_CODE;
  current: AppearancePreferenceV1;
}

export function isAppearanceModeV1(value: unknown): value is AppearanceMode {
  return typeof value === 'string' && (APPEARANCE_MODES as readonly string[]).includes(value);
}

export function isAccentIdV1(value: unknown): value is AccentId {
  return typeof value === 'string' && (ACCENT_IDS as readonly string[]).includes(value);
}

export function defaultAppearancePreferenceV1(): AppearancePreferenceV1 {
  return {
    schemaVersion: APPEARANCE_PREFERENCE_SCHEMA_VERSION,
    mode: DEFAULT_APPEARANCE.mode,
    accent: DEFAULT_APPEARANCE.accent,
    revision: 0,
    updatedAt: null,
    source: 'default',
  };
}

export type AppearanceUpdateValidationV1 =
  | { ok: true; update: AppearancePreferenceUpdateV1 }
  | { ok: false; errors: string[] };

const UPDATE_KEYS = new Set(['mode', 'accent', 'expectedRevision']);

/** 严格校验写入请求：只接受三个键；取值必须在 token 定义里；至少改一项。 */
export function validateAppearancePreferenceUpdateV1(input: unknown): AppearanceUpdateValidationV1 {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['body: must be an object'] };
  }
  const record = input as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(record)) {
    if (!UPDATE_KEYS.has(key)) errors.push(`${key}: unexpected field`);
  }
  if (record.mode !== undefined && !isAppearanceModeV1(record.mode)) errors.push('mode: unsupported value');
  if (record.accent !== undefined && !isAccentIdV1(record.accent)) errors.push('accent: unsupported value');
  if (
    record.expectedRevision !== undefined &&
    !(typeof record.expectedRevision === 'number' && Number.isSafeInteger(record.expectedRevision) && record.expectedRevision >= 0)
  ) {
    errors.push('expectedRevision: must be a non-negative integer');
  }
  if (record.mode === undefined && record.accent === undefined) errors.push('body: nothing to update');
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    update: {
      ...(record.mode !== undefined ? { mode: record.mode as AppearanceMode } : {}),
      ...(record.accent !== undefined ? { accent: record.accent as AccentId } : {}),
      ...(record.expectedRevision !== undefined ? { expectedRevision: record.expectedRevision as number } : {}),
    },
  };
}

/**
 * 读端用：把存储里或网络上读到的任何东西变成合法的偏好。
 * 未知的模式或主题色逐项回退到默认值（坏的主题色不会把合法的模式也重置掉）。
 */
export function normalizeStoredAppearancePreferenceV1(stored: unknown): AppearancePreferenceV1 {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return defaultAppearancePreferenceV1();
  const record = stored as Record<string, unknown>;
  const revision =
    typeof record.revision === 'number' && Number.isSafeInteger(record.revision) && record.revision > 0 ? record.revision : 0;
  const updatedAt = typeof record.updatedAt === 'string' && !Number.isNaN(Date.parse(record.updatedAt)) ? record.updatedAt : null;
  if (revision === 0) return defaultAppearancePreferenceV1();
  return {
    schemaVersion: APPEARANCE_PREFERENCE_SCHEMA_VERSION,
    mode: isAppearanceModeV1(record.mode) ? record.mode : DEFAULT_APPEARANCE.mode,
    accent: isAccentIdV1(record.accent) ? record.accent : DEFAULT_APPEARANCE.accent,
    revision,
    updatedAt,
    source: 'owner',
  };
}
