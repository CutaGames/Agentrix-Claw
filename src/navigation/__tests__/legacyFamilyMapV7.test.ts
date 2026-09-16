import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveLegacyPath } from '../legacyRouteTable';
import {
  legacyFamilyOf,
  resolveLegacyFamilyForV7,
  resolveLegacyFamilyPath,
  type LegacyFamilyOptions,
} from '../v7/legacyFamilyMap';
import { parseMobileV7Route } from '../v7/routeContract';

/** The composition `src/app/linking.ts` uses when `mobile.agent_first_ia` is on. */
function resolveUnderV7(path: string, options: LegacyFamilyOptions = {}): string | null {
  return resolveLegacyFamilyPath(resolveLegacyPath(path), options);
}

/**
 * Hidden routes (decision d-32): World / Plaza stay mounted in
 * `AgentFirstTabNavigator` without a tab button, and the Pet family lives in
 * the `My` stack. A pass-through result is only "not a white screen" if that
 * navigator really mounts the family it names.
 */
const HIDDEN_ROUTE = /^\/(world|plaza)(\/|\?|$)|^\/me\/(pet|axp)(\/|\?|$)/;
const PET_ON: LegacyFamilyOptions = { petSurfaceEnabled: true };

describe('MTR-R08.1 — every legacy family resolves to V7, a hidden route, or destination-error', () => {
  it.each([
    ['world/map', 'world'],
    ['summon', 'summon'],
    ['plaza/skills', 'plaza'],
    ['me/settings', 'me'],
  ])('recognises %s as the %s family', (path, family) => {
    expect(legacyFamilyOf(path)).toBe(family);
  });

  it('leaves non-family paths to the caller', () => {
    expect(legacyFamilyOf('agents/a1')).toBeNull();
    expect(resolveLegacyFamilyForV7('actions/new')).toBeNull();
    expect(resolveLegacyFamilyPath('')).toBeNull();
  });

  it.each([
    ['me', '/my'],
    ['me/account', '/my?section=account'],
    ['me/settings', '/my?section=settings'],
    ['me/orders', '/my?section=orders'],
    ['me/notifications', '/inbox'],
    ['me/scan', '/scan'],
    ['summon', '/agents'],
    ['summon/voice', '/agents'],
    ['world/creation/c_1', '/creation/c_1'],
    ['world/experience/c_1', '/creation/c_1'],
  ])('maps %s to the exact V7 counterpart %s', (input, expected) => {
    expect(resolveLegacyFamilyPath(input)).toBe(expected);
  });

  it.each([
    'world',
    'world/map',
    'world/plots',
    'world/market',
    'world/plot/p_1',
    'plaza',
    'plaza/skills',
    'plaza/tasks/t_1',
    'plaza/skills/s_1?ref=share',
  ])('passes %s through as a hidden route (M0.0.7 decided per spec default, d-32)', (input) => {
    const resolved = resolveLegacyFamilyPath(input);
    expect(resolved).toBe(`/${input}`);
    expect(resolved).toMatch(HIDDEN_ROUTE);
  });

  it('keeps World / Plaza / Me mounted as hidden tabs so the pass-through lands somewhere', () => {
    const navigator = readFileSync(
      resolve(__dirname, '../agent-first/AgentFirstTabNavigator.tsx'),
      'utf8',
    );
    for (const name of ['World', 'Plaza', 'Me']) {
      expect(navigator).toContain(`<Tab.Screen name="${name}"`);
      expect(navigator).toMatch(new RegExp(`<Tab\\.Screen name="${name}"[^\\n]*options=\\{hiddenTabOptions\\}`));
    }
  });

  describe('MTR-R09.3 / R09.8 — the Pet family follows mobile.pet_l2_surface', () => {
    const petPaths = ['me/pet/wardrobe', 'me/pet/soul', 'me/pet/breed', 'me/axp', 'me/axp/shop'];

    it.each(petPaths)('hides %s behind destination-error(surface_flag_off) when the flag is off', (input) => {
      expect(resolveLegacyFamilyPath(input, { petSurfaceEnabled: false }))
        .toBe('/destination-error?reason=surface_flag_off');
    });

    it.each(petPaths)('fails closed for %s when the caller passes no flag at all', (input) => {
      expect(resolveLegacyFamilyPath(input))
        .toBe('/destination-error?reason=surface_flag_off');
    });

    it.each(petPaths)('passes %s through as a hidden route when the flag is on', (input) => {
      const resolved = resolveLegacyFamilyPath(input, PET_ON);
      expect(resolved).toBe(`/${input}`);
      expect(resolved).toMatch(HIDDEN_ROUTE);
    });

    it('never produces the retired pending_ia_decision reason any more', () => {
      for (const input of ['world', 'plaza', ...petPaths]) {
        expect(resolveLegacyFamilyPath(input)).not.toContain('pending_ia_decision');
        expect(resolveLegacyFamilyPath(input, PET_ON)).not.toContain('pending_ia_decision');
      }
    });
  });

  it('rejects an unsafe creation id rather than building a path from it', () => {
    expect(resolveLegacyFamilyPath('world/creation/..%2fetc'))
      .toBe('/destination-error?reason=unknown_route');
  });

  it.each([
    'world/..%2f..%2fetc',
    'plaza/skills/<script>',
    'me/pet/../../destination-error',
  ])('refuses to pass %s through when a segment is not a safe opaque token', (input) => {
    expect(resolveLegacyFamilyPath(input, PET_ON))
      .toBe('/destination-error?reason=unknown_route');
  });
});

describe('MTR-R08.2 — no white screen, no loop, no wrong agent', () => {
  const families = [
    'world', 'world/map', 'world/feed', 'world/creation/c_1',
    'summon', 'summon/voice',
    'plaza', 'plaza/skills', 'plaza/pets/skins',
    'me', 'me/settings', 'me/orders', 'me/notifications', 'me/scan',
    'me/pet/wardrobe', 'me/pet/breed', 'me/axp',
    // pre-4-tab links that legacyRouteTable rewrites into a family first
    'agent/chat', 'pet/wardrobe', 'market/skill/s_1', 'discover/feed', 'today',
    'home/pet/memory', 'wallet',
  ];

  it.each([
    ['flag off', {}],
    ['flag on', PET_ON],
  ] as const)('always produces a V7-parseable path or a mounted hidden route (%s)', (_label, options) => {
    for (const input of families) {
      const resolved = resolveUnderV7(input, options);
      // `null` means "not a family" — the caller falls back to the legacy
      // table, which is a mounted destination in either IA.
      if (resolved === null) continue;
      const ok = parseMobileV7Route(resolved).ok === true || HIDDEN_ROUTE.test(resolved);
      expect({ input, resolved, ok }).toEqual({ input, resolved, ok: true });
    }
  });

  it('never routes to an agent-scoped destination', () => {
    // Landing on `/agents/<someone>` from a family link would be the
    // "wrong Agent" failure MTR-R08.2 forbids.
    for (const input of families) {
      for (const options of [{}, PET_ON]) {
        const resolved = resolveUnderV7(input, options);
        if (resolved === null) continue;
        expect(resolved).not.toMatch(/^\/agents\/[^/]+/);
      }
    }
  });

  it('is idempotent — resolving twice cannot loop', () => {
    for (const input of families) {
      for (const options of [{}, PET_ON]) {
        const once = resolveUnderV7(input, options);
        if (once === null) continue;
        const twice = resolveLegacyFamilyPath(once, options);
        // Either it is already a V7 path (not a family) or it is stable.
        expect({ input, once, stable: twice === null || twice === once })
          .toEqual({ input, once, stable: true });
      }
    }
  });
});
