/**
 * "有新版本" on 关于 → 应用版本 (appVersionCheck.ts, REQ-mobile-089): only a newer version, only an https
 * agentrix.top download, only on Android; anything unreadable shows just the installed version.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import {
  APP_VERSION_DEFAULTS_V1,
  decodeAppVersionInfoResponseV1,
  isTrustedAppDownloadUrlV1,
  type AppVersionInfoResponseV1,
} from '../../../shared/types/app-version';
import { APP_VERSION_CACHE_MS, appUpdateOffer, clearAppVersionCache, compareAppVersions, readAppVersion } from '../appVersionCheck';

const APK = 'https://api.agentrix.top/downloads/clawlink-agent.apk';
const info = (latestVersion: string, apkUrl: string | null = APK): AppVersionInfoResponseV1 => ({
  ...APP_VERSION_DEFAULTS_V1,
  latestVersion,
  apkUrl,
});

function transport(response: Partial<HttpResponseV1> | Error | 'hang') {
  const calls: HttpRequestV1[] = [];
  const t: HttpTransportV1 = {
    request: jest.fn(async (req: HttpRequestV1) => {
      calls.push(req);
      if (response === 'hang') return new Promise<HttpResponseV1>(() => undefined);
      if (response instanceof Error) throw response;
      return { status: 200, headers: {}, body: undefined, ...response };
    }),
  };
  return { t, calls };
}

beforeEach(() => clearAppVersionCache());

describe('versions', () => {
  it('compares numerically, missing parts are 0', () => {
    expect(compareAppVersions('1.4.1', '1.4.0')).toBe(1);
    expect(compareAppVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareAppVersions('1.4', '1.4.0')).toBe(0);
    expect(compareAppVersions('1.3.9', '1.4.0')).toBe(-1);
    expect(compareAppVersions('2.0.0', '1.99.99')).toBe(1);
  });
});

describe('download address (contract isTrustedAppDownloadUrlV1, the phone checks it again before opening)', () => {
  it('https on agentrix.top or a subdomain only', () => {
    for (const ok of [APK, 'https://www.agentrix.top/downloads/a.apk', 'https://agentrix.top/x', 'https://agentrix.top', 'HTTPS://API.AGENTRIX.TOP/a.apk']) {
      expect(isTrustedAppDownloadUrlV1(ok)).toBe(true);
    }
    for (const bad of [
      'http://api.agentrix.top/a.apk',
      'https://agentrix.top.evil.example/a.apk',
      'https://evil.example/agentrix.top/a.apk',
      'https://xagentrix.top/a.apk',
      'https://user@agentrix.top/a.apk',
      'https://evil.example@agentrix.top/a.apk',
      'https://agentrix.top:8443/a.apk',
      'https://agentrix.top\\@evil.example/a.apk',
      'javascript:alert(1)',
      'intent://agentrix.top#Intent;end',
      ' https://agentrix.top/a.apk',
      '',
      42,
      null,
    ]) {
      expect(isTrustedAppDownloadUrlV1(bad)).toBe(false);
    }
  });
});

describe('the offer', () => {
  it('a newer version with a trusted address, on Android', () => {
    expect(appUpdateOffer(info('1.5.0'), '1.4.0', 'android')).toEqual({ latestVersion: '1.5.0', url: APK });
  });

  it('nothing when not newer, not Android, not trusted, or unreadable', () => {
    expect(appUpdateOffer(info('1.4.0'), '1.4.0', 'android')).toBeNull();
    expect(appUpdateOffer(info('1.1.0'), '1.4.0', 'android')).toBeNull(); // what the server says today
    expect(appUpdateOffer(info('1.5.0'), '1.4.0', 'ios')).toBeNull();
    expect(appUpdateOffer(info('1.5.0', 'https://evil.example/a.apk'), '1.4.0', 'android')).toBeNull();
    expect(appUpdateOffer(info('1.5.0', null), '1.4.0', 'android')).toBeNull(); // new version, no APK address set
    expect(appUpdateOffer(info('1.5.0'), '', 'android')).toBeNull();
    expect(appUpdateOffer(null, '1.4.0', 'android')).toBeNull();
  });
});

describe('reading GET /app/version', () => {
  const body = {
    latestVersion: '1.5.0',
    buildNumber: 6,
    apkUrl: APK,
    minVersion: '1.0.0',
    forceUpdate: false,
    releaseNotes: 'notes',
    releasedAt: '2026-10-15',
  };

  it('the contract decoder: the server body, also wrapped in data; an untrusted or missing address is null', () => {
    expect(decodeAppVersionInfoResponseV1(body)).toMatchObject({ latestVersion: '1.5.0', apkUrl: APK, releaseNotes: 'notes', forceUpdate: false });
    expect(decodeAppVersionInfoResponseV1({ data: body })).toMatchObject({ latestVersion: '1.5.0', apkUrl: APK });
    expect(decodeAppVersionInfoResponseV1({ ...body, latestVersion: 'latest' })).toBeNull();
    expect(decodeAppVersionInfoResponseV1({ ...body, latestVersion: '1' })).toBeNull();
    expect(decodeAppVersionInfoResponseV1({ ...body, apkUrl: undefined })).toMatchObject({ apkUrl: null });
    expect(decodeAppVersionInfoResponseV1({ ...body, apkUrl: 'https://evil.example/a.apk' })).toMatchObject({ apkUrl: null });
    expect(decodeAppVersionInfoResponseV1('1.5.0')).toBeNull();
    expect(decodeAppVersionInfoResponseV1(null)).toBeNull();
    // What the phone then offers: nothing, when the address was dropped.
    expect(appUpdateOffer(decodeAppVersionInfoResponseV1({ ...body, apkUrl: 'http://api.agentrix.top/a.apk' }), '1.4.0', 'android')).toBeNull();
    expect(appUpdateOffer(decodeAppVersionInfoResponseV1(body), '1.4.0', 'android')).toEqual({ latestVersion: '1.5.0', url: APK });
  });

  it('a public GET on the API base, no token; a good answer is kept 10 minutes per base', async () => {
    let now = 1_000;
    const { t, calls } = transport({ status: 200, body });
    const base = 'https://api.agentrix.top/api/';
    expect(await readAppVersion({ baseUrl: base, transport: t, now: () => now })).toMatchObject({ latestVersion: '1.5.0' });
    expect(calls[0]).toMatchObject({ method: 'GET', path: 'https://api.agentrix.top/api/app/version' });
    expect(calls[0].headers?.Authorization).toBeUndefined();
    now += APP_VERSION_CACHE_MS - 1;
    await readAppVersion({ baseUrl: base, transport: t, now: () => now });
    expect(calls).toHaveLength(1);
    await readAppVersion({ baseUrl: 'https://stg.agentrix.top/api', transport: t, now: () => now });
    expect(calls).toHaveLength(2);
    now += 2;
    await readAppVersion({ baseUrl: base, transport: t, now: () => now });
    expect(calls).toHaveLength(3);
  });

  it('an untrusted address from the server never leaves readAppVersion', async () => {
    for (const apkUrl of ['https://evil.example/a.apk', 'http://api.agentrix.top/a.apk', 'https://agentrix.top.evil.example/a.apk']) {
      clearAppVersionCache();
      const { t } = transport({ status: 200, body: { data: { ...body, apkUrl } } });
      expect(await readAppVersion({ baseUrl: 'https://api.agentrix.top/api', transport: t })).toMatchObject({ latestVersion: '1.5.0', apkUrl: null });
    }
  });

  it('errors, non-2xx, bad bodies and no answer are null and not kept', async () => {
    for (const response of [new Error('offline'), { status: 500, body }, { status: 200, body: { nope: true } }] as const) {
      const { t, calls } = transport(response as Partial<HttpResponseV1> | Error);
      expect(await readAppVersion({ baseUrl: 'https://api.agentrix.top/api', transport: t })).toBeNull();
      expect(await readAppVersion({ baseUrl: 'https://api.agentrix.top/api', transport: t })).toBeNull();
      expect(calls).toHaveLength(2);
    }
    const { t } = transport('hang');
    expect(await readAppVersion({ baseUrl: 'https://api.agentrix.top/api', transport: t, timeoutMs: 10 })).toBeNull();
  });
});
