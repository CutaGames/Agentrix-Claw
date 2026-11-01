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
