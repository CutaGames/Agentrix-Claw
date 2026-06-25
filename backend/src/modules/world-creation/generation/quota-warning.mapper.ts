/**
 * quota-warning.mapper — pure mapper for the FREE monthly cost-ceiling notice
 * (task 15.2, R12.2/12.3).
 *
 * The v5 {@link QuotaService.checkMonthlyCostCeiling} already classifies a FREE
 * user's accumulated monthly spend into `none` / `soft_warning` (≥ 80% of the
 * $5 cap) / `hard_block` (≥ 100%). This mapper turns that classification into a
 * user-facing {@link GenerationQuotaWarning} that generation entry points
 * (e.g. {@link AgentBuilderService.generateDraft}, {@link GenerationMeteringService.checkQuota})
 * can surface to callers verbatim.
 *
 * Kept as a pure, dependency-free function so the 80% soft-reminder and 100%
 * hard-block boundaries are directly unit-testable (task 15.3) without any
 * NestJS / DB wiring.
 */
import {
  FREE_MONTHLY_COST_CAP_USD,
  type GenerationQuotaWarning,
  type GenerationWarningLevel,
} from '../../../../shared/types/world-creation';

/** Shape of the v5 QuotaService.checkMonthlyCostCeiling result consumed here. */
export interface CeilingState {
  warningLevel: GenerationWarningLevel;
  currentCost: number;
  ceiling: number;
}

/**
 * Build a user-facing cost-ceiling warning from a monthly-ceiling state.
 *
 * @returns A {@link GenerationQuotaWarning} when the ceiling is in a
 *          `soft_warning` (≥ 80%) or `hard_block` (≥ 100%) state, or `null` when
 *          the user is comfortably under the cap (`none`) — including non-FREE
 *          tiers which never carry a finite ceiling.
 */
export function buildQuotaWarning(
  state: CeilingState,
): GenerationQuotaWarning | null {
  if (state.warningLevel === 'none') {
    return null;
  }

  // Non-FREE tiers report an Infinity ceiling; fall back to the FREE cap so the
  // message stays sensible even if a finite value is ever absent.
  const cap = Number.isFinite(state.ceiling)
    ? state.ceiling
    : FREE_MONTHLY_COST_CAP_USD;

  const ratioUsed = cap > 0 ? Math.max(0, state.currentCost / cap) : 0;

  const message =
    state.warningLevel === 'hard_block'
      ? `Monthly generation cost cap reached ($${state.currentCost.toFixed(2)} / ` +
        `$${cap}). Generation is blocked until the next billing cycle or an upgrade.`
      : `You have used ${Math.round(ratioUsed * 100)}% of your monthly generation ` +
        `cost cap ($${state.currentCost.toFixed(2)} / $${cap}). Generation will be ` +
        `blocked once you reach the cap.`;

  return {
    warningLevel: state.warningLevel,
    currentCost: state.currentCost,
    ceiling: cap,
    ratioUsed,
    message,
  };
}
