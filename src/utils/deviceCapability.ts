/**
 * deviceCapability — Sprint 2 · Task 2.8 + Sprint 5 · Task 5.3
 *
 * Detects device hardware tier and recommends the appropriate pet renderer.
 * Uses expo-device for memory info where available.
 *
 * Renderer tiers:
 *   - emoji: ultra-low-end fallback (text only)
 *   - svg:   low-end (< 4 GB RAM) — gradient circle + emoji
 *   - rive:  mid-range (4-8 GB RAM) — 2D Rive animation
 *   - vrm:   high-end (≥ 8 GB RAM) — 3D VRM WebGL rendering
 */
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export type RendererType = 'rive' | 'svg' | 'emoji' | 'vrm';

/** Threshold in bytes — 4 GB */
const LOW_END_RAM_THRESHOLD = 4 * 1024 * 1024 * 1024;

/** Threshold in bytes — 8 GB */
const HIGH_END_RAM_THRESHOLD = 8 * 1024 * 1024 * 1024;

/**
 * Returns true if the device has less than 4 GB of total memory.
 * Falls back to false on platforms where memory info is unavailable.
 */
export function isLowEndDevice(): boolean {
  try {
    const totalMemory = Device.totalMemory;
    if (totalMemory == null) return false;
    return totalMemory < LOW_END_RAM_THRESHOLD;
  } catch {
    return false;
  }
}

/**
 * Returns true if the device has 8 GB or more of total memory.
 * These devices can handle WebGL-based VRM 3D rendering.
 */
export function isHighEndDevice(): boolean {
  try {
    const totalMemory = Device.totalMemory;
    if (totalMemory == null) return false;
    return totalMemory >= HIGH_END_RAM_THRESHOLD;
  } catch {
    return false;
  }
}

/**
 * Returns the recommended renderer based on device capability:
 * - Web → 'svg' (no native GL context)
 * - Low-end (< 4 GB RAM) → 'svg' (gradient circle + emoji fallback)
 * - Mid-range (4-8 GB RAM) → 'rive' (2D Rive animation)
 * - High-end (≥ 8 GB RAM) → 'vrm' (3D VRM WebGL rendering)
 */
export function getRecommendedRenderer(): RendererType {
  if (Platform.OS === 'web') return 'svg';
  if (isLowEndDevice()) return 'svg';
  if (isHighEndDevice()) return 'vrm';
  return 'rive';
}

/**
 * Returns a human-readable device tier label for debugging/analytics.
 */
export function getDeviceTier(): 'low' | 'mid' | 'high' {
  const totalMemory = Device.totalMemory;
  if (totalMemory == null) return 'mid';
  if (totalMemory < LOW_END_RAM_THRESHOLD) return 'low';
  if (totalMemory >= HIGH_END_RAM_THRESHOLD) return 'high';
  return 'mid';
}
