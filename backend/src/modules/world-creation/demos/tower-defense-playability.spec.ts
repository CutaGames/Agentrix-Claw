/**
 * Unit tests for the pure tower-defense playability decision (task 22.2, R17.8).
 *
 * Verifies the device-profile gating that lets a published Tier_C game be played
 * on Mobile subject to the device resource profile, and offers a degraded or
 * Desktop alternative when it cannot be instantiated (R17.8, design §5.3/§13).
 */

import {
  canPlayTowerDefenseOnDevice,
  resolveTowerDefensePlayability,
  type TowerDefenseDeviceProfile,
} from './tower-defense-playability';

const HIGH_MOBILE: TowerDefenseDeviceProfile = {
  isMobile: true,
  deviceTier: 'high',
  supports3D: true,
  degradedMode: false,
};

describe('tower-defense playability (R17.8)', () => {
  describe('canPlayTowerDefenseOnDevice', () => {
    it('allows any non-mobile (Desktop/web) profile', () => {
      expect(
        canPlayTowerDefenseOnDevice({
          isMobile: false,
          deviceTier: 'low',
          supports3D: false,
          degradedMode: true,
        }),
      ).toBe(true);
    });

    it('requires high tier + 3D + not degraded on Mobile', () => {
      expect(canPlayTowerDefenseOnDevice(HIGH_MOBILE)).toBe(true);
      expect(canPlayTowerDefenseOnDevice({ ...HIGH_MOBILE, deviceTier: 'mid' })).toBe(false);
      expect(canPlayTowerDefenseOnDevice({ ...HIGH_MOBILE, supports3D: false })).toBe(false);
      expect(canPlayTowerDefenseOnDevice({ ...HIGH_MOBILE, degradedMode: true })).toBe(false);
    });
  });

  describe('resolveTowerDefensePlayability', () => {
    it('instantiates at full quality on a capable Mobile device', () => {
      const plan = resolveTowerDefensePlayability(HIGH_MOBILE);
      expect(plan).toEqual({
        canInstantiate: true,
        mode: 'full',
        offerDesktopAlternative: false,
        offerDegradedAlternative: false,
      });
    });

    it('offers degraded + Desktop alternatives on an incapable Mobile device', () => {
      const plan = resolveTowerDefensePlayability({
        isMobile: true,
        deviceTier: 'mid',
        supports3D: true,
        degradedMode: false,
      });
      expect(plan.canInstantiate).toBe(false);
      expect(plan.mode).toBe('desktop');
      expect(plan.offerDesktopAlternative).toBe(true);
      expect(plan.offerDegradedAlternative).toBe(true);
      expect(plan.reason).toContain('Desktop');
    });

    it('always instantiates on Desktop/web', () => {
      const plan = resolveTowerDefensePlayability({
        isMobile: false,
        deviceTier: 'high',
        supports3D: true,
        degradedMode: false,
      });
      expect(plan.canInstantiate).toBe(true);
      expect(plan.mode).toBe('full');
    });

    it('is pure (same profile ⇒ same plan)', () => {
      expect(resolveTowerDefensePlayability(HIGH_MOBILE)).toEqual(
        resolveTowerDefensePlayability(HIGH_MOBILE),
      );
    });
  });
});
