/**
 * L8-14 item 10 (A30), phone side: App version, platform and install id on requests to our API.
 *
 * - the version comes from `Constants.expoConfig.version`; none (or not a version number) means no version header, never a default
 * - the install id is a random UUID v4 made once, kept in AsyncStorage (wiped on uninstall), sent only with a valid version and
 *   platform and only to our own API; when it cannot be kept it is not sent
 * - nothing is read from the hardware or an advertising id
 * - the raw id never reaches Sentry; `petPresence` / `petModeAdapters` no longer write "1.0.0"
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }), { virtual: true });

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import {
  APP_INSTALL_HEADERS_V1,
  isAppInstallIdV1,
} from '../../../shared/types/app-install-presence';
import { apiFetch, setApiConfig } from '../api';
import {
  APP_INSTALL_ID_STORAGE_KEY_V1,
  appInstallHeadersForV1,
  createAppInstallHeadersV1,
  knownAppInstallIdV1,
  readInstalledAppVersionV1,
  scrubInstallIdFromSentryEventV1,
} from '../appInstallHeaders';
import { mobileV6HttpTransport } from '../mobileV6Runtime';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '');
const ID = APP_INSTALL_HEADERS_V1.installId;

function memoryStore(initial: string | null = null) {
  let value = initial;
  return {
    get value() {
      return value;
    },
    readStored: jest.fn(async () => value),
    writeStored: jest.fn(async (id: string) => {
      value = id;
    }),
  };
}
let counter = 0;
const randomBytes = jest.fn((count: number) => {
  counter += 1;
  return Array.from({ length: count }, (_, index) => (index * 17 + counter * 31) & 0xff);
});

describe('createAppInstallHeadersV1', () => {
  beforeEach(() => {
    counter = 0;
    randomBytes.mockClear();
  });

  it('sends version, platform and a UUID v4 install id; the id is made once and kept', async () => {
    const store = memoryStore();
    const headers = createAppInstallHeadersV1({ version: () => '1.4.4', platform: () => 'android', randomBytes, ...store });
    const first = await headers.get();
    expect(first[APP_INSTALL_HEADERS_V1.version]).toBe('1.4.4');
    expect(first[APP_INSTALL_HEADERS_V1.platform]).toBe('android');
    expect(isAppInstallIdV1(first[ID])).toBe(true);
    expect(store.value).toBe(first[ID]);
    expect((await headers.get())[ID]).toBe(first[ID]);
    expect(randomBytes).toHaveBeenCalledTimes(1);
    expect(store.writeStored).toHaveBeenCalledTimes(1);
    expect(headers.knownInstallId()).toBe(first[ID]);
  });

  it('two requests at the same moment still make one id', async () => {
    const store = memoryStore();
    const headers = createAppInstallHeadersV1({ version: () => '1.4.4', platform: () => 'ios', randomBytes, ...store });
    const [a, b, c] = await Promise.all([headers.get(), headers.get(), headers.get()]);
    expect(a[ID]).toBe(b[ID]);
    expect(b[ID]).toBe(c[ID]);
    expect(randomBytes).toHaveBeenCalledTimes(1);
  });

  it('a restart keeps the stored id; an empty store (a reinstall) makes a new one', async () => {
    const store = memoryStore();
    const one = await createAppInstallHeadersV1({ version: () => '1.4.4', platform: () => 'android', randomBytes, ...store }).get();
    const restarted = await createAppInstallHeadersV1({ version: () => '1.4.5', platform: () => 'android', randomBytes, ...store }).get();
    expect(restarted[ID]).toBe(one[ID]);
    expect(restarted[APP_INSTALL_HEADERS_V1.version]).toBe('1.4.5');
    const reinstalled = await createAppInstallHeadersV1({ version: () => '1.4.5', platform: () => 'android', randomBytes, ...memoryStore() }).get();
    expect(reinstalled[ID]).not.toBe(one[ID]);
  });

  it('a stored value that is not a UUID v4 is replaced', async () => {
    const store = memoryStore('not-an-id');
    const headers = await createAppInstallHeadersV1({ version: () => '1.4.4', platform: () => 'android', randomBytes, ...store }).get();
    expect(isAppInstallIdV1(headers[ID])).toBe(true);
    expect(store.value).toBe(headers[ID]);
  });

  it('no readable version: no version header, no default, and the install id is not sent either', async () => {
    const headers = await createAppInstallHeadersV1({ version: () => undefined, platform: () => 'android', randomBytes, ...memoryStore() }).get();
    expect(headers).toEqual({ [APP_INSTALL_HEADERS_V1.platform]: 'android' });
    expect(JSON.stringify(headers)).not.toContain('1.0.0');
    expect(randomBytes).not.toHaveBeenCalled();
  });

  it('no platform: the version goes, the install id does not', async () => {
    const headers = await createAppInstallHeadersV1({ version: () => '1.4.4', platform: () => undefined, randomBytes, ...memoryStore() }).get();
    expect(headers).toEqual({ [APP_INSTALL_HEADERS_V1.version]: '1.4.4' });
  });

  it('when the id cannot be read or kept it is not sent, nothing throws, and it is not retried on every request', async () => {
    const broken = {
      readStored: jest.fn(async () => {
        throw new Error('storage down');
      }),
      writeStored: jest.fn(async () => undefined),
    };
    const headers = createAppInstallHeadersV1({ version: () => '1.4.4', platform: () => 'android', randomBytes, ...broken });
    const first = await headers.get();
    expect(first).toEqual({ [APP_INSTALL_HEADERS_V1.version]: '1.4.4', [APP_INSTALL_HEADERS_V1.platform]: 'android' });
    await headers.get();
    expect(broken.readStored).toHaveBeenCalledTimes(1);

    const cannotWrite = {
      readStored: jest.fn(async () => null),
      writeStored: jest.fn(async () => {
        throw new Error('disk full');
      }),
    };
    const second = await createAppInstallHeadersV1({ version: () => '1.4.4', platform: () => 'android', randomBytes, ...cannotWrite }).get();
    expect(second[ID]).toBeUndefined();
    expect(headers.knownInstallId()).toBeNull();
  });

  it('a version reader that throws leaves the headers out instead of throwing', async () => {
    const headers = createAppInstallHeadersV1({
      version: () => {
        throw new Error('no constants');
      },
      platform: () => 'android',
      randomBytes,
      ...memoryStore(),
    });
    await expect(headers.get()).resolves.toEqual({});
  });
});

describe('the version the app reports', () => {
  const constants = Constants as unknown as { expoConfig: { version?: unknown } };
  afterEach(() => {
    delete constants.expoConfig.version;
  });
  it('is Constants.expoConfig.version when it is a version number, else nothing (never "1.0.0")', () => {
    expect(readInstalledAppVersionV1()).toBeUndefined();
    constants.expoConfig.version = '1.4.4';
    expect(readInstalledAppVersionV1()).toBe('1.4.4');
    constants.expoConfig.version = '1.4.4-beta.1';
    expect(readInstalledAppVersionV1()).toBeUndefined();
    constants.expoConfig.version = '';
    expect(readInstalledAppVersionV1()).toBeUndefined();
    constants.expoConfig.version = 144;
    expect(readInstalledAppVersionV1()).toBeUndefined();
  });
});

describe('where the headers go', () => {
  const source = jest.fn(async () => ({ [APP_INSTALL_HEADERS_V1.version]: '1.4.4' }));
  beforeEach(() => source.mockClear());

  it('only to our own API address', async () => {
    const base = 'https://api.example.test/api';
    expect(await appInstallHeadersForV1(`${base}/oauth/connected-apps`, base, source)).toEqual({ [APP_INSTALL_HEADERS_V1.version]: '1.4.4' });
    expect(await appInstallHeadersForV1(`${base}/`, `${base}/`, source)).toEqual({ [APP_INSTALL_HEADERS_V1.version]: '1.4.4' });
    source.mockClear();
    for (const url of ['https://other.example/api/x', 'https://api.example.test/api-evil/x', 'https://api.example.test/apix', 'http://api.example.test/api/x', '/relative']) {
      expect(await appInstallHeadersForV1(url, base, source)).toEqual({});
    }
    expect(await appInstallHeadersForV1(`${base}/x`, undefined, source)).toEqual({});
    expect(await appInstallHeadersForV1(`${base}/x`, '', source)).toEqual({});
    expect(source).not.toHaveBeenCalled();
  });

  it('a source that throws gives no headers, not an error', async () => {
    const boom = jest.fn(async () => {
      throw new Error('x');
    });
    await expect(appInstallHeadersForV1('https://a.test/api/x', 'https://a.test/api', boom)).resolves.toEqual({});
  });
});

describe('on real requests (apiFetch and the shared transport)', () => {
  const realFetch = global.fetch;
  const constants = Constants as unknown as { expoConfig: { version?: unknown } };
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  beforeEach(async () => {
    calls.length = 0;
    constants.expoConfig.version = '1.4.4';
    setApiConfig({ baseUrl: 'https://api.example.test/api', token: 'tok' });
    await AsyncStorage.removeItem(APP_INSTALL_ID_STORAGE_KEY_V1);
    global.fetch = jest.fn(async (url: unknown, init?: { headers?: Record<string, string> }) => {
      calls.push({ url: String(url), headers: { ...(init?.headers ?? {}) } });
      return { ok: true, status: 200, text: async () => '{}', json: async () => ({}), headers: { forEach: () => undefined } } as unknown as Response;
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
    delete constants.expoConfig.version;
  });

  it('apiFetch adds the three headers, the same id every time, and keeps the id in AsyncStorage', async () => {
    await apiFetch('/auth/me');
    await apiFetch('/user-agents');
    expect(calls).toHaveLength(2);
    const [a, b] = calls.map((call) => call.headers);
    expect(a[APP_INSTALL_HEADERS_V1.version]).toBe('1.4.4');
    expect(a[APP_INSTALL_HEADERS_V1.platform]).toBe('android');
    expect(isAppInstallIdV1(a[ID])).toBe(true);
    expect(b[ID]).toBe(a[ID]);
    expect(a.Authorization).toBe('Bearer tok');
    expect(await AsyncStorage.getItem(APP_INSTALL_ID_STORAGE_KEY_V1)).toBe(a[ID]);
    expect(knownAppInstallIdV1()).toBe(a[ID]);
  });

  it('the shared transport adds them too, to our API only', async () => {
    await mobileV6HttpTransport.request({ method: 'GET', path: 'https://api.example.test/api/oauth/connected-apps', headers: { 'X-Agentrix-Surface': 'mobile' } });
    await mobileV6HttpTransport.request({ method: 'GET', path: 'https://elsewhere.example/thing', headers: {} });
    expect(calls[0].headers[APP_INSTALL_HEADERS_V1.version]).toBe('1.4.4');
    expect(isAppInstallIdV1(calls[0].headers[ID])).toBe(true);
    expect(calls[0].headers['X-Agentrix-Surface']).toBe('mobile');
    expect(calls[1].headers[ID]).toBeUndefined();
    expect(calls[1].headers[APP_INSTALL_HEADERS_V1.version]).toBeUndefined();
  });

  it('without a readable version the request carries none of the three headers beyond platform', async () => {
    delete constants.expoConfig.version;
    await apiFetch('/auth/me');
    expect(calls[0].headers[APP_INSTALL_HEADERS_V1.version]).toBeUndefined();
    expect(calls[0].headers[ID]).toBeUndefined();
  });
});

describe('the install id stays out of crash reports', () => {
  it('Sentry events and breadcrumbs lose the header and the phone’s own id wherever it sits', async () => {
    const headers = createAppInstallHeadersV1({ version: () => '1.4.4', platform: () => 'android', randomBytes, ...memoryStore() });
    const id = (await headers.get())[ID];
    // The default instance is what crashReport uses, so load its id the way a request does.
    const constants = Constants as unknown as { expoConfig: { version?: unknown } };
    constants.expoConfig.version = '1.4.4';
    await AsyncStorage.removeItem(APP_INSTALL_ID_STORAGE_KEY_V1);
    setApiConfig({ baseUrl: 'https://api.example.test/api' });
    const realFetch = global.fetch;
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '{}', json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;
    await apiFetch('/auth/me');
    global.fetch = realFetch;
    delete constants.expoConfig.version;
    const own = knownAppInstallIdV1() as string;
    expect(isAppInstallIdV1(own)).toBe(true);
    expect(own).not.toBe(id);

    const event = {
      message: `request failed with X-Agentrix-Install-Id: ${own}`,
      request: { url: 'https://api.example.test/api/x', headers: { accept: 'application/json', 'X-Agentrix-Install-Id': own, 'x-agentrix-app-version': '1.4.4' } },
      exception: { values: [{ type: 'Error', value: `bad thing for ${own}` }] },
      breadcrumbs: [{ category: 'fetch', data: { url: 'https://api.example.test/api/x', request_headers: { 'x-agentrix-install-id': own } }, message: `GET ${own}` }],
      extra: { note: 'unrelated', nested: [{ headerDump: `x-agentrix-install-id=${own}` }] },
    };
    const before = JSON.stringify(event);
    const clean = scrubInstallIdFromSentryEventV1(event);
    expect(JSON.stringify(event)).toBe(before);
    expect(JSON.stringify(clean)).not.toContain(own);
    expect(clean.request.headers.accept).toBe('application/json');
    expect(clean.request.headers['x-agentrix-app-version']).toBe('1.4.4');
    expect(clean.request.headers['X-Agentrix-Install-Id']).toBe('[redacted]');
    expect(clean.extra.note).toBe('unrelated');
    // Another UUID in a message is not the install id and stays.
    const other = '123e4567-e89b-42d3-a456-426614174000';
    expect(JSON.stringify(scrubInstallIdFromSentryEventV1({ message: `order ${other}` }))).toContain(other);
  });

  it('crashReport runs both Sentry hooks through the scrub', () => {
    const source = code('src/services/crashReport.ts');
    expect(source).toContain("import { scrubInstallIdFromSentryEventV1 } from './appInstallHeaders';");
    expect(source).toMatch(/return scrubInstallIdFromSentryEventV1\(event\);/);
    expect(source).toMatch(/beforeBreadcrumb\(breadcrumb\) \{\s*return scrubInstallIdFromSentryEventV1\(breadcrumb\);/);
  });

  it('nothing in the app logs the header: apiFetch and the transport never print headers', () => {
    for (const file of ['src/services/api.ts', 'src/services/mobileV6Runtime.ts', 'src/services/appInstallHeaders.ts']) {
      const source = code(file);
      expect(source).not.toMatch(/console\.(log|info|warn|error|debug)\([^)]*(headers|installHeaders|installId)/i);
    }
  });
});

describe('what the id is made from', () => {
  it('reads nothing from the hardware, the OS or an advertising id', () => {
    const source = code('src/services/appInstallHeaders.ts');
    for (const forbidden of [
      /expo-device/,
      /expo-application/,
      /expo-tracking-transparency/,
      /react-native-device-info/,
      /getAndroidId|androidId|getIosIdForVendorAsync|identifierForVendor/i,
      /advertis/i,
      /expo-secure-store/,
    ]) {
      expect(source).not.toMatch(forbidden);
    }
  });

  it('the pet presence handshake no longer invents version "1.0.0"', () => {
    for (const file of ['src/services/petPresence.ts', 'src/services/petModeAdapters.ts']) {
      const source = code(file);
      expect(source).not.toContain("'1.0.0'");
      expect(source).not.toMatch(/appVersion:\s*opts\.appVersion\s*\|\|/);
      expect(source).toContain('...(opts.appVersion ? { appVersion: opts.appVersion } : {})');
    }
  });
});
