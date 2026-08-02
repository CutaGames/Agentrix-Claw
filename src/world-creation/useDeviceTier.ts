/**
 * useDeviceTier — World_Map device-tier hook (Task 10.3, R13).
 *
 * Single React entry point that assembles a {@link MapRenderProfile} from the
 * **existing** mobile capability probes and exposes the derived render quality
 * and Tier_C launch planning. Reuses, rather than reinvents:
 *   - `getDeviceTier()`           — RAM-based 'low' | 'mid' | 'high' tier.
 *   - `detectDeviceCapabilities()`— supports3D / degradedMode (RAM + OS version).
 *
 * The actual decision logic lives in the pure {@link ./renderStrategy} module so
 * it can be unit-tested without a React/RN runtime.
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §5.3, §13
 */

import { useMemo } from 'react';
import { Platform } from 'react-native';

import { getDeviceTier } from '../utils/deviceCapability';
import { detectDeviceCapabilities } from '../utils/worldEngineCache';
import type { SubstrateTier } from '../../shared/types/world-creation';
import {
  type ExperienceLaunchPlan,
  type MapRenderProfile,
  type RenderQuality,
  type RenderQualityParams,
  getRenderQualityParams,
  planExperienceLaunch,
  resolveRenderQuality,
} from './renderStrategy';

/** What {@link useDeviceTier} returns to the renderer / screen. */
export interface UseDeviceTierResult {
  /** The assembled device render profile (single source of truth). */
  profile: MapRenderProfile;
  /** Chosen render quality for the map ('full' | 'degraded'). */
  quality: RenderQuality;
  /** Concrete renderer knobs for the chosen quality. */
  params: RenderQualityParams;
  /** True when the map renders degraded (reduced detail, nav/entry preserved). */
  isDegraded: boolean;
  /** Plan how to launch a Plot experience of the given tier on this device. */
  planLaunch: (tier: SubstrateTier) => ExperienceLaunchPlan;
}

/**
 * Build the {@link MapRenderProfile} from the existing device probes. Defensive:
 * any probe failure falls back to a safe degraded-capable mid profile so the map
 * still renders (navigation/entry preserved).
 */
export function buildMapRenderProfile(): MapRenderProfile {
  const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';

  let deviceTier: MapRenderProfile['deviceTier'] = 'mid';
  let supports3D = true;
  let degradedMode = false;

  try {
    deviceTier = getDeviceTier();
  } catch {
    deviceTier = 'mid';
  }

  try {
    const caps = detectDeviceCapabilities();
    supports3D = caps.supports3D;
    degradedMode = caps.degradedMode;
  } catch {
    // Probe unavailable (e.g. expo-device missing) — assume a conservative
    // degraded-capable profile rather than blocking the map.
    supports3D = false;
    degradedMode = true;
  }

  return { deviceTier, supports3D, degradedMode, isMobile };
}

/**
 * React hook exposing the device render tier and derived launch planning for the
 * World_Map. The profile is memoized for the component's lifetime (device
 * hardware does not change at runtime).
 */
export function useDeviceTier(): UseDeviceTierResult {
  return useMemo(() => {
    const profile = buildMapRenderProfile();
    const quality = resolveRenderQuality(profile);
    const params = getRenderQualityParams(quality);

    return {
      profile,
      quality,
      params,
      isDegraded: quality === 'degraded',
      planLaunch: (tier: SubstrateTier) => planExperienceLaunch(tier, profile),
    };
  }, []);
}
