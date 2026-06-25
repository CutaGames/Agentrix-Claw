/**
 * Resource_Watchdog — per-instance CPU / memory / frame-budget accounting and
 * over-limit termination decision (design §5.3, R6.5/6.6/6.7).
 *
 * Every running Plot experience is bounded. This module is the **pure,
 * testable core** of that guard: given a stream of resource samples and a
 * budget, it decides whether an instance must be terminated and why. It holds
 * no I/O and no timers — the live wiring (sampling cadence, iframe unload,
 * WASM epoch bump, user notification, "return to map") lives in
 * {@link ../services/sandbox.service} and the desktop Rust `world_sandbox`.
 *
 * ## What it measures (design §5.3)
 *   - **L1 (iframe JS)**: a frame/long-task duration monitor (`frameMs`) plus an
 *     iframe heartbeat age (`heartbeatAgeMs`). A frame longer than the frame
 *     budget is a "slow frame"; enough consecutive slow frames, or a lost
 *     heartbeat, terminates the instance.
 *   - **L2 (WASM)**: fuel consumed (`fuelConsumed`) against a fuel budget, and a
 *     hard epoch-deadline flag (`epochDeadlineExceeded`) the watchdog thread
 *     raised by bumping the engine epoch.
 *   - **Both**: a measured CPU time slice (`cpuMs`) and instance memory
 *     footprint (`memoryBytes`).
 *
 * ## Determinism (drives Property 4 — task 5.4)
 * The decision functions are pure: the same budget + samples always yield the
 * same {@link WatchdogDecision}. An injected dead-loop sample (huge `cpuMs` /
 * exhausted `fuelConsumed` / repeated slow frames) or a memory-bomb sample
 * (`memoryBytes` over budget) MUST decide `terminate: true`. This is the
 * contract Property 4 exercises.
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §5.3 Resource_Watchdog
 * @see desktop/src-tauri/src/world_sandbox/wasm_runtime.rs — L2 fuel/epoch abort
 */

import type { WorldCreationError } from '../../../../shared/types/world-creation';

// ============================================================
// §1 Budget model
// ============================================================

/**
 * Resource budget for a single running experience. Thresholds are calibrated by
 * device tier (design §5.3 references v5 §10: 30 FPS, RAM tiers); this module
 * only enforces "a budget exists and exceeding it terminates the instance".
 */
export interface ResourceWatchdogBudget {
  /** Max measured CPU time slice for the instance (ms). Exceed → terminate. */
  cpuMsBudget: number;
  /** Hard memory ceiling for the instance (bytes). Exceed → terminate. */
  memoryBytesBudget: number;
  /** A frame/task longer than this (ms) is a "slow frame" (long-task). */
  frameBudgetMs: number;
  /** Consecutive slow frames tolerated before terminating. */
  maxConsecutiveSlowFrames: number;
  /** L1: terminate if the iframe heartbeat is older than this (ms). */
  heartbeatTimeoutMs: number;
  /** L2: max WASM fuel the instance may consume. Reach → terminate. */
  fuelBudget: number;
}

/** Device hardware tier used to pick a default budget (design §5.3 / v5 §10). */
export type DeviceTier = 'full' | 'degraded';

/** 30 FPS frame budget (design §5.3 references v5 30 FPS), in milliseconds. */
export const FRAME_BUDGET_30FPS_MS = 1000 / 30;

/**
 * Default per-tier budgets. Conservative structural caps; the live watchdog may
 * refine them per device. `full` ≈ 4GB+ RAM profile, `degraded` ≈ 2–4GB.
 */
export const DEFAULT_WATCHDOG_BUDGETS: Readonly<Record<DeviceTier, ResourceWatchdogBudget>> = {
  full: {
    cpuMsBudget: 1000,
    memoryBytesBudget: 256 * 1024 * 1024,
    frameBudgetMs: FRAME_BUDGET_30FPS_MS,
    maxConsecutiveSlowFrames: 30,
    heartbeatTimeoutMs: 3000,
    fuelBudget: 1_000_000_000,
  },
  degraded: {
    cpuMsBudget: 500,
    memoryBytesBudget: 128 * 1024 * 1024,
    frameBudgetMs: FRAME_BUDGET_30FPS_MS * 2,
    maxConsecutiveSlowFrames: 15,
    heartbeatTimeoutMs: 3000,
    fuelBudget: 500_000_000,
  },
};

// ============================================================
// §2 Resource sample
// ============================================================

/**
 * One resource observation for an instance. All fields are optional — a sampler
 * fills only the signals it has (L1 fills frame/heartbeat, L2 fills fuel/epoch);
 * both may fill `cpuMs` / `memoryBytes`.
 */
