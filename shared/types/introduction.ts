/**
 * 草案 v0（L8 第 3 批第 0 步，coord 10-20）：线 N 实现时可加字段，不可改语义。
 *
 * R7「双方确认的引荐 + 引荐分成」：A 的主人让 A 的 Agent 把 B 介绍给 C，三方都确认以后引荐成立，出一张平台签名的
 * 引荐回执；C 以后在 B 那里下单，A 按约定的比例拿一笔分成。
 *
 * 流程：A 发起（`IntroductionProposalInputV1`）→ B 在请求列表里接受并选一档 R2 预设（`IntroductionDecisionCommandV1`）→
 * C 收到带一次性码的邮件或链接并确认（`IntroductionConfirmCommandV1`）→ 引荐成立（`active`），回执签名走
 * `PlatformJwsSignerPortV1`（头 `typ: introduction-receipt+jwt`）。任何一方拒绝，或者 14 天没回，就过期。
 *
 * 钱的规矩（测试模式；真钱随 B3，要 owner 逐次批）：
 * - 只有 `active` 的引荐才分成（`introductionPaysShareV1`），三方没有都确认就不记。
 * - 分成上限 10%（1000 基点），和 `agent-income` 的 `referralShareMinorV0` 同一个上限。
 * - 每笔订单至多记一次，幂等键 `referral:<orderId>`；退款的单不记，已经记了又退款的，用 `referral_reversal:<orderId>` 冲回。
 * - 订单表不加列：订单和引荐的关系放旁表 `introduction_orders`（订单 id → 引荐 id）。
 *
 * 视图里不放别人的邮箱、账户 id：只有显示名。C 的邮箱只在提交那一次出现，存的时候是 A7 密文加 HMAC。
 * 开关：`INTRODUCTIONS_V1_ENABLED`，只认精确的 `'1'`，默认关；分成另外要 `AGENT_INCOME_V0_ENABLED` 开着。
 * 解码函数拒收未知字段和错误类型，失败时给出 `reasonCode` 和出错的字段名，不抛异常。
 */
import { AGENT_PASS_TIER_PRESETS_V1, type AgentPassTierPresetV1 } from './agent-pass';

export const INTRODUCTION_SCHEMA_VERSION_V1 = 1 as const;

export const INTRODUCTIONS_FLAG_V1 = 'INTRODUCTIONS_V1_ENABLED';
export const INTRODUCTION_INCOME_FLAG_V1 = 'AGENT_INCOME_V0_ENABLED';

export const INTRODUCTION_STATUSES_V1 = ['proposed', 'b_accepted', 'c_accepted', 'active', 'closed', 'declined', 'expired'] as const;
export type IntroductionStatusV1 = (typeof INTRODUCTION_STATUSES_V1)[number];

/** 状态只能这样走。`declined`、`expired`、`closed` 是终点。 */
export const INTRODUCTION_TRANSITIONS_V1: Readonly<Record<IntroductionStatusV1, readonly IntroductionStatusV1[]>> = {
  proposed: ['b_accepted', 'declined', 'expired'],
  b_accepted: ['c_accepted', 'declined', 'expired'],
  c_accepted: ['active', 'declined', 'expired'],
  active: ['closed'],
  closed: [],
  declined: [],
  expired: [],
};

export const INTRODUCTION_B_KINDS_V1 = ['agent', 'owner'] as const;
export type IntroductionBKindV1 = (typeof INTRODUCTION_B_KINDS_V1)[number];
export const INTRODUCTION_C_KINDS_V1 = ['visitor', 'account'] as const;
export type IntroductionCKindV1 = (typeof INTRODUCTION_C_KINDS_V1)[number];

export const INTRODUCTION_DECISIONS_V1 = ['accept', 'decline'] as const;
export type IntroductionDecisionV1 = (typeof INTRODUCTION_DECISIONS_V1)[number];

/** 分成上限：10%，以基点计。 */
export const INTRODUCTION_SHARE_MAX_BPS_V1 = 1000;
/** 引荐的有效期：14 天没人答复就过期。 */
export const INTRODUCTION_EXPIRY_DAYS_V1 = 14;
/** 回执 JWS 头 `typ`。 */
export const INTRODUCTION_RECEIPT_TYP_V1 = 'introduction-receipt+jwt';

export const INTRODUCTION_LIMITS_V1 = {
  purposeMax: 500,
  emailMax: 254,
  /** C 的一次性确认码长度（字符）。 */
  codeMin: 32,
  codeMax: 64,
} as const;

export const INTRODUCTION_REASON_CODES_V1 = [
  'unsupported_schema_version',
  'unknown_field',
  'missing_field',
  'invalid_type',
  'invalid_value',
  /** `tierPreset` 和 `decision` 对不上：接受要带，拒绝不许带。 */
  'decision_mismatch',
  /** 分成比例超过 10%。 */
  'share_over_cap',
  /** 三方没有都确认。 */
  'not_all_confirmed',
  'already_decided',
  'expired',
  /** 一次性码已经用过，或者不对。 */
  'code_invalid',
  /** 不存在，或者不是这个主人的（不区分，不给探测）。 */
  'not_found',
  /** 没有注册实现：默认拒绝。 */
  'port_unavailable',
  /** `INTRODUCTIONS_V1_ENABLED` 没开。 */
  'feature_disabled',
] as const;
export type IntroductionReasonCodeV1 = (typeof INTRODUCTION_REASON_CODES_V1)[number];

export type IntroductionDecodeResultV1<T> =
  | { ok: true; value: T }
  | { ok: false; reasonCode: IntroductionReasonCodeV1; field: string };

/** B：另一个 Agent（`agent`）或另一位主人（`owner`），都用不透明的 id。 */
export interface IntroductionBPartyV1 {
  kind: IntroductionBKindV1;
  ref: string;
}

/** C：已有账户（`account`，用 id），或者还没有账户的访客（`visitor`，用邮箱，确认码寄到那里）。 */
export type IntroductionCPartyV1 = { kind: 'account'; ref: string } | { kind: 'visitor'; email: string };

/** A 发起。属主（A 的主人）不在里面，由服务端从登录态取。 */
export interface IntroductionProposalInputV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  /** A 的 Agent。 */
  agentId: string;
  b: IntroductionBPartyV1;
  c: IntroductionCPartyV1;
  /** 为什么介绍，1–500 字，B 和 C 都会看到。 */
  purpose: string;
  /** 分成基点，0–1000。0 = 不要分成。 */
  shareBps: number;
}

/** B 答复。接受要选一档 R2 预设；拒绝不许带。 */
export interface IntroductionDecisionCommandV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  introductionId: string;
  decision: IntroductionDecisionV1;
  tierPreset?: AgentPassTierPresetV1;
}

/** C 凭一次性码确认。码只能用一次。 */
export interface IntroductionConfirmCommandV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  code: string;
}

/** 视图里每一方只给显示名。 */
export interface IntroductionPartyViewV1 {
  kind: IntroductionBKindV1 | IntroductionCKindV1;
  displayName: string | null;
}

/** 给 A、B 看的一条引荐。 */
export interface IntroductionV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  id: string;
  agentId: string;
  b: IntroductionPartyViewV1;
  c: IntroductionPartyViewV1;
  purpose: string;
  shareBps: number;
  status: IntroductionStatusV1;
  createdAt: string;
  expiresAt: string;
  /** `active` 和 `closed` 时有值，其余为 null。 */
  activatedAt: string | null;
}

/** 平台签名的引荐回执（JWS 载荷）。谁引荐了谁，用引用，不放名字和邮箱。 */
export interface IntroductionReceiptClaimsV1 {
  iss: string;
  /** 回执号。 */
  jti: string;
  iat: number;
  introduction_id: string;
  introducer_agent_id: string;
  b_ref: string;
  c_ref: string;
  share_bps: number;
  activated_at: string;
}

// ── 状态和钱的规矩 ───────────────────────────────────────────────────────────────────

export function introductionCanTransitionV1(from: IntroductionStatusV1, to: IntroductionStatusV1): boolean {
  return (INTRODUCTION_TRANSITIONS_V1[from] ?? []).includes(to);
}

/** 只有三方都确认、已经成立的引荐才分成。 */
export function introductionPaysShareV1(status: string): boolean {
  return status === 'active';
}

/** 记分成的幂等键：每笔订单至多一次。 */
export function introductionReferralKeyV1(orderId: string): string {
  return `referral:${orderId}`;
}

/** 退款后冲回的幂等键：每笔订单至多一次。 */
export function introductionReferralReversalKeyV1(orderId: string): string {
  return `referral_reversal:${orderId}`;
}

/** 访客链接带着的引荐引用：`intro_` + 32 位小写十六进制。 */
export const INTRODUCTION_REF_PATTERN_V1 = /^intro_[0-9a-f]{32}$/;

// ── 解码 ────────────────────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = /^[A-Za-z0-9_-]+$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

type Failure = { ok: false; reasonCode: IntroductionReasonCodeV1; field: string };

