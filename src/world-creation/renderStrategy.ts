/**
 * World_Map render strategy — device-tier degradation & Tier_C dispatch (R13).
 *
 * Task 10.3 — "React Three Fiber 渲染与设备分档降级". This module holds the
 * **pure, framework-agnostic** decision logic so it is trivially unit-testable
 * (no React, no react-native, no expo). The React hook ({@link ./useDeviceTier})
 * feeds it a {@link MapRenderProfile} derived from the existing mobile device
 * capability probes (`src/utils/deviceCapability.ts` + `src/utils/worldEngineCache.ts`),
 * and the renderer / screen consume the resulting plan.
 *
 * Requirement mapping:
 *   - R13.1 — map renders 3D via the v5 rendering stack (three.js via expo-gl,
 *     i.e. the React-Three-Fiber renderer; the GL backdrop lives in the renderer).
 *   - R13.2 — full-quality hardware profile → full-quality detail.
 *   - R13.3 — below full profile → degraded mode that still preserves navigation
 *     and Plot entry.
 *   - R13.4 — a Tier_C experience requested on Mobile surfaces a Desktop-dispatch
 *     path rather than executing on Mobile.
 *   - R13.5 / R17.8 — when an experience cannot be instantiated on the device,
 *     report unavailability and offer a degraded or Desktop alternative.
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §5.3, §13
 */

import type { SubstrateTier } from '../../shared/types/world-creation';

// ============================================================
// §1 Profile & quality types
// ============================================================

/** Coarse hardware tier from `getDeviceTier()` (RAM-based). */
export type MapDeviceTier = 'low' | 'mid' | 'high';

/** Render detail level chosen for the World_Map. */
export type RenderQuality = 'full' | 'degraded';

/**
 * The device profile the strategy reasons over. Assembled by the
 * {@link useDeviceTier} hook from existing capability probes so the platform
 * has a single source of truth for "what can this device do".
 */
export interface MapRenderProfile {
  /** Coarse RAM tier ('low' | 'mid' | 'high') from `getDeviceTier()`. */
  deviceTier: MapDeviceTier;
  /** Whether the device clears the bar for full 3D (from `detectDeviceCapabilities`). */
  supports3D: boolean;
  /** Whether the device was flagged into degraded mode (RAM / OS version). */
  degradedMode: boolean;
  /** True on a native mobile runtime (iOS/Android); false on web/desktop shells. */
  isMobile: boolean;
}

/** Concrete renderer knobs derived from the chosen {@link RenderQuality}. */
export interface RenderQualityParams {
  /** Chosen detail level. */
  quality: RenderQuality;
  /** WebGL device pixel ratio (higher = sharper, heavier). */
  pixelRatio: number;
  /** Whether to enable shadow rendering. */
  shadows: boolean;
  /** Whether to enable anti-aliasing. */
  antialias: boolean;
  /** Max dynamic lights to add to the scene. */
  maxLights: number;
  /** Max plot meshes drawn as extruded 3D tiles before falling back to flat markers. */
  maxRenderedPlots: number;
  /** Target frame rate the Resource_Watchdog budget is tuned against. */
  targetFps: number;
}

// ============================================================
// §2 Quality presets (design §5.3 — tuned per v5 §10 device tiers)
// ============================================================

/** Full-quality preset for devices meeting the full hardware profile (R13.2). */
export const FULL_QUALITY_PARAMS: RenderQualityParams = {
  quality: 'full',
  pixelRatio: 2,
  shadows: true,
  antialias: true,
  maxLights: 4,
  maxRenderedPlots: 256,
  targetFps: 30,
};

/**
 * Degraded preset for devices below the full profile (R13.3). Reduced detail,
 * but navigation + Plot entry are preserved (the renderer still draws tappable
 * plot markers; only the visual richness drops).
 */
export const DEGRADED_QUALITY_PARAMS: RenderQualityParams = {
  quality: 'degraded',
  pixelRatio: 1,
  shadows: false,
  antialias: false,
  maxLights: 1,
  maxRenderedPlots: 48,
  targetFps: 24,
};

// ============================================================
// §3 Render-quality resolution (R13.2, R13.3)
// ============================================================

