/**
 * 平台默认模型的优先顺序（E87，合同 v0；I-056 / I-060）。
 *
 * 用在哪：用户没有自己的模型（BYO）时，平台替他选模型的三个地方都照这张表的顺序挑：
 * - 分身回答：号池分发（第 2 步）的优先列表，以及 Sub2API 网关（第 3 步）先试的模型；
 * - 平台试用：表里的模型都算试用模型，从每人的试用额度里扣；
 * - openclaw 平台兜底：用户自己的模型不可用时，改用表里的第一个。
 *
 * 规则：
 * - 有序列表，1–8 项，`modelId` 是号池目录里的上游 id（例如 `claude-opus-5`、`grok-4.6`），不重复；
 *   `effort` 可选，是推理强度 `low` / `medium` / `high`（Sub2API 把它换成 Claude 的 `output_config.effort` 和
 *   thinking 预算，对别的模型原样转给上游）。
 * - 管理员（`pool.policy.write`）改，必须写理由（1–200 字），每次写入都留审计；写之前服务端核对每个模型都在号池
 *   当前目录里，不在就 400，目录读不到就 503，都不写入。
 * - 能回滚：历史只追加，回滚是把某个旧版本再追加一次（也要理由，也核对目录）。
 * - 读的一方有短缓存（`PLATFORM_MODEL_PREFERENCE_CACHE_SECONDS`）。表为空、读不到、或者一项都不合格时，退回代码里的
 *   默认值 `PLATFORM_MODEL_PREFERENCE_DEFAULTS_V1`，不会因为读失败而答不了。
 */
export const PLATFORM_MODEL_PREFERENCE_SCHEMA_VERSION = 1 as const;

export const PLATFORM_MODEL_PREFERENCE_ROUTES = {
  read: 'GET /api/admin/ai-pool/model-preference', // → PlatformModelPreferenceAdminViewV1（pool.read）
  write: 'POST /api/admin/ai-pool/model-preference', // PlatformModelPreferenceWriteRequestV1 → PlatformModelPreferenceRecordV1（pool.policy.write）
  rollback: 'POST /api/admin/ai-pool/model-preference/rollback', // PlatformModelPreferenceRollbackRequestV1 → PlatformModelPreferenceRecordV1（pool.policy.write）
} as const;

export const PLATFORM_MODEL_EFFORTS = ['low', 'medium', 'high'] as const;
export type PlatformModelEffortV1 = (typeof PLATFORM_MODEL_EFFORTS)[number];

export const PLATFORM_MODEL_PREFERENCE_LIMITS_V1 = {
  maxEntries: 8,
  reasonMaxLength: 200,
  historyKept: 20,
} as const;

export const PLATFORM_MODEL_PREFERENCE_CACHE_SECONDS = 30;

/** 号池目录里的上游模型 id：字母或数字开头，只含字母、数字和 `. _ : -`，最长 128。 */
export const PLATFORM_MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
/** 版本号：`pmp_` + 毫秒时间戳 + `_` + 6 位随机十六进制。 */
export const PLATFORM_MODEL_PREFERENCE_VERSION_PATTERN = /^pmp_[0-9]{13}_[0-9a-f]{6}$/;

export interface PlatformModelPreferenceEntryV1 {
  modelId: string;
  effort?: PlatformModelEffortV1;
}

/** 代码里的默认值：没配过、读不到、或者配的一项都不合格时用它（和 E87 之前的行为一样）。 */
export const PLATFORM_MODEL_PREFERENCE_DEFAULTS_V1: readonly PlatformModelPreferenceEntryV1[] = Object.freeze([
  { modelId: 'gpt-5.6-terra' },
  { modelId: 'grok-4.6' },
  { modelId: 'claude-sonnet-4.6' },
  { modelId: 'claude-haiku-4.5' },
]);

/** 一次写入（或回滚）留下的记录。 */
export interface PlatformModelPreferenceRecordV1 {
  schemaVersion: typeof PLATFORM_MODEL_PREFERENCE_SCHEMA_VERSION;
  version: string;
  entries: PlatformModelPreferenceEntryV1[];
  reason: string;
  /** 管理员 id。 */
  updatedBy: string;
  updatedAt: string;
  /** 回滚时是回到的那个版本号。 */
  rolledBackFrom?: string;
}

