/**
 * 二次确认就地完成（E84 B，合同 v0 草案；I-053、`briefs/login-simplify-v1.md`）。
 *
 * 用在哪：放宽类操作（公开分身、上架、代表授权、交付订单、确认桌面配对等）要"最近 10 分钟登录过"
 * （`visibility-actions.ts` 的 `STEP_UP_MAX_AGE_SECONDS`）。原来不满足时只能退出重登；现在客户端就地弹确认框：
 *
 * 1. 业务接口返回 403 `{ code: 'STEP_UP_REQUIRED', reasonCode: 'recent_sign_in_required' }`
 *    （`isRecentSignInRequiredErrorV1` 判断）。
 * 2. `POST /api/auth/step-up/start`，选一种方式：
 *    - `email_code`：服务端给账户的邮箱发 6 位验证码（邮箱只回脱敏的样子）；
 *    - `passkey`：服务端返回 WebAuthn 挑战和这个账户登记过的凭据 id。
 * 3. `POST /api/auth/step-up/finish`，带 `stepUpRef` 和验证码或 WebAuthn 断言。
 * 4. 服务端返回一个新的登录 token：同一个用户，`iat` 是现在。客户端换掉本地 token，重试第 1 步的请求。
 *
 * 弹框之前可以先 `GET /api/auth/step-up/methods`，看这个账户能用哪几种方式（REQ-backend-073 补充第 1 点）。
 *
 * 规则：
 * - 只有本人的登录凭据能用（`authIssuedAt` 不为空的 token）。游客、MCP / OAuth 客户端 token、管理员 token、
 *   运行时凭据一律 403 `step_up_not_allowed`，不能用它换出登录 token。
 * - 验证码只存哈希，10 分钟有效，一个 `stepUpRef` 最多试 5 次，验过或试满就作废；同一用户 15 分钟内最多
 *   start 5 次，同一方式 60 秒内只发一次码。
 * - 通行密钥：服务端验签（`authenticatorData || SHA-256(clientDataJSON)`，用登记时的公钥），并核对
 *   `type=webauthn.get`、挑战、origin、`rpIdHash`、用户在场标志和签名计数。挑战 5 分钟有效，只能用一次。
 * - `stepUpRef` 绑定发起它的用户和方式；别人的、过期的、用过的一律 `step_up_invalid`，不区分原因。
 * - 换出来的 token 和普通登录 token 一样（30 天，E84 不改期限），只是 `iat` 更新。
 * - "15 分钟 5 次"只数真的发了码或发了挑战的 start；返回 409 / 429 / 503 的不算。
 * - `finish` 的请求带着 cookie `agentrix_token` 时，响应同时 `Set-Cookie` 换掉它（属性和 `/auth/cookie-set` 一样），
 *   网页不用再调 `cookie-set`；不带就只在响应体里返回 token。
 * - 通行密钥的 `rpId` 是 `agentrix.top`（和 `/api/v1/passkey/register/start` 一致，服务端配置 `PASSKEY_RP_ID` 可改）；
 *   origin 缺省只收 `https://agentrix.top`、`https://www.agentrix.top`，staging 用 `PASSKEY_ALLOWED_ORIGINS` 配成自己的。
 * - 429 的错误体带 `retryAfterSeconds`（`api-error.ts` 的转发字段），响应头 `Retry-After` 也带。
 *   另外每个 IP 对每条路由每分钟 10 次（登录类接口共用的限频），超了也是 429、也带 `retryAfterSeconds`，但 `code` 不是
 *   `step_up_rate_limited`。客户端对 429 一律按 `retryAfterSeconds` 等，不按 `code` 分支。
 */
import { STEP_UP_MAX_AGE_SECONDS, STEP_UP_RECENT_SIGN_IN_REASON, STEP_UP_REQUIRED_CODE } from './visibility-actions';

export const AUTH_STEP_UP_SCHEMA_VERSION = 1 as const;

export const AUTH_STEP_UP_ROUTES = {
  methods: 'GET /api/auth/step-up/methods', // → AuthStepUpMethodsResponseV1
  start: 'POST /api/auth/step-up/start', // AuthStepUpStartRequestV1 → AuthStepUpStartResponseV1
  finish: 'POST /api/auth/step-up/finish', // AuthStepUpFinishRequestV1 → AuthStepUpFinishResponseV1
} as const;

export const AUTH_STEP_UP_METHODS = ['email_code', 'passkey'] as const;
export type AuthStepUpMethodV1 = (typeof AUTH_STEP_UP_METHODS)[number];

