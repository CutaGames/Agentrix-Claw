/**
 * 草案 v0（L8 1b 第 0 步，coord 10-18）：线 N 实现时可加字段，不可改语义。
 *
 * A5「统一 Pass v1」：外部（链接、别的 Agent、本机客户端）要读主人的什么、为了什么、读多久、读几次，都用同一张 Pass 说清楚。
 * 收紧和撤销立即生效；放宽要预览、再确认、最近登录过（走 `common/security/visibility-step-up.ts`）。放宽确认要带的字段由线 3
 * 按 step-up 的形状补上（只加不改）。
 *
 * - 受众（`audience`）：分享链接（`share:<grantId>`，不改 1990 的表）、外部 Agent（`agent:<id>`，要先核实过护照）、
 *   本机客户端（`client:<clientId>`，A6）、关系档位预设（`tier:<档位>`，R2：客户、合作者、家人、学员 / 社群）。
 * - 范围（`scopes`）：类别 × 目的的组合，逐对列出。类别不含 Context Gateway 默认拒绝的三类（关系图、财务摘要、凭据元数据）；
 *   以后要加，是加法。
 * - 期限（`duration`）：once 一次（`useLimit` 必须是 1）、session 一次会话（没有会话终点，服务端按签发后 24 小时算，存成 timed）、timed 限时（必须带 `expiresAt`）、ongoing 持续到撤销。
 * - 每次使用经 `ContextUseLedgerPortV1` 写一条 kind 为 `pass_use` 的回执（见 `context-data-class.ts`），不另建回执表。
 * - 端口 `AgentPassAuthorizerPortV1`（见 `backend/src/common/ports/l8-1b.ports.ts`）：线 3 实现；R2 的协作请求放行和 A6 的
 *   `agentrix_recall` 都调它。没有实现时一律拒绝（`port_unavailable`）。`mode: 'check'` 只判断，`mode: 'use'` 判断通过后记一次使用。
 * - 拒绝时不区分「没有这张 Pass」和「这张 Pass 不是这个主人的」，都回 `pass_not_found`，不给探测。
 *
 * 开关：`AGENT_PASS_V1_ENABLED`，只认精确的 `'1'`，默认关。R2 和 A6 的开关要求它也开着，前置开关没开就当作关着。
 * 解码函数都拒收未知字段和错误类型，失败时给出 `reasonCode` 和出错的字段名，不抛异常。
 */
import { AGENT_COLLABORATION_PRESET_KINDS_V1 } from './agent-collaboration';
import { CONTEXT_PURPOSES_V1 } from './context-projection';
import { DESKTOP_MEMORY_CLIENT_IDS_V1 } from './context-memory';
import type { AgentPassOperationV1, VisibilityChangeV1 } from './visibility-actions';

export const AGENT_PASS_SCHEMA_VERSION_V1 = 1 as const;

export const AGENT_PASS_AUDIENCE_KINDS_V1 = ['share_link', 'external_agent', 'local_client', 'tier_preset', 'oauth_client'] as const;
export type AgentPassAudienceKindV1 = (typeof AGENT_PASS_AUDIENCE_KINDS_V1)[number];

/** R2：在 `client / collaborator / family` 之外加一档 `community`（学员 / 社群）。 */
export const AGENT_PASS_TIER_PRESETS_V1 = ['client', 'collaborator', 'family', 'community'] as const;
export type AgentPassTierPresetV1 = (typeof AGENT_PASS_TIER_PRESETS_V1)[number];

/** 本机客户端 id，和 D4 的 `DESKTOP_MEMORY_CLIENT_IDS_V1` 同一组。 */
export const AGENT_PASS_LOCAL_CLIENTS_V1 = DESKTOP_MEMORY_CLIENT_IDS_V1;

/** 每个受众种类的 `ref` 前缀。 */
export const AGENT_PASS_AUDIENCE_REF_PREFIX_V1: Readonly<Record<AgentPassAudienceKindV1, string>> = {
  share_link: 'share:',
  external_agent: 'agent:',
  local_client: 'client:',
  tier_preset: 'tier:',
  /** L8 3A E1：用 Yowo 登录的第三方应用，`oauth_client:<client_id 的 SHA-256 十六进制>`。只由同意页签出，不能经签发路由造。 */
  oauth_client: 'oauth_client:',
};

/**
 * 类别：Context Gateway 的四类（含 A6 的 `agent_memory`）、护照分享页，以及 L6-1 协作请求的四种动作。
 * 默认拒绝的 `relationship_graph`、`financial_summary`、`credential_metadata` 不在里面。
 */
