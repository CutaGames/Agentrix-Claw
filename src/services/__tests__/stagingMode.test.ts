/**
 * Preview build "连接 staging" (I-046 item 2; staging plan §9 / §9.2). Negatives run every time:
 * - without a gate key nothing is sent to the staging host;
 * - the X-Agentrix-Staging-Key header never goes to any other host, and callers cannot set it;
 * - a build without EXPO_PUBLIC_STAGING_SWITCH=1 has no switch (no store read, no entry, production);
 * - after a switch the other environment's token is never used.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as SecureStore from 'expo-secure-store';
import {
  STAGING_GATE_KEY_STORE_KEY,
  STAGING_KEY_HEADER,
  STAGING_SELECTION,
  STAGING_SELECTION_STORE_KEY,
  STAGING_SWITCH_BUILD,
  StagingRequestBlockedError,
  TOKEN_ENV_STORE_KEY,
  base64UrlBytes,
  installStagingNetworkGuard,
  md5Bytes,
  normalizeStagingKey,
  resolveStagingSelection,
  stagingRequestDecision,
  stagingSocketTicket,
  stagingSwitchAvailable,
  tokenEnvMatches,
  withStagingSocketTicket,
  type StagingSelection,
} from '../../config/stagingMode';
import { probeStagingGate, stagingBadgeText, switchToProduction, switchToStaging, type StagingSwitchDeps } from '../stagingSwitch';

const KEY = 'test-key-not-real-0123456789';
const ACTIVE: StagingSelection = { active: true, key: KEY };
const NO_KEY: StagingSelection = { active: true, key: null };
const OFF: StagingSelection = { active: false, key: null };
const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const md5Hex = (text: string) => Buffer.from(md5Bytes(text)).toString('hex');

describe('which builds have the switch', () => {
  it('only EXPO_PUBLIC_STAGING_SWITCH exactly "1"', () => {
    expect(['1', undefined, '', '0', 'true', 'yes', 1, true].map(stagingSwitchAvailable)).toEqual([true, false, false, false, false, false, false, false]);
    // This test run is a build without the flag: nothing is selected, whatever the store holds.
    expect(STAGING_SWITCH_BUILD).toBe(false);
    expect(STAGING_SELECTION).toEqual({ active: false, key: null });
  });

  it('staging needs the switch build and the stored choice; a bad key selects staging with no key', () => {
    expect(resolveStagingSelection({ switchBuild: false, selection: 'staging', key: KEY })).toEqual(OFF);
    expect(resolveStagingSelection({ switchBuild: true, selection: null, key: KEY })).toEqual(OFF);
    expect(resolveStagingSelection({ switchBuild: true, selection: 'production', key: KEY })).toEqual(OFF);
    expect(resolveStagingSelection({ switchBuild: true, selection: 'staging', key: `  ${KEY}\n` })).toEqual(ACTIVE);
    expect(resolveStagingSelection({ switchBuild: true, selection: 'staging', key: 'short' })).toEqual(NO_KEY);
    expect(resolveStagingSelection({ switchBuild: true, selection: 'staging', key: null })).toEqual(NO_KEY);
    expect(normalizeStagingKey('has space inside key 123')).toBeNull();
    expect(normalizeStagingKey('x'.repeat(257))).toBeNull();
  });

  it('the module reads the store at start only in a switch build', () => {
    const load = (flag: string | undefined) => {
      const previous = process.env.EXPO_PUBLIC_STAGING_SWITCH;
      if (flag === undefined) delete process.env.EXPO_PUBLIC_STAGING_SWITCH;
      else process.env.EXPO_PUBLIC_STAGING_SWITCH = flag;
      let result: { selection: StagingSelection; tokenEnv: string; reads: number } | undefined;
      try {
        jest.isolateModules(() => {
          // A fresh registry: seed its own copy of the store (the device already chose staging).
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const store = require('expo-secure-store');
          store.setItem(STAGING_SELECTION_STORE_KEY, 'staging');
          store.setItem(STAGING_GATE_KEY_STORE_KEY, KEY);
          const getItem = jest.spyOn(store, 'getItem');
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const mod = require('../../config/stagingMode');
          result = { selection: mod.STAGING_SELECTION, tokenEnv: mod.CURRENT_TOKEN_ENV, reads: getItem.mock.calls.length };
        });
        return result;
      } finally {
        if (previous === undefined) delete process.env.EXPO_PUBLIC_STAGING_SWITCH;
        else process.env.EXPO_PUBLIC_STAGING_SWITCH = previous;
      }
    };
    expect(load(undefined)).toEqual({ selection: OFF, tokenEnv: 'production', reads: 0 });
    expect(load('true')).toEqual({ selection: OFF, tokenEnv: 'production', reads: 0 });
    expect(load('1')).toEqual({ selection: ACTIVE, tokenEnv: 'staging', reads: 2 });
  });

  it('the build flag is read as the literal expression babel inlines, and the switch UI is gated on it', () => {
    const mode = read('src/config/stagingMode.ts');
    expect(mode).toContain('stagingSwitchAvailable(process.env.EXPO_PUBLIC_STAGING_SWITCH)');
    // The entry is on the screen that 我的 → 设置与隐私 really renders (MeStackNavigator's `Settings`), not the
    // unreferenced src/screens/SettingsScreen.tsx it was first put on (98df3b76).
    expect(read('src/navigation/MeStackNavigator.tsx')).toContain('<Stack.Screen name="Settings" component={ClawSettingsScreen}');
    const settings = read('src/screens/me/ClawSettingsScreen.tsx');
    expect(settings).toContain("onLongPress={item.id === 'version' && STAGING_SWITCH_BUILD ? () => setStagingSwitchOpen(true) : undefined}");
    expect(settings).toContain('{STAGING_SWITCH_BUILD ? <StagingSwitchModal');
    expect(read('src/screens/SettingsScreen.tsx')).not.toContain('StagingSwitchModal');
    expect(read('src/components/StagingSwitchModal.tsx')).toContain('if (!STAGING_SWITCH_BUILD) return null;');
    const env = read('src/config/env.ts');
    expect(env).toContain('if (STAGING_SELECTION.active) return \'staging\';');
    expect(env).not.toContain('staging-api.agentrix.top');
    expect(env).not.toMatch(/channel === 'staging'/);
  });

  it('the header name appears in exactly one source file, so nothing else can send it', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '__mocks__') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|jsx?)$/.test(entry.name)) files.push(full);
      }
    };
    walk(path.join(ROOT, 'src'));
    files.push(path.join(ROOT, 'App.tsx'));
    const hits = files.filter((file) => /x-agentrix-staging-key/i.test(fs.readFileSync(file, 'utf8'))).map((file) => path.relative(ROOT, file));
    expect(hits).toEqual(['src/config/stagingMode.ts']);
  });
});

describe('stagingRequestDecision', () => {
  it('while staging is selected with a key: the header goes to https / wss staging only; production Agentrix hosts are refused', () => {
    const cases: Array<[string, string]> = [
      ['https://stg.agentrix.top/api/health', 'attach'],
      ['HTTPS://STG.Agentrix.TOP:443/api/x?y=1', 'attach'],
      ['wss://stg.agentrix.top/socket.io/?EIO=4', 'attach'],
      // User info names no host: this request really goes to staging.
      ['https://api.agentrix.top@stg.agentrix.top/api', 'attach'],
      ['http://stg.agentrix.top/api', 'block:staging_insecure'],
      ['https://api.agentrix.top/api/health', 'block:production_host_in_staging'],
      ['https://www.agentrix.top/', 'block:production_host_in_staging'],
      ['https://agentrix.top/downloads/x', 'block:production_host_in_staging'],
      ['https://twin.agentrix.top/api', 'block:production_host_in_staging'],
      ['wss://api.agentrix.top/socket.io/', 'block:production_host_in_staging'],
      // Look-alikes are not staging: no header.
      ['https://stg.agentrix.top.evil.example/api', 'pass'],
      ['https://stg.agentrix.top@evil.example/api', 'pass'],
      ['https://u.expo.dev/manifest', 'pass'],
      ['data:image/png;base64,AAAA', 'pass'],
      ['file:///data/user/0/app/cache/a.jpg', 'pass'],
    ];
    const label = (url: string) => {
      const decision = stagingRequestDecision(url, ACTIVE);
      return decision.kind === 'block' ? `block:${decision.reason}` : decision.kind;
    };
    expect(cases.map(([url]) => [url, label(url)])).toEqual(cases);
  });

  it('without a key nothing goes to staging; when staging is not selected staging is refused and production passes', () => {
    expect(stagingRequestDecision('https://stg.agentrix.top/api/health', NO_KEY)).toEqual({ kind: 'block', reason: 'staging_key_missing' });
    expect(stagingRequestDecision('https://stg.agentrix.top/api/health', OFF)).toEqual({ kind: 'block', reason: 'staging_not_selected' });
    expect(stagingRequestDecision('https://api.agentrix.top/api/health', OFF)).toEqual({ kind: 'pass' });
  });
});

/** A stand-in for React Native's XMLHttpRequest: records what would go on the wire. */
function fakeXhr() {
  const sent: Array<{ url: string; headers: Record<string, string> }> = [];
  class FakeXhr {
    url = '';
    headers: Record<string, string> = {};
    open(_method: string, url: string) {
      this.url = url;
    }
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value;
    }
    send() {
      sent.push({ url: this.url, headers: { ...this.headers } });
    }
  }
  return { FakeXhr, sent };
}