/**
 * 某种方式用不了的原因：
 * - `no_email`：账户没有邮箱；
 * - `email_unavailable`：服务端现在发不了验证码（`GET /api/auth/providers` 里 `email_code` 不可用）；
 * - `no_passkey`：账户没有登记通行密钥。
 */
export const AUTH_STEP_UP_METHOD_UNAVAILABLE_REASONS = ['no_email', 'email_unavailable', 'no_passkey'] as const;
export type AuthStepUpMethodUnavailableReasonV1 = (typeof AUTH_STEP_UP_METHOD_UNAVAILABLE_REASONS)[number];

export type AuthStepUpMethodStatusV1 =
  | { method: AuthStepUpMethodV1; available: true }
  | { method: AuthStepUpMethodV1; available: false; reason: AuthStepUpMethodUnavailableReasonV1 };

export interface AuthStepUpMethodsResponseV1 {
  schemaVersion: typeof AUTH_STEP_UP_SCHEMA_VERSION;
  /** 每种方式一条，顺序照 `AUTH_STEP_UP_METHODS`。 */
  methods: AuthStepUpMethodStatusV1[];
}

export const AUTH_STEP_UP_LIMITS_V1 = {
  emailCodeTtlSeconds: 10 * 60,
  emailCodeLength: 6,
  passkeyChallengeTtlSeconds: 5 * 60,
  maxAttemptsPerStepUp: 5,
  startsPerUserWindowSeconds: 15 * 60,
  maxStartsPerUserWindow: 5,
  resendAfterSeconds: 60,
} as const;

/**
 * 错误码（`api-error.ts` 的 `code`）。验证码或断言不对、`stepUpRef` 过期 / 用过 / 不是自己的，都是
 * `step_up_invalid`，不告诉客户端是哪一种。
 */
export const AUTH_STEP_UP_ERROR_CODES = {
  invalidRequest: 'step_up_request_invalid', // 400，带 errors
  notAllowed: 'step_up_not_allowed', // 403：不是本人的登录凭据
  methodUnavailable: 'step_up_method_unavailable', // 409：账户没有邮箱 / 没有登记通行密钥
  invalid: 'step_up_invalid', // 401：码或断言不对，或 stepUpRef 失效
  rateLimited: 'step_up_rate_limited', // 429，带 retryAfterSeconds（响应头 Retry-After）
  emailUnavailable: 'step_up_email_unavailable', // 503：发信服务没配或暂时不可用
} as const;
export type AuthStepUpErrorCodeV1 = (typeof AUTH_STEP_UP_ERROR_CODES)[keyof typeof AUTH_STEP_UP_ERROR_CODES];

/** `stepUpRef`：`stu_` + 32 位小写十六进制（128 位随机数）。 */
export const AUTH_STEP_UP_REF_PATTERN = /^stu_[0-9a-f]{32}$/;
export const AUTH_STEP_UP_EMAIL_CODE_PATTERN = /^[0-9]{6}$/;
/** WebAuthn 字段一律 base64url（无填充）。 */
export const AUTH_BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const BASE64URL_MAX = 8192;

export interface AuthStepUpStartRequestV1 {
  schemaVersion: typeof AUTH_STEP_UP_SCHEMA_VERSION;
  method: AuthStepUpMethodV1;
}

export type AuthStepUpStartResponseV1 =
  | {
      schemaVersion: typeof AUTH_STEP_UP_SCHEMA_VERSION;
      stepUpRef: string;
      method: 'email_code';
      expiresAt: string;
      /** 例如 `z***@example.com`，只给用户认得出是哪个邮箱。 */
      maskedEmail: string;
      resendAfterSeconds: number;
    }
  | {
      schemaVersion: typeof AUTH_STEP_UP_SCHEMA_VERSION;
      stepUpRef: string;
      method: 'passkey';
      expiresAt: string;
      /** 传给 `navigator.credentials.get({ publicKey: { challenge, rpId, allowCredentials, timeout } })`。 */
      challenge: string;
      rpId: string;
      allowCredentialIds: string[];
      timeoutMs: number;
    };

export interface AuthStepUpPasskeyAssertionV1 {
  credentialId: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  userHandle?: string | null;
}

export type AuthStepUpFinishRequestV1 =
  | { schemaVersion: typeof AUTH_STEP_UP_SCHEMA_VERSION; stepUpRef: string; method: 'email_code'; code: string }
  | { schemaVersion: typeof AUTH_STEP_UP_SCHEMA_VERSION; stepUpRef: string; method: 'passkey'; assertion: AuthStepUpPasskeyAssertionV1 };

