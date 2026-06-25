/**
 * Resource_Watchdog — unit tests (task 5.3, R6.5/6.6/6.7).
 *
 * Verifies the pure budget-accounting / over-limit decision core:
 *   - within-budget samples never terminate;
 *   - injected dead-loop signals (CPU / fuel / epoch / consecutive slow frames)
 *     and a memory-bomb sample (memory over budget) MUST terminate;
 *   - the slow-frame streak is stateful (resets on a good frame);
 *   - the structured termination event carries the user message + return-to-map
 *     signal (R6.6/6.7).
 *
 * These cover the decision contract; the Property 4 test (task 5.4) drives the
 * same core across generated dead-loop / memory-bomb inputs.
 */

import {
  DEFAULT_WATCHDOG_BUDGETS,
  evaluateSample,
  evaluateSamples,
  initialWatchdogState,
  makeTerminationEvent,
  RESOURCE_LIMIT_USER_MESSAGE,
  type ResourceWatchdogBudget,
} from './resource-watchdog';

const BUDGET: ResourceWatchdogBudget = DEFAULT_WATCHDOG_BUDGETS.full;

describe('evaluateSample — within budget', () => {
  it('does not terminate for a healthy sample', () => {
    const { decision } = evaluateSample(BUDGET, {
      cpuMs: 5,
      memoryBytes: 10 * 1024 * 1024,
      frameMs: 12,
      fuelConsumed: 1000,
      heartbeatAgeMs: 200,
    });
    expect(decision.terminate).toBe(false);
    expect(decision.reason).toBeNull();
  });
});

describe('evaluateSample — hard kills', () => {
  it('terminates on a CPU dead loop (cpuMs over budget)', () => {
    const { decision } = evaluateSample(BUDGET, { cpuMs: BUDGET.cpuMsBudget + 1 });
    expect(decision.terminate).toBe(true);
    expect(decision.reason).toBe('CPU_EXCEEDED');
  });

  it('terminates on a memory bomb (memoryBytes over budget)', () => {
    const { decision } = evaluateSample(BUDGET, {
      memoryBytes: BUDGET.memoryBytesBudget + 1,
    });
    expect(decision.terminate).toBe(true);
    expect(decision.reason).toBe('MEMORY_EXCEEDED');
  });

  it('terminates on WASM fuel exhaustion (L2)', () => {
    const { decision } = evaluateSample(BUDGET, { fuelConsumed: BUDGET.fuelBudget });
    expect(decision.terminate).toBe(true);
    expect(decision.reason).toBe('FUEL_EXHAUSTED');
  });

  it('terminates on a fired WASM epoch deadline (L2 hard interrupt)', () => {
    const { decision } = evaluateSample(BUDGET, { epochDeadlineExceeded: true });
    expect(decision.terminate).toBe(true);
    expect(decision.reason).toBe('EPOCH_DEADLINE');
  });

  it('terminates on a lost iframe heartbeat (L1)', () => {
    const { decision } = evaluateSample(BUDGET, {
      heartbeatAgeMs: BUDGET.heartbeatTimeoutMs + 1,
    });
    expect(decision.terminate).toBe(true);
    expect(decision.reason).toBe('HEARTBEAT_LOST');
  });
});

describe('evaluateSamples — stateful slow-frame streak', () => {
  it('terminates after maxConsecutiveSlowFrames slow frames', () => {
    const slow = { frameMs: BUDGET.frameBudgetMs + 50 };
    const samples = Array.from({ length: BUDGET.maxConsecutiveSlowFrames }, () => slow);
    const { decision } = evaluateSamples(BUDGET, samples);
    expect(decision.terminate).toBe(true);
    expect(decision.reason).toBe('FRAME_BUDGET_EXCEEDED');
  });

  it('does not terminate when a good frame resets the streak', () => {
    const slow = { frameMs: BUDGET.frameBudgetMs + 50 };
    const good = { frameMs: 5 };
    // One short of the tolerance, then a good frame, then slow again.
    const samples = [
      ...Array.from({ length: BUDGET.maxConsecutiveSlowFrames - 1 }, () => slow),
      good,
      slow,
    ];
    const { decision } = evaluateSamples(BUDGET, samples);
    expect(decision.terminate).toBe(false);
  });

  it('threads state across separate evaluateSample calls', () => {
    const slow = { frameMs: BUDGET.frameBudgetMs + 50 };
    let state = initialWatchdogState();
    let lastTerminate = false;
    for (let i = 0; i < BUDGET.maxConsecutiveSlowFrames; i++) {
      const res = evaluateSample(BUDGET, slow, state);
      state = res.state;
      lastTerminate = res.decision.terminate;
    }
    expect(lastTerminate).toBe(true);
  });
});

describe('makeTerminationEvent', () => {
  it('builds a return-to-map event with the user message (R6.6/6.7)', () => {
    const event = makeTerminationEvent({
      sessionId: 's1',
      plotId: 'plot_8842',
      reason: 'CPU_EXCEEDED',
      detail: 'cpu 2000ms > budget 1000ms',
      ts: 1780000000,
    });
    expect(event).toEqual({
      type: 'sandbox.terminated',
      sessionId: 's1',
      plotId: 'plot_8842',
      reason: 'CPU_EXCEEDED',
      error: {
        error: 'RESOURCE_EXCEEDED',
        detail: 'CPU_EXCEEDED: cpu 2000ms > budget 1000ms',
      },
      userMessage: RESOURCE_LIMIT_USER_MESSAGE,
      returnToMap: true,
      ts: 1780000000,
    });
  });
});
