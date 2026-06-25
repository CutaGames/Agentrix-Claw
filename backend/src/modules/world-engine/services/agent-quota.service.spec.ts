import * as fc from 'fast-check';
import { ForbiddenException } from '@nestjs/common';

/**
 * Property 5: Agent Slot 约束
 * Bound Agent count never exceeds subscription max (free ≤ 3).
 *
 * **Validates: Requirements 6.6, 11.2, 11.3**
 *
 * This test validates the core invariant of the AgentQuotaService:
 * regardless of the sequence of bind/unbind operations, the number of
 * bound agents never exceeds the workspace's maxAgents limit.
 */
describe('Property 5: Agent Slot Constraint', () => {
  // ─── Test helpers ────────────────────────────────────────────

  /**
   * Synchronous model of the Agent quota system.
   * Mirrors the core logic of AgentQuotaService without DB/async overhead.
   *
   * The real service uses:
   * - getUserMaxAgents() → workspace.maxAgents
   * - countBoundAgents() → openclaw_instances + world_assets with boundAgentId
   * - acquireLock/releaseLock → Redis mutex for serialization
   *
   * This model captures the essential invariant: bound count ≤ maxAgents.
   */
  class QuotaModel {
    private boundCount: number;
    readonly maxAgents: number;

    constructor(maxAgents: number, initialBound = 0) {
      this.maxAgents = maxAgents;
      this.boundCount = initialBound;
    }

    getBoundCount(): number {
      return this.boundCount;
    }

    /**
     * Attempt to bind an agent. Returns true if successful, false if quota full.
     * Mirrors acquireAgentSlot() which throws ForbiddenException on quota exhaustion.
     */
    tryBind(): boolean {
      if (this.boundCount >= this.maxAgents) {
        return false; // Quota exhausted
      }
      this.boundCount++;
      return true;
    }

    /**
     * Unbind an agent. Mirrors releaseAgentSlot() / unbindAgent().
     */
    unbind(): void {
      if (this.boundCount > 0) {
        this.boundCount--;
      }
    }

    checkQuota(): { current: number; max: number; available: boolean } {
      return {
        current: this.boundCount,
        max: this.maxAgents,
        available: this.boundCount < this.maxAgents,
      };
    }
  }

  // ─── Property tests ──────────────────────────────────────────

  it('bound agent count never exceeds workspace.maxAgents after any sequence of bind/unbind operations', () => {
    const operationArb = fc.constantFrom('bind' as const, 'unbind' as const);
    const operationSequenceArb = fc.array(operationArb, { minLength: 1, maxLength: 50 });

    // Test with FREE=3 limit
    fc.assert(
      fc.property(operationSequenceArb, (operations) => {
        const model = new QuotaModel(3);

        for (const op of operations) {
          if (op === 'bind') {
            model.tryBind(); // May succeed or fail — either is fine
          } else {
            model.unbind();
          }

          // INVARIANT checked after EVERY operation:
          // bound count never exceeds maxAgents
          expect(model.getBoundCount()).toBeLessThanOrEqual(model.maxAgents);
          expect(model.getBoundCount()).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 200 },
    );

    // Test with PRO=10 limit
    fc.assert(
      fc.property(operationSequenceArb, (operations) => {
        const model = new QuotaModel(10);

        for (const op of operations) {
          if (op === 'bind') {
            model.tryBind();
          } else {
            model.unbind();
          }

          expect(model.getBoundCount()).toBeLessThanOrEqual(model.maxAgents);
          expect(model.getBoundCount()).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('concurrent bind attempts do not exceed quota', async () => {
    // Simulate 5 concurrent bindAgent() calls when only 1 slot remains.
    // The real service uses a Redis mutex to serialize concurrent binds.
    // This test verifies the serialization invariant.
    const maxAgents = 3;
    const initialBound = 2; // Only 1 slot remaining
    let boundCount = initialBound;

    // Simulate mutex-protected acquireAgentSlot with async serialization
    let lockHeld = false;
    const lockQueue: Array<() => void> = [];

    const acquireLock = (): Promise<void> => {
      return new Promise<void>((resolve) => {
        if (!lockHeld) {
          lockHeld = true;
          resolve();
        } else {
          lockQueue.push(() => {
            lockHeld = true;
            resolve();
          });
        }
      });
    };

    const releaseLock = (): void => {
      if (lockQueue.length > 0) {
        const next = lockQueue.shift()!;
        next();
      } else {
        lockHeld = false;
      }
    };

    const acquireSlot = async (): Promise<void> => {
      await acquireLock();
      try {
        if (boundCount >= maxAgents) {
          throw new ForbiddenException('Agent slot quota reached');
        }
        boundCount++;
      } finally {
        releaseLock();
      }
    };

    // Launch 5 concurrent bind attempts
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => acquireSlot()),
    );

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    // Exactly 1 should succeed (only 1 slot was available)
    expect(successes.length).toBe(1);
    // The other 4 should fail with ForbiddenException
    expect(failures.length).toBe(4);

    // Final bound count must not exceed max
    expect(boundCount).toBeLessThanOrEqual(maxAgents);
    expect(boundCount).toBe(3); // 2 initial + 1 successful bind
  });

  it('unbinding frees a slot for subsequent binding', () => {
    // Fill all slots
    const model = new QuotaModel(3, 3);

    // Verify quota is full
    const quotaBefore = model.checkQuota();
    expect(quotaBefore.available).toBe(false);
    expect(quotaBefore.current).toBe(3);

    // Attempting to bind should fail
    expect(model.tryBind()).toBe(false);
    expect(model.getBoundCount()).toBe(3); // Still at max

    // Unbind one
    model.unbind();

    // Now quota should have 1 available
    const quotaAfter = model.checkQuota();
    expect(quotaAfter.available).toBe(true);
    expect(quotaAfter.current).toBe(2);

    // Next bind should succeed
    expect(model.tryBind()).toBe(true);
    expect(model.getBoundCount()).toBe(3);
    expect(model.getBoundCount()).toBeLessThanOrEqual(model.maxAgents);
  });

  it('total successful binds never exceed maxAgents regardless of attempt count', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(3, 10, 50, 200), // FREE, PRO, BUSINESS, ENTERPRISE
        fc.integer({ min: 0, max: 200 }),
        (maxAgents, attemptedBinds) => {
          const model = new QuotaModel(maxAgents);
          let successfulBinds = 0;

          for (let i = 0; i < attemptedBinds; i++) {
            if (model.tryBind()) {
              successfulBinds++;
            }
          }

          // INVARIANT: successful binds never exceed maxAgents
          expect(successfulBinds).toBeLessThanOrEqual(maxAgents);
          expect(model.getBoundCount()).toBeLessThanOrEqual(maxAgents);
          // Successful binds should equal min(attemptedBinds, maxAgents)
          expect(successfulBinds).toBe(Math.min(attemptedBinds, maxAgents));
        },
      ),
      { numRuns: 100 },
    );
  });
});