function fail(reasonCode: IntroductionReasonCodeV1, field: string): Failure {
  return { ok: false, reasonCode, field };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value));
}

function checkEnvelope(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): Failure | null {
  if (value.schemaVersion === undefined) return fail('missing_field', 'schemaVersion');
  if (typeof value.schemaVersion !== 'number') return fail('invalid_type', 'schemaVersion');
  if (value.schemaVersion !== INTRODUCTION_SCHEMA_VERSION_V1) return fail('unsupported_schema_version', 'schemaVersion');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return fail('unknown_field', key);
  for (const key of required) if (value[key] === undefined) return fail('missing_field', key);
  return null;
}

function decodeText(value: unknown, field: string, max: number): IntroductionDecodeResultV1<string> {
  if (typeof value !== 'string') return fail('invalid_type', field);
  const text = value.trim();
  if (text.length === 0 || text.length > max || CONTROL.test(text)) return fail('invalid_value', field);
  return { ok: true, value: text };
}

function decodeB(value: unknown): IntroductionDecodeResultV1<IntroductionBPartyV1> {
  if (!isRecord(value)) return fail('invalid_type', 'b');
  for (const key of Object.keys(value)) if (key !== 'kind' && key !== 'ref') return fail('unknown_field', `b.${key}`);
  for (const key of ['kind', 'ref']) if (value[key] === undefined) return fail('missing_field', `b.${key}`);
  if (typeof value.kind !== 'string') return fail('invalid_type', 'b.kind');
  if (!isOneOf(INTRODUCTION_B_KINDS_V1, value.kind)) return fail('invalid_value', 'b.kind');
  if (typeof value.ref !== 'string') return fail('invalid_type', 'b.ref');
  if (!OPAQUE_ID.test(value.ref)) return fail('invalid_value', 'b.ref');
  return { ok: true, value: { kind: value.kind, ref: value.ref } };
}

function decodeC(value: unknown): IntroductionDecodeResultV1<IntroductionCPartyV1> {
  if (!isRecord(value)) return fail('invalid_type', 'c');
  if (value.kind === undefined) return fail('missing_field', 'c.kind');
  if (typeof value.kind !== 'string') return fail('invalid_type', 'c.kind');
  if (!isOneOf(INTRODUCTION_C_KINDS_V1, value.kind)) return fail('invalid_value', 'c.kind');
  const second = value.kind === 'account' ? 'ref' : 'email';
  for (const key of Object.keys(value)) if (key !== 'kind' && key !== second) return fail('unknown_field', `c.${key}`);
  if (value[second] === undefined) return fail('missing_field', `c.${second}`);
  const text = value[second];
  if (typeof text !== 'string') return fail('invalid_type', `c.${second}`);
  if (value.kind === 'account') {
    if (!OPAQUE_ID.test(text)) return fail('invalid_value', 'c.ref');
    return { ok: true, value: { kind: 'account', ref: text } };
  }
  const email = text.trim();
  if (email.length > INTRODUCTION_LIMITS_V1.emailMax || !EMAIL.test(email) || CONTROL.test(email)) return fail('invalid_value', 'c.email');
  return { ok: true, value: { kind: 'visitor', email } };
}

export function decodeIntroductionProposalInputV1(value: unknown): IntroductionDecodeResultV1<IntroductionProposalInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = checkEnvelope(value, ['schemaVersion', 'agentId', 'b', 'c', 'purpose', 'shareBps'], ['agentId', 'b', 'c', 'purpose', 'shareBps']);
  if (bad) return bad;
  if (typeof value.agentId !== 'string') return fail('invalid_type', 'agentId');
  if (!OPAQUE_ID.test(value.agentId)) return fail('invalid_value', 'agentId');
  const b = decodeB(value.b);
  if (b.ok === false) return b;
  const c = decodeC(value.c);
  if (c.ok === false) return c;
  const purpose = decodeText(value.purpose, 'purpose', INTRODUCTION_LIMITS_V1.purposeMax);
  if (purpose.ok === false) return purpose;
  if (typeof value.shareBps !== 'number') return fail('invalid_type', 'shareBps');
  if (!Number.isInteger(value.shareBps) || value.shareBps < 0) return fail('invalid_value', 'shareBps');
  if (value.shareBps > INTRODUCTION_SHARE_MAX_BPS_V1) return fail('share_over_cap', 'shareBps');
  return {
    ok: true,
    value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, agentId: value.agentId, b: b.value, c: c.value, purpose: purpose.value, shareBps: value.shareBps },
  };
}

export function decodeIntroductionDecisionCommandV1(value: unknown): IntroductionDecodeResultV1<IntroductionDecisionCommandV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = checkEnvelope(value, ['schemaVersion', 'introductionId', 'decision', 'tierPreset'], ['introductionId', 'decision']);
  if (bad) return bad;
  if (typeof value.introductionId !== 'string') return fail('invalid_type', 'introductionId');
  if (!UUID.test(value.introductionId)) return fail('invalid_value', 'introductionId');
  if (typeof value.decision !== 'string') return fail('invalid_type', 'decision');
  if (!isOneOf(INTRODUCTION_DECISIONS_V1, value.decision)) return fail('invalid_value', 'decision');
  let tierPreset: AgentPassTierPresetV1 | undefined;
  if (value.tierPreset !== undefined) {
    if (typeof value.tierPreset !== 'string') return fail('invalid_type', 'tierPreset');
    if (!isOneOf(AGENT_PASS_TIER_PRESETS_V1, value.tierPreset)) return fail('invalid_value', 'tierPreset');
    if (value.decision === 'decline') return fail('decision_mismatch', 'tierPreset');
    tierPreset = value.tierPreset;
  } else if (value.decision === 'accept') {
    return fail('decision_mismatch', 'tierPreset');
  }
  const out: IntroductionDecisionCommandV1 = { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, introductionId: value.introductionId, decision: value.decision };
  if (tierPreset !== undefined) out.tierPreset = tierPreset;
  return { ok: true, value: out };
}

export function decodeIntroductionConfirmCommandV1(value: unknown): IntroductionDecodeResultV1<IntroductionConfirmCommandV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = checkEnvelope(value, ['schemaVersion', 'code'], ['code']);
  if (bad) return bad;
  if (typeof value.code !== 'string') return fail('invalid_type', 'code');
  if (value.code.length < INTRODUCTION_LIMITS_V1.codeMin || value.code.length > INTRODUCTION_LIMITS_V1.codeMax || !CODE.test(value.code)) return fail('invalid_value', 'code');
  return { ok: true, value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, code: value.code } };
}

function decodePartyView(value: unknown, field: 'b' | 'c', kinds: readonly string[]): IntroductionDecodeResultV1<IntroductionPartyViewV1> {
  if (!isRecord(value)) return fail('invalid_type', field);
  for (const key of Object.keys(value)) if (key !== 'kind' && key !== 'displayName') return fail('unknown_field', `${field}.${key}`);
  for (const key of ['kind', 'displayName']) if (value[key] === undefined) return fail('missing_field', `${field}.${key}`);
  if (typeof value.kind !== 'string') return fail('invalid_type', `${field}.kind`);
  if (!kinds.includes(value.kind)) return fail('invalid_value', `${field}.kind`);
  let displayName: string | null = null;
  if (value.displayName !== null) {
    const name = decodeText(value.displayName, `${field}.displayName`, 100);
    if (name.ok === false) return name;
    displayName = name.value;
  }
  return { ok: true, value: { kind: value.kind as IntroductionPartyViewV1['kind'], displayName } };
}

export function decodeIntroductionV1(value: unknown): IntroductionDecodeResultV1<IntroductionV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const keys = ['id', 'agentId', 'b', 'c', 'purpose', 'shareBps', 'status', 'createdAt', 'expiresAt', 'activatedAt'];
  const bad = checkEnvelope(value, ['schemaVersion', ...keys], keys);
  if (bad) return bad;
  if (typeof value.id !== 'string') return fail('invalid_type', 'id');
  if (!UUID.test(value.id)) return fail('invalid_value', 'id');
  if (typeof value.agentId !== 'string') return fail('invalid_type', 'agentId');
  if (!OPAQUE_ID.test(value.agentId)) return fail('invalid_value', 'agentId');
  const b = decodePartyView(value.b, 'b', INTRODUCTION_B_KINDS_V1);
  if (b.ok === false) return b;
  const c = decodePartyView(value.c, 'c', INTRODUCTION_C_KINDS_V1);
  if (c.ok === false) return c;
  const purpose = decodeText(value.purpose, 'purpose', INTRODUCTION_LIMITS_V1.purposeMax);
  if (purpose.ok === false) return purpose;
  if (typeof value.shareBps !== 'number') return fail('invalid_type', 'shareBps');
  if (!Number.isInteger(value.shareBps) || value.shareBps < 0 || value.shareBps > INTRODUCTION_SHARE_MAX_BPS_V1) return fail('invalid_value', 'shareBps');
  if (typeof value.status !== 'string') return fail('invalid_type', 'status');
  if (!isOneOf(INTRODUCTION_STATUSES_V1, value.status)) return fail('invalid_value', 'status');
  for (const key of ['createdAt', 'expiresAt']) {
    if (typeof value[key] !== 'string') return fail('invalid_type', key);
    if (!isIso(value[key])) return fail('invalid_value', key);
  }
  let activatedAt: string | null = null;
  if (value.activatedAt !== null) {
    if (typeof value.activatedAt !== 'string') return fail('invalid_type', 'activatedAt');
    if (!isIso(value.activatedAt)) return fail('invalid_value', 'activatedAt');
    activatedAt = value.activatedAt;
  }
  if ((value.status === 'active' || value.status === 'closed') !== (activatedAt !== null)) return fail('invalid_value', 'activatedAt');
  return {
    ok: true,
    value: {
      schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1,
      id: value.id,
      agentId: value.agentId,
      b: b.value,
      c: c.value,
      purpose: purpose.value,
      shareBps: value.shareBps,
      status: value.status,
      createdAt: value.createdAt as string,
      expiresAt: value.expiresAt as string,
      activatedAt,
    },
  };
}