export const AGENT_PASS_CATEGORIES_V1 = [
  'agent_profile',
  'agent_preferences',
  'schedule_metadata',
  'skill_inventory',
  'agent_memory',
  'passport_view',
  'collab_ask',
  'collab_book',
  'collab_deposit_intent',
  'collab_file_offer',
  /** L8 R4: the thin slice of the relationship book an Agent may read (name, tier label, source, last contact; never contact details or notes). */
  'relationship_book',
] as const;
export type AgentPassCategoryV1 = (typeof AGENT_PASS_CATEGORIES_V1)[number];

/** 目的：Context Gateway 的四种，加上看护照页和协作请求。 */
export const AGENT_PASS_PURPOSES_V1 = [...CONTEXT_PURPOSES_V1, 'passport_viewing', 'collaboration_request'] as const;
export type AgentPassPurposeV1 = (typeof AGENT_PASS_PURPOSES_V1)[number];

export const AGENT_PASS_DURATIONS_V1 = ['once', 'session', 'timed', 'ongoing'] as const;
export type AgentPassDurationV1 = (typeof AGENT_PASS_DURATIONS_V1)[number];

export const AGENT_PASS_STATUSES_V1 = ['active', 'revoked', 'expired', 'exhausted'] as const;
export type AgentPassStatusV1 = (typeof AGENT_PASS_STATUSES_V1)[number];

export const AGENT_PASS_AUTHORIZE_MODES_V1 = ['check', 'use'] as const;
export type AgentPassAuthorizeModeV1 = (typeof AGENT_PASS_AUTHORIZE_MODES_V1)[number];

export const AGENT_PASS_LIMITS_V1 = {
  scopesMax: 96,
  useLimitMax: 1_000_000,
} as const;

export const AGENT_PASS_REASON_CODES_V1 = [
  'unsupported_schema_version',
  'unknown_field',
  'missing_field',
  'invalid_type',
  'invalid_value',
  /** `duration`、`expiresAt`、`useLimit` 或 `audience` 前缀搭配不对。 */
  'terms_mismatch',
  /** 没有这张 Pass，或者它不是这个主人的（不区分）。 */
  'pass_not_found',
  'pass_expired',
  'pass_revoked',
  'pass_exhausted',
  /** 请求的类别不在 Pass 的范围里（D4 沿用同名 `category_denied`）。 */
  'category_denied',
  /** 类别在，但这个目的不在。 */
  'purpose_denied',
  /** 外部 Agent 没核实过护照，拿不到 Pass。 */
  'audience_unverified',
  /** `expectedVersion` 和当前版本对不上。 */
  'version_conflict',
  /** 放宽没走预览 + 确认 + 最近登录。 */
  'loosen_not_confirmed',
  /** 没有注册实现：默认拒绝。 */
  'port_unavailable',
  /** `AGENT_PASS_V1_ENABLED` 没开。 */
  'feature_disabled',
] as const;
export type AgentPassReasonCodeV1 = (typeof AGENT_PASS_REASON_CODES_V1)[number];

export type AgentPassDecodeResultV1<T> =
  | { ok: true; value: T }
  | { ok: false; reasonCode: AgentPassReasonCodeV1; field: string };

export interface AgentPassAudienceV1 {
  kind: AgentPassAudienceKindV1;
  /** 前缀见 `AGENT_PASS_AUDIENCE_REF_PREFIX_V1`。 */
  ref: string;
}

export interface AgentPassScopeV1 {
  category: AgentPassCategoryV1;
  purpose: AgentPassPurposeV1;
}

/** Pass 的条款：签发、收紧、放宽时都是这一组。 */
export interface AgentPassTermsV1 {
  audience: AgentPassAudienceV1;
  /** 1–64 对，不重复。 */
  scopes: AgentPassScopeV1[];
  duration: AgentPassDurationV1;
  /** timed 必填，其余必须是 null。 */
  expiresAt: string | null;
  /** null = 不限次数；once 必须是 1。 */
  useLimit: number | null;
}

export interface AgentPassV1 extends AgentPassTermsV1 {
  schemaVersion: typeof AGENT_PASS_SCHEMA_VERSION_V1;
  /** `pass_` + 32 位小写十六进制。 */
  id: string;
  agentId: string;
  status: AgentPassStatusV1;
  /** 每次收紧或放宽加 1，从 1 起。 */
  version: number;
  usedCount: number;
  issuedAt: string;
  updatedAt: string;
  /** 撤销时间；当且仅当 status 为 revoked 时非 null。 */
  revokedAt: string | null;
}

export interface AgentPassIssueCommandV1 extends AgentPassTermsV1 {
  schemaVersion: typeof AGENT_PASS_SCHEMA_VERSION_V1;
  /** 幂等键。 */
  requestId: string;
  agentId: string;
}

/** 改条款。比当前更窄就立即生效，更宽要先确认（见文件顶部）。 */
export interface AgentPassChangeCommandV1 {
  schemaVersion: typeof AGENT_PASS_SCHEMA_VERSION_V1;
  requestId: string;
  passId: string;
  expectedVersion: number;
  terms: AgentPassTermsV1;
}

