/**
 * Pet Companion wander engine (Phase 6 S1.2)
 *
 * Owns the autonomous behaviour of the always-on-top pet window:
 *   - state machine: idle → wander → follow-cursor → sleep → play → busy
 *   - Bezier path interpolation between the current position and a target
 *   - edge-collision clamping with a configurable safe-margin
 *
 * The engine is intentionally framework-agnostic so it can be reused later
 * by the mobile / web overlays. The desktop adapter calls
 * `setBoundsFromTauri` once on boot to inject the live monitor rect.
 */

export type CompanionState =
  | "idle"
  | "wander"
  | "follow-cursor"
  | "sleep"
  | "play"
  | "busy";

export interface CompanionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Bottom inset to leave room for the OS taskbar / dock. */
  bottomInset: number;
}

export interface CompanionPosition {
  x: number;
  y: number;
}

export interface PathSample {
  position: CompanionPosition;
  /** 0..1 along the current segment */
  t: number;
  /** True when the segment finished this tick. */
  done: boolean;
}

export interface PathSegment {
  start: CompanionPosition;
  control: CompanionPosition;
  end: CompanionPosition;
  /** Total ms the segment should take. */
  durationMs: number;
}

const SAFE_MARGIN_X = 32;
const SAFE_MARGIN_Y_TOP = 32;
/** Pet sprite footprint inside the 180×220 companion window. */
const PET_FOOTPRINT_W = 160;
const PET_FOOTPRINT_H = 200;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Clamp a candidate target so the pet stays fully inside the safe area. */
export function clampToBounds(
  pos: CompanionPosition,
  bounds: CompanionBounds,
): CompanionPosition {
  const minX = bounds.x + SAFE_MARGIN_X;
  const minY = bounds.y + SAFE_MARGIN_Y_TOP;
  const maxX = bounds.x + bounds.width - PET_FOOTPRINT_W - SAFE_MARGIN_X;
  const maxY =
    bounds.y + bounds.height - PET_FOOTPRINT_H - bounds.bottomInset;
  return {
    x: clamp(pos.x, minX, maxX),
    y: clamp(pos.y, minY, maxY),
  };
}

export function pickRandomTarget(
  bounds: CompanionBounds,
  near?: CompanionPosition,
): CompanionPosition {
  const minX = bounds.x + SAFE_MARGIN_X;
  const maxX = bounds.x + bounds.width - PET_FOOTPRINT_W - SAFE_MARGIN_X;
  const minY = bounds.y + SAFE_MARGIN_Y_TOP;
  const maxY =
    bounds.y + bounds.height - PET_FOOTPRINT_H - bounds.bottomInset;
  // Bias the wander to not jump across the entire screen — keep it within
  // 25–60 % of the screen width for a more believable life-like motion.
  if (near) {
    const radius =
      bounds.width * (0.25 + Math.random() * 0.35) * (Math.random() < 0.5 ? -1 : 1);
    const dy = (Math.random() - 0.5) * bounds.height * 0.4;
    return clampToBounds({ x: near.x + radius, y: near.y + dy }, bounds);
  }
  return {
    x: minX + Math.random() * Math.max(1, maxX - minX),
    y: minY + Math.random() * Math.max(1, maxY - minY),
  };
}

/** Sample a quadratic Bezier curve at parameter t (0..1). */
function sampleBezier(seg: PathSegment, t: number): CompanionPosition {
  const oneMinus = 1 - t;
  return {
    x:
      oneMinus * oneMinus * seg.start.x +
      2 * oneMinus * t * seg.control.x +
      t * t * seg.end.x,
    y:
      oneMinus * oneMinus * seg.start.y +
      2 * oneMinus * t * seg.control.y +
      t * t * seg.end.y,
  };
}

export function buildSegment(
  from: CompanionPosition,
  to: CompanionPosition,
  speedPxPerSec = 90,
): PathSegment {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Random control point creates the "skip" feel — perpendicular offset
  // proportional to distance, biased upwards (negative Y) to mimic hops.
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const perpX = -dy / Math.max(1, dist);
  const perpY = dx / Math.max(1, dist);
  const offset = Math.min(120, dist * 0.3) * (Math.random() < 0.5 ? -1 : 1);
  const control: CompanionPosition = {
    x: midX + perpX * offset,
    y: midY + perpY * offset - 24, // small upward arc
  };
  return {
    start: from,
    control,
    end: to,
    durationMs: Math.max(400, (dist / Math.max(20, speedPxPerSec)) * 1000),
  };
}

/**
 * Stateful sampler — call `tick(dtMs)` once per frame to get the next
 * position. When the segment finishes, returns `done: true` so the caller
 * can either spawn a new wander target or transition state.
 */
export class PathPlayer {
  private segment: PathSegment | null = null;
  private elapsed = 0;

  setSegment(segment: PathSegment) {
    this.segment = segment;
    this.elapsed = 0;
  }

  hasSegment(): boolean {
    return this.segment !== null;
  }

  tick(dtMs: number): PathSample | null {
    if (!this.segment) return null;
    this.elapsed += dtMs;
    const t = clamp(this.elapsed / this.segment.durationMs, 0, 1);
    // Ease-in-out cubic for a soft start/stop.
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const pos = sampleBezier(this.segment, eased);
    const done = t >= 1;
    if (done) this.segment = null;
    return { position: pos, t, done };
  }
}

/**
 * Speed multiplier driven by the pet's emotion. Sleepy / sad pets walk
 * slower; excited / happy pets sprint a bit. Used by the renderer when
 * computing the next segment's duration.
 */
export function speedForEmotion(emotion: string | undefined | null): number {
  switch (emotion) {
    case "excited":
    case "happy":
      return 1.4;
    case "sad":
    case "sleepy":
      return 0.5;
    case "curious":
      return 1.15;
    default:
      return 1.0;
  }
}
