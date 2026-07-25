/**
 * companionPerf — performance instrumentation for the P-9 companion
 * critical paths (T24.2).
 *
 * Spec R12.8 budget targets:
 *   - CompanionBall mount → 60fps render
 *   - Companion_Mode transition P95 ≤ 50ms
 *   - Voice_Greet TTS start P95 ≤ 1.5s
 *   - Lock_Screen_Pet update P95 ≤ 30s
 *   - Trust3SigningSheet present P95 ≤ 200ms
 *   - Wallet_Capsule full anim ≤ 3.2s
 *   - PetDetailSheet present P95 ≤ 250ms
 *   - Conversation_Bubble first-token cloud P95 ≤ 2s / local-text ≤ 5s / local-multimodal ≤ 90s
 *
 * We sample with `performance.now()` and forward to voiceDiagnostics so
 * the Companion_Settings 今日小结 + dev overlays can surface them.
 *
 * Phase 1 ships pure timer helpers; visualization (per-metric percentile
 * graph) lands in wave 15 with the dev overlay.
 */
import { addVoiceDiagnostic } from './voiceDiagnostics';

export type PerfMarkKind =
  | 'companion-ball-mount'
  | 'mode-transition'
  | 'voice-greet-tts-start'
  | 'lock-screen-update'
  | 'trust3-sheet-present'
  | 'wallet-capsule-anim'
  | 'pet-detail-sheet-present'
  | 'bubble-first-token-cloud'
  | 'bubble-first-token-local-text'
  | 'bubble-first-token-local-multimodal'
  | 'remote-control-roundtrip'
  | 'sign-request-roundtrip';

const BUDGET_MS_P95: Record<PerfMarkKind, number> = {
  'companion-ball-mount': 16,
  'mode-transition': 50,
  'voice-greet-tts-start': 1500,
  'lock-screen-update': 30000,
  'trust3-sheet-present': 200,
  'wallet-capsule-anim': 3200,
  'pet-detail-sheet-present': 250,
  'bubble-first-token-cloud': 2000,
  'bubble-first-token-local-text': 5000,
  'bubble-first-token-local-multimodal': 90000,
  'remote-control-roundtrip': 5000,
  'sign-request-roundtrip': 2000,
};

interface OpenMark {
  kind: PerfMarkKind;
  startedAtMs: number;
  context?: Record<string, unknown>;
}

const _openMarks = new Map<string, OpenMark>();

function nowMs(): number {
  if (typeof globalThis.performance?.now === 'function') {
    return globalThis.performance.now();
  }
  return Date.now();
}

/**
 * Begin a perf mark. Returns a token that callers pass to `endMark` to
 * close. The token is opaque — callers don't need to track it; just
 * use the same kind+context pair.
 */
export function beginMark(kind: PerfMarkKind, context?: Record<string, unknown>): string {
  const token = `${kind}:${Math.random().toString(36).slice(2, 10)}`;
  _openMarks.set(token, { kind, startedAtMs: nowMs(), context });
  return token;
}

/**
 * End a perf mark and record duration to voiceDiagnostics.
 * Returns the elapsed ms (or undefined if mark wasn't open).
 */
export function endMark(token: string): number | undefined {
  const open = _openMarks.get(token);
  if (!open) return undefined;
  _openMarks.delete(token);
  const elapsed = nowMs() - open.startedAtMs;
  const budget = BUDGET_MS_P95[open.kind];
  const overBudget = elapsed > budget;
  addVoiceDiagnostic('companion-perf', open.kind, {
    elapsedMs: Math.round(elapsed),
    budgetMs: budget,
    overBudget,
    ...(open.context ?? {}),
  });
  return elapsed;
}

/**
 * Convenience: time an async closure under a mark. Closes the mark
 * even if the closure throws.
 */
export async function timed<T>(kind: PerfMarkKind, fn: () => Promise<T>, context?: Record<string, unknown>): Promise<T> {
  const token = beginMark(kind, context);
  try {
    return await fn();
  } finally {
    endMark(token);
  }
}

/** Synchronous variant. */
export function timedSync<T>(kind: PerfMarkKind, fn: () => T, context?: Record<string, unknown>): T {
  const token = beginMark(kind, context);
  try {
    return fn();
  } finally {
    endMark(token);
  }
}
