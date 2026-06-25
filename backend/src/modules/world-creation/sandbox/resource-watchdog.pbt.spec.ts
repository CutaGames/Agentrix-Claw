/**
 * Resource_Watchdog — Property 4 (Watchdog 终止) property + integration tests
 * (task 5.4, design §5.3).
 *
 * **Property 4: Watchdog 终止** — 注入死循环 / 内存炸弹，验证超出 CPU/内存/帧预算的
 * 实例必被终止且地图层保持可响应。
 *
 * **Validates: Requirements 6.6, 6.7**
 *
 * Strategy: drive the pure decision core ({@link evaluateSample} /
 * {@link evaluateSamples}) across generated budgets and injected over-limit
 * samples (dead-loop CPU / exhausted fuel / fired epoch / memory bomb / lost
 * heartbeat / consecutive slow frames). For each over-budget signal the
 * watchdog MUST decide `terminate: true` with the correct reason; for any
 * strictly within-budget sample it MUST decide `terminate: false`. The
 * integration property then wires the same injected samples through
 * {@link SandboxService.recordResourceSample} and asserts the terminated
 * instance emits a `returnToMap` event (R6.7) carrying the user message
 * (R6.6), while the map layer stays responsive (a new session can still be
 * instantiated after the kill).
 */

import fc from 'fast-check';
import {
  evaluateSample,
  evaluateSamples,
  DEFAULT_WATCHDOG_BUDGETS,
  RESOURCE_LIMIT_USER_MESSAGE,
  type ResourceWatchdogBudget,
  type ResourceSample,
  type WatchdogTerminationReason,
} from './resource-watchdog';
import { SandboxService } from '../services/sandbox.service';

// ------------------------------------------------------------
// Generators
// ------------------------------------------------------------

/** A valid budget with strictly positive thresholds (every dimension enforceable). */
const budgetArb: fc.Arbitrary<ResourceWatchdogBudget> = fc.record({
  cpuMsBudget: fc.integer({ min: 1, max: 10_000 }),
  memoryBytesBudget: fc.integer({ min: 1024, max: 1024 * 1024 * 1024 }),
  frameBudgetMs: fc.integer({ min: 1, max: 1000 }),
  maxConsecutiveSlowFrames: fc.integer({ min: 1, max: 60 }),
  heartbeatTimeoutMs: fc.integer({ min: 1, max: 10_000 }),
  fuelBudget: fc.integer({ min: 1, max: 1_000_000_000 }),
});

interface OverBudgetCase {
  sample: ResourceSample;
  reason: WatchdogTerminationReason;
}

/**
 * For a given budget, generate a sample that exceeds exactly ONE point-in-time
 * dimension (so the expected reason is unambiguous w.r.t. the decision priority
 * order: epoch → fuel → memory → cpu → heartbeat). Frame-budget streaks are
 * tested separately via {@link evaluateSamples}.
 */
const overBudgetCaseArb = (budget: ResourceWatchdogBudget): fc.Arbitrary<OverBudgetCase> =>
  fc.oneof(
    // Dead loop on a single tick — cpuMs over budget.
    fc
      .integer({ min: 1, max: 1_000_000 })
      .map((d) => ({ sample: { cpuMs: budget.cpuMsBudget + d }, reason: 'CPU_EXCEEDED' as const })),
    // Memory bomb — memoryBytes over budget.
    fc.integer({ min: 1, max: 1_000_000_000 }).map((d) => ({
      sample: { memoryBytes: budget.memoryBytesBudget + d },
      reason: 'MEMORY_EXCEEDED' as const,
    })),
    // WASM fuel exhaustion (>= budget triggers).
    fc.integer({ min: 0, max: 1_000_000_000 }).map((d) => ({
      sample: { fuelConsumed: budget.fuelBudget + d },
      reason: 'FUEL_EXHAUSTED' as const,
    })),
    // WASM epoch deadline fired (hard interrupt).
    fc.constant({ sample: { epochDeadlineExceeded: true }, reason: 'EPOCH_DEADLINE' as const }),
    // Lost iframe heartbeat.
    fc.integer({ min: 1, max: 1_000_000 }).map((d) => ({
      sample: { heartbeatAgeMs: budget.heartbeatTimeoutMs + d },
      reason: 'HEARTBEAT_LOST' as const,
    })),
  );

/** For a given budget, a sample strictly within every dimension. */
const withinBudgetSampleArb = (budget: ResourceWatchdogBudget): fc.Arbitrary<ResourceSample> =>
  fc.record({
    cpuMs: fc.integer({ min: 0, max: budget.cpuMsBudget }),
    memoryBytes: fc.integer({ min: 0, max: budget.memoryBytesBudget }),
    frameMs: fc.integer({ min: 0, max: budget.frameBudgetMs }),
    fuelConsumed: fc.integer({ min: 0, max: budget.fuelBudget - 1 }),
    heartbeatAgeMs: fc.integer({ min: 0, max: budget.heartbeatTimeoutMs }),
    epochDeadlineExceeded: fc.constant(false),
  });

