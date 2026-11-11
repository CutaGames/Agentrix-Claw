/**
 * L9 P3-7（F 线）：转介回执给双方、可核验。
 *
 * 引荐成立（`active`）时平台已经签了一张回执（`introduction-receipt+jwt`，ES256，见 `introduction.ts`）。这里只加「展示和核验」：
 * 引荐的 A、B 两方各自能取到回执原文、服务端对着平台公钥验过的结果、以及验过以后的声明内容。
 *
 * 规矩：
 * - 验签只认平台自己的 ES256 钥和 `kid`，`typ` 钉住 `introduction-receipt+jwt`；`alg: none`、别的算法、别的 `typ` 一律不通过。
 * - 验过签还要对一遍：声明里的 `introduction_id` 必须等于这一条引荐，`jti` 必须等于库里记的回执号。对不上算不通过。
 * - 声明里只有引用（`ref_…` 假名）、分成基点、成立时间；没有名字、邮箱、账户 id。验不过的回执不给声明内容。
 * - 回执本身不写任何链：默认不写 ERC-8004 反馈（F8′：平台一个钱包代写会让口碑变成「平台说了算」）。
 * 解码函数在前后端共用，失败返回 `null`，不抛异常。
 */
import { INTRODUCTION_RECEIPT_TYP_V1, decodeIntroductionReceiptClaimsV1, type IntroductionReceiptClaimsV1 } from './introduction';

export const INTRODUCTION_RECEIPT_VIEW_SCHEMA_VERSION_V1 = 1 as const;
/** 平台公钥集的相对位置（`agentrix-oauth-metadata.controller.ts` 提供）。 */
export const INTRODUCTION_RECEIPT_JWKS_PATH_V1 = '/.well-known/jwks.json' as const;
/** 打开回执展示和核验的开关；只认精确 `'1'`，且要 `INTRODUCTIONS_V1_ENABLED` 也开着。 */
export const INTRODUCTION_RECEIPT_VIEW_FLAG_V1 = 'INTRODUCTION_RECEIPT_VIEW_V1_ENABLED' as const;

/** 回执验不过的原因。前 9 个来自平台签名器，后 2 个是验过签以后的对账。 */
export const INTRODUCTION_RECEIPT_CHECK_REASONS_V1 = [
  'token_malformed',
  'unsupported_alg',
  'unknown_kid',
  'signature_invalid',
  'typ_mismatch',
  'token_expired',
  'token_not_yet_valid',
  'port_unavailable',
  'signer_not_configured',
  'signer_key_invalid',
  /** 验过签，但声明不是回执该有的样子。 */
  'claims_invalid',
  /** 验过签，但声明说的不是这一条引荐（或回执号对不上）。 */
  'claims_mismatch',
] as const;
export type IntroductionReceiptCheckReasonV1 = (typeof INTRODUCTION_RECEIPT_CHECK_REASONS_V1)[number];

export const INTRODUCTION_RECEIPT_ROLES_V1 = ['introducer', 'introduced'] as const;
export type IntroductionReceiptRoleV1 = (typeof INTRODUCTION_RECEIPT_ROLES_V1)[number];

export type IntroductionReceiptCheckV1 =
  | { valid: true; kid: string; claims: IntroductionReceiptClaimsV1 }
  | { valid: false; reasonCode: IntroductionReceiptCheckReasonV1 };

export interface IntroductionReceiptVerificationV1 {
  valid: boolean;
  /** 通过时为 null。 */
  reasonCode: IntroductionReceiptCheckReasonV1 | null;
  /** 通过时是签名钥的 `kid`，否则 null。 */
  kid: string | null;
  alg: 'ES256' | null;
  checkedAt: string;
}

/** `GET /introductions/:id/receipt/view`：A 或 B 看到的回执。 */
export interface IntroductionReceiptViewV1 {
  schemaVersion: typeof INTRODUCTION_RECEIPT_VIEW_SCHEMA_VERSION_V1;
  introductionId: string;
  role: IntroductionReceiptRoleV1;
  /** 引荐被收尾（`closed`）以后回执仍然有效，只是不再分成。 */
  status: 'active' | 'closed';
  typ: typeof INTRODUCTION_RECEIPT_TYP_V1;
  /** 紧凑 JWS 原文，拿去和公钥集自己对。 */
  receipt: string;
  verification: IntroductionReceiptVerificationV1;
  /** 只有验过签才有。 */
  claims: IntroductionReceiptClaimsV1 | null;
  /** 公钥集的位置（相对路径）。 */
  jwksPath: typeof INTRODUCTION_RECEIPT_JWKS_PATH_V1;
}

