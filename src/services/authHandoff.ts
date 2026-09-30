/**
 * authHandoff — E84 C on the phone: browser sign-in comes back with a one-time code, never the token
 * (contract `shared/types/auth-handoff-code.ts`, REQ-backend-076).
 *
 * - Only Google, Discord and X, and only when `GET /api/auth/providers` says that method hands off
 *   (`authProviderSupportsHandoffV1`). An old backend, a list that cannot be read, or any other method keeps
 *   the old callback for now, so a new phone never breaks sign-in on an old server.
 * - `state` and the PKCE `codeVerifier` are 32 random bytes each from expo-crypto, base64url (43 characters).
 * - The start is kept in memory and in SecureStore for the server's 10 minutes, so a callback that cold-starts
 *   the app (Android closed it while the browser was open) can still be finished. A new start replaces it.
 * - A callback is used only when its `state` is the one this phone sent; one that carries a token, somebody
 *   else's `state` or a malformed code is refused and nothing is exchanged.
 * - On Android the auth session result and the AuthCallback screen can both receive the same link:
 *   `onceByCallbackState` gives both the same outcome, so the code is exchanged once.
 * - Nothing here logs a URL, a code, a state or a token.
 */
import * as SecureStore from 'expo-secure-store';
import { getRandomBytesAsync } from 'expo-crypto';
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import {
  AUTH_HANDOFF_CODE_VERIFIER_PATTERN,
  AUTH_HANDOFF_SCHEMA_VERSION,
  AUTH_HANDOFF_START_QUERY_V1,
  AUTH_HANDOFF_START_TTL_SECONDS,
  AUTH_HANDOFF_STATE_PATTERN,
  authHandoffPkceChallengeV1,
  decodeAuthHandoffExchangeResponseV1,
  parseAuthHandoffCallbackParamsV1,
  readAuthHandoffCallbackV1,
  type AuthHandoffCallbackErrorV1,
  type AuthHandoffExchangeRequestV1,
  type AuthHandoffExchangeResponseV1,
} from '../../shared/types/auth-handoff-code';
import { authProviderSupportsHandoffV1, type AuthProviderIdV1, type AuthProvidersResponseV1 } from '../../shared/types/auth-providers';
import { mobileV6HttpTransport } from './mobileV6Runtime';

/** The phone's name for the method (also the server's OAuth route) → the contract's id. */
export const MOBILE_HANDOFF_PROVIDERS: Readonly<Record<'google' | 'discord' | 'twitter', AuthProviderIdV1>> = {
  google: 'google',
  discord: 'discord',
  twitter: 'x',
};
export type MobileHandoffProviderV1 = keyof typeof MOBILE_HANDOFF_PROVIDERS;

export const MOBILE_HANDOFF_EXCHANGE_PATH = '/auth/handoff/exchange';
export const MOBILE_HANDOFF_PENDING_KEY = 'agentrix_auth_handoff_pending';
/** How long a finished callback keeps its outcome for a second receiver of the same link. */
export const MOBILE_HANDOFF_ONCE_KEEP_MS = 2 * 60_000;

/** The method as the phone names it, when this server hands it off; otherwise null (old callback). */
export function mobileHandoffProvider(provider: string, providers: AuthProvidersResponseV1 | null): MobileHandoffProviderV1 | null {
  if (!Object.prototype.hasOwnProperty.call(MOBILE_HANDOFF_PROVIDERS, provider)) return null;
  const id = provider as MobileHandoffProviderV1;
  return authProviderSupportsHandoffV1(providers, MOBILE_HANDOFF_PROVIDERS[id]) ? id : null;
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url without padding. */
export function base64UrlFromBytes(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const left = bytes.length - i;
    out += BASE64URL[(n >> 18) & 63] + BASE64URL[(n >> 12) & 63];
    if (left > 1) out += BASE64URL[(n >> 6) & 63];
    if (left > 2) out += BASE64URL[n & 63];
  }
  return out;
}