export function decodeIntroductionReceiptClaimsV1(value: unknown): IntroductionDecodeResultV1<IntroductionReceiptClaimsV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const keys = ['iss', 'jti', 'iat', 'introduction_id', 'introducer_agent_id', 'b_ref', 'c_ref', 'share_bps', 'activated_at'];
  for (const key of Object.keys(value)) if (!keys.includes(key)) return fail('unknown_field', key);
  for (const key of keys) if (value[key] === undefined) return fail('missing_field', key);
  for (const key of ['iss', 'jti', 'introduction_id', 'introducer_agent_id', 'b_ref', 'c_ref', 'activated_at']) if (typeof value[key] !== 'string') return fail('invalid_type', key);
  if (!/^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d{1,5})?$/.test(value.iss as string)) return fail('invalid_value', 'iss');
  for (const key of ['jti', 'introducer_agent_id', 'b_ref', 'c_ref']) if (!OPAQUE_ID.test(value[key] as string)) return fail('invalid_value', key);
  if (!UUID.test(value.introduction_id as string)) return fail('invalid_value', 'introduction_id');
  if (!isIso(value.activated_at)) return fail('invalid_value', 'activated_at');
  if (typeof value.iat !== 'number') return fail('invalid_type', 'iat');
  if (!Number.isInteger(value.iat) || value.iat < 1) return fail('invalid_value', 'iat');
  if (typeof value.share_bps !== 'number') return fail('invalid_type', 'share_bps');
  if (!Number.isInteger(value.share_bps) || value.share_bps < 0 || value.share_bps > INTRODUCTION_SHARE_MAX_BPS_V1) return fail('invalid_value', 'share_bps');
  return { ok: true, value: Object.fromEntries(keys.map((key) => [key, value[key]])) as unknown as IntroductionReceiptClaimsV1 };
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// L9（coord 10-31，E145）：客户先同意（P1-1）、B 免登录接收（P1-2）、按人名单（P1-0）。
//
// 上面的旧契约一个字都没动：旧状态集、旧转移表、旧解码函数照旧，开关关着时旧路径逐字节一样。
// 新流程的顺序：proposed → c_consented（客户在同意页自己输入联系方式并同意）→ a_approved（A 批准）→ active
// （B 接受，联系方式此刻才给 B）。另有 c_declined（客户不同意）、withdrawn（客户撤回或删除）。
// 开关：`INTRODUCTIONS_CUSTOMER_FIRST_V1_ENABLED`（P1-1）、`INTRODUCTIONS_GUEST_B_V1_ENABLED`（P1-2），都要在
// `INTRODUCTIONS_V1_ENABLED` 开着的前提下才生效，只认精确的 `'1'`，默认关。分成在新流程里恒为 0。
// 免登录接口一律用 POST 加请求体里的令牌，令牌不进网址，不进访问日志；失效、不存在、格式不对统一 404。
// ═══════════════════════════════════════════════════════════════════════════════════════

export const INTRODUCTIONS_CUSTOMER_FIRST_FLAG_V1 = 'INTRODUCTIONS_CUSTOMER_FIRST_V1_ENABLED';
export const INTRODUCTIONS_GUEST_B_FLAG_V1 = 'INTRODUCTIONS_GUEST_B_V1_ENABLED';

/** 同意页文案版本；客户同意时服务端记下，换文案时改这个值。 */
export const INTRODUCTION_CONSENT_VERSION_V1 = '2026-10-31.1';

export const INTRODUCTION_CUSTOMER_FIRST_STATUSES_V1 = ['c_consented', 'a_approved', 'c_declined', 'withdrawn'] as const;
/** 旧状态加新状态。数据库 CHECK（迁移 2190）就是这一份，列宽 varchar(12) 不变。 */
export const INTRODUCTION_ALL_STATUSES_V1 = [...INTRODUCTION_STATUSES_V1, ...INTRODUCTION_CUSTOMER_FIRST_STATUSES_V1] as const;
export type IntroductionAnyStatusV1 = (typeof INTRODUCTION_ALL_STATUSES_V1)[number];

/** B 的种类加 `guest`：没有账号的同行，凭接收链接答复（迁移 2191）。 */
export const INTRODUCTION_ALL_B_KINDS_V1 = [...INTRODUCTION_B_KINDS_V1, 'guest'] as const;
export type IntroductionAnyBKindV1 = (typeof INTRODUCTION_ALL_B_KINDS_V1)[number];

export const INTRODUCTION_FLOWS_V1 = ['legacy', 'customer_first'] as const;
export type IntroductionFlowV1 = (typeof INTRODUCTION_FLOWS_V1)[number];

/** 新流程的转移表。`declined` 是 A 不批准或 B 婉拒；`c_declined`、`withdrawn` 是客户一侧的终点。 */
export const INTRODUCTION_CUSTOMER_FIRST_TRANSITIONS_V1: Readonly<Record<IntroductionAnyStatusV1, readonly IntroductionAnyStatusV1[]>> = {
  proposed: ['c_consented', 'c_declined', 'expired'],
  c_consented: ['a_approved', 'declined', 'withdrawn', 'expired'],
  a_approved: ['active', 'declined', 'withdrawn', 'expired'],
  active: ['closed', 'withdrawn'],
  closed: [],
  declined: [],
  expired: [],
  c_declined: [],
  withdrawn: [],
  b_accepted: [],
  c_accepted: [],
};

export function introductionCanTransitionCustomerFirstV1(from: IntroductionAnyStatusV1, to: IntroductionAnyStatusV1): boolean {
  return (INTRODUCTION_CUSTOMER_FIRST_TRANSITIONS_V1[from] ?? []).includes(to);
}

/** 联系方式种类：邮件，或手机（含 WhatsApp 号）。 */
export const INTRODUCTION_CONTACT_KINDS_V1 = ['email', 'phone'] as const;
export type IntroductionContactKindV1 = (typeof INTRODUCTION_CONTACT_KINDS_V1)[number];
export interface IntroductionContactV1 {
  kind: IntroductionContactKindV1;
  /** 邮件：小写；手机：E.164（`+` 加国家码，总长 8 至 15 位）。 */
  value: string;
}

export const INTRODUCTION_NEED_CATEGORIES_V1 = [
  'education',
  'events',
  'photo_video',
  'design',
  'home_services',
  'beauty',
  'fitness',
  'food',
  'tech',
  'business',
  'moving',
  'other',
] as const;
export type IntroductionNeedCategoryV1 = (typeof INTRODUCTION_NEED_CATEGORIES_V1)[number];
export const INTRODUCTION_NEED_REGIONS_V1 = ['sg_central', 'sg_east', 'sg_west', 'sg_south', 'sg_north', 'online'] as const;
export type IntroductionNeedRegionV1 = (typeof INTRODUCTION_NEED_REGIONS_V1)[number];
export const INTRODUCTION_NEED_WINDOWS_V1 = ['this_week', 'two_weeks', 'one_month', 'not_urgent'] as const;
export type IntroductionNeedWindowV1 = (typeof INTRODUCTION_NEED_WINDOWS_V1)[number];

export const INTRODUCTION_CUSTOMER_FIRST_LIMITS_V1 = {
  needNoteMax: 140,
  retentionDays: 90,
  /** B 接收链接的有效期：A 批准后 14 天。 */
  guestExpiryDays: 14,
  displayNameMax: 100,
  /** 每令牌每分钟。 */
  tokenPerMinute: 30,
  /** 每网络地址每分钟（所有免登录接口合计）。 */
  ipPerMinute: 60,
  /** 同意接口：每网络地址每小时。 */
  consentPerIpPerHour: 10,
  /** 同一个联系方式 24 小时内对同一个 A 的同意请求。 */
  consentPerContactPerOwnerPerDay: 2,
  /** 每个 A 每天的新提议。 */
  proposalsPerOwnerPerDay: 20,
} as const;