// ------------------------------------------------------------
// Property 4 — pure decision core
// ------------------------------------------------------------

describe('Property 4: Watchdog 终止 (evaluateSample / evaluateSamples)', () => {
  it('terminates with the correct reason for any over-budget sample (R6.6)', () => {
    fc.assert(
      fc.property(
        budgetArb.chain((budget) =>
          fc.record({ budget: fc.constant(budget), over: overBudgetCaseArb(budget) }),
        ),
        ({ budget, over }) => {
          const { decision } = evaluateSample(budget, over.sample);
          expect(decision.terminate).toBe(true);
          expect(decision.reason).toBe(over.reason);
          expect(decision.detail.length).toBeGreaterThan(0);
        },
      ),
    );
  });

  it('does not terminate for any strictly within-budget sample', () => {
    fc.assert(
      fc.property(
        budgetArb.chain((budget) =>
          fc.record({ budget: fc.constant(budget), sample: withinBudgetSampleArb(budget) }),
        ),
        ({ budget, sample }) => {
          const { decision } = evaluateSample(budget, sample);
          expect(decision.terminate).toBe(false);
          expect(decision.reason).toBeNull();
        },
      ),
    );
  });

  it('terminates after maxConsecutiveSlowFrames slow frames (frame budget, R6.6)', () => {
    fc.assert(
      fc.property(budgetArb, (budget) => {
        // Inject a run of slow frames exactly reaching the tolerance.
        const slow: ResourceSample = { frameMs: budget.frameBudgetMs + 1 };
        const samples = Array.from({ length: budget.maxConsecutiveSlowFrames }, () => slow);
        const { decision } = evaluateSamples(budget, samples);
        expect(decision.terminate).toBe(true);
        expect(decision.reason).toBe('FRAME_BUDGET_EXCEEDED');
      }),
    );
  });

  it('does not terminate when fewer than the tolerance of slow frames occur', () => {
    fc.assert(
      fc.property(
        budgetArb.filter((b) => b.maxConsecutiveSlowFrames > 1),
        (budget) => {
          const slow: ResourceSample = { frameMs: budget.frameBudgetMs + 1 };
          const samples = Array.from(
            { length: budget.maxConsecutiveSlowFrames - 1 },
            () => slow,
          );
          const { decision } = evaluateSamples(budget, samples);
          expect(decision.terminate).toBe(false);
        },
      ),
    );
  });

  it('a good frame resets the slow-frame streak (no termination)', () => {
    fc.assert(
      fc.property(
        budgetArb.filter((b) => b.maxConsecutiveSlowFrames > 1),
        (budget) => {
          const slow: ResourceSample = { frameMs: budget.frameBudgetMs + 1 };
          const good: ResourceSample = { frameMs: 0 };
          // (max - 1) slow, one good (reset), then one slow again.
          const samples = [
            ...Array.from({ length: budget.maxConsecutiveSlowFrames - 1 }, () => slow),
            good,
            slow,
          ];
          const { decision } = evaluateSamples(budget, samples);
          expect(decision.terminate).toBe(false);
        },
      ),
    );
  });
});

// ------------------------------------------------------------
// Property 4 — SandboxService integration (R6.6 notify / R6.7 return to map)
// ------------------------------------------------------------

describe('Property 4: SandboxService.recordResourceSample terminates + returns to map', () => {
  it('over-limit sample terminates the instance, returns to map, keeps map layer responsive', async () => {
    await fc.assert(
      fc.asyncProperty(overBudgetCaseArb(DEFAULT_WATCHDOG_BUDGETS.full), async (over) => {
        const service = new SandboxService();
        const observed: WatchdogTerminationReason[] = [];
        const unsubscribe = service.onTermination((e) => {
          observed.push(e.reason as WatchdogTerminationReason);
        });

        const { sessionId } = await service.instantiate('plot_dead_loop', 'L1', [], 'full');
        const event = await service.recordResourceSample(sessionId, over.sample);

        // The instance MUST be terminated (R6.6) ...
        expect(event).not.toBeNull();
        expect(event!.reason).toBe(over.reason);
        expect(event!.error.error).toBe('RESOURCE_EXCEEDED');
        expect(event!.userMessage).toBe(RESOURCE_LIMIT_USER_MESSAGE);
        // ... and the user is returned to the map view (R6.7).
        expect(event!.returnToMap).toBe(true);
        expect(observed).toEqual([over.reason]);

        // The map layer remains responsive: a new session can still be
        // instantiated after the kill (the service is not wedged).
        const next = await service.instantiate('plot_next', 'L1', [], 'full');
        expect(typeof next.sessionId).toBe('string');
        // The terminated session is gone — further samples are a no-op.
        expect(await service.recordResourceSample(sessionId, over.sample)).toBeNull();

        unsubscribe();
      }),
    );
  });
});