export interface ResourceSample {
  /** When the sample was taken (epoch ms). Informational. */
  ts?: number;
  /** Measured CPU time slice for the instance (ms). */
  cpuMs?: number;
  /** Instance memory footprint (bytes). */
  memoryBytes?: number;
  /** Duration of the most recent frame/task (ms). L1 long-task monitor. */
  frameMs?: number;
  /** Cumulative WASM fuel consumed so far (L2). */
  fuelConsumed?: number;
  /** True if the WASM epoch deadline already fired (L2 hard interrupt). */
  epochDeadlineExceeded?: boolean;
  /** Age of the last iframe heartbeat (ms since last ping) (L1). */
  heartbeatAgeMs?: number;
}

// ============================================================
// §3 Decision + reason
// ============================================================

/** Why the watchdog decided to terminate an instance (R6.6). */
export type WatchdogTerminationReason =
  | 'CPU_EXCEEDED'
  | 'MEMORY_EXCEEDED'
  | 'FRAME_BUDGET_EXCEEDED'
  | 'FUEL_EXHAUSTED'
  | 'EPOCH_DEADLINE'
  | 'HEARTBEAT_LOST';

/** The outcome of evaluating samples against a budget. */
export interface WatchdogDecision {
  /** True iff the instance must be terminated. */
  terminate: boolean;
  /** The triggering reason, or null when within budget. */
  reason: WatchdogTerminationReason | null;
  /** Human-readable detail describing the violating signal. */
  detail: string;
}

/** A decision indicating the instance is within budget. */
const WITHIN_BUDGET: WatchdogDecision = {
  terminate: false,
  reason: null,
  detail: 'within budget',
};

// ============================================================
// §4 Watchdog state (folds consecutive slow frames)
// ============================================================

/**
 * Accumulated watchdog state across samples. Only the slow-frame streak needs
 * to persist between samples; every other check is point-in-time.
 */
export interface WatchdogState {
  /** Count of consecutive slow frames seen so far. */
  consecutiveSlowFrames: number;
}

/** A fresh watchdog state (no slow frames seen). */
export function initialWatchdogState(): WatchdogState {
  return { consecutiveSlowFrames: 0 };
}

// ============================================================
// §5 Pure evaluation
// ============================================================

/**
 * Evaluate a single {@link ResourceSample} against a {@link ResourceWatchdogBudget},
 * folding the slow-frame streak through {@link WatchdogState}.
 *
 * Hard, point-in-time kills (epoch / fuel / memory / cpu / heartbeat) are
 * checked first and short-circuit. The frame-budget check is stateful: a slow
 * frame increments the streak (terminating once it reaches the tolerance), and
 * a good frame resets it.
 *
 * Pure: returns a new decision + next state without mutating inputs (drives
 * Property 4 — same input ⇒ same decision).
 */
export function evaluateSample(
  budget: ResourceWatchdogBudget,
  sample: ResourceSample,
  state: WatchdogState = initialWatchdogState(),
): { decision: WatchdogDecision; state: WatchdogState } {
  // (1) L2 hard interrupt — epoch deadline already fired.
  if (sample.epochDeadlineExceeded === true) {
    return {
      decision: {
        terminate: true,
        reason: 'EPOCH_DEADLINE',
        detail: 'WASM epoch deadline exceeded (hard interrupt)',
      },
      state,
    };
  }

  // (2) L2 fuel exhaustion.
  if (typeof sample.fuelConsumed === 'number' && sample.fuelConsumed >= budget.fuelBudget) {
    return {
      decision: {
        terminate: true,
        reason: 'FUEL_EXHAUSTED',
        detail: `fuel ${sample.fuelConsumed} >= budget ${budget.fuelBudget}`,
      },
      state,
    };
  }

  // (3) Memory bomb.
  if (typeof sample.memoryBytes === 'number' && sample.memoryBytes > budget.memoryBytesBudget) {
    return {
      decision: {
        terminate: true,
        reason: 'MEMORY_EXCEEDED',
        detail: `memory ${sample.memoryBytes}B > budget ${budget.memoryBytesBudget}B`,
      },
      state,
    };
  }

  // (4) CPU time slice (dead loop on a single tick).
  if (typeof sample.cpuMs === 'number' && sample.cpuMs > budget.cpuMsBudget) {
    return {
      decision: {
        terminate: true,
        reason: 'CPU_EXCEEDED',
        detail: `cpu ${sample.cpuMs}ms > budget ${budget.cpuMsBudget}ms`,
      },
      state,
    };
  }

  // (5) L1 lost heartbeat (iframe stopped responding).
  if (
    typeof sample.heartbeatAgeMs === 'number' &&
    sample.heartbeatAgeMs > budget.heartbeatTimeoutMs
  ) {
    return {
      decision: {
        terminate: true,
        reason: 'HEARTBEAT_LOST',
        detail: `heartbeat age ${sample.heartbeatAgeMs}ms > timeout ${budget.heartbeatTimeoutMs}ms`,
      },
      state,
    };
  }

  // (6) L1 frame budget — stateful slow-frame streak.
  if (typeof sample.frameMs === 'number') {
    if (sample.frameMs > budget.frameBudgetMs) {
      const consecutiveSlowFrames = state.consecutiveSlowFrames + 1;
      if (consecutiveSlowFrames >= budget.maxConsecutiveSlowFrames) {
        return {
          decision: {
            terminate: true,
            reason: 'FRAME_BUDGET_EXCEEDED',
            detail: `${consecutiveSlowFrames} consecutive slow frames (>${budget.frameBudgetMs}ms)`,
          },
          state: { consecutiveSlowFrames },
        };
      }
      return { decision: WITHIN_BUDGET, state: { consecutiveSlowFrames } };
    }
    // A frame within budget resets the streak.
    return { decision: WITHIN_BUDGET, state: { consecutiveSlowFrames: 0 } };
  }

  return { decision: WITHIN_BUDGET, state };
}

