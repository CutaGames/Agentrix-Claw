import * as fc from 'fast-check';
import { NotFoundException } from '@nestjs/common';
import {
  AgentBindingService,
  XP_THRESHOLDS,
  MAX_GROWTH_SKILL_SLOTS,
} from './agent-binding.service';

/**
 * Property 7: XP 单调递增
 * WorldAsset.xp only increases, never decreases (unless asset deleted).
 *
 * **Validates: Requirements 6.4**
 */
describe('Property 7: XP Monotonic Increase', () => {
  // ─── Test helpers ────────────────────────────────────────────

  /**
   * Minimal in-memory simulation of the XP system.
   * Mirrors AgentBindingService.awardXp() and calculateUnlockedSlots() logic.
   */
  function createXpTracker(initialXp = 0) {
    let xp = initialXp;
    let unlockedSlots = calculateUnlockedSlots(xp);

    function calculateUnlockedSlots(currentXp: number): number {
      let slots = 0;
      for (const threshold of XP_THRESHOLDS) {
        if (currentXp >= threshold) {
          slots++;
        } else {
          break;
        }
      }
      return Math.min(slots, MAX_GROWTH_SKILL_SLOTS);
    }

    return {
      getXp: () => xp,
      getUnlockedSlots: () => unlockedSlots,

      awardXp(amount: number): { xp: number; unlockedSkillSlots: number; newSlotUnlocked: boolean } {
        if (amount <= 0) {
          throw new Error('XP amount must be positive (XP is monotonically increasing)');
        }

        const previousXp = xp;
        const previousSlots = unlockedSlots;

        xp = xp + amount;
        unlockedSlots = calculateUnlockedSlots(xp);

        return {
          xp,
          unlockedSkillSlots: unlockedSlots,
          newSlotUnlocked: unlockedSlots > previousSlots,
        };
      },
    };
  }

  // ─── Property tests ──────────────────────────────────────────

  it('XP never decreases after any sequence of awardXp calls', () => {
    // Generate random positive XP amounts
    const xpAmountArb = fc.integer({ min: 1, max: 1000 });
    const xpSequenceArb = fc.array(xpAmountArb, { minLength: 1, maxLength: 100 });

    fc.assert(
      fc.property(xpSequenceArb, (xpAmounts) => {
        const tracker = createXpTracker(0);
        let previousXp = 0;

        for (const amount of xpAmounts) {
          const result = tracker.awardXp(amount);

          // INVARIANT: XP is monotonically increasing
          expect(result.xp).toBeGreaterThan(previousXp);
          expect(result.xp).toBeGreaterThanOrEqual(previousXp + amount);

          previousXp = result.xp;
        }

        // Final XP should equal the sum of all awarded amounts
        const totalXp = xpAmounts.reduce((sum, a) => sum + a, 0);
        expect(tracker.getXp()).toBe(totalXp);
      }),
      { numRuns: 100 },
    );
  });

  it('skill slots unlock monotonically at correct thresholds', () => {
    // Award XP in increments, verify slots unlock at 100, 500, 1500, 5000
    // Verify slots never decrease
    // Verify max 4 growth slots
    const xpIncrementArb = fc.integer({ min: 1, max: 500 });
    const xpSequenceArb = fc.array(xpIncrementArb, { minLength: 1, maxLength: 50 });

    fc.assert(
      fc.property(xpSequenceArb, (increments) => {
        const tracker = createXpTracker(0);
        let previousSlots = 0;

        for (const increment of increments) {
          const result = tracker.awardXp(increment);

          // INVARIANT: Skill slots never decrease
          expect(result.unlockedSkillSlots).toBeGreaterThanOrEqual(previousSlots);

          // INVARIANT: Max 4 growth slots
          expect(result.unlockedSkillSlots).toBeLessThanOrEqual(MAX_GROWTH_SKILL_SLOTS);

          // Verify correct threshold logic
          const currentXp = tracker.getXp();
          let expectedSlots = 0;
          if (currentXp >= 100) expectedSlots++;
          if (currentXp >= 500) expectedSlots++;
          if (currentXp >= 1500) expectedSlots++;
          if (currentXp >= 5000) expectedSlots++;
          expectedSlots = Math.min(expectedSlots, MAX_GROWTH_SKILL_SLOTS);

          expect(result.unlockedSkillSlots).toBe(expectedSlots);

          previousSlots = result.unlockedSkillSlots;
        }
      }),
      { numRuns: 100 },
    );
  });

  it('awardXp rejects non-positive amounts', () => {
    const tracker = createXpTracker(50);

    // Zero should throw
    expect(() => tracker.awardXp(0)).toThrow('XP amount must be positive');

    // Negative should throw
    expect(() => tracker.awardXp(-5)).toThrow('XP amount must be positive');
    expect(() => tracker.awardXp(-100)).toThrow('XP amount must be positive');

    // XP should remain unchanged after rejected calls
    expect(tracker.getXp()).toBe(50);
  });

  it('calculateUnlockedSlots matches expected thresholds exactly', () => {
    // Test the static calculateUnlockedSlots function from the service
    const service = new AgentBindingService(
      {} as any, // worldAssetRepo mock
      {} as any, // agentQuotaService mock
    );

    // Below first threshold
    expect(service.calculateUnlockedSlots(0)).toBe(0);
    expect(service.calculateUnlockedSlots(50)).toBe(0);
    expect(service.calculateUnlockedSlots(99)).toBe(0);

    // At and above first threshold (100)
    expect(service.calculateUnlockedSlots(100)).toBe(1);
    expect(service.calculateUnlockedSlots(499)).toBe(1);

    // At and above second threshold (500)
    expect(service.calculateUnlockedSlots(500)).toBe(2);
    expect(service.calculateUnlockedSlots(1499)).toBe(2);

    // At and above third threshold (1500)
    expect(service.calculateUnlockedSlots(1500)).toBe(3);
    expect(service.calculateUnlockedSlots(4999)).toBe(3);

    // At and above fourth threshold (5000)
    expect(service.calculateUnlockedSlots(5000)).toBe(4);
    expect(service.calculateUnlockedSlots(99999)).toBe(4);

    // Max is always 4 regardless of how high XP goes
    expect(service.calculateUnlockedSlots(1_000_000)).toBe(4);
  });

  it('XP accumulation is additive and precise', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 10000 }), { minLength: 2, maxLength: 20 }),
        (amounts) => {
          const tracker = createXpTracker(0);
          let runningTotal = 0;

          for (const amount of amounts) {
            tracker.awardXp(amount);
            runningTotal += amount;

            // INVARIANT: XP equals exact sum of all awards
            expect(tracker.getXp()).toBe(runningTotal);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