export function introductionReceiptViewPathV1(introductionId: string): string {
  return `/introductions/${encodeURIComponent(introductionId)}/receipt/view`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const KID = /^[A-Za-z0-9_-]{1,100}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => own.includes(key));
}

export function decodeIntroductionReceiptVerificationV1(value: unknown): IntroductionReceiptVerificationV1 | null {
  if (!isRecord(value) || !hasOnly(value, ['valid', 'reasonCode', 'kid', 'alg', 'checkedAt'])) return null;
  if (typeof value.valid !== 'boolean') return null;
  if (typeof value.checkedAt !== 'string' || !ISO.test(value.checkedAt) || !Number.isFinite(Date.parse(value.checkedAt))) return null;
  if (value.valid) {
    if (value.reasonCode !== null || value.alg !== 'ES256' || typeof value.kid !== 'string' || !KID.test(value.kid)) return null;
    return { valid: true, reasonCode: null, kid: value.kid, alg: 'ES256', checkedAt: value.checkedAt };
  }
  if (typeof value.reasonCode !== 'string' || !(INTRODUCTION_RECEIPT_CHECK_REASONS_V1 as readonly string[]).includes(value.reasonCode)) return null;
  if (value.kid !== null || value.alg !== null) return null;
  return { valid: false, reasonCode: value.reasonCode as IntroductionReceiptCheckReasonV1, kid: null, alg: null, checkedAt: value.checkedAt };
}

export function decodeIntroductionReceiptViewV1(value: unknown): IntroductionReceiptViewV1 | null {
  if (!isRecord(value) || !hasOnly(value, ['schemaVersion', 'introductionId', 'role', 'status', 'typ', 'receipt', 'verification', 'claims', 'jwksPath'])) return null;
  if (value.schemaVersion !== INTRODUCTION_RECEIPT_VIEW_SCHEMA_VERSION_V1) return null;
  if (typeof value.introductionId !== 'string' || !UUID.test(value.introductionId)) return null;
  if (typeof value.role !== 'string' || !(INTRODUCTION_RECEIPT_ROLES_V1 as readonly string[]).includes(value.role)) return null;
  if (value.status !== 'active' && value.status !== 'closed') return null;
  if (value.typ !== INTRODUCTION_RECEIPT_TYP_V1 || value.jwksPath !== INTRODUCTION_RECEIPT_JWKS_PATH_V1) return null;
  if (typeof value.receipt !== 'string' || value.receipt.length === 0 || value.receipt.length > 24 * 1024) return null;
  const verification = decodeIntroductionReceiptVerificationV1(value.verification);
  if (!verification) return null;
  let claims: IntroductionReceiptClaimsV1 | null = null;
  if (verification.valid) {
    // Only a receipt that passed has to be a compact JWS; a stored receipt that is broken still decodes as a failed check,
    // so the page can say why (for example "not in the expected format") instead of "could not load it".
    if (!JWS.test(value.receipt)) return null;
    const decoded = decodeIntroductionReceiptClaimsV1(value.claims);
    // A receipt that passed must say it is about this very introduction.
    if (decoded.ok === false || decoded.value.introduction_id !== value.introductionId) return null;
    claims = decoded.value;
  } else if (value.claims !== null) {
    return null;
  }
  return {
    schemaVersion: INTRODUCTION_RECEIPT_VIEW_SCHEMA_VERSION_V1,
    introductionId: value.introductionId,
    role: value.role as IntroductionReceiptRoleV1,
    status: value.status,
    typ: INTRODUCTION_RECEIPT_TYP_V1,
    receipt: value.receipt,
    verification,
    claims,
    jwksPath: INTRODUCTION_RECEIPT_JWKS_PATH_V1,
  };
}