export interface AgentPassRevokeCommandV1 {
  schemaVersion: typeof AGENT_PASS_SCHEMA_VERSION_V1;
  requestId: string;
  passId: string;
}

/** `AgentPassAuthorizerPortV1.authorize` 的请求。属主是端口的第一个参数。 */
export interface AgentPassAuthorizeRequestV1 {
  schemaVersion: typeof AGENT_PASS_SCHEMA_VERSION_V1;
  mode: AgentPassAuthorizeModeV1;
  agentId: string;
  audience: AgentPassAudienceV1;
  category: AgentPassCategoryV1;
  purpose: AgentPassPurposeV1;
  /** 幂等键；`use` 时也是 pass_use 回执的 `turnRef`。 */
  requestId: string;
}

export type AgentPassAuthorizeOutcomeV1 =
  | { allowed: true; passId: string; passVersion: number; remainingUses: number | null }
  | { allowed: false; reasonCode: AgentPassReasonCodeV1 };

/** Pass 的范围放不放行这一对（类别, 目的）。放行返回 null，否则返回拒绝原因。授权器和测试共用。 */
export function evaluateAgentPassScopeV1(
  scopes: readonly AgentPassScopeV1[],
  category: unknown,
  purpose: unknown,
): 'category_denied' | 'purpose_denied' | null {
  if (!Array.isArray(scopes)) return 'category_denied';
  const sameCategory = scopes.filter((scope) => scope?.category === category);
  if (sameCategory.length === 0) return 'category_denied';
  return sameCategory.some((scope) => scope.purpose === purpose) ? null : 'purpose_denied';
}

// ── 解码 ────────────────────────────────────────────────────────────────────────────

const PASS_ID = /^pass_[0-9a-f]{32}$/;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const AUDIENCE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

type Failure = { ok: false; reasonCode: AgentPassReasonCodeV1; field: string };

function fail(reasonCode: AgentPassReasonCodeV1, field: string): Failure {
  return { ok: false, reasonCode, field };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value));
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function checkEnvelope(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): Failure | null {
  if (value.schemaVersion === undefined) return fail('missing_field', 'schemaVersion');
  if (typeof value.schemaVersion !== 'number') return fail('invalid_type', 'schemaVersion');
  if (value.schemaVersion !== AGENT_PASS_SCHEMA_VERSION_V1) return fail('unsupported_schema_version', 'schemaVersion');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return fail('unknown_field', key);
  for (const key of required) if (value[key] === undefined) return fail('missing_field', key);
  return null;
}

function decodeAudience(value: unknown, path: string): AgentPassDecodeResultV1<AgentPassAudienceV1> {
  if (!isRecord(value)) return fail('invalid_type', path);
  for (const key of Object.keys(value)) if (!['kind', 'ref'].includes(key)) return fail('unknown_field', `${path}.${key}`);
  for (const key of ['kind', 'ref']) if (value[key] === undefined) return fail('missing_field', `${path}.${key}`);
  if (typeof value.kind !== 'string') return fail('invalid_type', `${path}.kind`);
  if (!isOneOf(AGENT_PASS_AUDIENCE_KINDS_V1, value.kind)) return fail('invalid_value', `${path}.kind`);
  if (typeof value.ref !== 'string') return fail('invalid_type', `${path}.ref`);
  const prefix = AGENT_PASS_AUDIENCE_REF_PREFIX_V1[value.kind];
  if (!value.ref.startsWith(prefix)) return fail('terms_mismatch', `${path}.ref`);
  const rest = value.ref.slice(prefix.length);
  if (!AUDIENCE_ID.test(rest)) return fail('invalid_value', `${path}.ref`);
  if (value.kind === 'tier_preset' && !isOneOf(AGENT_PASS_TIER_PRESETS_V1, rest)) return fail('invalid_value', `${path}.ref`);
  if (value.kind === 'local_client' && !isOneOf(AGENT_PASS_LOCAL_CLIENTS_V1, rest)) return fail('invalid_value', `${path}.ref`);
  if (value.kind === 'oauth_client' && !/^[0-9a-f]{64}$/.test(rest)) return fail('invalid_value', `${path}.ref`);
  return { ok: true, value: { kind: value.kind, ref: value.ref } };
}

