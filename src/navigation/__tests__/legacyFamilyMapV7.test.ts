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
 * Hidden routes (decision d-35): World / Plaza stay mounted in
 * `AgentFirstTabNavigator` without a tab button behind
 * `mobile.world_plaza_l2_surface` (default off), and the Pet family lives in
 * the `My` stack behind `mobile.pet_l2_surface` (default on — the Shell kill
 * switch). A pass-through result is only "not a white screen" if that
 * navigator really mounts the family it names.
 */
const HIDDEN_ROUTE = /^\/(world|plaza)(\/|\?|$)|^\/me\/(pet|axp)(\/|\?|$)/;
const SURFACE_OFF = '/destination-error?reason=surface_flag_off';
const PET_ON: LegacyFamilyOptions = { petSurfaceEnabled: true };
const WORLD_PLAZA_ON: LegacyFamilyOptions = { worldPlazaSurfaceEnabled: true };
const ALL_ON: LegacyFamilyOptions = { petSurfaceEnabled: true, worldPlazaSurfaceEnabled: true };
const OPTION_MATRIX = [
  ['both off', {}],
  ['pet on', PET_ON],
  ['world/plaza on', WORLD_PLAZA_ON],
  ['both on', ALL_ON],
] as const;

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

  describe('MTR-R09.2 / R09.7 — World / Plaza are hidden routes behind mobile.world_plaza_l2_surface (d-35)', () => {
    const worldPlazaPaths = [
      'world',
      'world/map',
      'world/plots',
      'world/market',
      'world/plot/p_1',
      'plaza',
      'plaza/skills',
      'plaza/tasks/t_1',
      'plaza/skills/s_1?ref=share',
    ];

    it.each(worldPlazaPaths)('lands %s on destination-error(surface_flag_off) when the flag is off (the product default)', (input) => {
      expect(resolveLegacyFamilyPath(input, { worldPlazaSurfaceEnabled: false })).toBe(SURFACE_OFF);
    });

    it.each(worldPlazaPaths)('fails closed for %s when the caller passes no flag at all', (input) => {
      expect(resolveLegacyFamilyPath(input)).toBe(SURFACE_OFF);
      // The Pet flag is not the World / Plaza flag.
      expect(resolveLegacyFamilyPath(input, PET_ON)).toBe(SURFACE_OFF);
    });

    it.each(worldPlazaPaths)('passes %s through as a hidden route when the flag is on (rollback = flag, not code)', (input) => {
      const resolved = resolveLegacyFamilyPath(input, WORLD_PLAZA_ON);
      expect(resolved).toBe(`/${input}`);
      expect(resolved).toMatch(HIDDEN_ROUTE);
    });

    it.each([
      // Aeon / Market / Social / Team reach the family map through legacyRouteTable rewrites.
      ['market/skill/s_1', 'plaza'],
      ['market/task', 'plaza'],
      ['social/feed', 'plaza'],
      ['discover/feed', 'plaza'],
      ['agent/console', 'world'],
      ['home', 'world'],
    ])('folds the pre-4-tab %s link into the %s family and gates it the same way', (input, family) => {
      const rewritten = resolveLegacyPath(input);
      expect(legacyFamilyOf(rewritten)).toBe(family);
      expect(resolveUnderV7(input)).toBe(SURFACE_OFF);
      expect(resolveUnderV7(input, WORLD_PLAZA_ON)).toMatch(HIDDEN_ROUTE);
    });

    it.each(['agent/team-space', 'agent/team-invite', 'me/team/space'])(
      'lands the withdrawn Team surface (%s) on the migration card too — no Me-stack route exists for a flag to re-open',
      (input) => {
        for (const [, options] of OPTION_MATRIX) {
          expect(resolveUnderV7(input, options)).toBe(SURFACE_OFF);
        }
      },
    );

    it('never gates the Creation counterpart (Economy sub-route, MTR-R09.4) behind the World flag', () => {
      expect(resolveLegacyFamilyPath('world/creation/c_1')).toBe('/creation/c_1');
      expect(resolveLegacyFamilyPath('world/experience/c_1', { worldPlazaSurfaceEnabled: false })).toBe('/creation/c_1');
    });
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

  describe('MTR-R09.3 / R09.8 — the Pet family follows mobile.pet_l2_surface (the Shell kill switch, d-35)', () => {
    const petPaths = ['me/pet/wardrobe', 'me/pet/soul', 'me/pet/breed', 'me/axp', 'me/axp/shop'];

    it.each(petPaths)('hides %s behind destination-error(surface_flag_off) when the kill switch is thrown', (input) => {
      expect(resolveLegacyFamilyPath(input, { petSurfaceEnabled: false })).toBe(SURFACE_OFF);
    });

    it.each(petPaths)('fails closed for %s when the caller passes no flag at all (the module has no default of its own)', (input) => {
      expect(resolveLegacyFamilyPath(input)).toBe(SURFACE_OFF);
      // The World / Plaza flag is not the Pet flag.
      expect(resolveLegacyFamilyPath(input, WORLD_PLAZA_ON)).toBe(SURFACE_OFF);
    });

    it.each(petPaths)('passes %s through as a hidden route when the flag is on (the product default under d-35)', (input) => {
      const resolved = resolveLegacyFamilyPath(input, PET_ON);
      expect(resolved).toBe(`/${input}`);
      expect(resolved).toMatch(HIDDEN_ROUTE);
    });

    it('never produces the retired pending_ia_decision reason any more', () => {
      for (const input of ['world', 'plaza', ...petPaths]) {
        for (const [, options] of OPTION_MATRIX) {
          expect(resolveLegacyFamilyPath(input, options)).not.toContain('pending_ia_decision');
        }
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
  ])('refuses to pass %s through when a segment is not a safe opaque token, even with every flag on', (input) => {
    expect(resolveLegacyFamilyPath(input, ALL_ON))
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

  it.each(OPTION_MATRIX)('always produces a V7-parseable path or a mounted hidden route (%s)', (_label, options) => {
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
      for (const [, options] of OPTION_MATRIX) {
        const resolved = resolveUnderV7(input, options);
        if (resolved === null) continue;
        expect(resolved).not.toMatch(/^\/agents\/[^/]+/);
      }
    }
  });

  it('is idempotent — resolving twice cannot loop', () => {
    for (const input of families) {
      for (const [, options] of OPTION_MATRIX) {
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
