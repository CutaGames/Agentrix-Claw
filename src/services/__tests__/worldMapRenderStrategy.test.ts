/**
 * Unit tests for the World_Map render strategy (Task 10.3, R13).
 *
 * Pure-logic tests (no RN/Expo runtime) covering device-tier degradation and
 * Tier_C dispatch planning. Lives under src/services/__tests__ so the existing
 * node-env jest config picks it up.
 */

import {
  DEGRADED_QUALITY_PARAMS,
  FULL_QUALITY_PARAMS,
  canPlayTierCOnDevice,
  getRenderQualityParams,
  planExperienceLaunch,
  resolveRenderQuality,
  type MapRenderProfile,
} from '../../world-creation/renderStrategy';

const HIGH_MOBILE: MapRenderProfile = {
  deviceTier: 'high',
  supports3D: true,
  degradedMode: false,
  isMobile: true,
};
const MID_MOBILE: MapRenderProfile = {
  deviceTier: 'mid',
  supports3D: true,
  degradedMode: false,
  isMobile: true,
};
const LOW_MOBILE: MapRenderProfile = {
  deviceTier: 'low',
  supports3D: false,
  degradedMode: true,
  isMobile: true,
};
const DESKTOP: MapRenderProfile = {
  deviceTier: 'mid',
  supports3D: true,
  degradedMode: false,
  isMobile: false,
};

describe('resolveRenderQuality (R13.2/R13.3)', () => {
  it('renders full quality only when the device clears the full profile', () => {
    expect(resolveRenderQuality(HIGH_MOBILE)).toBe('full');
  });

  it('degrades on a mid-tier device', () => {
    expect(resolveRenderQuality(MID_MOBILE)).toBe('degraded');
  });

  it('degrades on a low-tier / degradedMode device', () => {
    expect(resolveRenderQuality(LOW_MOBILE)).toBe('degraded');
  });

  it('degrades when 3D is unsupported even on a high tier', () => {
    expect(
      resolveRenderQuality({ ...HIGH_MOBILE, supports3D: false }),
    ).toBe('degraded');
  });

  it('degrades when flagged into degradedMode even on a high tier', () => {
    expect(
      resolveRenderQuality({ ...HIGH_MOBILE, degradedMode: true }),
    ).toBe('degraded');
  });
});

describe('getRenderQualityParams', () => {
  it('maps full → full params and degraded → degraded params', () => {
    expect(getRenderQualityParams('full')).toBe(FULL_QUALITY_PARAMS);
    expect(getRenderQualityParams('degraded')).toBe(DEGRADED_QUALITY_PARAMS);
  });

  it('degraded params are lighter than full params', () => {
    expect(DEGRADED_QUALITY_PARAMS.pixelRatio).toBeLessThanOrEqual(FULL_QUALITY_PARAMS.pixelRatio);
    expect(DEGRADED_QUALITY_PARAMS.shadows).toBe(false);
    expect(DEGRADED_QUALITY_PARAMS.maxRenderedPlots).toBeLessThan(FULL_QUALITY_PARAMS.maxRenderedPlots);
  });
});

describe('canPlayTierCOnDevice (R17.8)', () => {
  it('allows Tier_C on a full-profile mobile device', () => {
    expect(canPlayTierCOnDevice(HIGH_MOBILE)).toBe(true);
  });

  it('blocks Tier_C on mid/low mobile devices', () => {
    expect(canPlayTierCOnDevice(MID_MOBILE)).toBe(false);
    expect(canPlayTierCOnDevice(LOW_MOBILE)).toBe(false);
  });

  it('always allows Tier_C on non-mobile (desktop) shells', () => {
    expect(canPlayTierCOnDevice(DESKTOP)).toBe(true);
  });
});

describe('planExperienceLaunch — Tier_A/B (R13.3)', () => {
  it('always instantiates Tier_A/B and never offers desktop dispatch', () => {
    for (const tier of ['A', 'B'] as const) {
      const plan = planExperienceLaunch(tier, MID_MOBILE);
      expect(plan.canInstantiate).toBe(true);
      expect(plan.offerDesktopDispatch).toBe(false);
    }
  });

  it('offers a degraded alternative for Tier_A/B on a degraded device', () => {
    const plan = planExperienceLaunch('B', LOW_MOBILE);
    expect(plan.quality).toBe('degraded');
    expect(plan.offerDegradedAlternative).toBe(true);
  });

  it('does not offer a degraded alternative when rendering full', () => {
    const plan = planExperienceLaunch('A', HIGH_MOBILE);
    expect(plan.quality).toBe('full');
    expect(plan.offerDegradedAlternative).toBe(false);
  });
});

describe('planExperienceLaunch — Tier_C (R13.4/R13.5/R17.8)', () => {
  it('on a capable mobile device: instantiable AND still offers desktop dispatch', () => {
    const plan = planExperienceLaunch('C', HIGH_MOBILE);
    expect(plan.canInstantiate).toBe(true);
    expect(plan.offerDesktopDispatch).toBe(true); // R13.4
    expect(plan.offerDegradedAlternative).toBe(false);
    expect(plan.reason).toBeUndefined();
  });

  it('on an incapable mobile device: not instantiable, offers desktop + degraded with a reason', () => {
    const plan = planExperienceLaunch('C', MID_MOBILE);
    expect(plan.canInstantiate).toBe(false);
    expect(plan.offerDesktopDispatch).toBe(true); // R13.4
    expect(plan.offerDegradedAlternative).toBe(true); // R13.5
    expect(typeof plan.reason).toBe('string');
  });

  it('on desktop: instantiable and does not force a desktop-dispatch path', () => {
    const plan = planExperienceLaunch('C', DESKTOP);
    expect(plan.canInstantiate).toBe(true);
    expect(plan.offerDesktopDispatch).toBe(false);
  });
});
