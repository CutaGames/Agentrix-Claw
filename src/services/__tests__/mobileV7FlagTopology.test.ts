import {
  DEFAULT_MOBILE_V6_FEATURE_FLAGS,
  MOBILE_V6_FEATURE_FLAG_DEPENDENCIES,
  MOBILE_V6_FEATURE_FLAG_NAMES,
  configureMobileV6FeatureFlags,
  configureMobileV6FeatureFlagsFromEnvironment,
  isAgentFirstIaEnabled,
  isMobileV6FeatureFlagName,
  isPetSurfaceEnabled,
  isTwinSurfaceEnabled,
  isWorldPlazaSurfaceEnabled,
  resetMobileV6FeatureFlags,
  resolveMobileV6FeatureFlags,
} from '../mobileV6FeatureFlags';

function withEnv(entries: Record<string, string | undefined>, run: () => void): void {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(entries)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('MTR-R05.4 — the dead mobile.v6_ia flag is gone', () => {
  it('is no longer in the flag table', () => {
    expect(MOBILE_V6_FEATURE_FLAG_NAMES).not.toContain('mobile.v6_ia');
    expect(DEFAULT_MOBILE_V6_FEATURE_FLAGS).not.toHaveProperty('mobile.v6_ia');
    expect(isMobileV6FeatureFlagName('mobile.v6_ia')).toBe(false);
  });

  it('ignores it if a stale remote payload still sends it', () => {
    // Compared against "resolve nothing" rather than the raw default table:
    // `mobile.pet_l2_surface` defaults on but depends on the Agent-first IA,
    // so the dependency pass turns it off whenever the IA flag is off.
    expect(resolveMobileV6FeatureFlags({ remote: { 'mobile.v6_ia': true } as never }))
      .toEqual(resolveMobileV6FeatureFlags());
  });
});

describe('MTR-R06.4 / design §3 — import-order trap', () => {
  afterEach(() => resetMobileV6FeatureFlags());

  it('resolves off before configure and on after, for the same env', () => {
    withEnv({ EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA: '1' }, () => {
      resetMobileV6FeatureFlags();
      // This is the state any module-scope reader sees: env says on, the flag
      // table has not been configured yet, so the honest answer is off.
      expect(isAgentFirstIaEnabled()).toBe(false);

      configureMobileV6FeatureFlagsFromEnvironment();
      expect(isAgentFirstIaEnabled()).toBe(true);
    });
  });

  it('goes back off when the env flag is absent', () => {
    withEnv({ EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA: undefined }, () => {
      configureMobileV6FeatureFlagsFromEnvironment();
      expect(isAgentFirstIaEnabled()).toBe(false);
    });
  });
});

describe('MTR-R26.1/.3 — mobile.twin_surface', () => {
  afterEach(() => resetMobileV6FeatureFlags());

  it('defaults off', () => {
    expect(DEFAULT_MOBILE_V6_FEATURE_FLAGS['mobile.twin_surface']).toBe(false);
  });

  it('declares its dependency on the Agent-first IA', () => {
    expect(MOBILE_V6_FEATURE_FLAG_DEPENDENCIES)
      .toContainEqual(['mobile.twin_surface', 'mobile.agent_first_ia']);
  });

  it('resolves off when the prerequisite is off', () => {
    expect(resolveMobileV6FeatureFlags({
      local: { 'mobile.twin_surface': true, 'mobile.agent_first_ia': false },
    })['mobile.twin_surface']).toBe(false);
  });

  it('resolves on only with the prerequisite on', () => {
    expect(resolveMobileV6FeatureFlags({
      local: { 'mobile.twin_surface': true, 'mobile.agent_first_ia': true },
    })['mobile.twin_surface']).toBe(true);
  });

  it('follows the prerequisite down when that one is kill-switched', () => {
    const resolved = resolveMobileV6FeatureFlags({
      local: { 'mobile.twin_surface': true, 'mobile.agent_first_ia': true },
      killSwitches: { 'mobile.agent_first_ia': true },
    });
    expect(resolved['mobile.agent_first_ia']).toBe(false);
    expect(resolved['mobile.twin_surface']).toBe(false);
  });

  it('can be killed on its own without touching the IA', () => {
    const resolved = resolveMobileV6FeatureFlags({
      local: { 'mobile.twin_surface': true, 'mobile.agent_first_ia': true },
      killSwitches: { 'mobile.twin_surface': true },
    });
    expect(resolved['mobile.agent_first_ia']).toBe(true);
    expect(resolved['mobile.twin_surface']).toBe(false);
  });

  it('reads EXPO_PUBLIC_MOBILE_TWIN_SURFACE only for the exact value 1', () => {
    withEnv(
      { EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA: '1', EXPO_PUBLIC_MOBILE_TWIN_SURFACE: 'true' },
      () => {
        expect(configureMobileV6FeatureFlagsFromEnvironment()['mobile.twin_surface']).toBe(false);
      },
    );
    withEnv(
      { EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA: '1', EXPO_PUBLIC_MOBILE_TWIN_SURFACE: '1' },
      () => {
        configureMobileV6FeatureFlagsFromEnvironment();
        expect(isTwinSurfaceEnabled()).toBe(true);
      },
    );
    withEnv(
      { EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA: '0', EXPO_PUBLIC_MOBILE_TWIN_SURFACE: '1' },
      () => {
        configureMobileV6FeatureFlagsFromEnvironment();
        expect(isTwinSurfaceEnabled()).toBe(false);
      },
    );
  });
});

describe('MTR-R09.3/.8 — mobile.pet_l2_surface is the Shell kill switch (decision d-35, M0.0.8 = Shell)', () => {
  afterEach(() => resetMobileV6FeatureFlags());

  it('defaults ON (the Pet family is not withdrawn) and depends on the Agent-first IA', () => {
    expect(DEFAULT_MOBILE_V6_FEATURE_FLAGS['mobile.pet_l2_surface']).toBe(true);
    expect(MOBILE_V6_FEATURE_FLAG_DEPENDENCIES)
      .toContainEqual(['mobile.pet_l2_surface', 'mobile.agent_first_ia']);
  });

  it('leaves the legacy IA ungated: Pet surfaces are LIVE_BASELINE there', () => {
    configureMobileV6FeatureFlags({ local: { 'mobile.agent_first_ia': false } });
    expect(isPetSurfaceEnabled()).toBe(true);
    configureMobileV6FeatureFlags({
      local: { 'mobile.agent_first_ia': false, 'mobile.pet_l2_surface': false },
    });
    expect(isPetSurfaceEnabled()).toBe(true);
  });

  it('keeps the Shell (floating ball / Companion layer) under Agent-first by default — live behaviour unchanged', () => {
    configureMobileV6FeatureFlags({ local: { 'mobile.agent_first_ia': true } });
    expect(isAgentFirstIaEnabled()).toBe(true);
    expect(isPetSurfaceEnabled()).toBe(true);
  });

  it('hides the whole Pet family again only through the kill switch (remote false / killSwitch / env 0)', () => {
    configureMobileV6FeatureFlags({
      local: { 'mobile.agent_first_ia': true },
      remote: { 'mobile.pet_l2_surface': false },
    });
    expect(isPetSurfaceEnabled()).toBe(false);
    configureMobileV6FeatureFlags({
      local: { 'mobile.agent_first_ia': true },
      killSwitches: { 'mobile.pet_l2_surface': true },
    });
    expect(isPetSurfaceEnabled()).toBe(false);
    withEnv(
      { EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA: '1', EXPO_PUBLIC_MOBILE_PET_L2_SURFACE: '0' },
      () => {
        configureMobileV6FeatureFlagsFromEnvironment();
        expect(isPetSurfaceEnabled()).toBe(false);
      },
    );
  });

  it('reads EXPO_PUBLIC_MOBILE_PET_L2_SURFACE only for the exact values 1 / 0', () => {
    for (const malformed of ['true', 'false', 'off', '']) {
      withEnv(
        { EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA: '1', EXPO_PUBLIC_MOBILE_PET_L2_SURFACE: malformed },
        () => {
          configureMobileV6FeatureFlagsFromEnvironment();
          // Malformed → ignored → the default (on) stands.
          expect(isPetSurfaceEnabled()).toBe(true);
        },
      );
    }
    withEnv(
      { EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA: '1', EXPO_PUBLIC_MOBILE_PET_L2_SURFACE: '1' },
      () => {
        configureMobileV6FeatureFlagsFromEnvironment();
        expect(isPetSurfaceEnabled()).toBe(true);
      },
    );
  });

  it('answers on both before and after configure under an Agent-first env, and off only once the kill switch is inlined', () => {
    // Same import-order trap as MTR-R06.4: a module-scope reader sees the
    // unconfigured table (agent_first_ia=false) and gets the legacy answer.
    // With the flag defaulting on the two answers happen to agree, but a
    // kill-switch build (`EXPO_PUBLIC_MOBILE_PET_L2_SURFACE=0`) would still be
    // read wrong at module scope — so the Companion gate MUST read per render.
    withEnv({ EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA: '1', EXPO_PUBLIC_MOBILE_PET_L2_SURFACE: '0' }, () => {
      resetMobileV6FeatureFlags();
      expect(isPetSurfaceEnabled()).toBe(true);
      configureMobileV6FeatureFlagsFromEnvironment();
      expect(isPetSurfaceEnabled()).toBe(false);
    });
  });
});

describe('MTR-R09.2/.7 — mobile.world_plaza_l2_surface (decision d-35, M0.0.7 hidden route + L2 flag)', () => {
  afterEach(() => resetMobileV6FeatureFlags());

  it('defaults off and depends on the Agent-first IA', () => {
    expect(DEFAULT_MOBILE_V6_FEATURE_FLAGS['mobile.world_plaza_l2_surface']).toBe(false);
    expect(MOBILE_V6_FEATURE_FLAG_DEPENDENCIES)
      .toContainEqual(['mobile.world_plaza_l2_surface', 'mobile.agent_first_ia']);
  });

  it('leaves the legacy IA ungated: World / Plaza ARE the legacy IA', () => {
    configureMobileV6FeatureFlags({ local: { 'mobile.agent_first_ia': false } });
    expect(isWorldPlazaSurfaceEnabled()).toBe(true);
  });

  it('keeps World / Plaza deep links off under Agent-first by default', () => {
    configureMobileV6FeatureFlags({ local: { 'mobile.agent_first_ia': true } });
    expect(isWorldPlazaSurfaceEnabled()).toBe(false);
  });

  it('opens them again only with the flag on, and the kill switch always wins', () => {
    configureMobileV6FeatureFlags({
      local: { 'mobile.agent_first_ia': true },
      remote: { 'mobile.world_plaza_l2_surface': true },
    });
    expect(isWorldPlazaSurfaceEnabled()).toBe(true);
    configureMobileV6FeatureFlags({
      local: { 'mobile.agent_first_ia': true, 'mobile.world_plaza_l2_surface': true },
      killSwitches: { 'mobile.world_plaza_l2_surface': true },
    });
    expect(isWorldPlazaSurfaceEnabled()).toBe(false);
  });

  it('reads EXPO_PUBLIC_MOBILE_WORLD_PLAZA_L2_SURFACE only for the exact value 1', () => {
    withEnv(
      { EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA: '1', EXPO_PUBLIC_MOBILE_WORLD_PLAZA_L2_SURFACE: 'true' },
      () => {
        configureMobileV6FeatureFlagsFromEnvironment();
        expect(isWorldPlazaSurfaceEnabled()).toBe(false);
      },
    );
    withEnv(
      { EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA: '1', EXPO_PUBLIC_MOBILE_WORLD_PLAZA_L2_SURFACE: '1' },
      () => {
        configureMobileV6FeatureFlagsFromEnvironment();
        expect(isWorldPlazaSurfaceEnabled()).toBe(true);
      },
    );
  });

  it('flips from the legacy answer (on) to off once the table is configured under an Agent-first env', () => {
    withEnv({ EXPO_PUBLIC_MOBILE_AGENT_FIRST_IA: '1' }, () => {
      resetMobileV6FeatureFlags();
      expect(isWorldPlazaSurfaceEnabled()).toBe(true);
      configureMobileV6FeatureFlagsFromEnvironment();
      expect(isWorldPlazaSurfaceEnabled()).toBe(false);
    });
  });
});