/**
 * Decide whether the World_Map should render at full quality or fall back to
 * degraded mode. Full quality requires the device to clear the full hardware
 * profile: a 'high' RAM tier, 3D support, and not flagged into degraded mode.
 * Everything below renders degraded (R13.3) — never blocked.
 *
 * @param profile the device render profile
 * @returns the chosen render quality
 */
export function resolveRenderQuality(profile: MapRenderProfile): RenderQuality {
  const meetsFullProfile =
    profile.deviceTier === 'high' && profile.supports3D && !profile.degradedMode;
  return meetsFullProfile ? 'full' : 'degraded';
}

/** Map a {@link RenderQuality} to its concrete renderer knobs. */
export function getRenderQualityParams(quality: RenderQuality): RenderQualityParams {
  return quality === 'full' ? FULL_QUALITY_PARAMS : DEGRADED_QUALITY_PARAMS;
}

/** Convenience: resolve quality and its params in one call from a profile. */
export function resolveRenderQualityParams(profile: MapRenderProfile): RenderQualityParams {
  return getRenderQualityParams(resolveRenderQuality(profile));
}

// ============================================================
// §4 Experience launch plan (R13.4, R13.5, R17.8)
// ============================================================

/**
 * A plan describing how (or whether) a Plot experience of a given
 * Substrate_Tier should be launched on the current device, and what fallback
 * affordances the UI must surface.
 */
export interface ExperienceLaunchPlan {
  /** The experience's declared Substrate_Tier. */
  tier: SubstrateTier;
  /** Whether the experience can be instantiated and run on this device. */
  canInstantiate: boolean;
  /** Render quality to use when instantiated. */
  quality: RenderQuality;
  /** Surface a "dispatch to Desktop / Agent" path (R13.4 for Tier_C on Mobile). */
  offerDesktopDispatch: boolean;
  /** Offer a degraded alternative when the experience can't run as-is (R13.5/R17.8). */
  offerDegradedAlternative: boolean;
  /** Human-facing reason shown when the experience is not directly playable. */
  reason?: string;
}

/**
 * Whether a published Tier_C experience can be instantiated/played on this
 * mobile device. Tier_C is the heaviest (sandboxed WASM logic); we only attempt
 * it on a device clearing the full hardware profile (R17.8). Non-mobile shells
 * (desktop) are always considered capable here.
 */
export function canPlayTierCOnDevice(profile: MapRenderProfile): boolean {
  if (!profile.isMobile) return true;
  return profile.deviceTier === 'high' && profile.supports3D && !profile.degradedMode;
}

/**
 * Build the {@link ExperienceLaunchPlan} for entering a Plot experience.
 *
 * - Tier_A / Tier_B always instantiate (degraded mode preserves nav + entry,
 *   R13.3); a degraded alternative is offered when the device can't render full.
 * - Tier_C on Mobile always surfaces a Desktop-dispatch path (R13.4). It is only
 *   marked instantiable when the device can actually run it (R17.8); otherwise
 *   the UI reports unavailability and offers a degraded or Desktop alternative
 *   (R13.5).
 *
 * @param tier the experience's declared Substrate_Tier
 * @param profile the device render profile
 * @returns the launch plan the screen/renderer should follow
 */
export function planExperienceLaunch(
  tier: SubstrateTier,
  profile: MapRenderProfile,
): ExperienceLaunchPlan {
  const quality = resolveRenderQuality(profile);

  if (tier === 'A' || tier === 'B') {
    return {
      tier,
      canInstantiate: true,
      quality,
      offerDesktopDispatch: false,
      offerDegradedAlternative: quality === 'degraded',
    };
  }

  // Tier_C
  const playable = canPlayTierCOnDevice(profile);
  return {
    tier,
    canInstantiate: playable,
    quality,
    // R13.4 — a Tier_C experience on Mobile always gets a Desktop-dispatch path.
    offerDesktopDispatch: profile.isMobile,
    // R13.5 / R17.8 — when it can't run here, offer a degraded/Desktop fallback.
    offerDegradedAlternative: !playable,
    reason: playable
      ? undefined
      : 'This is a Tier_C (advanced) experience that needs more capable hardware. ' +
        'Play it on Desktop, or try a degraded version.',
  };
}
