import type { SubstrateTier } from '../../../../shared/types/world-creation';
import type {
  CreationSurface,
  CreationDispatchDecision,
} from '../../../../shared/types/world-creation-api';

/**
 * resolveCreationRouting — Mobile Tier_C dispatch routing helper (R3.7, R8.7).
 *
 * Pure decision function (no I/O) so it is trivially unit-testable (task 14.4)
 * and reusable by the continuum orchestrator and the future Creation_Task_Queue
 * (task 20.x). It encodes the single invariant:
 *
 *   **Tier_C authoring may not run on Mobile** — a Mobile-originated Tier_C
 *   creation MUST be dispatched as a Creation_Task to Desktop or a bound
 *   Agent_Builder; everything else (Tier_A/B on any surface, Tier_C on
 *   Desktop/web) runs locally on the originating surface.
 *
 * @param surface         Where the creation request originates (mobile/desktop/web).
 * @param substrateTier   The Plot's declared substrate tier (authoring ceiling).
 * @param preferredTarget Optional preferred dispatch target when routing is forced
 *                        (defaults to `desktop`); only honored for `desktop`/`agent`.
 */
export function resolveCreationRouting(
  surface: CreationSurface,
  substrateTier: SubstrateTier,
  preferredTarget?: 'desktop' | 'agent',
): CreationDispatchDecision {
  if (surface === 'mobile' && substrateTier === 'C') {
    const target = preferredTarget === 'agent' ? 'agent' : 'desktop';
    return {
      mustDispatch: true,
      target,
      substrateTier,
      reason:
        `Tier_C authoring cannot run on Mobile; dispatched as a Creation_Task ` +
        `to ${target} (R3.7/R8.7)`,
    };
  }

  return {
    mustDispatch: false,
    target: 'self',
    substrateTier,
    reason: `Tier_${substrateTier} authoring on ${surface} runs locally on the originating surface`,
  };
}