/** 免登录令牌：32 字节随机的 base64url，43 个字符。格式不对的直接当作不存在。 */
export const INTRODUCTION_PUBLIC_TOKEN_PATTERN_V1 = /^[A-Za-z0-9_-]{43}$/;

export const INTRODUCTION_CUSTOMER_FIRST_REASON_CODES_V1 = [
  'contact_invalid_email',
  'contact_invalid_phone',
  'need_note_too_long',
  /** 一句话里有明显的姓名、学校、号码或链接。 */
  'need_note_personal',
  'consent_version_mismatch',
] as const;
export type IntroductionAnyReasonCodeV1 = IntroductionReasonCodeV1 | (typeof INTRODUCTION_CUSTOMER_FIRST_REASON_CODES_V1)[number];
export type IntroductionCfDecodeResultV1<T> =
  | { ok: true; value: T }
  | { ok: false; reasonCode: IntroductionAnyReasonCodeV1; field: string };

function failCf(reasonCode: IntroductionAnyReasonCodeV1, field: string): { ok: false; reasonCode: IntroductionAnyReasonCodeV1; field: string } {
  return { ok: false, reasonCode, field };
}

// ── 联系方式 ────────────────────────────────────────────────────────────────────────

const E164 = /^\+[1-9]\d{7,14}$/;
const SG_MOBILE_OR_LANDLINE = /^\+65[3689]\d{7}$/;

/**
 * 校验并规范化一个联系方式。手机先去掉空格、横线、括号和点，再按 E.164；新加坡 `+65` 后必须正好 8 位。
 * 邮件转小写、≤254 字符。出错只给原因码和字段名，页面按当前语言写人话。
 */
export function normalizeIntroductionContactV1(kind: unknown, raw: unknown, field = 'contact'): IntroductionCfDecodeResultV1<IntroductionContactV1> {
  if (typeof kind !== 'string') return failCf('invalid_type', `${field}.kind`);
  if (!isOneOf(INTRODUCTION_CONTACT_KINDS_V1, kind)) return failCf('invalid_value', `${field}.kind`);
  if (typeof raw !== 'string') return failCf('invalid_type', `${field}.value`);
  if (kind === 'email') {
    const email = raw.trim().toLowerCase();
    if (email.length === 0 || email.length > INTRODUCTION_LIMITS_V1.emailMax || !EMAIL.test(email) || CONTROL.test(email) || /\s/.test(email)) {
      return failCf('contact_invalid_email', `${field}.value`);
    }
    return { ok: true, value: { kind, value: email } };
  }
  const phone = raw.replace(/[\s\-().]/g, '');
  if (!E164.test(phone) || (phone.startsWith('+65') && !SG_MOBILE_OR_LANDLINE.test(phone))) return failCf('contact_invalid_phone', `${field}.value`);
  return { ok: true, value: { kind, value: phone } };
}

export function decodeIntroductionContactV1(value: unknown, field = 'contact'): IntroductionCfDecodeResultV1<IntroductionContactV1> {
  if (!isRecord(value)) return failCf('invalid_type', field);
  for (const key of Object.keys(value)) if (key !== 'kind' && key !== 'value') return failCf('unknown_field', `${field}.${key}`);
  for (const key of ['kind', 'value']) if (value[key] === undefined) return failCf('missing_field', `${field}.${key}`);
  return normalizeIntroductionContactV1(value.kind, value.value, field);
}

// ── 需求卡 ──────────────────────────────────────────────────────────────────────────

export interface IntroductionNeedCardV1 {
  category: IntroductionNeedCategoryV1;
  region: IntroductionNeedRegionV1;
  window: IntroductionNeedWindowV1;
  /** 一句话，≤140 字，超出服务端拒绝，不静默截断。 */
  note: string;
}

const NOTE_PERSONAL_PATTERNS: readonly RegExp[] = [
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/i,
  /\b[a-z][a-z0-9+.-]*:\/\/\S+/i,
  /\bwww\.\S+/i,
  /\b(?:my|our)\s+(?:son|daughter|child|kid|boy|girl)\s*(?:is|,|named|called)?\s*(?!(?:Primary|Secondary|Sec|Pri|JC|Year|Grade)\b)[A-Z][a-z]{1,}/,
  /\b(?:name\s+is|named|called)\s+[A-Z][a-z]{1,}/,
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\s+(?:Primary|Secondary|Junior College|Polytechnic|International School|High School|Kindergarten)\b/,
  /(?:孩子|儿子|女儿|小孩|宝宝|学生)\s*(?:叫|名叫|名字是|姓名是)\s*[\u4e00-\u9fa5]{2,4}/,
  /我\s*(?:叫|名叫|名字是)\s*[\u4e00-\u9fa5]{2,4}/,
  /[\u4e00-\u9fa5]{2,}(?:小学|中学|学校|书院|幼儿园|学院|初中|高中)/,
];

/** 一句话里有没有明显的姓名、学校、号码、链接模式。尽力而为，不保证；误报比漏报好。 */
export function introductionNeedNoteHasPersonalDataV1(note: string): boolean {
  if (NOTE_PERSONAL_PATTERNS.some((pattern) => pattern.test(note))) return true;
  // 8 位以上的数字串（可夹空格、横线、括号）像电话号码；先去掉日期，免得「2026-11-05」被当成号码。
  const withoutDates = note.replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, ' ').replace(/\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/g, ' ');
  return /(?:\+?\d[\s\-().]?){8,}/.test(withoutDates);
}

export function decodeIntroductionNeedCardV1(value: unknown, field = 'needCard'): IntroductionCfDecodeResultV1<IntroductionNeedCardV1> {
  if (!isRecord(value)) return failCf('invalid_type', field);
  for (const key of Object.keys(value)) if (!['category', 'region', 'window', 'note'].includes(key)) return failCf('unknown_field', `${field}.${key}`);
  for (const key of ['category', 'region', 'window', 'note']) if (value[key] === undefined) return failCf('missing_field', `${field}.${key}`);
  if (typeof value.category !== 'string') return failCf('invalid_type', `${field}.category`);
  if (!isOneOf(INTRODUCTION_NEED_CATEGORIES_V1, value.category)) return failCf('invalid_value', `${field}.category`);
  if (typeof value.region !== 'string') return failCf('invalid_type', `${field}.region`);
  if (!isOneOf(INTRODUCTION_NEED_REGIONS_V1, value.region)) return failCf('invalid_value', `${field}.region`);
  if (typeof value.window !== 'string') return failCf('invalid_type', `${field}.window`);
  if (!isOneOf(INTRODUCTION_NEED_WINDOWS_V1, value.window)) return failCf('invalid_value', `${field}.window`);
  if (typeof value.note !== 'string') return failCf('invalid_type', `${field}.note`);
  const note = value.note.trim();
  if (note.length === 0 || CONTROL.test(note)) return failCf('invalid_value', `${field}.note`);
  if (Array.from(note).length > INTRODUCTION_CUSTOMER_FIRST_LIMITS_V1.needNoteMax) return failCf('need_note_too_long', `${field}.note`);
  if (introductionNeedNoteHasPersonalDataV1(note)) return failCf('need_note_personal', `${field}.note`);
  return { ok: true, value: { category: value.category, region: value.region, window: value.window, note } };
}

/** 新流程写进 `purpose` 的文字（≤500，不改列）。页面不显示它，页面按结构化字段按当前语言写。 */
export function introductionNeedCardTextV1(card: IntroductionNeedCardV1): string {
  return `${card.category} | ${card.region} | ${card.window} | ${card.note}`.slice(0, INTRODUCTION_LIMITS_V1.purposeMax);
}

// ── 命令 ────────────────────────────────────────────────────────────────────────────

/** B：已有账号的 Agent 或主人，或没有账号的同行（`guest`，`ref` 是同行名单条目 id，联系方式用来通知他）。 */
export type IntroductionCfBPartyV1 =
  | { kind: 'agent'; ref: string }
  /** `displayName`（可选，L9 B 线）：同行名单里 B 同意被提及的那个名字；有账号的同行也要在客户同意页上写明转给谁。 */
  | { kind: 'owner'; ref: string; displayName?: string }
  | { kind: 'guest'; ref: string; displayName: string; contact: IntroductionContactV1 };

/** A（或 A 的分身）提议。属主由服务端从登录态取；客户的联系方式不在这里，客户自己在同意页输入。 */
export interface IntroductionCfProposalInputV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  agentId: string;
  b: IntroductionCfBPartyV1;
  needCard: IntroductionNeedCardV1;
}