function decodeScopes(value: unknown, path: string): AgentPassDecodeResultV1<AgentPassScopeV1[]> {
  if (!Array.isArray(value)) return fail('invalid_type', path);
  if (value.length === 0 || value.length > AGENT_PASS_LIMITS_V1.scopesMax) return fail('invalid_value', path);
  const out: AgentPassScopeV1[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < value.length; i += 1) {
    const scope: unknown = value[i];
    const at = `${path}[${i}]`;
    if (!isRecord(scope)) return fail('invalid_type', at);
    for (const key of Object.keys(scope)) if (!['category', 'purpose'].includes(key)) return fail('unknown_field', `${at}.${key}`);
    for (const key of ['category', 'purpose']) if (scope[key] === undefined) return fail('missing_field', `${at}.${key}`);
    if (typeof scope.category !== 'string') return fail('invalid_type', `${at}.category`);
    if (!isOneOf(AGENT_PASS_CATEGORIES_V1, scope.category)) return fail('invalid_value', `${at}.category`);
    if (typeof scope.purpose !== 'string') return fail('invalid_type', `${at}.purpose`);
    if (!isOneOf(AGENT_PASS_PURPOSES_V1, scope.purpose)) return fail('invalid_value', `${at}.purpose`);
    const key = `${scope.category}|${scope.purpose}`;
    if (seen.has(key)) return fail('invalid_value', at);
    seen.add(key);
    out.push({ category: scope.category, purpose: scope.purpose });
  }
  return { ok: true, value: out };
}

/** 条款这五个字段都必须在，`expiresAt` 和 `useLimit` 不限就写 null。 */
function decodeTerms(value: Record<string, unknown>, path: string): AgentPassDecodeResultV1<AgentPassTermsV1> {
  const at = (name: string) => (path ? `${path}.${name}` : name);
  const audience = decodeAudience(value.audience, at('audience'));
  if (audience.ok === false) return audience;
  const scopes = decodeScopes(value.scopes, at('scopes'));
  if (scopes.ok === false) return scopes;
  if (typeof value.duration !== 'string') return fail('invalid_type', at('duration'));
  if (!isOneOf(AGENT_PASS_DURATIONS_V1, value.duration)) return fail('invalid_value', at('duration'));
  let expiresAt: string | null = null;
  if (value.expiresAt !== null) {
    if (typeof value.expiresAt !== 'string') return fail('invalid_type', at('expiresAt'));
    if (!isIso(value.expiresAt)) return fail('invalid_value', at('expiresAt'));
    expiresAt = value.expiresAt;
  }
  let useLimit: number | null = null;
  if (value.useLimit !== null) {
    if (typeof value.useLimit !== 'number') return fail('invalid_type', at('useLimit'));
    if (!Number.isInteger(value.useLimit) || value.useLimit < 1 || value.useLimit > AGENT_PASS_LIMITS_V1.useLimitMax) {
      return fail('invalid_value', at('useLimit'));
    }
    useLimit = value.useLimit;
  }
  if ((value.duration === 'timed') !== (expiresAt !== null)) return fail('terms_mismatch', at('expiresAt'));
  if (value.duration === 'once' && useLimit !== 1) return fail('terms_mismatch', at('useLimit'));
  return {
    ok: true,
    value: { audience: audience.value, scopes: scopes.value, duration: value.duration, expiresAt, useLimit },
  };
}

const TERMS_KEYS = ['audience', 'scopes', 'duration', 'expiresAt', 'useLimit'] as const;

export function decodeAgentPassTermsV1(value: unknown): AgentPassDecodeResultV1<AgentPassTermsV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  for (const key of Object.keys(value)) if (!(TERMS_KEYS as readonly string[]).includes(key)) return fail('unknown_field', key);
  for (const key of TERMS_KEYS) if (value[key] === undefined) return fail('missing_field', key);
  return decodeTerms(value, '');
}

export function decodeAgentPassIssueCommandV1(value: unknown): AgentPassDecodeResultV1<AgentPassIssueCommandV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = checkEnvelope(value, ['schemaVersion', 'requestId', 'agentId', ...TERMS_KEYS], ['requestId', 'agentId', ...TERMS_KEYS]);
  if (bad) return bad;
  if (typeof value.requestId !== 'string') return fail('invalid_type', 'requestId');
  if (!OPAQUE_ID.test(value.requestId)) return fail('invalid_value', 'requestId');
  if (typeof value.agentId !== 'string') return fail('invalid_type', 'agentId');
  if (!OPAQUE_ID.test(value.agentId)) return fail('invalid_value', 'agentId');
  const terms = decodeTerms(value, '');
  if (terms.ok === false) return terms;
  return {
    ok: true,
    value: { schemaVersion: AGENT_PASS_SCHEMA_VERSION_V1, requestId: value.requestId, agentId: value.agentId, ...terms.value },
  };
}