export interface PendingMobileHandoffV1 {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  provider: MobileHandoffProviderV1;
  redirectUri: string;
  /** ms since epoch. */
  createdAt: number;
}

type RandomBytes = (count: number) => Promise<Uint8Array>;

async function randomToken(random: RandomBytes): Promise<string> {
  const bytes = await random(32);
  // A random source that hands back fewer bytes or one repeated value is broken: do not sign in with it.
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32 || bytes.every((b) => b === bytes[0])) {
    throw new Error('handoff_random_unavailable');
  }
  return base64UrlFromBytes(bytes);
}

export async function createMobileHandoffStart(
  provider: MobileHandoffProviderV1,
  redirectUri: string,
  deps: { randomBytes?: RandomBytes; now?: () => number } = {},
): Promise<PendingMobileHandoffV1> {
  const random = deps.randomBytes ?? getRandomBytesAsync;
  const state = await randomToken(random);
  const codeVerifier = await randomToken(random);
  if (!AUTH_HANDOFF_STATE_PATTERN.test(state) || !AUTH_HANDOFF_CODE_VERIFIER_PATTERN.test(codeVerifier) || state === codeVerifier) {
    throw new Error('handoff_random_unavailable');
  }
  return {
    state,
    codeVerifier,
    codeChallenge: authHandoffPkceChallengeV1(codeVerifier),
    provider,
    redirectUri,
    createdAt: (deps.now ?? Date.now)(),
  };
}

/** `GET /api/auth/<provider>?handoff_client=mobile&state=…&code_challenge=…&code_challenge_method=S256&redirect_uri=…` */
export function mobileHandoffEntryUrl(baseUrl: string, pending: PendingMobileHandoffV1): string {
  const K = AUTH_HANDOFF_START_QUERY_V1;
  const query = [
    [K.client, 'mobile'],
    [K.state, pending.state],
    [K.codeChallenge, pending.codeChallenge],
    [K.codeChallengeMethod, 'S256'],
    [K.redirectUri, pending.redirectUri],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `${baseUrl.replace(/\/+$/, '')}/auth/${pending.provider}?${query}`;
}

export interface MobileHandoffStoreV1 {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const secureStore: MobileHandoffStoreV1 = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  remove: (key) => SecureStore.deleteItemAsync(key),
};

let pendingInMemory: PendingMobileHandoffV1 | null = null;

function decodePending(value: unknown): PendingMobileHandoffV1 | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.state !== 'string' || !AUTH_HANDOFF_STATE_PATTERN.test(v.state)) return null;
  if (typeof v.codeVerifier !== 'string' || !AUTH_HANDOFF_CODE_VERIFIER_PATTERN.test(v.codeVerifier)) return null;
  if (typeof v.codeChallenge !== 'string' || v.codeChallenge !== authHandoffPkceChallengeV1(v.codeVerifier)) return null;
  if (typeof v.provider !== 'string' || !Object.prototype.hasOwnProperty.call(MOBILE_HANDOFF_PROVIDERS, v.provider)) return null;
  if (typeof v.redirectUri !== 'string' || typeof v.createdAt !== 'number' || !Number.isFinite(v.createdAt)) return null;
  return {
    state: v.state,
    codeVerifier: v.codeVerifier,
    codeChallenge: v.codeChallenge,
    provider: v.provider as MobileHandoffProviderV1,
    redirectUri: v.redirectUri,
    createdAt: v.createdAt,
  };
}