export interface AuthStepUpFinishResponseV1 {
  schemaVersion: typeof AUTH_STEP_UP_SCHEMA_VERSION;
  accessToken: string;
  tokenType: 'Bearer';
  /** 新 token 的 `iat`（秒）。 */
  authIssuedAt: number;
  /** 从现在起多久内算"最近登录"（= `STEP_UP_MAX_AGE_SECONDS`）。 */
  recentSignInValidSeconds: number;
}

export type AuthStepUpDecodeResultV1<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unexpectedKeys(record: Record<string, unknown>, allowed: readonly string[], errors: string[], prefix = ''): void {
  for (const key of Object.keys(record)) if (!allowed.includes(key)) errors.push(`${prefix}${key}: unexpected field`);
}

function base64url(value: unknown, field: string, errors: string[], optional = false): void {
  if (optional && (value === undefined || value === null)) return;
  if (typeof value !== 'string' || !value || value.length > BASE64URL_MAX || !AUTH_BASE64URL_PATTERN.test(value)) {
    errors.push(`${field}: base64url`);
  }
}

/** 服务端用：校验 start 请求体（多余字段也算错）。 */
export function decodeAuthStepUpStartRequestV1(body: unknown): AuthStepUpDecodeResultV1<AuthStepUpStartRequestV1> {
  const errors: string[] = [];
  if (!isRecord(body)) return { ok: false, errors: ['body: expected object'] };
  unexpectedKeys(body, ['schemaVersion', 'method'], errors);
  if (body.schemaVersion !== AUTH_STEP_UP_SCHEMA_VERSION) errors.push('schemaVersion: 1');
  if (!(AUTH_STEP_UP_METHODS as readonly unknown[]).includes(body.method)) errors.push(`method: one of ${AUTH_STEP_UP_METHODS.join(', ')}`);
  return errors.length ? { ok: false, errors } : { ok: true, value: body as unknown as AuthStepUpStartRequestV1 };
}

/** 服务端用：校验 finish 请求体。 */
export function decodeAuthStepUpFinishRequestV1(body: unknown): AuthStepUpDecodeResultV1<AuthStepUpFinishRequestV1> {
  const errors: string[] = [];
  if (!isRecord(body)) return { ok: false, errors: ['body: expected object'] };
  if (body.schemaVersion !== AUTH_STEP_UP_SCHEMA_VERSION) errors.push('schemaVersion: 1');
  if (typeof body.stepUpRef !== 'string' || !AUTH_STEP_UP_REF_PATTERN.test(body.stepUpRef)) errors.push('stepUpRef: invalid');
  if (body.method === 'email_code') {
    unexpectedKeys(body, ['schemaVersion', 'stepUpRef', 'method', 'code'], errors);
    if (typeof body.code !== 'string' || !AUTH_STEP_UP_EMAIL_CODE_PATTERN.test(body.code)) errors.push('code: 6 digits');
  } else if (body.method === 'passkey') {
    unexpectedKeys(body, ['schemaVersion', 'stepUpRef', 'method', 'assertion'], errors);
    const assertion = body.assertion;
    if (!isRecord(assertion)) {
      errors.push('assertion: expected object');
    } else {
      unexpectedKeys(assertion, ['credentialId', 'clientDataJSON', 'authenticatorData', 'signature', 'userHandle'], errors, 'assertion.');
      base64url(assertion.credentialId, 'assertion.credentialId', errors);
      base64url(assertion.clientDataJSON, 'assertion.clientDataJSON', errors);
      base64url(assertion.authenticatorData, 'assertion.authenticatorData', errors);
      base64url(assertion.signature, 'assertion.signature', errors);
      base64url(assertion.userHandle, 'assertion.userHandle', errors, true);
    }
  } else {
    errors.push(`method: one of ${AUTH_STEP_UP_METHODS.join(', ')}`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: body as unknown as AuthStepUpFinishRequestV1 };
}

/** 客户端用：解码 start 的响应。认不出的形状一律当失败，不猜。 */
export function decodeAuthStepUpStartResponseV1(value: unknown): AuthStepUpStartResponseV1 | null {
  if (!isRecord(value) || value.schemaVersion !== AUTH_STEP_UP_SCHEMA_VERSION) return null;
  if (typeof value.stepUpRef !== 'string' || !AUTH_STEP_UP_REF_PATTERN.test(value.stepUpRef)) return null;
  if (typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt))) return null;
  if (value.method === 'email_code') {
    if (typeof value.maskedEmail !== 'string' || !Number.isInteger(value.resendAfterSeconds)) return null;
    return {
      schemaVersion: AUTH_STEP_UP_SCHEMA_VERSION,
      stepUpRef: value.stepUpRef,
      method: 'email_code',
      expiresAt: value.expiresAt,
      maskedEmail: value.maskedEmail,
      resendAfterSeconds: value.resendAfterSeconds as number,
    };
  }
  if (value.method === 'passkey') {
    if (typeof value.challenge !== 'string' || !AUTH_BASE64URL_PATTERN.test(value.challenge)) return null;
    if (typeof value.rpId !== 'string' || !value.rpId) return null;
    if (!Array.isArray(value.allowCredentialIds) || !value.allowCredentialIds.every((id) => typeof id === 'string' && AUTH_BASE64URL_PATTERN.test(id))) {
      return null;
    }
    if (!Number.isInteger(value.timeoutMs) || (value.timeoutMs as number) <= 0) return null;
    return {
      schemaVersion: AUTH_STEP_UP_SCHEMA_VERSION,
      stepUpRef: value.stepUpRef,
      method: 'passkey',
      expiresAt: value.expiresAt,
      challenge: value.challenge,
      rpId: value.rpId,
      allowCredentialIds: [...(value.allowCredentialIds as string[])],
      timeoutMs: value.timeoutMs as number,
    };
  }
  return null;
}