export function decodeAgentPassChangeCommandV1(value: unknown): AgentPassDecodeResultV1<AgentPassChangeCommandV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = checkEnvelope(value, ['schemaVersion', 'requestId', 'passId', 'expectedVersion', 'terms'], ['requestId', 'passId', 'expectedVersion', 'terms']);
  if (bad) return bad;
  if (typeof value.requestId !== 'string') return fail('invalid_type', 'requestId');
  if (!OPAQUE_ID.test(value.requestId)) return fail('invalid_value', 'requestId');
  if (typeof value.passId !== 'string') return fail('invalid_type', 'passId');
  if (!PASS_ID.test(value.passId)) return fail('invalid_value', 'passId');
  if (typeof value.expectedVersion !== 'number') return fail('invalid_type', 'expectedVersion');
  if (!Number.isInteger(value.expectedVersion) || value.expectedVersion < 1) return fail('invalid_value', 'expectedVersion');
  const terms = decodeAgentPassTermsV1(value.terms);
  if (terms.ok === false) return { ok: false, reasonCode: terms.reasonCode, field: terms.field === '$' ? 'terms' : `terms.${terms.field}` };
  return {
    ok: true,
    value: {
      schemaVersion: AGENT_PASS_SCHEMA_VERSION_V1,
      requestId: value.requestId,
      passId: value.passId,
      expectedVersion: value.expectedVersion,
      terms: terms.value,
    },
  };
}

export function decodeAgentPassRevokeCommandV1(value: unknown): AgentPassDecodeResultV1<AgentPassRevokeCommandV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = checkEnvelope(value, ['schemaVersion', 'requestId', 'passId'], ['requestId', 'passId']);
  if (bad) return bad;
  if (typeof value.requestId !== 'string') return fail('invalid_type', 'requestId');
  if (!OPAQUE_ID.test(value.requestId)) return fail('invalid_value', 'requestId');
  if (typeof value.passId !== 'string') return fail('invalid_type', 'passId');
  if (!PASS_ID.test(value.passId)) return fail('invalid_value', 'passId');
  return { ok: true, value: { schemaVersion: AGENT_PASS_SCHEMA_VERSION_V1, requestId: value.requestId, passId: value.passId } };
}

/** 三端解码服务端返回的 Pass。 */
export function decodeAgentPassV1(value: unknown): AgentPassDecodeResultV1<AgentPassV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const keys = ['id', 'agentId', 'status', 'version', 'usedCount', 'issuedAt', 'updatedAt', 'revokedAt'];
  const bad = checkEnvelope(value, ['schemaVersion', ...keys, ...TERMS_KEYS], [...keys, ...TERMS_KEYS]);
  if (bad) return bad;
  if (typeof value.id !== 'string') return fail('invalid_type', 'id');
  if (!PASS_ID.test(value.id)) return fail('invalid_value', 'id');
  if (typeof value.agentId !== 'string') return fail('invalid_type', 'agentId');
  if (!OPAQUE_ID.test(value.agentId)) return fail('invalid_value', 'agentId');
  if (typeof value.status !== 'string') return fail('invalid_type', 'status');
  if (!isOneOf(AGENT_PASS_STATUSES_V1, value.status)) return fail('invalid_value', 'status');
  if (typeof value.version !== 'number') return fail('invalid_type', 'version');
  if (!Number.isInteger(value.version) || value.version < 1) return fail('invalid_value', 'version');
  if (typeof value.usedCount !== 'number') return fail('invalid_type', 'usedCount');
  if (!Number.isInteger(value.usedCount) || value.usedCount < 0) return fail('invalid_value', 'usedCount');
  if (typeof value.issuedAt !== 'string') return fail('invalid_type', 'issuedAt');
  if (!isIso(value.issuedAt)) return fail('invalid_value', 'issuedAt');
  if (typeof value.updatedAt !== 'string') return fail('invalid_type', 'updatedAt');
  if (!isIso(value.updatedAt)) return fail('invalid_value', 'updatedAt');
  let revokedAt: string | null = null;
  if (value.revokedAt !== null) {
    if (typeof value.revokedAt !== 'string') return fail('invalid_type', 'revokedAt');
    if (!isIso(value.revokedAt)) return fail('invalid_value', 'revokedAt');
    revokedAt = value.revokedAt;
  }
  if ((value.status === 'revoked') !== (revokedAt !== null)) return fail('invalid_value', 'revokedAt');
  const terms = decodeTerms(value, '');
  if (terms.ok === false) return terms;
  if (terms.value.useLimit !== null && value.usedCount > terms.value.useLimit) return fail('invalid_value', 'usedCount');
  return {
    ok: true,
    value: {
      schemaVersion: AGENT_PASS_SCHEMA_VERSION_V1,
      id: value.id,
      agentId: value.agentId,
      status: value.status,
      version: value.version,
      usedCount: value.usedCount,
      issuedAt: value.issuedAt,
      updatedAt: value.updatedAt,
      revokedAt,
      ...terms.value,
    },
  };
}

