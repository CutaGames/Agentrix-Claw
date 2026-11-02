/**
 * L9 P3-9（F 线）：公开核对页，免登录。
 *
 * 引荐的一方（A 或 B）在回执页生成一个「核对链接」交给第三方；第三方打开页面，页面把链接里的令牌用 POST 正文交给后端，
 * 后端在我们自己的签名记录里验签（`checkIntroductionReceiptV1`），只回答「这份回执是不是真的」，不回任何主人信息。
 *
 * 规矩（l9-plan 3.2「接口规则」）：
 * - 令牌 ≥128 位随机（这里 256 位），库里只存 SHA-256 哈希；令牌放在链接的 `#` 片段里，不进 URL、访问日志和 referrer。
 * - 90 天过期，或者被撤销，立即失效。
 * - 不存在、过期、已撤销、格式不对、对应的引荐不存在或还没成立：同一个 404，防枚举。
 * - 限频：每令牌每分钟 ≤30 次，每网络地址每分钟 ≤60 次。
 * - 不回显个人数据：公开的回答里没有主人 id、名字、邮箱、分身 id、分成、回执原文和假名引用；只有「真/假」、签发方、时间、状态。
 * - 默认不写 ERC-8004 反馈，也不写任何链（F8′）。
 */
export const INTRODUCTION_RECEIPT_PUBLIC_VERIFY_FLAG_V1 = 'INTRODUCTION_RECEIPT_PUBLIC_VERIFY_V1_ENABLED' as const;
/** 网页编译期开关（要重建网页）：关着时核对页是 404，回执页上没有「让别人核对」一栏。 */
export const INTRODUCTION_RECEIPT_PUBLIC_VERIFY_WEB_FLAG_V1 = 'NEXT_PUBLIC_INTRODUCTION_RECEIPT_PUBLIC_VERIFY_ENABLED' as const;
export const INTRODUCTION_RECEIPT_PUBLIC_SCHEMA_VERSION_V1 = 1 as const;
/** 核对链接的有效天数。 */
export const INTRODUCTION_RECEIPT_LINK_DAYS_V1 = 90;
/** 同一个人对同一条引荐同时有效的链接最多几条。 */
export const INTRODUCTION_RECEIPT_LINK_MAX_LIVE_V1 = 5;
export const INTRODUCTION_RECEIPT_LINK_RATE_V1 = { perTokenPerMinute: 30, perAddressPerMinute: 60 } as const;
/** 公开核验接口（POST，令牌在正文里）。 */
export const INTRODUCTION_RECEIPT_PUBLIC_VERIFY_ROUTE_V1 = '/v1/public/introduction-receipts/verify' as const;
/** 网页上的公开核对页（令牌放在 `#token=` 片段里）。 */
export const INTRODUCTION_RECEIPT_PUBLIC_PAGE_PATH_V1 = '/trust/verify/receipt' as const;
/** `rcl_` 加 43 个 base64url 字符（32 字节）。 */
export const INTRODUCTION_RECEIPT_LINK_TOKEN_PATTERN_V1 = /^rcl_[A-Za-z0-9_-]{43}$/;

export const INTRODUCTION_RECEIPT_PUBLIC_REASONS_V1 = ['not_authentic', 'unavailable'] as const;
export type IntroductionReceiptPublicReasonV1 = (typeof INTRODUCTION_RECEIPT_PUBLIC_REASONS_V1)[number];

export type IntroductionReceiptPublicVerifyV1 =
  | {
      schemaVersion: typeof INTRODUCTION_RECEIPT_PUBLIC_SCHEMA_VERSION_V1;
      valid: true;
      /** 签发方，例如 `https://api.agentrix.top`。 */
      issuer: string;
      signedAt: string;
      startedAt: string;
      status: 'active' | 'ended';
      kid: string;
      alg: 'ES256';
      /** 公钥集的完整地址，供懂技术的人自己对。 */
      jwksUrl: string;
      checkedAt: string;
    }
  | {
      schemaVersion: typeof INTRODUCTION_RECEIPT_PUBLIC_SCHEMA_VERSION_V1;
      valid: false;
      reason: IntroductionReceiptPublicReasonV1;
      checkedAt: string;
    };