/** Keeps the start for the callback (a new start replaces the previous one). */
export async function rememberMobileHandoff(pending: PendingMobileHandoffV1, store: MobileHandoffStoreV1 = secureStore): Promise<void> {
  pendingInMemory = pending;
  try {
    await store.set(MOBILE_HANDOFF_PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Memory still has it; only a cold start could not finish.
  }
}

async function storedPending(store: MobileHandoffStoreV1): Promise<PendingMobileHandoffV1 | null> {
  try {
    const raw = await store.get(MOBILE_HANDOFF_PENDING_KEY);
    return raw ? decodePending(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

async function forgetMobileHandoff(state: string, store: MobileHandoffStoreV1): Promise<void> {
  if (pendingInMemory?.state === state) pendingInMemory = null;
  try {
    if ((await storedPending(store))?.state === state) await store.remove(MOBILE_HANDOFF_PENDING_KEY);
  } catch {
    // Expires by itself.
  }
}

async function findPending(state: string, store: MobileHandoffStoreV1, now: number): Promise<PendingMobileHandoffV1 | null> {
  const pending = pendingInMemory?.state === state ? pendingInMemory : await storedPending(store);
  if (!pending || pending.state !== state) return null;
  const age = now - pending.createdAt;
  if (age < -60_000 || age > AUTH_HANDOFF_START_TTL_SECONDS * 1000) {
    await forgetMobileHandoff(state, store);
    return null;
  }
  return pending;
}

export type MobileHandoffFailureV1 =
  | 'cancelled'
  | 'provider_unavailable'
  | 'login_failed'
  | 'expired'
  | 'rate_limited'
  | 'network'
  | 'invalid';

export type MobileHandoffOutcomeV1 =
  | { kind: 'signed_in'; session: AuthHandoffExchangeResponseV1; provider: MobileHandoffProviderV1 }
  | { kind: 'failed'; reason: MobileHandoffFailureV1 };

const CALLBACK_ERRORS: Record<AuthHandoffCallbackErrorV1, MobileHandoffFailureV1> = {
  login_cancelled: 'cancelled',
  provider_unavailable: 'provider_unavailable',
  login_failed: 'login_failed',
};

const failed = (reason: MobileHandoffFailureV1): MobileHandoffOutcomeV1 => ({ kind: 'failed', reason });

/** A callback link that belongs to this flow (it carries a `state`; the old callbacks never did). */
export function isMobileHandoffCallback(url: string | null | undefined): boolean {
  return typeof url === 'string' && !!parseAuthHandoffCallbackParamsV1(url)?.get('state');
}

/** The callback link again, from the params React Navigation parsed out of it. */
export function mobileHandoffCallbackUrlFromParams(
  params: Record<string, unknown> | null | undefined,
  redirectUri = 'agentrix://auth/callback',
): string {
  const parts: string[] = [];
  // Every key the reader looks at, so a link that carried a token is still refused.
  for (const key of ['code', 'state', 'error', 'token', 'access_token']) {
    const value = params?.[key];
    if (typeof value === 'string') parts.push(`${key}=${encodeURIComponent(value)}`);
  }
  return `${redirectUri}?${parts.join('&')}`;
}

/**
 * Reads the callback, checks the `state`, and exchanges the code with the saved PKCE verifier.
 * The start is forgotten once the server has answered the exchange (a code works once) or the callback
 * reported an error; a network failure keeps it until it expires.
 */
export async function finishMobileHandoff(
  url: string,
  input: { baseUrl: string; transport?: HttpTransportV1; store?: MobileHandoffStoreV1; now?: () => number },
): Promise<MobileHandoffOutcomeV1> {
  const store = input.store ?? secureStore;
  const state = parseAuthHandoffCallbackParamsV1(url)?.get('state');
  if (!state || !AUTH_HANDOFF_STATE_PATTERN.test(state)) return failed('invalid');
  const pending = await findPending(state, store, (input.now ?? Date.now)());
  if (!pending) return failed('expired');
  const read = readAuthHandoffCallbackV1(url, pending.state);
  if (read.kind === 'invalid') return failed('invalid');
  if (read.kind === 'error') {
    await forgetMobileHandoff(pending.state, store);
    return failed(CALLBACK_ERRORS[read.error]);
  }
  const body: AuthHandoffExchangeRequestV1 = {
    schemaVersion: AUTH_HANDOFF_SCHEMA_VERSION,
    code: read.code,
    state: pending.state,
    codeVerifier: pending.codeVerifier,
  };
  let response: HttpResponseV1;
  try {
    response = await (input.transport ?? mobileV6HttpTransport).request({
      method: 'POST',
      path: `${input.baseUrl.replace(/\/+$/, '')}${MOBILE_HANDOFF_EXCHANGE_PATH}`,
      headers: { Accept: 'application/json', 'X-Agentrix-Surface': 'mobile' },
      body,
    });
  } catch {
    return failed('network');
  }
  if (response.status === 429) return failed('rate_limited');
  await forgetMobileHandoff(pending.state, store);
  if (response.status === 400) return failed('expired');
  if (response.status < 200 || response.status >= 300) return failed('login_failed');
  const raw = response.body as Record<string, unknown> | undefined;
  const session =
    decodeAuthHandoffExchangeResponseV1(raw) ??
    (raw && typeof raw === 'object' ? decodeAuthHandoffExchangeResponseV1(raw.data) : null);
  return session ? { kind: 'signed_in', session, provider: pending.provider } : failed('login_failed');
}

/**
 * Runs `fn` once per callback `state`: a second receiver of the same link gets the same promise
 * (kept `keepMs` after it started). Links without a `state` are not shared.
 */
export function onceByCallbackState<T>(
  fn: (url: string) => Promise<T>,
  options: { keepMs?: number; now?: () => number } = {},
): (url: string) => Promise<T> {
  const keepMs = options.keepMs ?? MOBILE_HANDOFF_ONCE_KEEP_MS;
  const now = options.now ?? Date.now;
  const flights = new Map<string, { at: number; promise: Promise<T> }>();
  return (url: string) => {
    const at = now();
    for (const [key, flight] of flights) if (at - flight.at > keepMs) flights.delete(key);
    const key = parseAuthHandoffCallbackParamsV1(url)?.get('state') ?? '';
    const hit = key ? flights.get(key) : undefined;
    if (hit) return hit.promise;
    const promise = fn(url);
    if (key) flights.set(key, { at, promise });
    return promise;
  };
}

export const MOBILE_HANDOFF_FAILURE_MESSAGES: Readonly<Record<MobileHandoffFailureV1, { en: string; zh: string }>> = {
  cancelled: { en: 'Sign-in was cancelled.', zh: '已取消登录。' },
  provider_unavailable: { en: 'This sign-in method is not available right now. Please use another one.', zh: '这种登录方式暂时用不了，请换一种。' },
  login_failed: { en: 'Sign-in did not complete. Please try again.', zh: '登录没有完成，请重试。' },
  expired: { en: 'This sign-in has expired. Please sign in again from the app.', zh: '这次登录已过期，请在 App 里重新登录。' },
  rate_limited: { en: 'Too many attempts. Please wait a minute and try again.', zh: '尝试次数太多，请过一分钟再试。' },
  network: { en: 'Could not reach Agentrix. Check the network and try again.', zh: '连不上 Agentrix，请检查网络后重试。' },
  invalid: { en: 'This sign-in could not be used. Please sign in again.', zh: '这次登录的回跳不能用，请重新登录。' },
};

/** Thrown by the sign-in functions; screens show `localized` in the app language. */
export class MobileHandoffSignInError extends Error {
  readonly reason: MobileHandoffFailureV1;
  readonly localized: { en: string; zh: string };
  constructor(reason: MobileHandoffFailureV1) {
    super(MOBILE_HANDOFF_FAILURE_MESSAGES[reason].en);
    this.name = 'MobileHandoffSignInError';
    this.reason = reason;
    this.localized = MOBILE_HANDOFF_FAILURE_MESSAGES[reason];
  }
}

/** Test hook: forget the in-memory start. */
export function resetMobileHandoffForTests(): void {
  pendingInMemory = null;
}
