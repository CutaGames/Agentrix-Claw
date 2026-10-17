/**
 * motionDetection.service — P1 (Sprint Q2 follow-up).
 *
 * Lightweight "is the user walking right now?" detector for the `journey`
 * Form_Variant, built on `expo-location` (ALREADY a project dependency) so
 * we don't need to add `expo-sensors` / a native rebuild just to make the
 * journey variant fire.
 *
 * Strategy:
 *   - Best-effort + non-blocking. If location permission isn't granted, or
 *     the module/runtime is unavailable (pure-Node jest), every call
 *     resolves to `false` and the formVariant resolver falls back to
 *     `default` — exactly the previous behavior, just no longer hardcoded.
 *   - Two signals, whichever is available:
 *       1. A single `getCurrentPositionAsync` reading exposes `coords.speed`
 *          (m/s) on most devices. Walking pace ≈ 0.4–2.5 m/s.
 *       2. If speed is null/unreliable, fall back to a two-sample distance/
 *          time estimate over ~6s.
 *   - We only READ location when foreground permission is ALREADY granted
 *     (we never prompt here — that belongs to an explicit user action), so
 *     this is privacy-safe and silent.
 *
 * Spec: requirements.md R7 (journey variant) — replaces the hardcoded
 * `isWalking() => false` stub in formVariant.service.
 */

const WALK_MIN_MPS = 0.4; // below this = standing/jitter
const WALK_MAX_MPS = 2.8; // above this = vehicle, not "walking with pet"

function lazyLocation(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    return require('expo-location');
  } catch {
    return null;
  }
}

async function hasForegroundPermission(Location: any): Promise<boolean> {
  try {
    if (!Location?.getForegroundPermissionsAsync) return false;
    const res = await Location.getForegroundPermissionsAsync();
    return !!res?.granted;
  } catch {
    return false;
  }
}

function speedToWalking(speedMps: number | null | undefined): boolean | null {
  if (speedMps == null || Number.isNaN(speedMps) || speedMps < 0) return null;
  return speedMps >= WALK_MIN_MPS && speedMps <= WALK_MAX_MPS;
}

/** Haversine distance in meters between two lat/lng points. */
function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Best-effort walking check. Returns false on any uncertainty
 * (no permission, no module, no fix) so callers can treat it as a pure
 * boolean signal.
 */
export async function detectWalking(): Promise<boolean> {
  const Location = lazyLocation();
  if (!Location) return false;
  if (!(await hasForegroundPermission(Location))) return false;

  try {
    const accuracy = Location.Accuracy?.Balanced ?? 3;
    const first = await Location.getCurrentPositionAsync({ accuracy });
    // Preferred: device-reported instantaneous speed.
    const bySpeed = speedToWalking(first?.coords?.speed);
    if (bySpeed != null) return bySpeed;

    // Fallback: sample again after ~6s and estimate speed from displacement.
    await new Promise((r) => setTimeout(r, 6000));
    const second = await Location.getCurrentPositionAsync({ accuracy });
    if (!first?.coords || !second?.coords) return false;
    const meters = distanceMeters(first.coords, second.coords);
    const seconds = Math.max(
      1,
      ((second.timestamp ?? Date.now()) - (first.timestamp ?? Date.now())) / 1000,
    );
    const mps = meters / seconds;
    return mps >= WALK_MIN_MPS && mps <= WALK_MAX_MPS;
  } catch {
    return false;
  }
}

// Exported for unit tests (pure functions, no RN runtime needed).
export const _internal = { speedToWalking, distanceMeters, WALK_MIN_MPS, WALK_MAX_MPS };
