/**
 * M1-i (2026-09-28) — old deep links in the four-zone IA (product doc 5.7 M1
 * "旧路由映射到新 IA 或'链接无效'页", D7): a four-zone equivalent, the hidden
 * legacy route they always opened, or the "link no longer works" notice.
 */
import { describe, it, expect, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { LEGACY_ROUTE_MAP, resolveLegacyPath, resolveLegacyRoute } from '../legacyRouteTable';
import {
  FOUR_ZONE_LEGACY_FAMILY_FALLBACKS,
  FOUR_ZONE_LEGACY_REDIRECTS,
  classifyFourZoneLegacyPath,
  fourZoneLegacyFamilyFallback,
  fourZoneStateFromLegacyPath,
  isRetiredLegacyPath,
  resolveFourZoneLinkState,
} from '../four-zone/fourZoneLegacyLinks';
import { ZONE_UNAVAILABLE_ROUTE, fourZoneTarget } from '../four-zone/fourZoneRoutes';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const app = fs.readFileSync(path.join(ROOT, 'App.tsx'), 'utf8');

/** Every path string in App.tsx's linking config, as a matcher (`:param` = one segment). */
const configBlock = app.slice(app.indexOf('config: {'), app.indexOf('export default function App'));
const registeredPatterns = [...configBlock.matchAll(/:\s*'([a-z][A-Za-z0-9/:_-]*)'/g)].map(
  (match) => new RegExp(`^${match[1].replace(/:[A-Za-z]+/g, '[^/]+')}$`),
);
const clean = (p: string) => p.replace(/[?#].*$/, '').replace(/^\/+/, '').replace(/\/+$/, '');
/** Stand-in for React Navigation's parser: a state only when some config path matches. */
const parser = (legacyPath: string) =>
  registeredPatterns.some((rx) => rx.test(clean(legacyPath))) ? { routes: [{ name: 'LEGACY', params: { path: clean(legacyPath) } }] } : undefined;

const notice = (reason: string) => ({ routes: [{ name: 'Main' }, { name: ZONE_UNAVAILABLE_ROUTE, params: { reason } }] });
const legacyKeys = Object.keys(LEGACY_ROUTE_MAP).map((key) => key.replace('agentrix://', '').replace('/*', '/x1'));

describe('retired features open the notice', () => {
  it.each(['discover/predict', '/social/dm/abc', 'co-raising/landing/xyz', 'greeting', 'airdrop', 'home/nft-mint', 'social/feed?x=1'])('%s', (p) => {
    const legacy = jest.fn(parser);
    expect(fourZoneStateFromLegacyPath(p, legacy)).toEqual(notice('link_retired'));
    expect(legacy).not.toHaveBeenCalled();
  });

  it('only the listed paths are retired (social/listener still resolves)', () => {
    expect(isRetiredLegacyPath('social/listener')).toBe(false);
    expect(isRetiredLegacyPath('discover')).toBe(false);
    expect(isRetiredLegacyPath('socialx')).toBe(false);
  });

  it('no old link lands on the hidden 集市 root except the old tab names', () => {
    const toPlazaRoot = Object.entries(LEGACY_ROUTE_MAP)
      .filter(([, target]) => target === 'agentrix://plaza')
      .map(([key]) => key.replace('agentrix://', '').replace('/*', '/x1'));
    const notRetired = toPlazaRoot.filter((p) => !isRetiredLegacyPath(p));
    expect(notRetired).toEqual(['discover']);
  });
});

describe('four-zone equivalents', () => {
  it('every redirect lands on a real four-zone screen', () => {
    for (const [from, destination] of Object.entries(FOUR_ZONE_LEGACY_REDIRECTS)) {
      expect([from, fourZoneTarget(destination.zone, destination.tab)]).not.toEqual([from, 'unavailable']);
    }
  });

  it('me/settings opens 我的 → 设置 without carrying the query', () => {
    expect(fourZoneStateFromLegacyPath('me/settings?tab=danger&ref=x', parser)).toEqual({
      routes: [{ name: 'Main', state: { routes: [{ name: 'My', state: { routes: [{ name: 'Settings', params: { tab: 'settings' } }] } }] } }],
    });
  });

  it.each([
    ['home', 'Companion'],
    ['today', 'Companion'],
    ['agent/chat', 'Companion'],
    ['pet/companion', 'My'],
    ['agent/memory', 'My'],
    ['wallet', 'My'],
    ['agent/desktop-control', 'Matters'],
    ['toy/activate', 'My'],
  ])('%s → %s tab', (p, tab) => {
    const state = fourZoneStateFromLegacyPath(p, parser) as any;
    expect(state.routes[0].name).toBe('Main');
    expect(state.routes[0].state.routes[0].name).toBe(tab);
  });
});

describe('hidden legacy routes and unknown links', () => {
  it('a link with a registered legacy route still opens it (D7)', () => {
    expect(fourZoneStateFromLegacyPath('market/skill/abc', parser)).toEqual({ routes: [{ name: 'LEGACY', params: { path: 'plaza/skills/abc' } }] });
    expect(fourZoneStateFromLegacyPath('buy?resourceId=sk1', parser)).toEqual({ routes: [{ name: 'LEGACY', params: { path: 'plaza/pets/skins/sk1' } }] });
    expect(fourZoneStateFromLegacyPath('world/map', parser)).toEqual({ routes: [{ name: 'LEGACY', params: { path: 'world/map' } }] });
  });

  it('a link no route matches opens the notice instead of doing nothing', () => {
    expect(fourZoneStateFromLegacyPath('no/such/place', parser)).toEqual(notice('link_unknown'));
  });

  it('the desktop QR link opens the in-app scanner and drops its token (M1-o)', () => {
    for (const p of ['connect?instanceId=i1&token=SECRET-TOKEN&host=10.0.0.2&port=1', 'connect', 'agent/local-connect', 'me/devices/local-connect?token=SECRET-TOKEN']) {
      const state = fourZoneStateFromLegacyPath(p, parser);
      expect([p, state]).toEqual([p, { routes: [{ name: 'LEGACY', params: { path: 'scan' } }] }]);
      expect(JSON.stringify(state)).not.toMatch(/SECRET-TOKEN|10\.0\.0\.2/);
    }
  });

  it('an unregistered old 设备 / 高级 / 钱包 link opens that family on 我的 (M1-o)', () => {
    const tabOf = (p: string) => (fourZoneStateFromLegacyPath(p, parser) as any).routes[0].state?.routes[0].state?.routes[0];
    expect(tabOf('agent/openclaw-bind')).toEqual({ name: 'MyDevices', params: { tab: 'devices' } });
    expect(tabOf('agent/cloud-deploy')).toEqual({ name: 'MyDevices', params: { tab: 'devices' } });
    expect(tabOf('agent/wearable-monitor/w1?x=1')).toEqual({ name: 'MyDevices', params: { tab: 'devices' } });
    expect(tabOf('agent/mcp')).toEqual({ name: 'Settings', params: { tab: 'settings' } });
    expect(tabOf('wallet/history/tx1')).toEqual({ name: 'WalletConnect', params: { tab: 'wallet' } });
  });

  it('a registered hidden route still wins over the family (D7)', () => {
    expect(fourZoneStateFromLegacyPath('agent/wearable', parser)).toEqual({ routes: [{ name: 'LEGACY', params: { path: 'me/devices/wearable' } }] });
  });

  it('families are real four-zone screens and match on segment boundaries only', () => {
    for (const { destination } of FOUR_ZONE_LEGACY_FAMILY_FALLBACKS) {
      expect(fourZoneTarget(destination.zone, destination.tab)).not.toBe('unavailable');
    }
    expect(fourZoneLegacyFamilyFallback('me/devicesx/1')).toBeNull();
    expect(fourZoneLegacyFamilyFallback('me/devices')).toEqual({ zone: 'my', tab: 'devices' });
  });

  it('prototype names are not redirects', () => {
    for (const p of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(classifyFourZoneLegacyPath(p)).toEqual({ kind: 'legacy', path: p });
      expect(fourZoneStateFromLegacyPath(p, parser)).toEqual(notice('link_unknown'));
    }
  });

  it('an empty path goes straight to the parser (bare scheme keeps the current screen)', () => {
    const legacy = jest.fn(() => undefined);
    expect(classifyFourZoneLegacyPath('')).toBeNull();
    expect(fourZoneStateFromLegacyPath('', legacy)).toBeUndefined();
    expect(legacy).toHaveBeenCalledWith('');
  });

  it('every entry of the legacy table ends somewhere: zone, hidden route or notice', () => {
    for (const p of legacyKeys) {
      const state = fourZoneStateFromLegacyPath(p, parser) as any;
      expect([p, state === undefined]).toEqual([p, false]);
      const last = state.routes[state.routes.length - 1];
      if (last.name === ZONE_UNAVAILABLE_ROUTE) expect(Object.keys(last.params)).toEqual(['reason']);
    }
  });
});

describe('legacy table robustness (all builds)', () => {
  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf?x=1'])('%s resolves to a plain string path and never throws', (p) => {
    const resolved = resolveLegacyPath(p);
    expect(typeof resolved).toBe('string');
    expect(resolved).toBe(p);
    expect(typeof resolveLegacyRoute(p)).toBe('string');
  });

  it('real marketplace actions still resolve', () => {
    expect(resolveLegacyPath('buy?resourceId=sk1')).toBe('plaza/pets/skins/sk1');
    expect(resolveLegacyPath('install_skill')).toBe('plaza/skills/install/');
  });
});

describe('wiring (source guards)', () => {
  it('App.tsx resolves four-zone links through resolveFourZoneLinkState, before v7 and the plain legacy path', () => {
    const fourZoneIdx = app.indexOf('resolveFourZoneLinkState(path, (legacyPath) => defaultGetStateFromPath(legacyPath, options))');
    const v7Idx = app.indexOf('isMobileV7RouteCandidate(path)');
    expect(fourZoneIdx).toBeGreaterThan(-1);
    expect(v7Idx).toBeGreaterThan(fourZoneIdx);
  });
  it('App.tsx never lets the flag-off link parser throw into the url listener', () => {
    const block = app.slice(app.indexOf('getStateFromPath: (path: string, options: any) => {'), app.indexOf('  config: {'));
    const tryIdx = block.indexOf('try {');
    expect(tryIdx).toBeGreaterThan(-1);
    expect(block.indexOf('isMobileV7RouteCandidate(path)')).toBeGreaterThan(tryIdx);
    expect(block.indexOf('defaultGetStateFromPath(normalized, options)')).toBeGreaterThan(tryIdx);
    expect(block).toMatch(/\} catch \{\s+return undefined;\s+\}/);
  });
  it('App.tsx logs links and routes only in the Maestro E2E build, without the link text', () => {
    expect(app).toMatch(/\.\.\.\(isMaestroE2E\s+\? \{ filter: \(\) => \{ console\.log\('\[maestro-e2e\] link received'\); return true; \} \}\s+: \{\}\)/);
    expect(app).toMatch(/if \(isMaestroE2E\) console\.log\('\[maestro-e2e\] link resolved to', describeLinkState\(state as any\)\);/);
    expect(app).toMatch(/onStateChange=\{isMaestroE2E \? \(state\) => console\.log\('\[maestro-e2e\] route', describeLinkState\(state as any\)\) : undefined\}/);
    expect(app).not.toMatch(/console\.log\([^)]*\bpath\b/);
  });

  it('the notice screen shows a fixed reason code only', () => {
    const screen = fs.readFileSync(path.join(ROOT, 'src', 'screens', 'four-zone', 'ZoneUnavailableScreen.tsx'), 'utf8');
    expect(screen).toMatch(/isFourZoneLinkNoticeReason\(route\.params\?\.reason\)/);
    expect(screen).toMatch(/testID="zone-link-notice-screen"/);
    expect(screen).not.toMatch(/route\.params\?\.(url|path|link)/);
  });
});