/**
 * Fold a sequence of samples through {@link evaluateSample}, stopping at the
 * first terminate decision. Returns that decision (or the within-budget result)
 * plus the resulting state.
 */
export function evaluateSamples(
  budget: ResourceWatchdogBudget,
  samples: ReadonlyArray<ResourceSample>,
  state: WatchdogState = initialWatchdogState(),
): { decision: WatchdogDecision; state: WatchdogState } {
  let current = state;
  for (const sample of samples) {
    const next = evaluateSample(budget, sample, current);
    current = next.state;
    if (next.decision.terminate) {
      return { decision: next.decision, state: current };
    }
  }
  return { decision: WITHIN_BUDGET, state: current };
}

// ============================================================
// §6 Termination signal (R6.6 notify / R6.7 return to map)
// ============================================================

/** User-facing message shown when an experience is stopped (R6.6). */
export const RESOURCE_LIMIT_USER_MESSAGE = '体验因超出资源被停止';

/** Reason for terminating a sandbox session — watchdog over-limit or manual. */
export type SandboxTerminationReason = WatchdogTerminationReason | 'manual';

/**
 * Structured event emitted when a sandbox session is terminated. Carries the
 * "return to map" signal (R6.7) and the user notification (R6.6). Host
 * surfaces (Map layer) listen for this to unload the instance and route the
 * user back to the responsive map view.
 */
export interface SandboxTerminationEvent {
  /** Discriminator. */
  type: 'sandbox.terminated';
  /** The terminated session. */
  sessionId: string;
  /** The Plot whose instance was terminated, if known. */
  plotId?: string;
  /** Why the session was terminated. */
  reason: SandboxTerminationReason;
  /** Structured error (`RESOURCE_EXCEEDED` for watchdog kills). */
  error: WorldCreationError;
  /** User-facing notification text (R6.6). */
  userMessage: string;
  /** Always true — the user is returned to the map view (R6.7). */
  returnToMap: true;
  /** Epoch ms when termination occurred. */
  ts: number;
}

/**
 * Map a termination reason to a structured {@link WorldCreationError}. Watchdog
 * over-limit reasons map to `RESOURCE_EXCEEDED` (design §Error Handling).
 */
export function watchdogReasonToError(
  reason: SandboxTerminationReason,
  detail: string,
): WorldCreationError {
  if (reason === 'manual') {
    return { error: 'RESOURCE_EXCEEDED', detail: detail || 'session terminated' };
  }
  return { error: 'RESOURCE_EXCEEDED', detail: `${reason}: ${detail}` };
}

/**
 * Build the structured {@link SandboxTerminationEvent} for a terminated session.
 * Pure (timestamp injectable for deterministic tests).
 */
export function makeTerminationEvent(input: {
  sessionId: string;
  plotId?: string;
  reason: SandboxTerminationReason;
  detail: string;
  ts?: number;
}): SandboxTerminationEvent {
  return {
    type: 'sandbox.terminated',
    sessionId: input.sessionId,
    plotId: input.plotId,
    reason: input.reason,
    error: watchdogReasonToError(input.reason, input.detail),
    userMessage: RESOURCE_LIMIT_USER_MESSAGE,
    returnToMap: true,
    ts: input.ts ?? Date.now(),
  };
}