function request(Xhr: any, url: string, headers: Record<string, string> = {}) {
  const xhr = new Xhr();
  xhr.open('GET', url, true);
  for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
  xhr.send();
}

describe('installStagingNetworkGuard · XMLHttpRequest (fetch is built on it)', () => {
  it('adds the key for staging only; a caller-set staging header never survives, on any host', () => {
    const { FakeXhr, sent } = fakeXhr();
    installStagingNetworkGuard({ XMLHttpRequest: FakeXhr }, ACTIVE);
    request(FakeXhr, 'https://stg.agentrix.top/api/me', { Authorization: 'Bearer s', [STAGING_KEY_HEADER]: 'forged' });
    request(FakeXhr, 'https://example.com/x', { 'x-agentrix-staging-key': 'forged', Accept: 'application/json' });
    expect(sent).toEqual([
      { url: 'https://stg.agentrix.top/api/me', headers: { Authorization: 'Bearer s', [STAGING_KEY_HEADER]: KEY } },
      { url: 'https://example.com/x', headers: { Accept: 'application/json' } },
    ]);
  });

  it('refuses before sending: no key, a production host while in staging, plain http', () => {
    const { FakeXhr, sent } = fakeXhr();
    installStagingNetworkGuard({ XMLHttpRequest: FakeXhr }, NO_KEY);
    expect(() => request(FakeXhr, 'https://stg.agentrix.top/api/me')).toThrow(StagingRequestBlockedError);
    expect(() => request(FakeXhr, 'https://api.agentrix.top/api/me')).toThrow('staging guard: production_host_in_staging');
    const other = fakeXhr();
    installStagingNetworkGuard({ XMLHttpRequest: other.FakeXhr }, ACTIVE);
    expect(() => request(other.FakeXhr, 'http://stg.agentrix.top/api/me')).toThrow('staging guard: staging_insecure');
    expect([...sent, ...other.sent]).toEqual([]);
  });

  it('in a switch build that is not connected to staging: production works, never with the header; staging is refused', () => {
    const { FakeXhr, sent } = fakeXhr();
    installStagingNetworkGuard({ XMLHttpRequest: FakeXhr }, OFF);
    request(FakeXhr, 'https://api.agentrix.top/api/me', { [STAGING_KEY_HEADER]: 'forged', Authorization: 'Bearer p' });
    expect(() => request(FakeXhr, 'https://stg.agentrix.top/api/me')).toThrow('staging guard: staging_not_selected');
    expect(sent).toEqual([{ url: 'https://api.agentrix.top/api/me', headers: { Authorization: 'Bearer p' } }]);
  });

  it('installs once', () => {
    const { FakeXhr, sent } = fakeXhr();
    installStagingNetworkGuard({ XMLHttpRequest: FakeXhr }, ACTIVE);
    installStagingNetworkGuard({ XMLHttpRequest: FakeXhr }, ACTIVE);
    request(FakeXhr, 'https://stg.agentrix.top/api/me');
    expect(sent).toEqual([{ url: 'https://stg.agentrix.top/api/me', headers: { [STAGING_KEY_HEADER]: KEY } }]);
  });
});