function decodeCfB(value: unknown): IntroductionCfDecodeResultV1<IntroductionCfBPartyV1> {
  if (!isRecord(value)) return failCf('invalid_type', 'b');
  if (value.kind === undefined) return failCf('missing_field', 'b.kind');
  if (typeof value.kind !== 'string') return failCf('invalid_type', 'b.kind');
  if (!isOneOf(INTRODUCTION_ALL_B_KINDS_V1, value.kind)) return failCf('invalid_value', 'b.kind');
  const allowed = value.kind === 'guest' ? ['kind', 'ref', 'displayName', 'contact'] : value.kind === 'owner' ? ['kind', 'ref', 'displayName'] : ['kind', 'ref'];
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return failCf('unknown_field', `b.${key}`);
  // `displayName` is optional on an owner-kind B only.
  for (const key of allowed) if (value[key] === undefined && !(value.kind === 'owner' && key === 'displayName')) return failCf('missing_field', `b.${key}`);
  if (typeof value.ref !== 'string') return failCf('invalid_type', 'b.ref');
  if (!OPAQUE_ID.test(value.ref) || value.ref.length > 80) return failCf('invalid_value', 'b.ref');
  if (value.kind === 'owner' && value.displayName !== undefined) {
    const ownerName = decodeText(value.displayName, 'b.displayName', INTRODUCTION_CUSTOMER_FIRST_LIMITS_V1.displayNameMax);
    if (ownerName.ok === false) return ownerName;
    return { ok: true, value: { kind: 'owner', ref: value.ref, displayName: ownerName.value } };
  }
  if (value.kind === 'owner') return { ok: true, value: { kind: 'owner', ref: value.ref } };
  if (value.kind === 'agent') return { ok: true, value: { kind: 'agent', ref: value.ref } };
  const name = decodeText(value.displayName, 'b.displayName', INTRODUCTION_CUSTOMER_FIRST_LIMITS_V1.displayNameMax);
  if (name.ok === false) return name;
  const contact = decodeIntroductionContactV1(value.contact, 'b.contact');
  if (contact.ok === false) return contact;
  return { ok: true, value: { kind: 'guest', ref: value.ref, displayName: name.value, contact: contact.value } };
}

export function decodeIntroductionCfProposalInputV1(value: unknown): IntroductionCfDecodeResultV1<IntroductionCfProposalInputV1> {
  if (!isRecord(value)) return failCf('invalid_type', '$');
  const bad = checkEnvelope(value, ['schemaVersion', 'agentId', 'b', 'needCard'], ['agentId', 'b', 'needCard']);
  if (bad) return bad;
  if (typeof value.agentId !== 'string') return failCf('invalid_type', 'agentId');
  if (!OPAQUE_ID.test(value.agentId)) return failCf('invalid_value', 'agentId');
  const b = decodeCfB(value.b);
  if (b.ok === false) return b;
  const needCard = decodeIntroductionNeedCardV1(value.needCard);
  if (needCard.ok === false) return needCard;
  return { ok: true, value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, agentId: value.agentId, b: b.value, needCard: needCard.value } };
}

function decodeToken(value: Record<string, unknown>): IntroductionCfDecodeResultV1<string> {
  if (typeof value.token !== 'string') return failCf('invalid_type', 'token');
  if (!INTRODUCTION_PUBLIC_TOKEN_PATTERN_V1.test(value.token)) return failCf('invalid_value', 'token');
  return { ok: true, value: value.token };
}

/** 只带令牌的免登录请求：同意页预览、状态页、撤回、删除、B 接收页预览。 */
export interface IntroductionPublicTokenCommandV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  token: string;
}

export function decodeIntroductionPublicTokenCommandV1(value: unknown): IntroductionCfDecodeResultV1<IntroductionPublicTokenCommandV1> {
  if (!isRecord(value)) return failCf('invalid_type', '$');
  const bad = checkEnvelope(value, ['schemaVersion', 'token'], ['token']);
  if (bad) return bad;
  const token = decodeToken(value);
  if (token.ok === false) return token;
  return { ok: true, value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, token: token.value } };
}

/** 客户在同意页同意或不同意。同意要带联系方式和文案版本；不同意不许带。 */
export type IntroductionConsentCommandV1 =
  | { schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1; token: string; decision: 'consent'; contact: IntroductionContactV1; consentVersion: string }
  | { schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1; token: string; decision: 'decline' };

export function decodeIntroductionConsentCommandV1(value: unknown): IntroductionCfDecodeResultV1<IntroductionConsentCommandV1> {
  if (!isRecord(value)) return failCf('invalid_type', '$');
  const bad = checkEnvelope(value, ['schemaVersion', 'token', 'decision', 'contact', 'consentVersion'], ['token', 'decision']);
  if (bad) return bad;
  const token = decodeToken(value);
  if (token.ok === false) return token;
  if (typeof value.decision !== 'string') return failCf('invalid_type', 'decision');
  if (value.decision === 'decline') {
    if (value.contact !== undefined) return failCf('decision_mismatch', 'contact');
    if (value.consentVersion !== undefined) return failCf('decision_mismatch', 'consentVersion');
    return { ok: true, value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, token: token.value, decision: 'decline' } };
  }
  if (value.decision !== 'consent') return failCf('invalid_value', 'decision');
  if (value.contact === undefined) return failCf('decision_mismatch', 'contact');
  if (value.consentVersion === undefined) return failCf('decision_mismatch', 'consentVersion');
  if (typeof value.consentVersion !== 'string') return failCf('invalid_type', 'consentVersion');
  if (value.consentVersion !== INTRODUCTION_CONSENT_VERSION_V1) return failCf('consent_version_mismatch', 'consentVersion');
  const contact = decodeIntroductionContactV1(value.contact);
  if (contact.ok === false) return contact;
  return {
    ok: true,
    value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, token: token.value, decision: 'consent', contact: contact.value, consentVersion: value.consentVersion },
  };
}

/** B 在接收页答复（免登录）。 */
export interface IntroductionGuestDecisionCommandV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  token: string;
  decision: IntroductionDecisionV1;
}

export function decodeIntroductionGuestDecisionCommandV1(value: unknown): IntroductionCfDecodeResultV1<IntroductionGuestDecisionCommandV1> {
  if (!isRecord(value)) return failCf('invalid_type', '$');
  const bad = checkEnvelope(value, ['schemaVersion', 'token', 'decision'], ['token', 'decision']);
  if (bad) return bad;
  const token = decodeToken(value);
  if (token.ok === false) return token;
  if (typeof value.decision !== 'string') return failCf('invalid_type', 'decision');
  if (!isOneOf(INTRODUCTION_DECISIONS_V1, value.decision)) return failCf('invalid_value', 'decision');
  return { ok: true, value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, token: token.value, decision: value.decision } };
}

/** B 注册后认领一条账本：凭接收链接令牌，要登录。 */
export function decodeIntroductionClaimCommandV1(value: unknown): IntroductionCfDecodeResultV1<IntroductionPublicTokenCommandV1> {
  return decodeIntroductionPublicTokenCommandV1(value);
}

// ── 视图 ────────────────────────────────────────────────────────────────────────────

/** 客户在状态页看到的状态。撤回、删除之后链接失效（404），这里没有对应的值。 */
export const INTRODUCTION_CUSTOMER_STATES_V1 = ['waiting_approval', 'waiting_recipient', 'recipient_accepted', 'not_going_ahead', 'expired'] as const;
export type IntroductionCustomerStateV1 = (typeof INTRODUCTION_CUSTOMER_STATES_V1)[number];

export const INTRODUCTION_TIMELINE_KEYS_V1 = ['proposed', 'consented', 'received', 'replied'] as const;
export type IntroductionTimelineKeyV1 = (typeof INTRODUCTION_TIMELINE_KEYS_V1)[number];
export interface IntroductionTimelineStepV1 {
  key: IntroductionTimelineKeyV1;
  at: string | null;
}

/** 同意页预览：转给谁、给哪些字段、用来做什么、保留多久。不含任何第三方个人数据。 */
export interface IntroductionConsentPreviewV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  introducerName: string | null;
  recipientName: string | null;
  needCard: IntroductionNeedCardV1;
  consentVersion: string;
  retentionDays: number;
  expiresAt: string;
}

/** 同意成功后给客户的状态链接令牌，只出现这一次。 */
export interface IntroductionConsentResultV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  outcome: 'consented' | 'declined';
  statusToken: string | null;
}

export interface IntroductionStatusPageV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  state: IntroductionCustomerStateV1;
  timeline: IntroductionTimelineStepV1[];
  recipientName: string | null;
  needCard: IntroductionNeedCardV1;
  contactKind: IntroductionContactKindV1 | null;
  retentionExpiresAt: string;
}

export interface IntroductionWithdrawResultV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  outcome: 'withdrawn' | 'deleted';
}

