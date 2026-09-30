/**
 * 浏览器登录回调只带一次性 code（E84 C，合同 v0 草案；I-053、`briefs/login-simplify-v1.md`）。
 *
 * 原来 Google / Discord / X / Apple 登录完成后，回调把 30 天的登录 token 直接放进 URL：
 * 桌面是 `http://127.0.0.1:<端口>/auth-callback?token=…`，手机是 `agentrix://auth/callback?token=…`。
 * URL 会进浏览器历史、系统日志，本机别的进程也可能先读到。现在改成和 OAuth + PKCE 一样：
 *
 * 1. 客户端生成 `state`（`AUTH_HANDOFF_STATE_PATTERN`，至少 128 位随机数）和 PKCE 的 `codeVerifier`
 *    （RFC 7636，43–128 位），算出 `codeChallenge = authHandoffPkceChallengeV1(codeVerifier)`（只支持 S256）。
 * 2. 打开 `GET /api/auth/<provider>?handoff_client=desktop|mobile&state=…&code_challenge=…&code_challenge_method=S256`，
 *    桌面另带 `callback_port`，手机另带 `redirect_uri`（只接受 `AUTH_HANDOFF_MOBILE_REDIRECTS_V1`）。
 *    `<provider>` 是 google、discord、twitter、apple（服务端的 OAuth 入口，照旧）。
 * 3. 登录成功后，服务端只回跳 `…?code=<一次性 code>&state=<原样的 state>`，URL 里没有 token。
 *    失败时回跳 `…?error=<AUTH_HANDOFF_CALLBACK_ERRORS 之一>&state=…`。
 * 4. 客户端先核对 `state` 是自己发出去的那个，再 `POST /api/auth/handoff/exchange`，带 `code`、`state`、
 *    `codeVerifier`，换到登录 token。
 *
 * 规则：
 * - code 是 256 位随机数，服务端只存哈希，60 秒内有效，只能换一次（取出即删，并发只有一个成功）。
 * - code 绑定发起时的 `state`、`codeChallenge` 和 `handoff_client`。`state` 不对、`codeVerifier` 算不出
 *   `codeChallenge`、过期、用过、查无此 code，一律 400 `handoff_code_invalid`，不区分原因；换失败也作废这个 code。
 * - 换出来的是这次登录的人的登录 token（`authIssuedAt` = 这次登录的时间），和原来回调里带的一样。
 * - 带了 `handoff_client` 的发起，任何分支都不会退回"回调带 token"：服务商报错、用户取消、Apple 的 form_post
 *   回调都回跳 `?error=…&state=…`。发起时 `state`、`code_challenge` 或回跳地址不合格，直接 400
 *   `handoff_start_invalid`，不回跳。
 * - 桌面的 `callback_port` 只在 `handoff_client=desktop` 时生效：1–65535 的整数，只跳 `127.0.0.1`。
 *   desktop 发起的 code 只能用 desktop 发起时的 `state` 和 `code_challenge` 换，mobile 同理。
 * - `exchange` 按 IP 限频（429 `handoff_rate_limited`）。
 * - 旧的"回调带 token"在三端都切换以后删掉（E84）。发起时不带 `handoff_client` 的，暂时照旧。
 */
import { sha256Hex, utf8Encode } from './trust-loop-primitives';

export const AUTH_HANDOFF_SCHEMA_VERSION = 1 as const;

export const AUTH_HANDOFF_ROUTES = {
  exchange: 'POST /api/auth/handoff/exchange', // AuthHandoffExchangeRequestV1 → AuthHandoffExchangeResponseV1
} as const;

/** 发起浏览器登录时追加的查询参数名。 */
export const AUTH_HANDOFF_START_QUERY_V1 = {
  client: 'handoff_client',
  state: 'state',
  codeChallenge: 'code_challenge',
  codeChallengeMethod: 'code_challenge_method',
} as const;

export const AUTH_HANDOFF_CLIENTS = ['desktop', 'mobile'] as const;
export type AuthHandoffClientV1 = (typeof AUTH_HANDOFF_CLIENTS)[number];