describe('installStagingNetworkGuard · WebSocket (§9.2 ticket)', () => {
  function fakeWs() {
    const opened: Array<{ url: string; options: unknown }> = [];
    function FakeWs(this: any, url: string, _protocols?: unknown, options?: unknown) {
      opened.push({ url, options });
      this.url = url;
    }
    (FakeWs as any).OPEN = 1;
    return { FakeWs, opened };
  }
  const NOW = (1790000000 - 24 * 3600) * 1000;

  it('a staging /socket.io/ socket carries st and e, never the key; a forged header option is dropped', () => {
    const { FakeWs, opened } = fakeWs();
    const target: Record<string, any> = { WebSocket: FakeWs };
    installStagingNetworkGuard(target, ACTIVE, () => NOW);
    const ws = new target.WebSocket('wss://stg.agentrix.top/socket.io/?EIO=4&transport=websocket', undefined, { headers: { [STAGING_KEY_HEADER]: 'forged', Origin: 'x' } });
    const { st } = stagingSocketTicket(KEY, NOW);
    expect(opened).toEqual([{ url: `wss://stg.agentrix.top/socket.io/?EIO=4&transport=websocket&st=${st}&e=1790000000`, options: { headers: { Origin: 'x' } } }]);
    expect(opened[0].url).not.toContain(KEY);
    expect(ws).toBeInstanceOf(FakeWs);
    expect(target.WebSocket.OPEN).toBe(1);
  });

  it('refuses a production socket while in staging and a staging socket without a key', () => {
    const one = fakeWs();
    const a: Record<string, any> = { WebSocket: one.FakeWs };
    installStagingNetworkGuard(a, ACTIVE);
    expect(() => new a.WebSocket('wss://api.agentrix.top/socket.io/')).toThrow('staging guard: production_host_in_staging');
    const two = fakeWs();
    const b: Record<string, any> = { WebSocket: two.FakeWs };
    installStagingNetworkGuard(b, NO_KEY);
    expect(() => new b.WebSocket('wss://stg.agentrix.top/socket.io/')).toThrow('staging guard: staging_key_missing');
    expect([...one.opened, ...two.opened]).toEqual([]);
  });

  it('only /socket.io/ on staging gets a ticket', () => {
    expect(withStagingSocketTicket('wss://stg.agentrix.top/other', KEY, NOW)).toBe('wss://stg.agentrix.top/other');
    expect(withStagingSocketTicket('wss://api.agentrix.top/socket.io/', KEY, NOW)).toBe('wss://api.agentrix.top/socket.io/');
    expect(withStagingSocketTicket('wss://stg.agentrix.top/socket.io/#h', KEY, NOW)).toMatch(/^wss:\/\/stg\.agentrix\.top\/socket\.io\/\?st=[A-Za-z0-9_-]{22}&e=1790000000#h$/);
  });
});

describe('md5 and the §9.2 ticket', () => {
  it('matches the RFC 1321 vectors and Node for multi-block and non-ASCII input', () => {
    expect(md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(md5Hex('The quick brown fox jumps over the lazy dog')).toBe('9e107d9d372bb6826bd81d3542a419d6');
    for (const text of ['x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'y'.repeat(1000), '门禁 key 🚀 staging']) {
      expect(md5Hex(text)).toBe(createHash('md5').update(text, 'utf8').digest('hex'));
    }
    const bytes = new Uint8Array([0xfb, 0xff, 0x01]);
    expect(base64UrlBytes(bytes)).toBe(Buffer.from(bytes).toString('base64url'));
    expect(base64UrlBytes(new Uint8Array([1, 2]))).toBe(Buffer.from([1, 2]).toString('base64url'));
  });

  it('reproduces the staging plan test vector (key test-key-not-real, e=1790000000)', () => {
    expect(base64UrlBytes(md5Bytes('1790000000/socket.io/ test-key-not-real'))).toBe('rjBMXrm2h68YYQ3iWmvKjQ');
    expect(stagingSocketTicket('test-key-not-real', (1790000000 - 24 * 3600) * 1000)).toEqual({ st: 'rjBMXrm2h68YYQ3iWmvKjQ', e: 1790000000 });
  });
});

describe('switching (stagingSwitch.ts)', () => {
  function deps(fail: Partial<Record<keyof StagingSwitchDeps, boolean>> = {}) {
    const calls: string[] = [];
    const step = (name: keyof StagingSwitchDeps, label: string) => async () => {
      calls.push(label);
      if (fail[name]) throw new Error(`${name} failed`);
    };
    const d: StagingSwitchDeps = {
      clearAuth: step('clearAuth', 'sign out'),
      clearLocalData: step('clearLocalData', 'wipe local data'),
      secureSet: async (key, value) => {
        calls.push(`set ${key}=${key === STAGING_GATE_KEY_STORE_KEY ? (value === KEY ? '<key>' : '<other>') : value}`);
        if (fail.secureSet) throw new Error('secureSet failed');
      },
      secureDelete: async (key) => {
        calls.push(`delete ${key}`);
      },
      reload: step('reload', 'reload'),
    };
    return { d, calls };
  }

  it('to staging: sign out and wipe first, then the key and the choice, then reload', async () => {
    const { d, calls } = deps();
    expect(await switchToStaging(`  ${KEY} `, d, true)).toEqual({ ok: true });
    expect(calls).toEqual(['sign out', 'wipe local data', `set ${STAGING_GATE_KEY_STORE_KEY}=<key>`, `set ${STAGING_SELECTION_STORE_KEY}=staging`, 'reload']);
  });

  it('to production: sign out and wipe, delete the choice and the key, reload', async () => {
    const { d, calls } = deps();
    expect(await switchToProduction(d, true)).toEqual({ ok: true });
    expect(calls).toEqual(['sign out', 'wipe local data', `delete ${STAGING_SELECTION_STORE_KEY}`, `delete ${STAGING_GATE_KEY_STORE_KEY}`, 'reload']);
  });

  it('does nothing in a build without the switch, or with a key that is not one', async () => {
    const { d, calls } = deps();
    expect(await switchToStaging(KEY, d, false)).toEqual({ ok: false, reason: 'not_a_switch_build' });
    expect(await switchToProduction(d, false)).toEqual({ ok: false, reason: 'not_a_switch_build' });
    expect(await switchToStaging('not a key', d, true)).toEqual({ ok: false, reason: 'key_invalid' });
    expect(calls).toEqual([]);
  });

  it('if signing out fails nothing is selected and nothing reloads; if storing fails the half choice is removed', async () => {
    const signOut = deps({ clearAuth: true });
    expect(await switchToStaging(KEY, signOut.d, true)).toEqual({ ok: false, reason: 'sign_out_failed' });
    expect(signOut.calls).toEqual(['sign out']);
    const store = deps({ secureSet: true });
    expect(await switchToStaging(KEY, store.d, true)).toEqual({ ok: false, reason: 'store_failed' });
    expect(store.calls).toEqual(['sign out', 'wipe local data', `set ${STAGING_GATE_KEY_STORE_KEY}=<key>`, `delete ${STAGING_SELECTION_STORE_KEY}`, `delete ${STAGING_GATE_KEY_STORE_KEY}`]);
  });

  it('the badge says when there is no key or the key is refused; the probe reads /health once', async () => {
    const urls: string[] = [];
    const probe = (status: number | 'throw') =>
      probeStagingGate(async (url) => {
        urls.push(url);
        if (status === 'throw') throw new Error('offline');
        return { status };
      }, 'https://stg.agentrix.top/api/');
    expect([await probe(200), await probe(403), await probe(502), await probe('throw')]).toEqual(['ok', 'rejected', 'unreachable', 'unreachable']);
    expect(new Set(urls)).toEqual(new Set(['https://stg.agentrix.top/api/health']));
    expect(stagingBadgeText(NO_KEY, null).zh).toBe('STAGING · 缺少门禁 key，不会发请求');
    expect(stagingBadgeText(ACTIVE, 'rejected').zh).toBe('STAGING · 门禁 key 被拒');
    expect(stagingBadgeText(ACTIVE, 'ok').zh).toBe('STAGING');
  });
});

describe('the other environment\u2019s token is never used', () => {
  it('a token without a tag is production (stored before 1.4.0); anything else must match', () => {
    expect(tokenEnvMatches(null, 'production')).toBe(true);
    expect(tokenEnvMatches(undefined, 'production')).toBe(true);
    expect(tokenEnvMatches('production', 'production')).toBe(true);
    expect(tokenEnvMatches('staging', 'production')).toBe(false);
    expect(tokenEnvMatches(null, 'staging')).toBe(false);
    expect(tokenEnvMatches('production', 'staging')).toBe(false);
    expect(tokenEnvMatches('staging', 'staging')).toBe(true);
    expect(tokenEnvMatches('weird', 'production')).toBe(false);
  });

  it('api.ts drops a staging token in a production start, and tags what it saves', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const api = require('../api');
    await SecureStore.setItemAsync('clawlink_token', 'staging-token');
    await SecureStore.setItemAsync(TOKEN_ENV_STORE_KEY, 'staging');
    expect(await api.loadTokenFromStorage()).toBeNull();
    expect(await SecureStore.getItemAsync('clawlink_token')).toBeNull();
    expect(api.getApiConfig().token).toBeUndefined();
    await api.saveTokenToStorage('production-token');
    expect(await SecureStore.getItemAsync(TOKEN_ENV_STORE_KEY)).toBe('production');
    expect(await api.loadTokenFromStorage()).toBe('production-token');
    await api.clearToken();
    expect(await SecureStore.getItemAsync(TOKEN_ENV_STORE_KEY)).toBeNull();
  });

  it('the auth store signs out instead of restoring a token from the other environment', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useAuthStore } = require('../../stores/authStore');
    await SecureStore.setItemAsync('clawlink_token', 'staging-token');
    await SecureStore.setItemAsync(TOKEN_ENV_STORE_KEY, 'staging');
    expect(await useAuthStore.getState().restoreSession()).toBe(false);
    expect(useAuthStore.getState().token).toBeNull();
    expect(await SecureStore.getItemAsync('clawlink_token')).toBeNull();
    expect(await SecureStore.getItemAsync(TOKEN_ENV_STORE_KEY)).toBeNull();
    // A production token (tagged, or untagged from 1.3.0) is restored as before.
    await SecureStore.setItemAsync('clawlink_token', 'production-token');
    expect(await useAuthStore.getState().restoreSession()).toBe(true);
    expect(useAuthStore.getState().token).toBe('production-token');
  });
});

describe('wiring', () => {
  it('App.tsx installs the guard before any other import, and shows the badge', () => {
    const app = read('App.tsx');
    const firstImport = app.split(/\r?\n/).find((line) => line.startsWith('import '));
    expect(firstImport).toBe("import './src/config/stagingGuardBoot';");
    expect(app).toContain('<StagingBadge />');
    expect(read('src/config/stagingGuardBoot.ts')).toContain('ensureStagingNetworkGuard();');
    expect(read('src/config/env.ts')).toContain('ensureStagingNetworkGuard();');
  });
});