/** B 接收页：只看匿名需求卡和 A 的显示名；接受之后才有联系方式。 */
export type IntroductionReceiveStateV1 = 'pending' | 'accepted' | 'declined';
export interface IntroductionReceivePageV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  state: IntroductionReceiveStateV1;
  introducerName: string | null;
  needCard: IntroductionNeedCardV1;
  expiresAt: string;
  contact: IntroductionContactV1 | null;
  /**
   * 接受之后才有：客户状态页的链接（客户的撤回、删除入口）。不做邮件验证，所以 B 联系客户的第一条消息必须带它，
   * 写明来源和撤回方式；号主可以在那里一键删除（「这不是我」）。接受之前和婉拒之后为 null。
   */
  noticeUrl: string | null;
  /**
   * L9 P1-7（C2 线）：B 接受之后，接收页要不要给「给自己做一张名片」。只在 `INTRODUCTION_BUILD_CARD_V1_ENABLED` 开着、
   * 页面处于已接受状态时才有这个键；开关关着或没接受时没有这个键，页面和今天逐字节一样。只有一个布尔和一个类别枚举，
   * 不说名单，不说转介人是谁（形状同 `shared/types/introduction-build-card.ts` 的 `IntroductionBuildCardOfferV1`，
   * 这里内联是为了不让两个文件互相引用）。
   */
  buildCard?: { schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1; available: boolean; seedCategory: IntroductionNeedCategoryV1 | null };
}

/** A 一侧通知 B 的状态：已发出、邮件待发（邮件配置没齐）、WhatsApp 由 A 本人点发。 */
export const INTRODUCTION_NOTICE_STATES_V1 = ['none', 'sent', 'pending_email', 'whatsapp_link'] as const;
export type IntroductionNoticeStateV1 = (typeof INTRODUCTION_NOTICE_STATES_V1)[number];

/** A 和有账号的 B 在列表里看到的一条新流程引荐。不含联系方式；B 接受后另有只读接口取。 */
export interface IntroductionCfViewV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  id: string;
  agentId: string;
  role: 'introducer' | 'introduced';
  status: IntroductionAnyStatusV1;
  b: { kind: IntroductionAnyBKindV1; displayName: string | null };
  needCard: IntroductionNeedCardV1;
  createdAt: string;
  expiresAt: string;
  consentedAt: string | null;
  approvedAt: string | null;
  noticeSentAt: string | null;
  decidedAt: string | null;
  notice: IntroductionNoticeStateV1;
  contactAvailable: boolean;
}

/** A 批准的结果：B 接收链接只在这里出现一次（只存哈希）；WhatsApp 号的 `waLink` 由 A 本人点发。 */
export interface IntroductionApproveResultV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  introduction: IntroductionCfViewV1;
  receiveToken: string | null;
  receiveUrl: string | null;
  waLink: string | null;
}

/** 接受之后给有账号的 B 的联系方式。 */
export interface IntroductionContactViewV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  introductionId: string;
  contact: IntroductionContactV1;
  /** 同 `IntroductionReceivePageV1.noticeUrl`：B 的第一条消息要带的客户状态页链接。 */
  noticeUrl: string;
}

function decodeIsoOrNull(value: unknown, field: string): IntroductionCfDecodeResultV1<string | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return failCf('invalid_type', field);
  if (!isIso(value)) return failCf('invalid_value', field);
  return { ok: true, value };
}

function decodeIsoRequired(value: unknown, field: string): IntroductionCfDecodeResultV1<string> {
  if (typeof value !== 'string') return failCf('invalid_type', field);
  if (!isIso(value)) return failCf('invalid_value', field);
  return { ok: true, value };
}

function decodeNameOrNull(value: unknown, field: string): IntroductionCfDecodeResultV1<string | null> {
  if (value === null) return { ok: true, value: null };
  return decodeText(value, field, INTRODUCTION_CUSTOMER_FIRST_LIMITS_V1.displayNameMax);
}

function strictRecord(value: unknown, keys: readonly string[]): IntroductionCfDecodeResultV1<Record<string, unknown>> {
  if (!isRecord(value)) return failCf('invalid_type', '$');
  const bad = checkEnvelope(value, ['schemaVersion', ...keys], keys);
  if (bad) return bad;
  return { ok: true, value };
}

export function decodeIntroductionConsentPreviewV1(value: unknown): IntroductionCfDecodeResultV1<IntroductionConsentPreviewV1> {
  const rec = strictRecord(value, ['introducerName', 'recipientName', 'needCard', 'consentVersion', 'retentionDays', 'expiresAt']);
  if (rec.ok === false) return rec;
  const v = rec.value;
  const introducerName = decodeNameOrNull(v.introducerName, 'introducerName');
  if (introducerName.ok === false) return introducerName;
  const recipientName = decodeNameOrNull(v.recipientName, 'recipientName');
  if (recipientName.ok === false) return recipientName;
  const needCard = decodeIntroductionNeedCardV1(v.needCard);
  if (needCard.ok === false) return needCard;
  if (typeof v.consentVersion !== 'string') return failCf('invalid_type', 'consentVersion');
  if (typeof v.retentionDays !== 'number') return failCf('invalid_type', 'retentionDays');
  if (!Number.isInteger(v.retentionDays) || v.retentionDays < 1 || v.retentionDays > 365) return failCf('invalid_value', 'retentionDays');
  const expiresAt = decodeIsoRequired(v.expiresAt, 'expiresAt');
  if (expiresAt.ok === false) return expiresAt;
  return {
    ok: true,
    value: {
      schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1,
      introducerName: introducerName.value,
      recipientName: recipientName.value,
      needCard: needCard.value,
      consentVersion: v.consentVersion,
      retentionDays: v.retentionDays,
      expiresAt: expiresAt.value,
    },
  };
}

export function decodeIntroductionConsentResultV1(value: unknown): IntroductionCfDecodeResultV1<IntroductionConsentResultV1> {
  const rec = strictRecord(value, ['outcome', 'statusToken']);
  if (rec.ok === false) return rec;
  const v = rec.value;
  if (v.outcome !== 'consented' && v.outcome !== 'declined') return failCf('invalid_value', 'outcome');
  let statusToken: string | null = null;
  if (v.statusToken !== null) {
    if (typeof v.statusToken !== 'string') return failCf('invalid_type', 'statusToken');
    if (!INTRODUCTION_PUBLIC_TOKEN_PATTERN_V1.test(v.statusToken)) return failCf('invalid_value', 'statusToken');
    statusToken = v.statusToken;
  }
  if ((v.outcome === 'consented') !== (statusToken !== null)) return failCf('invalid_value', 'statusToken');
  return { ok: true, value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, outcome: v.outcome, statusToken } };
}

export function decodeIntroductionStatusPageV1(value: unknown): IntroductionCfDecodeResultV1<IntroductionStatusPageV1> {
  const rec = strictRecord(value, ['state', 'timeline', 'recipientName', 'needCard', 'contactKind', 'retentionExpiresAt']);
  if (rec.ok === false) return rec;
  const v = rec.value;
  if (typeof v.state !== 'string') return failCf('invalid_type', 'state');
  if (!isOneOf(INTRODUCTION_CUSTOMER_STATES_V1, v.state)) return failCf('invalid_value', 'state');
  if (!Array.isArray(v.timeline) || v.timeline.length !== INTRODUCTION_TIMELINE_KEYS_V1.length) return failCf('invalid_value', 'timeline');
  const timeline: IntroductionTimelineStepV1[] = [];
  for (let i = 0; i < v.timeline.length; i += 1) {
    const step: unknown = v.timeline[i];
    if (!isRecord(step)) return failCf('invalid_type', `timeline.${i}`);
    for (const key of Object.keys(step)) if (key !== 'key' && key !== 'at') return failCf('unknown_field', `timeline.${i}.${key}`);
    if (step.key !== INTRODUCTION_TIMELINE_KEYS_V1[i]) return failCf('invalid_value', `timeline.${i}.key`);
    const at = decodeIsoOrNull(step.at, `timeline.${i}.at`);
    if (at.ok === false) return at;
    timeline.push({ key: INTRODUCTION_TIMELINE_KEYS_V1[i], at: at.value });
  }
  const recipientName = decodeNameOrNull(v.recipientName, 'recipientName');
  if (recipientName.ok === false) return recipientName;
  const needCard = decodeIntroductionNeedCardV1(v.needCard);
  if (needCard.ok === false) return needCard;
  let contactKind: IntroductionContactKindV1 | null = null;
  if (v.contactKind !== null) {
    if (typeof v.contactKind !== 'string') return failCf('invalid_type', 'contactKind');
    if (!isOneOf(INTRODUCTION_CONTACT_KINDS_V1, v.contactKind)) return failCf('invalid_value', 'contactKind');
    contactKind = v.contactKind;
  }
  const retentionExpiresAt = decodeIsoRequired(v.retentionExpiresAt, 'retentionExpiresAt');
  if (retentionExpiresAt.ok === false) return retentionExpiresAt;
  return {
    ok: true,
    value: {
      schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1,
      state: v.state,
      timeline,
      recipientName: recipientName.value,
      needCard: needCard.value,
      contactKind,
      retentionExpiresAt: retentionExpiresAt.value,
    },
  };
}

export function decodeIntroductionWithdrawResultV1(value: unknown): IntroductionCfDecodeResultV1<IntroductionWithdrawResultV1> {
  const rec = strictRecord(value, ['outcome']);
  if (rec.ok === false) return rec;
  if (rec.value.outcome !== 'withdrawn' && rec.value.outcome !== 'deleted') return failCf('invalid_value', 'outcome');
  return { ok: true, value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, outcome: rec.value.outcome } };
}