export const AUTH_HANDOFF_CODE_TTL_SECONDS = 60;
/** 手机回跳地址白名单（前缀精确到路径）。开发构建的 `exp://` 只在非生产环境接受，由服务端决定。 */
export const AUTH_HANDOFF_MOBILE_REDIRECTS_V1 = ['agentrix://auth/callback'] as const;
/** 桌面回跳：`http://127.0.0.1:<callback_port>/auth-callback`。 */
export const AUTH_HANDOFF_DESKTOP_CALLBACK_PATH = '/auth-callback' as const;

/** `state`：43–128 位 base64url（至少 32 字节随机数）。 */
export const AUTH_HANDOFF_STATE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
/** RFC 7636 §4.1：43–128 位 unreserved 字符。 */
export const AUTH_HANDOFF_CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
/** S256 的 code_challenge：SHA-256 的 base64url，43 位。 */
export const AUTH_HANDOFF_CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** 一次性 code：`ahc_` + 43 位 base64url（256 位随机数）。 */
export const AUTH_HANDOFF_CODE_PATTERN = /^ahc_[A-Za-z0-9_-]{43}$/;

export const AUTH_HANDOFF_ERROR_CODES = {
  invalidRequest: 'handoff_request_invalid', // 400，请求体格式不对，带 errors
  codeInvalid: 'handoff_code_invalid', // 400：过期、用过、查无此 code、state 或 codeVerifier 对不上
  startInvalid: 'handoff_start_invalid', // 400：发起时 state / code_challenge / 回跳地址不合格
  rateLimited: 'handoff_rate_limited', // 429，按 IP，带 Retry-After
} as const;

/** 回跳里 `error=` 的取值（不带服务商的原始报错）。 */
export const AUTH_HANDOFF_CALLBACK_ERRORS = ['login_failed', 'login_cancelled', 'provider_unavailable'] as const;
export type AuthHandoffCallbackErrorV1 = (typeof AUTH_HANDOFF_CALLBACK_ERRORS)[number];

export interface AuthHandoffExchangeRequestV1 {
  schemaVersion: typeof AUTH_HANDOFF_SCHEMA_VERSION;
  code: string;
  state: string;
  codeVerifier: string;
}

export interface AuthHandoffExchangeResponseV1 {
  schemaVersion: typeof AUTH_HANDOFF_SCHEMA_VERSION;
  accessToken: string;
  tokenType: 'Bearer';
  /** 这次登录的时间（token 的 `iat`，秒）。 */
  authIssuedAt: number;
  user: { id: string; agentrixId: string | null; email: string | null };
}

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function hexToBase64Url(hex: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const remaining = bytes.length - i;
    out += BASE64URL_ALPHABET[(n >> 18) & 63] + BASE64URL_ALPHABET[(n >> 12) & 63];
    if (remaining > 1) out += BASE64URL_ALPHABET[(n >> 6) & 63];
    if (remaining > 2) out += BASE64URL_ALPHABET[n & 63];
  }
  return out;
}

/** PKCE S256：`base64url(SHA-256(ASCII(codeVerifier)))`，三端和服务端同一个实现。 */
export function authHandoffPkceChallengeV1(codeVerifier: string): string {
  return hexToBase64Url(sha256Hex(utf8Encode(codeVerifier)));
}

export type AuthHandoffDecodeResultV1<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 服务端用：校验换 token 的请求体（多余字段也算错）。 */
export function decodeAuthHandoffExchangeRequestV1(body: unknown): AuthHandoffDecodeResultV1<AuthHandoffExchangeRequestV1> {
  const errors: string[] = [];
  if (!isRecord(body)) return { ok: false, errors: ['body: expected object'] };
  for (const key of Object.keys(body)) {
    if (!['schemaVersion', 'code', 'state', 'codeVerifier'].includes(key)) errors.push(`${key}: unexpected field`);
  }
  if (body.schemaVersion !== AUTH_HANDOFF_SCHEMA_VERSION) errors.push('schemaVersion: 1');
  if (typeof body.code !== 'string' || !AUTH_HANDOFF_CODE_PATTERN.test(body.code)) errors.push('code: invalid');
  if (typeof body.state !== 'string' || !AUTH_HANDOFF_STATE_PATTERN.test(body.state)) errors.push('state: invalid');
  if (typeof body.codeVerifier !== 'string' || !AUTH_HANDOFF_CODE_VERIFIER_PATTERN.test(body.codeVerifier)) errors.push('codeVerifier: invalid');
  return errors.length ? { ok: false, errors } : { ok: true, value: body as unknown as AuthHandoffExchangeRequestV1 };
}

