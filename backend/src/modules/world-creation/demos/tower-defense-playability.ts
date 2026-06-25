/**
 * Tower_Defense_Playability — backend device-profile gating for playing a
 * published Tier_C tower-defense game (design §5.3 / §13, R17.8 / R13.4 / R13.5).
 *
 * A published Tier_C game is playable on Mobile **subject to the device resource
 * profile**; when it cannot be instantiated, the platform must offer a degraded
 * mode or a Desktop alternative (R17.8). This module is the **pure, testable**
 * decision core — no I/O, no React, no react-native — mirroring the frontend
 * `src/world-creation/renderStrategy.ts` semantics (task 10.3) on the server so
 * the same rule (`high tier + supports3D + not degraded` ⇒ playable on Mobile)
 * holds wherever the decision is made.
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §5.3, §13
 * @see src/world-creation/renderStrategy.ts — frontend Tier_C launch planning (10.3)
 */

/** Coarse RAM-based hardware tier (mirrors the frontend `getDeviceTier()`). */
export type TowerDefenseDeviceTier = 'low' | 'mid' | 'high';

/**
 * The device profile the playability decision reasons over. Assembled by the
 * client from the existing capability probes; the backend only needs these
 * coarse signals to decide whether a Tier_C game can be instantiated.
 */
export interface TowerDefenseDeviceProfile {
  /** True on a native mobile runtime (iOS/Android); false on web/desktop shells. */
  isMobile: boolean;
  /** Coarse RAM tier ('low' | 'mid' | 'high'). */
  deviceTier: TowerDefenseDeviceTier;
  /** Whether the device clears the bar for full 3D. */
  supports3D: boolean;
  /** Whether the device was flagged into degraded mode (RAM / OS version). */
  degradedMode: boolean;
}

/** How a published Tier_C game should be launched on the requesting device. */
export type TowerDefensePlayMode =
  /** Instantiate at full quality. */
  | 'full'
  /** Instantiate, but in a reduced-detail degraded mode. */
  | 'degraded'
  /** Cannot instantiate here — dispatch to / play on Desktop instead. */
  | 'desktop';

/**
 * The resolved play plan for a published Tier_C tower-defense game on a device
 * (R17.8). When `canInstantiate` is false the UI must surface a degraded or
 * Desktop alternative (`offerDegradedAlternative` / `offerDesktopAlternative`).
 */
export interface TowerDefensePlayPlan {
  /** Whether the game can be instantiated on this device as-is. */
  canInstantiate: boolean;
  /** The launch mode to use. */
  mode: TowerDefensePlayMode;
  /** Offer a "play on Desktop" alternative (R17.8 / R13.4). */
  offerDesktopAlternative: boolean;
  /** Offer a reduced-detail degraded alternative (R17.8 / R13.5). */
  offerDegradedAlternative: boolean;
  /** Human-facing reason shown when the game is not directly playable at full quality. */
  reason?: string;
}

/**
 * Whether a published Tier_C game can run on the given device profile.
 *
 * Mirrors the frontend `canPlayTierCOnDevice`: non-mobile shells (Desktop/web)
 * can always run it; on Mobile it requires a `high` RAM tier, 3D support, and not
 * being flagged into degraded mode (the heaviest tier needs the most capable
 * hardware, design §5.3).
 */
export function canPlayTowerDefenseOnDevice(
  profile: TowerDefenseDeviceProfile,
): boolean {
  if (!profile.isMobile) {
    return true;
  }
  return (
    profile.deviceTier === 'high' && profile.supports3D && !profile.degradedMode
  );
}

/**
 * Resolve how a published Tier_C tower-defense game should launch on a device
 * (R17.8). Pure: same profile ⇒ same plan.
 *
 *  - Non-mobile (Desktop/web): always instantiable at full quality.
 *  - Mobile clearing the Tier_C bar: instantiable at full quality.
 *  - Mobile below the bar: NOT instantiable as-is — the plan reports a Desktop
 *    alternative AND a degraded alternative so the UI can offer either (R17.8).
 */
export function resolveTowerDefensePlayability(
  profile: TowerDefenseDeviceProfile,
): TowerDefensePlayPlan {
  if (!profile.isMobile) {
    return {
      canInstantiate: true,
      mode: 'full',
      offerDesktopAlternative: false,
      offerDegradedAlternative: false,
    };
  }

  if (canPlayTowerDefenseOnDevice(profile)) {
    return {
      canInstantiate: true,
      mode: 'full',
      offerDesktopAlternative: false,
      offerDegradedAlternative: false,
    };
  }

  // Mobile below the Tier_C bar — cannot instantiate the full game here (R17.8).
  return {
    canInstantiate: false,
    mode: 'desktop',
    offerDesktopAlternative: true,
    offerDegradedAlternative: true,
    reason:
      'This Tier_C tower-defense game needs more capable hardware to run on ' +
      'this device. Play it on Desktop, or try a degraded version.',
  };
}
