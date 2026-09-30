/**
 * E84 C on the phone (authHandoff.ts; contract shared/types/auth-handoff-code.ts, REQ-backend-076):
 * browser sign-in comes back with a one-time code and this phone's state, never the token.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import {
  AUTH_HANDOFF_START_TTL_SECONDS,
  authHandoffPkceChallengeV1,
  decodeAuthHandoffStartQueryV1,
  parseAuthHandoffCallbackParamsV1,
} from '../../../shared/types/auth-handoff-code';
import { decodeAuthProvidersResponseV1 } from '../../../shared/types/auth-providers';
import {
  MOBILE_HANDOFF_EXCHANGE_PATH,
  MOBILE_HANDOFF_FAILURE_MESSAGES,
  MOBILE_HANDOFF_PENDING_KEY,
  MobileHandoffSignInError,
  base64UrlFromBytes,
  createMobileHandoffStart,
  finishMobileHandoff,
  isMobileHandoffCallback,
  mobileHandoffCallbackUrlFromParams,
  mobileHandoffEntryUrl,
  mobileHandoffProvider,
  onceByCallbackState,
  rememberMobileHandoff,
  resetMobileHandoffForTests,
  type MobileHandoffStoreV1,
  type PendingMobileHandoffV1,
} from '../authHandoff';

const BASE = 'https://api.agentrix.top/api';
const CALLBACK = 'agentrix://auth/callback';
const T0 = 1_790_000_000_000;
const CODE = `ahc_${'A'.repeat(42)}w`;

function providersWith(handoff: Record<string, boolean>, extra: Record<string, unknown> = {}) {
  const ids = ['email_code', 'google', 'apple', 'discord', 'x', 'telegram', 'wallet', 'password'];
  return decodeAuthProvidersResponseV1({
    schemaVersion: 1,
    providers: ids.map((id) => ({
      id,
      available: true,
      browserRedirect: !['email_code', 'wallet', 'password'].includes(id),
      nativeSdk: id === 'apple',
      ...(id in handoff ? { handoff: handoff[id] } : {}),
    })),
    ...extra,
  });
}

function memoryStore(): MobileHandoffStoreV1 & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key) => (data.has(key) ? (data.get(key) as string) : null),
    set: async (key, value) => {
      data.set(key, value);
    },
    remove: async (key) => {
      data.delete(key);
    },
  };
}

function transportReturning(response: Partial<HttpResponseV1> | Error) {
  const calls: HttpRequestV1[] = [];
  const transport: HttpTransportV1 = {
    request: jest.fn(async (req: HttpRequestV1) => {
      calls.push(req);
      if (response instanceof Error) throw response;
      return { status: 200, headers: {}, body: undefined, ...response };
    }),
  };
  return { transport, calls };
}

const session = {
  schemaVersion: 1,
  accessToken: 'jwt-for-the-user',
  tokenType: 'Bearer',
  authIssuedAt: 1_790_000_000,
  user: { id: 'user-1', agentrixId: 'AX-1', email: 'a@example.com' },
};

async function started(store: MobileHandoffStoreV1, provider: 'google' | 'discord' | 'twitter' = 'google') {
  const pending = await createMobileHandoffStart(provider, CALLBACK, { now: () => T0 });
  await rememberMobileHandoff(pending, store);
  return pending;
}

const callback = (pending: PendingMobileHandoffV1, extra = '') => `${CALLBACK}?code=${CODE}&state=${pending.state}${extra}`;

beforeEach(() => {
  resetMobileHandoffForTests();
});

describe('which sign-ins hand off', () => {
  it('only Google, Discord and X, and only when this server says so', () => {
    const all = providersWith({ google: true, discord: true, x: true, apple: true, telegram: true });
    expect(mobileHandoffProvider('google', all)).toBe('google');
    expect(mobileHandoffProvider('discord', all)).toBe('discord');
    expect(mobileHandoffProvider('twitter', all)).toBe('twitter'); // the contract calls it x
    expect(mobileHandoffProvider('apple', all)).toBeNull();
    expect(mobileHandoffProvider('telegram', all)).toBeNull();
    expect(mobileHandoffProvider('x', all)).toBeNull(); // the phone's name is twitter (the server route)
  });

  it('an old backend (no handoff field), handoff false or an unreadable list keeps the old callback', () => {
    expect(mobileHandoffProvider('google', providersWith({}))).toBeNull();
    expect(mobileHandoffProvider('google', providersWith({ google: false, discord: true }))).toBeNull();
    expect(mobileHandoffProvider('discord', providersWith({ google: false, discord: true }))).toBe('discord');
    expect(mobileHandoffProvider('google', null)).toBeNull();
  });
});

describe('the start', () => {
  it('base64url without padding', () => {
    expect(base64UrlFromBytes(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
    const bytes = new Uint8Array(Array.from({ length: 50 }, (_, i) => (i * 97 + 13) & 255));
    for (const n of [0, 1, 2, 3, 31, 32, 50]) {
      expect(base64UrlFromBytes(bytes.slice(0, n))).toBe(Buffer.from(bytes.slice(0, n)).toString('base64url'));
    }
  });

  it('state and verifier are 32 random bytes each; the challenge is the contract S256 of the verifier', async () => {
    const a = await createMobileHandoffStart('google', CALLBACK, { now: () => T0 });
    const b = await createMobileHandoffStart('google', CALLBACK, { now: () => T0 });
    expect(a.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.state).not.toBe(a.codeVerifier);
    expect(a.state).not.toBe(b.state);
    expect(a.codeChallenge).toBe(authHandoffPkceChallengeV1(a.codeVerifier));
    expect(a).toMatchObject({ provider: 'google', redirectUri: CALLBACK, createdAt: T0 });
  });

  it('a broken random source is refused, not used', async () => {
    await expect(createMobileHandoffStart('google', CALLBACK, { randomBytes: async () => new Uint8Array(32) })).rejects.toThrow('handoff_random_unavailable');
    await expect(createMobileHandoffStart('google', CALLBACK, { randomBytes: async () => new Uint8Array(16).fill(7) })).rejects.toThrow('handoff_random_unavailable');
    // Stuck on one byte per call: state and verifier differ, but neither is random.
    let call = 0;
    await expect(
      createMobileHandoffStart('google', CALLBACK, { randomBytes: async () => new Uint8Array(32).fill((call += 1)) }),
    ).rejects.toThrow('handoff_random_unavailable');
  });

  it('the entry URL is the server OAuth route with exactly what the server decoder accepts', async () => {
    const pending = await createMobileHandoffStart('twitter', CALLBACK, { now: () => T0 });
    const url = mobileHandoffEntryUrl(`${BASE}/`, pending);
    expect(url.startsWith(`${BASE}/auth/twitter?`)).toBe(true);
    const query = Object.fromEntries(parseAuthHandoffCallbackParamsV1(url) ?? new Map());
    expect(Object.keys(query).sort()).toEqual(['code_challenge', 'code_challenge_method', 'handoff_client', 'redirect_uri', 'state']);
    expect(decodeAuthHandoffStartQueryV1(query, { allowExpoRedirect: false })).toEqual({
      ok: true,
      value: { client: 'mobile', state: pending.state, codeChallenge: pending.codeChallenge, redirectUri: CALLBACK },
    });
  });
});

describe('finishing the callback', () => {
  it('exchanges the code with the saved verifier once, then forgets the start', async () => {
    const store = memoryStore();
    const pending = await started(store);
    const { transport, calls } = transportReturning({ status: 200, body: session });
    const outcome = await finishMobileHandoff(callback(pending), { baseUrl: BASE, transport, store, now: () => T0 + 30_000 });
    expect(outcome).toEqual({ kind: 'signed_in', session, provider: 'google' });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].path).toBe(`${BASE}${MOBILE_HANDOFF_EXCHANGE_PATH}`);
    expect(calls[0].body).toEqual({ schemaVersion: 1, code: CODE, state: pending.state, codeVerifier: pending.codeVerifier });
    expect(calls[0].headers?.Authorization).toBeUndefined();
    expect(store.data.has(MOBILE_HANDOFF_PENDING_KEY)).toBe(false);
    // The same link again: nothing left to exchange with.
    expect(await finishMobileHandoff(callback(pending), { baseUrl: BASE, transport, store, now: () => T0 + 31_000 })).toEqual({ kind: 'failed', reason: 'expired' });
    expect(calls).toHaveLength(1);
  });

  it('a callback with somebody else\'s state is never exchanged (a code pushed in from outside)', async () => {
    const store = memoryStore();
    await started(store);
    const other = await createMobileHandoffStart('google', CALLBACK, { now: () => T0 });
    const { transport, calls } = transportReturning({ status: 200, body: session });
    expect(await finishMobileHandoff(callback(other), { baseUrl: BASE, transport, store, now: () => T0 })).toEqual({ kind: 'failed', reason: 'expired' });
    expect(await finishMobileHandoff(`${CALLBACK}?code=${CODE}`, { baseUrl: BASE, transport, store, now: () => T0 })).toEqual({ kind: 'failed', reason: 'invalid' });
    expect(calls).toHaveLength(0);
  });

  it('a callback that carries a token, or a malformed code, is refused and nothing is exchanged', async () => {
    const store = memoryStore();
    const pending = await started(store);
    const { transport, calls } = transportReturning({ status: 200, body: session });
    const opts = { baseUrl: BASE, transport, store, now: () => T0 };
    expect(await finishMobileHandoff(callback(pending, '&token=old-style'), opts)).toEqual({ kind: 'failed', reason: 'invalid' });
    expect(await finishMobileHandoff(`${CALLBACK}?code=not-a-code&state=${pending.state}`, opts)).toEqual({ kind: 'failed', reason: 'invalid' });
    expect(await finishMobileHandoff(`${CALLBACK}?code=${CODE}&code=${CODE}&state=${pending.state}`, opts)).toEqual({ kind: 'failed', reason: 'invalid' });
    expect(calls).toHaveLength(0);
    // Still ours to finish with the right link.
    expect((await finishMobileHandoff(callback(pending), opts)).kind).toBe('signed_in');
  });

  it('an error callback ends the start without an exchange', async () => {
    const store = memoryStore();
    const { transport, calls } = transportReturning({ status: 200, body: session });
    const cases: Array<[string, string]> = [
      ['login_cancelled', 'cancelled'],
      ['provider_unavailable', 'provider_unavailable'],
      ['login_failed', 'login_failed'],
      ['something_else', 'login_failed'],
    ];
    for (const [error, reason] of cases) {
      const pending = await started(store);
      const url = `${CALLBACK}?error=${error}&state=${pending.state}`;
      expect(await finishMobileHandoff(url, { baseUrl: BASE, transport, store, now: () => T0 })).toEqual({ kind: 'failed', reason });
      expect(store.data.has(MOBILE_HANDOFF_PENDING_KEY)).toBe(false);
    }
    expect(calls).toHaveLength(0);
  });

  it('server answers: 400 expired, 429 rate limited (start kept), other errors and bad bodies fail', async () => {
    const cases: Array<[Partial<HttpResponseV1> | Error, string, boolean]> = [
      [{ status: 400, body: { code: 'handoff_code_invalid' } }, 'expired', false],
      [{ status: 429, body: { code: 'handoff_rate_limited' } }, 'rate_limited', true],
      [{ status: 500, body: {} }, 'login_failed', false],
      [{ status: 200, body: { ...session, tokenType: 'MAC' } }, 'login_failed', false],
      [{ status: 200, body: { ...session, accessToken: '' } }, 'login_failed', false],
      [new Error('offline'), 'network', true],
    ];
    for (const [response, reason, kept] of cases) {
      resetMobileHandoffForTests();
      const store = memoryStore();
      const pending = await started(store);
      const { transport } = transportReturning(response);
      expect(await finishMobileHandoff(callback(pending), { baseUrl: BASE, transport, store, now: () => T0 })).toEqual({ kind: 'failed', reason });
      expect(store.data.has(MOBILE_HANDOFF_PENDING_KEY)).toBe(kept);
    }
  });

  it('reads a body wrapped in data', async () => {
    const store = memoryStore();
    const pending = await started(store, 'discord');
    const { transport } = transportReturning({ status: 200, body: { data: session } });
    expect(await finishMobileHandoff(callback(pending), { baseUrl: BASE, transport, store, now: () => T0 })).toEqual({ kind: 'signed_in', session, provider: 'discord' });
  });

  it('a cold start finishes from SecureStore; a tampered or expired saved start is not used', async () => {
    const store = memoryStore();
    const pending = await started(store);
    resetMobileHandoffForTests(); // the app process was closed while the browser was open
    const { transport, calls } = transportReturning({ status: 200, body: session });
    expect((await finishMobileHandoff(callback(pending), { baseUrl: BASE, transport, store, now: () => T0 + 60_000 })).kind).toBe('signed_in');

    const tampered = await started(memoryStore());
    resetMobileHandoffForTests();
    const tamperedStore = memoryStore();
    tamperedStore.data.set(MOBILE_HANDOFF_PENDING_KEY, JSON.stringify({ ...tampered, codeChallenge: pending.codeChallenge }));
    expect(await finishMobileHandoff(callback(tampered), { baseUrl: BASE, transport, store: tamperedStore, now: () => T0 })).toEqual({ kind: 'failed', reason: 'expired' });

    const late = memoryStore();
    const old = await started(late);
    const after = T0 + AUTH_HANDOFF_START_TTL_SECONDS * 1000 + 1;
    expect(await finishMobileHandoff(callback(old), { baseUrl: BASE, transport, store: late, now: () => after })).toEqual({ kind: 'failed', reason: 'expired' });
    expect(late.data.has(MOBILE_HANDOFF_PENDING_KEY)).toBe(false);
    expect(calls).toHaveLength(1);
  });
});

describe('one exchange per link', () => {
  it('two receivers of the same link share one run; another state runs on its own', async () => {
    let now = T0;
    const fn = jest.fn(async (url: string) => url.length);
    const once = onceByCallbackState(fn, { keepMs: 1000, now: () => now });
    const a = `${CALLBACK}?code=${CODE}&state=${'a'.repeat(43)}`;
    const b = `${CALLBACK}?code=${CODE}&state=${'b'.repeat(43)}`;
    const first = once(a);
    expect(once(a)).toBe(first);
    await first;
    once(b);
    expect(fn).toHaveBeenCalledTimes(2);
    now += 1001;
    once(a);
    expect(fn).toHaveBeenCalledTimes(3);
    // No state: not shared.
    once(`${CALLBACK}?token=x`);
    once(`${CALLBACK}?token=x`);
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it('rebuilds the link from React Navigation params, keeping a token so it is still refused', () => {
    const url = mobileHandoffCallbackUrlFromParams({ code: CODE, state: 's'.repeat(43), token: 'x', provider: 'google' });
    expect(url).toBe(`${CALLBACK}?code=${CODE}&state=${'s'.repeat(43)}&token=x`);
    expect(isMobileHandoffCallback(url)).toBe(true);
    expect(isMobileHandoffCallback(`${CALLBACK}?token=x`)).toBe(false);
    expect(isMobileHandoffCallback(null)).toBe(false);
  });

  it('sign-in errors carry text in both languages', () => {
    const error = new MobileHandoffSignInError('expired');
    expect(error.localized).toBe(MOBILE_HANDOFF_FAILURE_MESSAGES.expired);
    expect(error.message).toBe(MOBILE_HANDOFF_FAILURE_MESSAGES.expired.en);
    for (const text of Object.values(MOBILE_HANDOFF_FAILURE_MESSAGES)) {
      expect(text.en.length).toBeGreaterThan(0);
      expect(text.zh.length).toBeGreaterThan(0);
    }
  });
});