/**
 * 客户端用：解码 methods 的响应。认不出的方式跳过（以后加方式不会让旧客户端报错）；原因认不出的，
 * 按不可用处理，`reason` 记成 `email_unavailable` / `no_passkey` 里对应方式的那个。
 */
export function decodeAuthStepUpMethodsResponseV1(value: unknown): AuthStepUpMethodsResponseV1 | null {
  if (!isRecord(value) || value.schemaVersion !== AUTH_STEP_UP_SCHEMA_VERSION || !Array.isArray(value.methods)) return null;
  const methods: AuthStepUpMethodStatusV1[] = [];
  for (const item of value.methods) {
    if (!isRecord(item) || !(AUTH_STEP_UP_METHODS as readonly unknown[]).includes(item.method)) continue;
    const method = item.method as AuthStepUpMethodV1;
    if (methods.some((known) => known.method === method)) continue;
    if (item.available === true) {
      methods.push({ method, available: true });
      continue;
    }
    const reason = (AUTH_STEP_UP_METHOD_UNAVAILABLE_REASONS as readonly unknown[]).includes(item.reason)
      ? (item.reason as AuthStepUpMethodUnavailableReasonV1)
      : method === 'passkey'
        ? 'no_passkey'
        : 'email_unavailable';
    methods.push({ method, available: false, reason });
  }
  return { schemaVersion: AUTH_STEP_UP_SCHEMA_VERSION, methods };
}

/** 客户端用：解码 finish 的响应。 */
export function decodeAuthStepUpFinishResponseV1(value: unknown): AuthStepUpFinishResponseV1 | null {
  if (!isRecord(value) || value.schemaVersion !== AUTH_STEP_UP_SCHEMA_VERSION) return null;
  if (typeof value.accessToken !== 'string' || !value.accessToken || value.tokenType !== 'Bearer') return null;
  if (typeof value.authIssuedAt !== 'number' || !Number.isFinite(value.authIssuedAt)) return null;
  if (!Number.isInteger(value.recentSignInValidSeconds)) return null;
  return {
    schemaVersion: AUTH_STEP_UP_SCHEMA_VERSION,
    accessToken: value.accessToken,
    tokenType: 'Bearer',
    authIssuedAt: value.authIssuedAt,
    recentSignInValidSeconds: value.recentSignInValidSeconds as number,
  };
}

/**
 * 业务接口的错误体是不是"要二次确认"。传 `api-error.ts` 的错误体（或 `parseApiErrorBodyV1` 解出来的对象）。
 * 只有 403 `STEP_UP_REQUIRED` + `recent_sign_in_required` 才弹确认框；别的 `STEP_UP_REQUIRED`（例如管理员
 * step-up）不走这里。
 */
export function isRecentSignInRequiredErrorV1(status: number, body: unknown): boolean {
  if (status !== 403 || !isRecord(body)) return false;
  return body.code === STEP_UP_REQUIRED_CODE && body.reasonCode === STEP_UP_RECENT_SIGN_IN_REASON;
}

/** 确认成功以后，新 token 在多久内算"最近登录"。 */
export const AUTH_STEP_UP_RECENT_SIGN_IN_SECONDS = STEP_UP_MAX_AGE_SECONDS;