/** L9 P1-7：接收页上可选的 `buildCard`；形状不对就整页解码失败。 */
function decodeReceiveBuildCardV1(value: unknown): IntroductionCfDecodeResultV1<NonNullable<IntroductionReceivePageV1['buildCard']>> {
  if (!isRecord(value)) return failCf('invalid_type', 'buildCard');
  for (const key of Object.keys(value)) if (!['schemaVersion', 'available', 'seedCategory'].includes(key)) return failCf('unknown_field', `buildCard.${key}`);
  if (value.schemaVersion !== undefined && value.schemaVersion !== INTRODUCTION_SCHEMA_VERSION_V1) return failCf('unsupported_schema_version', 'buildCard.schemaVersion');
  if (typeof value.available !== 'boolean') return failCf(value.available === undefined ? 'missing_field' : 'invalid_type', 'buildCard.available');
  if (value.seedCategory === undefined) return failCf('missing_field', 'buildCard.seedCategory');
  if (value.seedCategory !== null && !(typeof value.seedCategory === 'string' && isOneOf(INTRODUCTION_NEED_CATEGORIES_V1, value.seedCategory))) return failCf('invalid_value', 'buildCard.seedCategory');
  if (value.available === false && value.seedCategory !== null) return failCf('invalid_value', 'buildCard.seedCategory');
  return { ok: true, value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, available: value.available, seedCategory: value.seedCategory as IntroductionNeedCategoryV1 | null } };
}

export function decodeIntroductionReceivePageV1(input: unknown): IntroductionCfDecodeResultV1<IntroductionReceivePageV1> {
  // `buildCard` is the one optional key (L9 P1-7): take it out, decode it on its own, and check the rest as before.
  let buildCard: IntroductionReceivePageV1['buildCard'];
  let value: unknown = input;
  if (isRecord(input) && 'buildCard' in input) {
    const { buildCard: raw, ...rest } = input;
    const offer = decodeReceiveBuildCardV1(raw);
    if (offer.ok === false) return offer;
    buildCard = offer.value;
    value = rest;
  }
  const rec = strictRecord(value, ['state', 'introducerName', 'needCard', 'expiresAt', 'contact', 'noticeUrl']);
  if (rec.ok === false) return rec;
  const v = rec.value;
  if (v.state !== 'pending' && v.state !== 'accepted' && v.state !== 'declined') return failCf('invalid_value', 'state');
  let noticeUrl: string | null = null;
  if (v.noticeUrl !== null) {
    if (typeof v.noticeUrl !== 'string') return failCf('invalid_type', 'noticeUrl');
    if (!/^https?:\/\//.test(v.noticeUrl)) return failCf('invalid_value', 'noticeUrl');
    noticeUrl = v.noticeUrl;
  }
  const introducerName = decodeNameOrNull(v.introducerName, 'introducerName');
  if (introducerName.ok === false) return introducerName;
  const needCard = decodeIntroductionNeedCardV1(v.needCard);
  if (needCard.ok === false) return needCard;
  const expiresAt = decodeIsoRequired(v.expiresAt, 'expiresAt');
  if (expiresAt.ok === false) return expiresAt;
  let contact: IntroductionContactV1 | null = null;
  if (v.contact !== null) {
    const decoded = decodeIntroductionContactV1(v.contact);
    if (decoded.ok === false) return decoded;
    contact = decoded.value;
  }
  // 接受之前、或婉拒之后，页面上不能有联系方式。
  if ((v.state === 'accepted') !== (contact !== null)) return failCf('invalid_value', 'contact');
  // 联系方式和客户状态页链接一起出现、一起消失：给了联系方式就一定带着撤回入口。
  if ((contact !== null) !== (noticeUrl !== null)) return failCf('invalid_value', 'noticeUrl');
  return {
    ok: true,
    value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, state: v.state, introducerName: introducerName.value, needCard: needCard.value, expiresAt: expiresAt.value, contact, noticeUrl, ...(buildCard ? { buildCard } : {}) },
  };
}

export function decodeIntroductionCfViewV1(value: unknown): IntroductionCfDecodeResultV1<IntroductionCfViewV1> {
  const keys = ['id', 'agentId', 'role', 'status', 'b', 'needCard', 'createdAt', 'expiresAt', 'consentedAt', 'approvedAt', 'noticeSentAt', 'decidedAt', 'notice', 'contactAvailable'];
  const rec = strictRecord(value, keys);
  if (rec.ok === false) return rec;
  const v = rec.value;
  if (typeof v.id !== 'string') return failCf('invalid_type', 'id');
  if (!UUID.test(v.id)) return failCf('invalid_value', 'id');
  if (typeof v.agentId !== 'string') return failCf('invalid_type', 'agentId');
  if (!OPAQUE_ID.test(v.agentId)) return failCf('invalid_value', 'agentId');
  if (v.role !== 'introducer' && v.role !== 'introduced') return failCf('invalid_value', 'role');
  if (typeof v.status !== 'string') return failCf('invalid_type', 'status');
  if (!isOneOf(INTRODUCTION_ALL_STATUSES_V1, v.status)) return failCf('invalid_value', 'status');
  if (!isRecord(v.b)) return failCf('invalid_type', 'b');
  for (const key of Object.keys(v.b)) if (key !== 'kind' && key !== 'displayName') return failCf('unknown_field', `b.${key}`);
  if (typeof v.b.kind !== 'string') return failCf('invalid_type', 'b.kind');
  if (!isOneOf(INTRODUCTION_ALL_B_KINDS_V1, v.b.kind)) return failCf('invalid_value', 'b.kind');
  const bName = decodeNameOrNull(v.b.displayName, 'b.displayName');
  if (bName.ok === false) return bName;
  const needCard = decodeIntroductionNeedCardV1(v.needCard);
  if (needCard.ok === false) return needCard;
  const createdAt = decodeIsoRequired(v.createdAt, 'createdAt');
  if (createdAt.ok === false) return createdAt;
  const expiresAt = decodeIsoRequired(v.expiresAt, 'expiresAt');
  if (expiresAt.ok === false) return expiresAt;
  const consentedAt = decodeIsoOrNull(v.consentedAt, 'consentedAt');
  if (consentedAt.ok === false) return consentedAt;
  const approvedAt = decodeIsoOrNull(v.approvedAt, 'approvedAt');
  if (approvedAt.ok === false) return approvedAt;
  const noticeSentAt = decodeIsoOrNull(v.noticeSentAt, 'noticeSentAt');
  if (noticeSentAt.ok === false) return noticeSentAt;
  const decidedAt = decodeIsoOrNull(v.decidedAt, 'decidedAt');
  if (decidedAt.ok === false) return decidedAt;
  if (typeof v.notice !== 'string') return failCf('invalid_type', 'notice');
  if (!isOneOf(INTRODUCTION_NOTICE_STATES_V1, v.notice)) return failCf('invalid_value', 'notice');
  if (typeof v.contactAvailable !== 'boolean') return failCf('invalid_type', 'contactAvailable');
  return {
    ok: true,
    value: {
      schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1,
      id: v.id,
      agentId: v.agentId,
      role: v.role,
      status: v.status,
      b: { kind: v.b.kind, displayName: bName.value },
      needCard: needCard.value,
      createdAt: createdAt.value,
      expiresAt: expiresAt.value,
      consentedAt: consentedAt.value,
      approvedAt: approvedAt.value,
      noticeSentAt: noticeSentAt.value,
      decidedAt: decidedAt.value,
      notice: v.notice,
      contactAvailable: v.contactAvailable,
    },
  };
}

export function decodeIntroductionApproveResultV1(value: unknown): IntroductionCfDecodeResultV1<IntroductionApproveResultV1> {
  const rec = strictRecord(value, ['introduction', 'receiveToken', 'receiveUrl', 'waLink']);
  if (rec.ok === false) return rec;
  const v = rec.value;
  const introduction = decodeIntroductionCfViewV1(v.introduction);
  if (introduction.ok === false) return introduction;
  let receiveToken: string | null = null;
  if (v.receiveToken !== null) {
    if (typeof v.receiveToken !== 'string') return failCf('invalid_type', 'receiveToken');
    if (!INTRODUCTION_PUBLIC_TOKEN_PATTERN_V1.test(v.receiveToken)) return failCf('invalid_value', 'receiveToken');
    receiveToken = v.receiveToken;
  }
  let receiveUrl: string | null = null;
  if (v.receiveUrl !== null) {
    if (typeof v.receiveUrl !== 'string') return failCf('invalid_type', 'receiveUrl');
    if (!/^https?:\/\//.test(v.receiveUrl)) return failCf('invalid_value', 'receiveUrl');
    receiveUrl = v.receiveUrl;
  }
  let waLink: string | null = null;
  if (v.waLink !== null) {
    if (typeof v.waLink !== 'string') return failCf('invalid_type', 'waLink');
    if (!v.waLink.startsWith('https://wa.me/')) return failCf('invalid_value', 'waLink');
    waLink = v.waLink;
  }
  return { ok: true, value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, introduction: introduction.value, receiveToken, receiveUrl, waLink } };
}