/** 授权器收到请求时用。 */
export function decodeAgentPassAuthorizeRequestV1(value: unknown): AgentPassDecodeResultV1<AgentPassAuthorizeRequestV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = checkEnvelope(
    value,
    ['schemaVersion', 'mode', 'agentId', 'audience', 'category', 'purpose', 'requestId'],
    ['mode', 'agentId', 'audience', 'category', 'purpose', 'requestId'],
  );
  if (bad) return bad;
  if (typeof value.mode !== 'string') return fail('invalid_type', 'mode');
  if (!isOneOf(AGENT_PASS_AUTHORIZE_MODES_V1, value.mode)) return fail('invalid_value', 'mode');
  if (typeof value.agentId !== 'string') return fail('invalid_type', 'agentId');
  if (!OPAQUE_ID.test(value.agentId)) return fail('invalid_value', 'agentId');
  const audience = decodeAudience(value.audience, 'audience');
  if (audience.ok === false) return audience;
  if (typeof value.category !== 'string') return fail('invalid_type', 'category');
  if (!isOneOf(AGENT_PASS_CATEGORIES_V1, value.category)) return fail('invalid_value', 'category');
  if (typeof value.purpose !== 'string') return fail('invalid_type', 'purpose');
  if (!isOneOf(AGENT_PASS_PURPOSES_V1, value.purpose)) return fail('invalid_value', 'purpose');
  if (typeof value.requestId !== 'string') return fail('invalid_type', 'requestId');
  if (!OPAQUE_ID.test(value.requestId)) return fail('invalid_value', 'requestId');
  return {
    ok: true,
    value: {
      schemaVersion: AGENT_PASS_SCHEMA_VERSION_V1,
      mode: value.mode,
      agentId: value.agentId,
      audience: audience.value,
      category: value.category,
      purpose: value.purpose,
      requestId: value.requestId,
    },
  };
}

// ── 收紧 / 放宽的分级和预览（线 3 在 A5 实现时补，只加不改） ──────────────────────────────────────

/** 期限从窄到宽。 */
export const AGENT_PASS_DURATION_RANK_V1: Readonly<Record<AgentPassDurationV1, number>> = {
  once: 0,
  session: 1,
  timed: 2,
  ongoing: 3,
};

export type AgentPassChangeDirectionV1 = 'widen' | 'narrow' | 'same';

export type AgentPassChangeClassificationV1 =
  | { ok: true; direction: AgentPassChangeDirectionV1; operations: AgentPassOperationV1[] }
  /** 受众不能改（换受众就签一张新的）。 */
  | { ok: false; reasonCode: 'terms_mismatch' };

function scopeKey(scope: AgentPassScopeV1): string {
  return `${scope.category}|${scope.purpose}`;
}

/**
 * 按实际效果分级，不看请求里写的意图：有任何一项变宽就整次按放宽算（`pass_widen`，要预览 + 确认 + 最近登录）；
 * 否则有任何一项变窄就是收紧（`pass_narrow`，立即生效）；一点没变是 `same`，不带操作。
 * 范围多了一对、期限更长、到期更晚、次数上限更高（含改成不限）都算变宽。
 */
export function classifyAgentPassChangeV1(current: AgentPassTermsV1, next: AgentPassTermsV1): AgentPassChangeClassificationV1 {
  if (current.audience.kind !== next.audience.kind || current.audience.ref !== next.audience.ref) {
    return { ok: false, reasonCode: 'terms_mismatch' };
  }
  let widened = false;
  let narrowed = false;
  const currentScopes = new Set(current.scopes.map(scopeKey));
  const nextScopes = new Set(next.scopes.map(scopeKey));
  for (const key of nextScopes) if (!currentScopes.has(key)) widened = true;
  for (const key of currentScopes) if (!nextScopes.has(key)) narrowed = true;

  const currentRank = AGENT_PASS_DURATION_RANK_V1[current.duration];
  const nextRank = AGENT_PASS_DURATION_RANK_V1[next.duration];
  if (nextRank > currentRank) widened = true;
  if (nextRank < currentRank) narrowed = true;

  if (current.expiresAt !== null && next.expiresAt !== null) {
    const a = Date.parse(current.expiresAt);
    const b = Date.parse(next.expiresAt);
    if (b > a) widened = true;
    if (b < a) narrowed = true;
  }

  if (current.useLimit === null && next.useLimit !== null) narrowed = true;
  else if (current.useLimit !== null && next.useLimit === null) widened = true;
  else if (current.useLimit !== null && next.useLimit !== null) {
    if (next.useLimit > current.useLimit) widened = true;
    if (next.useLimit < current.useLimit) narrowed = true;
  }

  if (widened) return { ok: true, direction: 'widen', operations: ['pass_widen'] };
  if (narrowed) return { ok: true, direction: 'narrow', operations: ['pass_narrow'] };
  return { ok: true, direction: 'same', operations: [] };
}

type PassJson = string | number | boolean | null | PassJson[] | { [key: string]: PassJson };