/** 后台页读到的：当前生效的列表、它从哪来、代码默认值和最近的历史（旧的在前）。 */
export interface PlatformModelPreferenceAdminViewV1 {
  schemaVersion: typeof PLATFORM_MODEL_PREFERENCE_SCHEMA_VERSION;
  effective: PlatformModelPreferenceEntryV1[];
  /** `configured`：用的是后台写的；`defaults`：没写过或读不到，用的是代码默认值。 */
  source: 'configured' | 'defaults';
  current: PlatformModelPreferenceRecordV1 | null;
  defaults: PlatformModelPreferenceEntryV1[];
  history: PlatformModelPreferenceRecordV1[];
}

export interface PlatformModelPreferenceWriteRequestV1 {
  schemaVersion: typeof PLATFORM_MODEL_PREFERENCE_SCHEMA_VERSION;
  entries: PlatformModelPreferenceEntryV1[];
  reason: string;
}

export interface PlatformModelPreferenceRollbackRequestV1 {
  schemaVersion: typeof PLATFORM_MODEL_PREFERENCE_SCHEMA_VERSION;
  toVersion: string;
  reason: string;
}

export const PLATFORM_MODEL_PREFERENCE_ERROR_CODES = {
  invalidRequest: 'platform_model_preference_invalid', // 400，带 errors
  modelNotInPool: 'platform_model_preference_model_not_in_pool', // 400，errors 列出不在目录里的 id
  unknownVersion: 'platform_model_preference_version_unknown', // 404：回滚的版本不在历史里
  catalogUnavailable: 'platform_model_preference_catalog_unavailable', // 503：号池目录读不到，没写入
  storeUnavailable: 'platform_model_preference_store_unavailable', // 503：审计或配置写不进去，没写入
} as const;

export type PlatformModelPreferenceDecodeResultV1<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unexpected(record: Record<string, unknown>, allowed: readonly string[], errors: string[], prefix = ''): void {
  for (const key of Object.keys(record)) if (!allowed.includes(key)) errors.push(`${prefix}${key}: unexpected field`);
}

/** 校验列表本身（写入和读回都用）。 */
export function validatePlatformModelPreferenceEntriesV1(value: unknown): PlatformModelPreferenceDecodeResultV1<PlatformModelPreferenceEntryV1[]> {
  const errors: string[] = [];
  if (!Array.isArray(value)) return { ok: false, errors: ['entries: expected array'] };
  if (value.length < 1 || value.length > PLATFORM_MODEL_PREFERENCE_LIMITS_V1.maxEntries) {
    errors.push(`entries: 1-${PLATFORM_MODEL_PREFERENCE_LIMITS_V1.maxEntries} items`);
  }
  const seen = new Set<string>();
  const entries: PlatformModelPreferenceEntryV1[] = [];
  value.forEach((item, i) => {
    const at = `entries[${i}]`;
    if (!isRecord(item)) {
      errors.push(`${at}: expected object`);
      return;
    }
    unexpected(item, ['modelId', 'effort'], errors, `${at}.`);
    const modelId = item.modelId;
    if (typeof modelId !== 'string' || !PLATFORM_MODEL_ID_PATTERN.test(modelId)) {
      errors.push(`${at}.modelId: invalid`);
      return;
    }
    if (seen.has(modelId)) errors.push(`${at}.modelId: duplicate`);
    seen.add(modelId);
    if (item.effort !== undefined && !(PLATFORM_MODEL_EFFORTS as readonly unknown[]).includes(item.effort)) {
      errors.push(`${at}.effort: one of ${PLATFORM_MODEL_EFFORTS.join(', ')}`);
      return;
    }
    entries.push(item.effort === undefined ? { modelId } : { modelId, effort: item.effort as PlatformModelEffortV1 });
  });
  return errors.length ? { ok: false, errors } : { ok: true, value: entries };
}

function reasonOf(value: unknown, errors: string[]): string {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (!reason || reason.length > PLATFORM_MODEL_PREFERENCE_LIMITS_V1.reasonMaxLength) {
    errors.push(`reason: 1-${PLATFORM_MODEL_PREFERENCE_LIMITS_V1.reasonMaxLength} characters`);
  }
  return reason;
}

/** 服务端用：校验写入请求体（多余字段也算错）。 */
export function decodePlatformModelPreferenceWriteRequestV1(body: unknown): PlatformModelPreferenceDecodeResultV1<PlatformModelPreferenceWriteRequestV1> {
  if (!isRecord(body)) return { ok: false, errors: ['body: expected object'] };
  const errors: string[] = [];
  unexpected(body, ['schemaVersion', 'entries', 'reason'], errors);
  if (body.schemaVersion !== PLATFORM_MODEL_PREFERENCE_SCHEMA_VERSION) errors.push('schemaVersion: 1');
  const entries = validatePlatformModelPreferenceEntriesV1(body.entries);
  if (entries.ok === false) errors.push(...entries.errors);
  const reason = reasonOf(body.reason, errors);
  if (errors.length || entries.ok === false) return { ok: false, errors };
  return { ok: true, value: { schemaVersion: PLATFORM_MODEL_PREFERENCE_SCHEMA_VERSION, entries: entries.value, reason } };
}