describe('resolveFourZoneLinkState (App.tsx getStateFromPath, four-zone build)', () => {
  it('a zone link wins and the legacy parser is not asked', () => {
    const legacy = jest.fn(parser);
    const state = resolveFourZoneLinkState('my/appearance', legacy) as any;
    expect(state.routes[0].state.routes[0]).toEqual({ name: 'My', state: { routes: [{ name: 'Appearance', params: { tab: 'appearance' } }] } });
    expect(legacy).not.toHaveBeenCalled();
  });
  it('anything else goes through the legacy mapping', () => {
    expect(resolveFourZoneLinkState('discover/predict', parser)).toEqual(notice('link_retired'));
    expect(resolveFourZoneLinkState('world/map', parser)).toEqual({ routes: [{ name: 'LEGACY', params: { path: 'world/map' } }] });
    expect(resolveFourZoneLinkState('no/such/place', parser)).toEqual(notice('link_unknown'));
  });
  it('never throws: a parser error (URIError on a bad escape) opens the notice', () => {
    const throwing = () => {
      throw new URIError('URI malformed');
    };
    expect(() => resolveFourZoneLinkState('onboarding/social/%E0', throwing)).not.toThrow();
    expect(resolveFourZoneLinkState('onboarding/social/%E0', throwing)).toEqual(notice('link_unknown'));
  });
  it.each(['%', 'my/%E0%A4%A', '/%zz/%', 'matters/pending?ref=%E0'])('malformed zone-looking link %s does not throw', (p) => {
    expect(() => resolveFourZoneLinkState(p, parser)).not.toThrow();
  });
});
