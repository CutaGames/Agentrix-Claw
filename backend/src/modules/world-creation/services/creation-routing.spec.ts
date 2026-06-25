import { resolveCreationRouting } from './creation-routing';
import type { SubstrateTier } from '../../../../shared/types/world-creation';
import type { CreationSurface } from '../../../../shared/types/world-creation-api';

/**
 * Unit tests for resolveCreationRouting — Mobile Tier_C dispatch routing
 * (Task 14.4, R3.7 / R8.7).
 *
 * Pure decision function: encodes the single invariant that Tier_C authoring may
 * not run on Mobile (must be dispatched to Desktop or a bound Agent_Builder),
 * while everything else runs locally on the originating surface.
 */
describe('resolveCreationRouting — Mobile Tier_C dispatch (R3.7/R8.7)', () => {
  describe('Mobile + Tier_C → must dispatch off-device', () => {
    it('defaults the dispatch target to desktop', () => {
      const decision = resolveCreationRouting('mobile', 'C');

      expect(decision.mustDispatch).toBe(true);
      expect(decision.target).toBe('desktop');
      expect(decision.substrateTier).toBe('C');
      expect(decision.reason).toMatch(/Tier_C/);
    });

    it('honors an explicit agent preferred target', () => {
      const decision = resolveCreationRouting('mobile', 'C', 'agent');

      expect(decision.mustDispatch).toBe(true);
      expect(decision.target).toBe('agent');
    });

    it('honors an explicit desktop preferred target', () => {
      const decision = resolveCreationRouting('mobile', 'C', 'desktop');

      expect(decision.mustDispatch).toBe(true);
      expect(decision.target).toBe('desktop');
    });
  });

  describe('everything else runs locally (mustDispatch=false, target=self)', () => {
    const localCases: Array<{ surface: CreationSurface; tier: SubstrateTier }> = [
      // Mobile may author Tier_A / Tier_B locally.
      { surface: 'mobile', tier: 'A' },
      { surface: 'mobile', tier: 'B' },
      // Desktop / web may author any tier locally, including Tier_C.
      { surface: 'desktop', tier: 'A' },
      { surface: 'desktop', tier: 'B' },
      { surface: 'desktop', tier: 'C' },
      { surface: 'web', tier: 'A' },
      { surface: 'web', tier: 'B' },
      { surface: 'web', tier: 'C' },
    ];

    it.each(localCases)(
      'surface=$surface tier=$tier → local self',
      ({ surface, tier }) => {
        const decision = resolveCreationRouting(surface, tier);

        expect(decision.mustDispatch).toBe(false);
        expect(decision.target).toBe('self');
        expect(decision.substrateTier).toBe(tier);
      },
    );

    it('ignores the preferred target when routing is not forced', () => {
      // Desktop Tier_C does not dispatch, so a preferred target is irrelevant.
      const decision = resolveCreationRouting('desktop', 'C', 'agent');

      expect(decision.mustDispatch).toBe(false);
      expect(decision.target).toBe('self');
    });
  });
});
