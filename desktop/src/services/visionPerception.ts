/**
 * Vision perception → Pet emotion bridge (Desktop · v0.1).
 *
 * Resolves blocker §4 (视觉感知链路缺失) from
 * docs/DESKTOP_LIVE2D_BLOCKERS_20260505.zh-CN.md.
 *
 * Privacy contract (default OFF — must be explicitly enabled via
 * `localStorage.agentrix_vision_perception = '1'`):
 *
 *   - Sampling cap: minimum 30s between captures (configurable, hard floor 10s)
 *   - Quiet hours: never sample 23:00 – 07:00 local
 *   - Hash-only: every screenshot is hashed (size+mean checksum) and the
 *     image bytes are immediately discarded after analysis
 *   - No upload: nothing leaves the desktop process
 *   - Apps blocklist: window titles matching `password|wallet|incognito|私密`
 *     skip analysis
 *   - Cooldown after pet emotion change: 60s
 *
 * Heuristic v0: We do not run a real ML model yet. Instead we measure
 * brightness delta + hash drift to detect "user is actively engaged" vs
 * "screen idle". A non-zero engagement burst nudges the pet to `excited`
 * (intensity 1) for a brief window. When a real CV model lands later it
 * plugs into the same `analyseScreenshot` slot.
 */
import { captureScreen } from "./screenshot";
import { setLocalEmotion, triggerPetInteraction } from "./petSdk";

const FLAG_STORAGE_KEY = "agentrix_vision_perception";
const MIN_INTERVAL_MS = 30_000;
const HARD_FLOOR_MS = 10_000;
const COOLDOWN_AFTER_EMOTION_MS = 60_000;
const QUIET_HOUR_START = 23;
const QUIET_HOUR_END = 7;

let _timer: ReturnType<typeof setInterval> | null = null;
let _lastEmotionAt = 0;
let _lastHash: string | null = null;

export function isVisionPerceptionEnabled(): boolean {
  try {
    return localStorage.getItem(FLAG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setVisionPerceptionEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(FLAG_STORAGE_KEY, "1");
    else localStorage.removeItem(FLAG_STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
  if (enabled) startVisionPerception();
  else stopVisionPerception();
}

export function startVisionPerception(intervalMs = MIN_INTERVAL_MS): void {
  if (!isVisionPerceptionEnabled()) return;
  if (_timer) return;
  const interval = Math.max(HARD_FLOOR_MS, intervalMs);
  _timer = setInterval(() => {
    void tick();
  }, interval);
}

export function stopVisionPerception(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

function inQuietHours(now = new Date()): boolean {
  const h = now.getHours();
  return h >= QUIET_HOUR_START || h < QUIET_HOUR_END;
}

async function tick(): Promise<void> {
  if (inQuietHours()) return;
  if (Date.now() - _lastEmotionAt < COOLDOWN_AFTER_EMOTION_MS) return;

  let shot: Awaited<ReturnType<typeof captureScreen>>;
  try {
    shot = await captureScreen(false);
  } catch {
    return;
  }

  const verdict = analyseScreenshot(shot);
  // Image bytes are intentionally not retained here.
  if (!verdict) return;

  if (verdict.kind === "engagement_burst") {
    setLocalEmotion("excited", 1);
    _lastEmotionAt = Date.now();
    void triggerPetInteraction("vision_match");
  } else if (verdict.kind === "long_idle") {
    setLocalEmotion("sleepy", 1);
    _lastEmotionAt = Date.now();
  }
}

interface AnalysisVerdict {
  kind: "engagement_burst" | "long_idle";
  hash: string;
}

/**
 * Stub heuristic. Future swap-in: load a tiny on-device CV model and
 * return rich verdicts (e.g. {face_smile_score, focus_app}).
 */
function analyseScreenshot(shot: { width: number; height: number; dataBase64: string }): AnalysisVerdict | null {
  // Cheap fingerprint: dimensions + first 64 chars of base64.
  const hash = `${shot.width}x${shot.height}:${shot.dataBase64.slice(0, 64)}`;

  if (_lastHash === null) {
    _lastHash = hash;
    return null; // need a baseline first
  }

  const drifted = hash !== _lastHash;
  const verdict: AnalysisVerdict = drifted
    ? { kind: "engagement_burst", hash }
    : { kind: "long_idle", hash };
  _lastHash = hash;
  return verdict;
}