/** `POST /introductions/:id/receipt/links` 的回答：令牌只出现这一次。 */
export interface IntroductionReceiptLinkCreatedV1 {
  schemaVersion: typeof INTRODUCTION_RECEIPT_PUBLIC_SCHEMA_VERSION_V1;
  introductionId: string;
  /** 完整的核对链接，令牌在 `#` 片段里。 */
  url: string;
  token: string;
  expiresAt: string;
}

export function introductionReceiptLinkUrlV1(webBase: string, token: string): string {
  return `${webBase.replace(/\/+$/, '')}${INTRODUCTION_RECEIPT_PUBLIC_PAGE_PATH_V1}#token=${encodeURIComponent(token)}`;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const KID = /^[A-Za-z0-9_-]{1,100}$/;
const ISSUER = /^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d{1,5})?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => own.includes(key));
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value));
}

/** 失败返回 `null`，不抛异常。多一个字段就拒收：公开回答里不能悄悄多出个人数据。 */
export function decodeIntroductionReceiptPublicVerifyV1(value: unknown): IntroductionReceiptPublicVerifyV1 | null {
  if (!isRecord(value) || value.schemaVersion !== INTRODUCTION_RECEIPT_PUBLIC_SCHEMA_VERSION_V1 || typeof value.valid !== 'boolean') return null;
  if (!isIso(value.checkedAt)) return null;
  if (value.valid === false) {
    if (!sameKeys(value, ['schemaVersion', 'valid', 'reason', 'checkedAt'])) return null;
    if (typeof value.reason !== 'string' || !(INTRODUCTION_RECEIPT_PUBLIC_REASONS_V1 as readonly string[]).includes(value.reason)) return null;
    return { schemaVersion: INTRODUCTION_RECEIPT_PUBLIC_SCHEMA_VERSION_V1, valid: false, reason: value.reason as IntroductionReceiptPublicReasonV1, checkedAt: value.checkedAt };
  }
  if (!sameKeys(value, ['schemaVersion', 'valid', 'issuer', 'signedAt', 'startedAt', 'status', 'kid', 'alg', 'jwksUrl', 'checkedAt'])) return null;
  if (typeof value.issuer !== 'string' || !ISSUER.test(value.issuer)) return null;
  if (!isIso(value.signedAt) || !isIso(value.startedAt)) return null;
  if (value.status !== 'active' && value.status !== 'ended') return null;
  if (typeof value.kid !== 'string' || !KID.test(value.kid) || value.alg !== 'ES256') return null;
  if (value.jwksUrl !== `${value.issuer}/.well-known/jwks.json`) return null;
  return {
    schemaVersion: INTRODUCTION_RECEIPT_PUBLIC_SCHEMA_VERSION_V1,
    valid: true,
    issuer: value.issuer,
    signedAt: value.signedAt,
    startedAt: value.startedAt,
    status: value.status,
    kid: value.kid,
    alg: 'ES256',
    jwksUrl: value.jwksUrl,
    checkedAt: value.checkedAt,
  };
}

export function decodeIntroductionReceiptLinkCreatedV1(value: unknown): IntroductionReceiptLinkCreatedV1 | null {
  if (!isRecord(value) || !sameKeys(value, ['schemaVersion', 'introductionId', 'url', 'token', 'expiresAt'])) return null;
  if (value.schemaVersion !== INTRODUCTION_RECEIPT_PUBLIC_SCHEMA_VERSION_V1) return null;
  if (typeof value.introductionId !== 'string' || typeof value.url !== 'string' || typeof value.token !== 'string') return null;
  if (!INTRODUCTION_RECEIPT_LINK_TOKEN_PATTERN_V1.test(value.token) || !isIso(value.expiresAt)) return null;
  if (!value.url.endsWith(`${INTRODUCTION_RECEIPT_PUBLIC_PAGE_PATH_V1}#token=${encodeURIComponent(value.token)}`)) return null;
  return {
    schemaVersion: INTRODUCTION_RECEIPT_PUBLIC_SCHEMA_VERSION_V1,
    introductionId: value.introductionId,
    url: value.url,
    token: value.token,
    expiresAt: value.expiresAt,
  };
}
