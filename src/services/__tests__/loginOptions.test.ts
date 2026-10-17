/**
 * E84 A / E86 (I-049, I-051, I-052): the phone's sign-in page shows only what the server can serve
 * (`GET /api/auth/providers`), split by the contract's own `splitAuthProvidersV1`. Negatives run every
 * time: an unavailable method is never shown; Apple needs a path the platform can use; a failed read never
 * invents a method; the page still offers 更多方式 and 先逛逛.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import { AUTH_PROVIDER_IDS, splitAuthProvidersV1, type AuthProviderIdV1 } from '../../../shared/types/auth-providers';
import { LOGIN_LEGAL_URLS, LOGIN_METHODS, isLoginCode, isLoginEmail, loginLayout, loginScreenLayout } from '../loginOptions';
import { AUTH_PROVIDERS_CACHE_MS, clearAuthProvidersCache, readAuthProviders } from '../authProviders';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const screen = fs.readFileSync(path.join(ROOT, 'src/screens/auth/LoginScreen.tsx'), 'utf8');

type Status = { available: boolean; browserRedirect?: boolean; nativeSdk?: boolean };
function body(statuses: Partial<Record<AuthProviderIdV1, Status>>) {
  return {
    schemaVersion: 1,
    providers: AUTH_PROVIDER_IDS.map((id) => {
      const status = statuses[id] ?? { available: false };
      return {
        id,
        available: status.available,
        ...(status.available ? {} : { reason: 'not_configured' }),
        browserRedirect: status.browserRedirect ?? (status.available && id !== 'wallet' && id !== 'password'),
        nativeSdk: status.nativeSdk ?? false,
      };
    }),
  };
}
function transport(route: { status: number; body: unknown } | 'throw' | 'hang'): HttpTransportV1 & { calls: HttpRequestV1[] } {
  const calls: HttpRequestV1[] = [];
  return {
    calls,
    async request(request: HttpRequestV1): Promise<HttpResponseV1> {
      calls.push(request);
      if (route === 'throw') throw new Error('offline');
      if (route === 'hang') return new Promise(() => undefined);
      return { status: route.status, headers: {}, body: route.body };
    },
  };
}
async function read(route: Parameters<typeof transport>[0], extra: Record<string, unknown> = {}) {
  clearAuthProvidersCache();
  const http = transport(route);
  const value = await readAuthProviders({ baseUrl: 'https://api.example.test/api', transport: http, ...extra });
  return { value, http };
}
const ids = (layout: ReturnType<typeof loginLayout>) => ({ primary: layout.primary.map((m) => m.id), more: layout.more.map((m) => m.id) });

describe('loginLayout', () => {
  it('the production shape expected after 上线 3: no Apple, email code only when mail and Redis work', async () => {
    const { value } = await read({
      status: 200,
      body: body({ google: { available: true }, discord: { available: true }, telegram: { available: true }, wallet: { available: true }, password: { available: true } }),
    });
    expect(ids(loginLayout(value, 'android'))).toEqual({ primary: ['google'], more: ['email_password', 'wallet', 'discord', 'telegram', 'openclaw'] });
  });

  it('everything available: the contract order for the main buttons (email code, Google, Apple)', async () => {
    const all = Object.fromEntries(AUTH_PROVIDER_IDS.map((id) => [id, { available: true, nativeSdk: id === 'apple' }]));
    const { value } = await read({ status: 200, body: body(all) });
    expect(ids(loginLayout(value, 'ios'))).toEqual({ primary: ['email_code', 'google', 'apple'], more: ['email_password', 'wallet', 'x', 'discord', 'telegram', 'openclaw'] });
    // The phone never reorders or adds a main button beyond what the contract's split gives.
    expect(loginLayout(value, 'ios').primary.map((m) => m.id)).toEqual(splitAuthProvidersV1(value).primary);
  });

  it('Apple: iOS may use the native SDK; Android needs the browser path', async () => {
    const nativeOnly = (await read({ status: 200, body: body({ apple: { available: true, browserRedirect: false, nativeSdk: true } }) })).value;
    expect(ids(loginLayout(nativeOnly, 'ios')).primary).toEqual(['apple']);
    expect(ids(loginLayout(nativeOnly, 'android')).primary).toEqual([]);
    const browser = (await read({ status: 200, body: body({ apple: { available: true, browserRedirect: true } }) })).value;
    expect(ids(loginLayout(browser, 'android')).primary).toEqual(['apple']);
    // A server that says unavailable is believed, whatever the flags say.
    const off = (await read({ status: 200, body: { schemaVersion: 1, providers: [{ id: 'apple', available: false, browserRedirect: true, nativeSdk: true }] } })).value;
    expect(ids(loginLayout(off, 'ios')).primary).toEqual([]);
  });

  it('a list that cannot be read shows what the contract falls back to, plus OpenClaw; nothing invented', () => {
    const fallback = splitAuthProvidersV1(null);
    const layout = ids(loginLayout(null, 'android'));
    expect(layout.primary).toEqual(fallback.primary.map((id) => (id === 'password' ? 'email_password' : id)));
    expect(layout.more).toEqual([...fallback.more.map((id) => (id === 'password' ? 'email_password' : id)), 'openclaw']);
  });

  it('every method has a literal test id', () => {
    for (const method of Object.values(LOGIN_METHODS)) expect(method.testId).toBe(`login-${method.id.replace('_', '-')}`);
  });

  it('no sign-in label uses the retired names (T7 r1: 连接私有龙虾实例 / Self-hosted OpenClaw instance)', () => {
    for (const method of Object.values(LOGIN_METHODS)) {
      expect(`${method.label.zh} ${method.label.en}`).not.toMatch(/龙虾|OpenClaw|🦀/i);
    }
    expect(LOGIN_METHODS.openclaw.label).toEqual({ zh: '连接自己部署的服务器', en: 'Connect your own server' });
  });
});

const shown = (layout: ReturnType<typeof loginLayout>) => {
  const value = loginScreenLayout(layout);
  return { main: value.main.map((m) => m.id), more: value.more.map((m) => m.id), openMore: value.openMore };
};

describe('loginScreenLayout (T7 r1: the page always has one clear way in)', () => {
  it('staging today (only email + password and a wallet): email + password becomes the main button, nothing opens by itself', async () => {
    const { value } = await read({ status: 200, body: body({ wallet: { available: true }, password: { available: true } }) });
    expect(ids(loginLayout(value, 'android')).primary).toEqual([]);
    expect(shown(loginLayout(value, 'android'))).toEqual({ main: ['email_password'], more: ['wallet', 'openclaw'], openMore: false });
  });

  it('with main methods from the server nothing is promoted and the lists are unchanged', async () => {
    const { value } = await read({
      status: 200,
      body: body({ google: { available: true }, discord: { available: true }, wallet: { available: true }, password: { available: true } }),
    });
    const layout = loginLayout(value, 'android');
    expect(shown(layout)).toEqual({ main: ids(layout).primary, more: ids(layout).more, openMore: false });
    expect(shown(layout).main).toEqual(['google']);
  });

  it('the self-hosted server option is never promoted; with nothing else, 更多方式 opens by itself', async () => {
    const { value } = await read({ status: 200, body: body({}) });
    const layout = loginLayout(value, 'android');
    expect(ids(layout)).toEqual({ primary: [], more: ['openclaw'] });
    expect(shown(layout)).toEqual({ main: [], more: ['openclaw'], openMore: true });
  });

  it('a list that cannot be read: the contract fallback decides, then the same rule', () => {
    const layout = loginLayout(null, 'android');
    const result = shown(layout);
    expect(result.main.length).toBeGreaterThan(0);
    expect(result.main).not.toContain('openclaw');
    expect([...result.main, ...result.more].sort()).toEqual([...ids(layout).primary, ...ids(layout).more].sort());
  });
});

describe('readAuthProviders', () => {
  it('one public GET, no token, decoded by the contract; kept 60 s', async () => {
    clearAuthProvidersCache();
    let now = 1_000;
    const http = transport({ status: 200, body: body({ google: { available: true } }) });
    const input = { baseUrl: 'https://api.example.test/api/', transport: http, now: () => now };
    const first = await readAuthProviders(input);
    expect(http.calls).toHaveLength(1);
    expect(http.calls[0]).toMatchObject({ method: 'GET', path: 'https://api.example.test/api/auth/providers' });
    expect(http.calls[0].headers).not.toHaveProperty('Authorization');
    expect(first?.providers.find((p) => p.id === 'google')?.available).toBe(true);
    now += AUTH_PROVIDERS_CACHE_MS - 1;
    expect(await readAuthProviders(input)).toBe(first);
    expect(http.calls).toHaveLength(1);
    now += 2;
    await readAuthProviders(input);
    expect(http.calls).toHaveLength(2);
  });

  it('a failure is null and is not kept: non-2xx, bad body, network error, no answer in time', async () => {
    expect((await read({ status: 404, body: { message: 'Not Found' } })).value).toBeNull();
    expect((await read({ status: 500, body: {} })).value).toBeNull();
    expect((await read({ status: 200, body: { schemaVersion: 2, providers: [] } })).value).toBeNull();
    expect((await read({ status: 200, body: '<html>' })).value).toBeNull();
    expect((await read('throw')).value).toBeNull();
    expect((await read('hang', { timeoutMs: 10 })).value).toBeNull();
    // After a failure the next read asks again.
    clearAuthProvidersCache();
    const bad = transport({ status: 503, body: {} });
    await readAuthProviders({ baseUrl: 'https://a/api', transport: bad });
    await readAuthProviders({ baseUrl: 'https://a/api', transport: bad });
    expect(bad.calls).toHaveLength(2);
  });

  it('a cached answer is per API base (staging and production never share one)', async () => {
    clearAuthProvidersCache();
    const http = transport({ status: 200, body: body({ google: { available: true } }) });
    await readAuthProviders({ baseUrl: 'https://api.agentrix.top/api', transport: http });
    await readAuthProviders({ baseUrl: 'https://stg.agentrix.top/api', transport: http });
    expect(http.calls.map((call) => call.path)).toEqual(['https://api.agentrix.top/api/auth/providers', 'https://stg.agentrix.top/api/auth/providers']);
  });
});

describe('input checks', () => {
  it('validates the email and the code before anything is sent', () => {
    expect(['a@b.co', ' name@example.com '].map(isLoginEmail)).toEqual([true, true]);
    expect(['', 'a@b', 'no at', 'a @b.co'].map(isLoginEmail)).toEqual([false, false, false, false]);
    expect(['1234', '123456', ' 12345678 '].map(isLoginCode)).toEqual([true, true, true]);
    expect(['123', '123456789', '12a456', ''].map(isLoginCode)).toEqual([false, false, false, false]);
  });
});

describe('LoginScreen wiring', () => {
  it('calls the same sign-in functions as before and keeps the guest entry', () => {
    for (const fn of ['loginWithGoogle', 'loginWithApple', 'loginWithX', 'loginWithDiscord', 'loginWithTelegram', 'loginWithEmail', 'registerWithEmail', 'sendEmailCode', 'loginWithEmailCode', 'loginWithOpenClaw', 'loginAsGuest']) {
      expect([fn, screen.includes(`${fn}`)]).toEqual([fn, true]);
    }
    expect(screen).toContain("navigate('WalletConnect')");
    expect(screen).toContain('testID="login-guest"');
    expect(screen).not.toMatch(/apiFetch|[^A-Za-z.]fetch\(/);
  });

  it('draws the buttons from the server list: the first main one solid, 更多方式 opens by itself only when nothing can be the main button', () => {
    expect(screen).toContain('readAuthProviders()');
    expect(screen).toContain("const layout = loginLayout(providers.kind === 'ready' ? providers.value : null, Platform.OS);");
    expect(screen).toContain('const shown = loginScreenLayout(layout);');
    expect(screen).toContain("shown.main.map((method, index) => methodButton(method, index === 0 ? 'solid' : 'outline'))");
    expect(screen).toContain("shown.more.map((method) => methodButton(method, 'more'))");
    expect(screen).toContain("const moreOpen = showMore || (providers.kind === 'ready' && shown.openMore);");
    // No buttons while the list is still being read, so nothing swaps under a finger.
    expect(screen).toMatch(/providers\.kind === 'ready' \? shown\.main\.map/);
    expect(screen).not.toMatch(/Connect Crypto Wallet|连接加密钱包/);
  });

  it('says nothing in the retired names, and the legal documents it names can be opened (T7 r1)', () => {
    expect(screen).not.toMatch(/龙虾|my-openclaw|Self-hosted OpenClaw|OpenClaw URL|OpenClaw 地址/);
    expect(screen).toContain('Linking.openURL(LOGIN_LEGAL_URLS.terms)');
    expect(screen).toContain('Linking.openURL(LOGIN_LEGAL_URLS.privacy)');
    expect(screen).toContain('testID="login-terms"');
    expect(screen).toContain('testID="login-privacy"');
    expect(LOGIN_LEGAL_URLS).toEqual({ terms: 'https://agentrix.top/terms', privacy: 'https://agentrix.top/privacy' });
  });

  it('the wallet page opened from sign-in has a way back (T7 r1)', () => {
    const root = fs.readFileSync(path.join(ROOT, 'src/navigation/RootNavigator.tsx'), 'utf8');
    const wallet = root.slice(root.indexOf('name="WalletConnect"'), root.indexOf('</AuthStack.Navigator>'));
    expect(wallet).toContain('headerShown: true');
    expect(wallet).toContain('headerTintColor: palette.textPrimary');
  });

  it('takes its colours from the theme, not a hard-coded dark page (E83)', () => {
    expect(screen).toContain('useThemedStyles(makeStyles)');
    expect(screen).not.toMatch(/#000000|#ffffff|#aaaaaa|#888888/i);
  });

  it('the old unused login screen is gone', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/screens/LoginScreen.tsx'))).toBe(false);
  });
});