/** 条款的规范 JSON 形状：范围按 `类别|目的` 排序，顺序不影响摘要。 */
function termsJson(terms: AgentPassTermsV1): { [key: string]: PassJson } {
  return {
    audience: { kind: terms.audience.kind, ref: terms.audience.ref },
    scopes: [...terms.scopes]
      .sort((a, b) => (scopeKey(a) < scopeKey(b) ? -1 : scopeKey(a) > scopeKey(b) ? 1 : 0))
      .map((scope) => ({ category: scope.category, purpose: scope.purpose })),
    duration: terms.duration,
    expiresAt: terms.expiresAt,
    useLimit: terms.useLimit,
  };
}

/** 签发：要预览 + 确认（授权别人读主人的数据，是放宽）。`objectRef` 是 Agent 账户 id。 */
export function agentPassIssueChangeV1(agentId: string, terms: AgentPassTermsV1): VisibilityChangeV1 {
  return { objectKind: 'agent_pass', objectRef: agentId, operations: ['pass_issue'], change: { terms: termsJson(terms) } };
}

/** 改条款。`operations` 来自 `classifyAgentPassChangeV1`；预览和提交两边用同一个函数，摘要才对得上。 */
export function agentPassTermsChangeV1(
  passId: string,
  expectedVersion: number,
  operations: readonly AgentPassOperationV1[],
  terms: AgentPassTermsV1,
): VisibilityChangeV1 {
  return {
    objectKind: 'agent_pass',
    objectRef: passId,
    operations: [...operations],
    change: { expectedVersion, terms: termsJson(terms) },
  };
}

export function agentPassRevokeChangeV1(passId: string): VisibilityChangeV1 {
  return { objectKind: 'agent_pass', objectRef: passId, operations: ['pass_revoke'], change: {} };
}

// ── R2：关系档位的默认 Pass（只加不改）──────────────────────────────────────────────────

/**
 * 一档的默认 Pass 条款：该档能发的协作请求种类（`AGENT_COLLABORATION_PRESET_KINDS_V1`）× 目的 `collaboration_request`，
 * 持续到撤销，不限次数。前四档与 L6-1 的静态表一致，所以打开预设开关本身不放宽任何东西。
 */
export function agentPassTierPresetTermsV1(tier: AgentPassTierPresetV1): AgentPassTermsV1 {
  return {
    audience: { kind: 'tier_preset', ref: `${AGENT_PASS_AUDIENCE_REF_PREFIX_V1.tier_preset}${tier}` },
    scopes: AGENT_COLLABORATION_PRESET_KINDS_V1[tier].map((kind) => ({
      category: `collab_${kind}` as AgentPassCategoryV1,
      purpose: 'collaboration_request' as const,
    })),
    duration: 'ongoing',
    expiresAt: null,
    useLimit: null,
  };
}

// ── 三端读 Pass 列表、预览、撤销（只加不改）──────────────────────────────────────────────

/** 列表路由 `GET /agent-passes` 的返回：`{ items }`，也认被 `{ data }` 包了一层的。任何一项解不开就整体不可读。 */
export function decodeAgentPassListV1(body: unknown): AgentPassV1[] | null {
  const outer = isRecord(body) && isRecord(body.data) && body.items === undefined ? body.data : body;
  if (!isRecord(outer) || !Array.isArray(outer.items)) return null;
  const out: AgentPassV1[] = [];
  for (const item of outer.items) {
    const decoded = decodeAgentPassV1(item);
    if (decoded.ok === false) return null;
    out.push(decoded.value);
  }
  return out;
}

/** 撤销 / 改条款路由的返回里的 `pass`。 */
export function decodeAgentPassChangedV1(body: unknown): AgentPassV1 | null {
  const outer = isRecord(body) && isRecord(body.data) && body.pass === undefined ? body.data : body;
  if (!isRecord(outer)) return null;
  const decoded = decodeAgentPassV1(outer.pass);
  return decoded.ok ? decoded.value : null;
}

export interface AgentPassCopyV1 {
  zh: string;
  en: string;
}

const AUDIENCE_KIND_COPY: Readonly<Record<AgentPassAudienceKindV1, AgentPassCopyV1>> = {
  share_link: { zh: '分享链接', en: 'Share link' },
  external_agent: { zh: '别人的 Agent', en: "Someone else's Agent" },
  local_client: { zh: '本机 AI 客户端', en: 'AI app on this computer' },
  tier_preset: { zh: '关系档位', en: 'Relationship tier' },
  oauth_client: { zh: '用 Agentrix 登录的应用', en: 'App signed in with Agentrix' },
};

const TIER_COPY: Readonly<Record<AgentPassTierPresetV1, AgentPassCopyV1>> = {
  client: { zh: '客户', en: 'Client' },
  collaborator: { zh: '合作者', en: 'Collaborator' },
  family: { zh: '家人', en: 'Family' },
  community: { zh: '学员 / 社群', en: 'Students / community' },
};