/** 服务端用：校验回滚请求体。 */
export function decodePlatformModelPreferenceRollbackRequestV1(body: unknown): PlatformModelPreferenceDecodeResultV1<PlatformModelPreferenceRollbackRequestV1> {
  if (!isRecord(body)) return { ok: false, errors: ['body: expected object'] };
  const errors: string[] = [];
  unexpected(body, ['schemaVersion', 'toVersion', 'reason'], errors);
  if (body.schemaVersion !== PLATFORM_MODEL_PREFERENCE_SCHEMA_VERSION) errors.push('schemaVersion: 1');
  if (typeof body.toVersion !== 'string' || !PLATFORM_MODEL_PREFERENCE_VERSION_PATTERN.test(body.toVersion)) errors.push('toVersion: invalid');
  const reason = reasonOf(body.reason, errors);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { schemaVersion: PLATFORM_MODEL_PREFERENCE_SCHEMA_VERSION, toVersion: body.toVersion as string, reason } };
}

function decodeRecord(value: unknown): PlatformModelPreferenceRecordV1 | null {
  if (!isRecord(value) || value.schemaVersion !== PLATFORM_MODEL_PREFERENCE_SCHEMA_VERSION) return null;
  if (typeof value.version !== 'string' || !PLATFORM_MODEL_PREFERENCE_VERSION_PATTERN.test(value.version)) return null;
  const entries = validatePlatformModelPreferenceEntriesV1(value.entries);
  if (entries.ok === false) return null;
  if (typeof value.reason !== 'string' || typeof value.updatedBy !== 'string' || typeof value.updatedAt !== 'string') return null;
  if (!Number.isFinite(Date.parse(value.updatedAt))) return null;
  const record: PlatformModelPreferenceRecordV1 = {
    schemaVersion: PLATFORM_MODEL_PREFERENCE_SCHEMA_VERSION,
    version: value.version,
    entries: entries.value,
    reason: value.reason,
    updatedBy: value.updatedBy,
    updatedAt: value.updatedAt,
  };
  if (typeof value.rolledBackFrom === 'string' && PLATFORM_MODEL_PREFERENCE_VERSION_PATTERN.test(value.rolledBackFrom)) {
    record.rolledBackFrom = value.rolledBackFrom;
  }
  return record;
}

/** 服务端读存储、后台页读响应都用：一条记录认不出就返回 null。 */
export function decodePlatformModelPreferenceRecordV1(value: unknown): PlatformModelPreferenceRecordV1 | null {
  return decodeRecord(value);
}

/** 后台页用：解码 GET 的响应。认不出的历史项跳过；整体认不出返回 null。 */
export function decodePlatformModelPreferenceAdminViewV1(value: unknown): PlatformModelPreferenceAdminViewV1 | null {
  if (!isRecord(value) || value.schemaVersion !== PLATFORM_MODEL_PREFERENCE_SCHEMA_VERSION) return null;
  const effective = validatePlatformModelPreferenceEntriesV1(value.effective);
  const defaults = validatePlatformModelPreferenceEntriesV1(value.defaults);
  if (effective.ok === false || defaults.ok === false) return null;
  if (value.source !== 'configured' && value.source !== 'defaults') return null;
  const current = value.current === null ? null : decodeRecord(value.current);
  if (value.current !== null && current === null) return null;
  const history = Array.isArray(value.history)
    ? value.history.map(decodeRecord).filter((r): r is PlatformModelPreferenceRecordV1 => r !== null)
    : [];
  return { schemaVersion: PLATFORM_MODEL_PREFERENCE_SCHEMA_VERSION, effective: effective.value, source: value.source, current, defaults: defaults.value, history };
}

/**
 * 读的一方用：按优先顺序挑出能用的模型。`available` 是号池当前能分发的上游 id；先按表的顺序取表里有、号池也有的，
 * 表里没有的号池模型接在后面（顺序不变）。
 */
export function orderByPlatformModelPreferenceV1(
  preference: readonly PlatformModelPreferenceEntryV1[],
  available: readonly string[],
): PlatformModelPreferenceEntryV1[] {
  const preferred = preference.filter((entry) => available.includes(entry.modelId));
  const rest = available.filter((id) => !preference.some((entry) => entry.modelId === id)).map((modelId) => ({ modelId }));
  return [...preferred.map((entry) => ({ ...entry })), ...rest];
}