export function decodeIntroductionContactViewV1(value: unknown): IntroductionCfDecodeResultV1<IntroductionContactViewV1> {
  const rec = strictRecord(value, ['introductionId', 'contact', 'noticeUrl']);
  if (rec.ok === false) return rec;
  if (typeof rec.value.introductionId !== 'string') return failCf('invalid_type', 'introductionId');
  if (!UUID.test(rec.value.introductionId)) return failCf('invalid_value', 'introductionId');
  const contact = decodeIntroductionContactV1(rec.value.contact);
  if (contact.ok === false) return contact;
  if (typeof rec.value.noticeUrl !== 'string') return failCf('invalid_type', 'noticeUrl');
  if (!/^https?:\/\//.test(rec.value.noticeUrl)) return failCf('invalid_value', 'noticeUrl');
  return { ok: true, value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, introductionId: rec.value.introductionId, contact: contact.value, noticeUrl: rec.value.noticeUrl } };
}

// ── 路由、页面路径、令牌链接 ─────────────────────────────────────────────────────────────

/** 免登录接口（令牌放请求体，不放网址）。同意页预览、同意、状态页、撤回、删除、B 接收页预览、B 答复。 */
export const INTRODUCTION_PUBLIC_ROUTES_V1 = {
  consentPreview: '/introductions/public/consent/preview',
  consent: '/introductions/public/consent',
  status: '/introductions/public/status',
  withdraw: '/introductions/public/status/withdraw',
  delete: '/introductions/public/status/delete',
  receivePreview: '/introductions/public/receive/preview',
  receiveDecision: '/introductions/public/receive/decision',
} as const;

/** 要登录的新流程接口：A 提议、新流程列表、B 注册后认领。批准、不批准、重发 B 链接、通知已发、取联系方式在 `/introductions/:id/...`。 */
export const INTRODUCTION_CUSTOMER_FIRST_ROUTES_V1 = {
  propose: '/introductions/proposals',
  list: '/introductions/customer-first',
  claim: '/introductions/claim',
  /** A B with an account answers a customer-first row; the body is the old decision command. */
  respond: '/introductions/respond',
} as const;

/** 网页路径。令牌放在网址的片段里（`#t=`），片段不发给服务器，不进访问日志。 */
export const INTRODUCTION_PAGE_PATHS_V1 = {
  consent: '/introductions/consent',
  status: '/introductions/status',
  receive: '/introductions/receive',
} as const;

export function introductionTokenUrlV1(base: string, path: string, token: string): string {
  return `${base.replace(/\/+$/, '')}${path}#t=${token}`;
}

/** 从 `location.hash` 取令牌；格式不对返回 null。 */
export function introductionTokenFromHashV1(hash: string | null | undefined): string | null {
  const match = /^#t=([A-Za-z0-9_-]+)$/.exec(hash ?? '');
  return match && INTRODUCTION_PUBLIC_TOKEN_PATTERN_V1.test(match[1]) ? match[1] : null;
}

/** A 提议的结果：客户同意链接的令牌只在这里出现一次（只存哈希），由 A 或 A 的分身交给客户。 */
export interface IntroductionCfProposeResultV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  introduction: IntroductionCfViewV1;
  consentToken: string;
  consentUrl: string;
}

export function decodeIntroductionCfProposeResultV1(value: unknown): IntroductionCfDecodeResultV1<IntroductionCfProposeResultV1> {
  const rec = strictRecord(value, ['introduction', 'consentToken', 'consentUrl']);
  if (rec.ok === false) return rec;
  const introduction = decodeIntroductionCfViewV1(rec.value.introduction);
  if (introduction.ok === false) return introduction;
  if (typeof rec.value.consentToken !== 'string') return failCf('invalid_type', 'consentToken');
  if (!INTRODUCTION_PUBLIC_TOKEN_PATTERN_V1.test(rec.value.consentToken)) return failCf('invalid_value', 'consentToken');
  if (typeof rec.value.consentUrl !== 'string') return failCf('invalid_type', 'consentUrl');
  if (!/^https?:\/\//.test(rec.value.consentUrl)) return failCf('invalid_value', 'consentUrl');
  return {
    ok: true,
    value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, introduction: introduction.value, consentToken: rec.value.consentToken, consentUrl: rec.value.consentUrl },
  };
}

export interface IntroductionCfListV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  items: IntroductionCfViewV1[];
}

export function decodeIntroductionCfListV1(value: unknown): IntroductionCfDecodeResultV1<IntroductionCfListV1> {
  const rec = strictRecord(value, ['items']);
  if (rec.ok === false) return rec;
  if (!Array.isArray(rec.value.items)) return failCf('invalid_type', 'items');
  const items: IntroductionCfViewV1[] = [];
  for (let i = 0; i < rec.value.items.length; i += 1) {
    const decoded = decodeIntroductionCfViewV1(rec.value.items[i]);
    if (decoded.ok === false) return failCf(decoded.reasonCode, `items.${i}.${decoded.field}`);
    items.push(decoded.value);
  }
  return { ok: true, value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, items } };
}

// ── P1-0 按人名单 ───────────────────────────────────────────────────────────────────

/** 名单环境变量：逗号分隔的主人 id；`*` = 全体（G2 通过后才由 coord 设置）。 */
export const L9_COHORT_USER_IDS_VAR = 'L9_COHORT_USER_IDS';
/** 只读接口：我在不在名单里。 */
export const L9_COHORT_ROUTE_V1 = '/l9/cohort/me';

/**
 * 网页问「我在不在名单里」的回答。`inCohort`：能用 L9 新功能的主人侧入口；`hasIncoming`：有没有指向我的、待我决定的引荐。
 * 网页只在 `inCohort || hasIncoming` 时渲染引荐卡片；名单外的人只看到指向自己的那几行，没有「发起」入口。
 * 账本开关（`INTRODUCTION_LEDGER_V1_ENABLED`）开着时，「待我决定」还包括「我作为 B 已接受、还没记结果」的引荐，
 * 名单外的 B 接受以后才还有地方记结果（L9 C2，coord 10-31 决定②）。开关关着时只算待决的行，和原来一样。
 */
export interface L9CohortStatusV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  inCohort: boolean;
  hasIncoming: boolean;
}

/**
 * 名单规则（前后端、测试共用一份）。生产空名单 = 全拒；非生产空名单 = 全允许；`*` = 全体已登录主人；
 * 其余只认名单里精确出现的 id。没有主人 id（匿名）一律不在名单里。
 */
export function l9CohortAdmitsV1(input: { userId: string | null | undefined; raw: string | undefined; production: boolean }): boolean {
  if (typeof input.userId !== 'string' || input.userId.length === 0) return false;
  const ids = (input.raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (ids.includes('*')) return true;
  if (ids.length === 0) return !input.production;
  return ids.includes(input.userId);
}

export function l9CohortShowsIntroductionsV1(status: Pick<L9CohortStatusV1, 'inCohort' | 'hasIncoming'>): boolean {
  return status.inCohort === true || status.hasIncoming === true;
}

/**
 * 跟进卡的两类种类（L9 C2，P1-6）：B 24 小时没答复，提醒转介人；客户 48 小时没约，问转介人一句。
 * 放在这里是共享契约：后端出卡、网页读卡、标签表都从这一个常量取，不各写一份字符串。
 * 已并进 `OWNER_FOLLOW_UP_KINDS_V1`（`owner-goals.ts`，L9 包③）：手机 `needsYou.ts`、`NeedsYouSection.tsx`、`ownerGoals.ts`，
 * 网页 `OwnerGoalsSection.tsx` 和桌面 `l6OwnerEntries.ts` 的穷举分支同时补上；通用说法见 `ownerFollowUpIntroductionWordsV1`。
 * 读的一方遇到不认识的种类要丢弃那张卡，不让整本账失败（见 `introduction-ledger.ts` 的解码函数）。
 */
export const INTRODUCTION_FOLLOW_UP_KINDS_V1 = ['b_no_reply', 'client_no_booking'] as const;
export type IntroductionFollowUpKindV1 = (typeof INTRODUCTION_FOLLOW_UP_KINDS_V1)[number];

export function decodeL9CohortStatusV1(value: unknown): IntroductionCfDecodeResultV1<L9CohortStatusV1> {
  const rec = strictRecord(value, ['inCohort', 'hasIncoming']);
  if (rec.ok === false) return rec;
  if (typeof rec.value.inCohort !== 'boolean') return failCf('invalid_type', 'inCohort');
  if (typeof rec.value.hasIncoming !== 'boolean') return failCf('invalid_type', 'hasIncoming');
  return { ok: true, value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, inCohort: rec.value.inCohort, hasIncoming: rec.value.hasIncoming } };
}