const CATEGORY_COPY: Readonly<Record<AgentPassCategoryV1, AgentPassCopyV1>> = {
  agent_profile: { zh: 'Agent 简介', en: 'Agent profile' },
  agent_preferences: { zh: '偏好', en: 'Preferences' },
  schedule_metadata: { zh: '日程的忙闲', en: 'Schedule free/busy' },
  skill_inventory: { zh: '技能清单', en: 'Skill list' },
  agent_memory: { zh: '记忆', en: 'Memory' },
  passport_view: { zh: '护照页', en: 'Passport page' },
  collab_ask: { zh: '向你提问', en: 'Ask you a question' },
  collab_book: { zh: '约你的时间', en: 'Book your time' },
  collab_deposit_intent: { zh: '提出定金意向', en: 'Propose a deposit' },
  collab_file_offer: { zh: '给你发文件', en: 'Offer you a file' },
  relationship_book: { zh: '关系簿里的称呼和档位', en: 'Names and tiers in your relationship book' },
};

const PURPOSE_COPY: Readonly<Record<AgentPassPurposeV1, AgentPassCopyV1>> = {
  answer_user_question: { zh: '回答问题', en: 'answering questions' },
  schedule_assistance: { zh: '协助安排日程', en: 'helping with scheduling' },
  task_execution_planning: { zh: '规划任务', en: 'planning tasks' },
  support_diagnostics: { zh: '排查问题', en: 'support diagnostics' },
  passport_viewing: { zh: '查看护照页', en: 'viewing the passport page' },
  collaboration_request: { zh: '协作请求', en: 'a collaboration request' },
};

const DURATION_COPY: Readonly<Record<AgentPassDurationV1, AgentPassCopyV1>> = {
  once: { zh: '只能用一次', en: 'One use only' },
  session: { zh: '签发后 24 小时内', en: 'For 24 hours after it is issued' },
  timed: { zh: '到期为止', en: 'Until it expires' },
  ongoing: { zh: '持续到你撤销', en: 'Until you revoke it' },
};

const STATUS_COPY: Readonly<Record<AgentPassStatusV1, AgentPassCopyV1>> = {
  active: { zh: '有效', en: 'Active' },
  revoked: { zh: '已撤销', en: 'Revoked' },
  expired: { zh: '已过期', en: 'Expired' },
  exhausted: { zh: '次数用完', en: 'Used up' },
};

export interface AgentPassPreviewV1 {
  status: AgentPassStatusV1;
  statusCopy: AgentPassCopyV1;
  /** 受众种类 + 具体对象（档位名 / 客户端 / 对方护照号 / 链接）。 */
  who: AgentPassCopyV1;
  /** 每一对（类别, 目的）一行："记忆，用于回答问题"。 */
  can: AgentPassCopyV1[];
  duration: AgentPassCopyV1;
  /** 过期时间，只在 timed 时有。 */
  expiresAt: string | null;
  uses: AgentPassCopyV1;
  /** 只有有效的 Pass 才能撤销。 */
  revocable: boolean;
}

/** 把一张 Pass 讲成人话：谁、能读什么、为了什么、多久、几次。三端的列表和预览共用，只读。 */
export function agentPassPreviewV1(pass: AgentPassV1): AgentPassPreviewV1 {
  const kind = AUDIENCE_KIND_COPY[pass.audience.kind];
  const rest = pass.audience.ref.slice(AGENT_PASS_AUDIENCE_REF_PREFIX_V1[pass.audience.kind].length);
  const tier = pass.audience.kind === 'tier_preset' ? TIER_COPY[rest as AgentPassTierPresetV1] : undefined;
  // 对象名原样展示（纯文本），share_link 和 oauth_client 只显示种类（链接 id、客户端摘要不是给人看的；应用名在「已连接的应用」里）。
  const target = pass.audience.kind === 'share_link' || pass.audience.kind === 'oauth_client' ? null : tier ?? { zh: rest, en: rest };
  const who = target ? { zh: `${kind.zh}：${target.zh}`, en: `${kind.en}: ${target.en}` } : kind;
  const can = pass.scopes.map((scope) => ({
    zh: `${CATEGORY_COPY[scope.category].zh}，用于${PURPOSE_COPY[scope.purpose].zh}`,
    en: `${CATEGORY_COPY[scope.category].en}, for ${PURPOSE_COPY[scope.purpose].en}`,
  }));
  const uses =
    pass.useLimit === null
      ? { zh: `已用 ${pass.usedCount} 次，次数不限`, en: `Used ${pass.usedCount} times, no cap` }
      : { zh: `已用 ${pass.usedCount} / ${pass.useLimit} 次`, en: `Used ${pass.usedCount} of ${pass.useLimit}` };
  return {
    status: pass.status,
    statusCopy: STATUS_COPY[pass.status],
    who,
    can,
    duration: DURATION_COPY[pass.duration],
    expiresAt: pass.expiresAt,
    uses,
    revocable: pass.status === 'active',
  };
}