/** 客户端用：解码换 token 的响应。 */
export function decodeAuthHandoffExchangeResponseV1(value: unknown): AuthHandoffExchangeResponseV1 | null {
  if (!isRecord(value) || value.schemaVersion !== AUTH_HANDOFF_SCHEMA_VERSION) return null;
  if (typeof value.accessToken !== 'string' || !value.accessToken || value.tokenType !== 'Bearer') return null;
  if (typeof value.authIssuedAt !== 'number' || !Number.isFinite(value.authIssuedAt)) return null;
  const user = value.user;
  if (!isRecord(user) || typeof user.id !== 'string' || !user.id) return null;
  const optional = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    schemaVersion: AUTH_HANDOFF_SCHEMA_VERSION,
    accessToken: value.accessToken,
    tokenType: 'Bearer',
    authIssuedAt: value.authIssuedAt,
    user: { id: user.id, agentrixId: optional(user.agentrixId), email: optional(user.email) },
  };
}

/**
 * 回跳 URL 的参数：取第一个 `?` 到 `#` 之间的部分（没有就取 `#` 之后），按 `&` 切，每一项只按**第一个** `=`
 * 切，再各自 `decodeURIComponent`。不用 `URL` / `URLSearchParams`：React Native 自带的实现和 Node、浏览器的
 * 切法不同（REQ-backend-073.re-mobile），三端要是同一套行为。解码失败或同一个参数出现两次，都当读不出。
 */
export function parseAuthHandoffCallbackParamsV1(url: string): Map<string, string> | null {
  if (typeof url !== 'string' || url.length > 4096 || !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(url)) return null;
  const q = url.indexOf('?');
  const h = url.indexOf('#');
  let raw = '';
  if (q >= 0 && (h < 0 || q < h)) raw = url.slice(q + 1, h >= 0 ? h : undefined);
  else if (h >= 0) raw = url.slice(h + 1);
  const params = new Map<string, string>();
  for (const part of raw.split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    let key: string;
    let value: string;
    try {
      key = decodeURIComponent((i >= 0 ? part.slice(0, i) : part).replace(/\+/g, ' '));
      value = decodeURIComponent((i >= 0 ? part.slice(i + 1) : '').replace(/\+/g, ' '));
    } catch {
      return null;
    }
    if (params.has(key)) return null;
    params.set(key, value);
  }
  return params;
}

/**
 * 客户端用：读回跳 URL。`state` 不是自己发出去的那个就当失败（防止别人塞来的 code）。
 * URL 里要是出现 `token` / `access_token`，说明服务端还在走旧回调，也当失败，不去用它。
 */
export function readAuthHandoffCallbackV1(
  url: string,
  expectedState: string,
): { kind: 'code'; code: string } | { kind: 'error'; error: AuthHandoffCallbackErrorV1 } | { kind: 'invalid' } {
  const params = parseAuthHandoffCallbackParamsV1(url);
  if (!params) return { kind: 'invalid' };
  if (params.has('token') || params.has('access_token')) return { kind: 'invalid' };
  if (params.get('state') !== expectedState || !AUTH_HANDOFF_STATE_PATTERN.test(expectedState)) return { kind: 'invalid' };
  const error = params.get('error');
  if (error !== undefined) {
    return (AUTH_HANDOFF_CALLBACK_ERRORS as readonly string[]).includes(error)
      ? { kind: 'error', error: error as AuthHandoffCallbackErrorV1 }
      : { kind: 'error', error: 'login_failed' };
  }
  const code = params.get('code');
  return code && AUTH_HANDOFF_CODE_PATTERN.test(code) ? { kind: 'code', code } : { kind: 'invalid' };
}
