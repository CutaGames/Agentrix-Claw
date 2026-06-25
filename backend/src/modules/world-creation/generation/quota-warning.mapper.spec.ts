import {
  buildQuotaWarning,
  type CeilingState,
} from './quota-warning.mapper';
import {
  FREE_MONTHLY_COST_CAP_USD,
  COST_SOFT_REMINDER_RATIO,
} from '../../../../shared/types/world-creation';

/**
 * Unit tests for the FREE monthly cost-ceiling notice mapper (task 15.3,
 * R12.2 / R12.3).
 *
 * `buildQuotaWarning` is a pure function whose output is driven by the
 * `warningLevel` classification the v5 `QuotaService.checkMonthlyCostCeiling`
 * computes from accumulated monthly spend against the $5 FREE cap:
 *   - < 80% of cap  → `none`         (no warning, returns null)
 *   - ≥ 80% of cap  → `soft_warning` (R12.2 soft reminder)
 *   - ≥ 100% of cap → `hard_block`   (R12.3 hard block)
 *
 * These tests pin the boundary behaviour (79% / 80% / 100%) plus the
 * `ratioUsed` and `message` content the caller surfaces verbatim.
 */
describe('buildQuotaWarning (task 15.3)', () => {
  const CAP = FREE_MONTHLY_COST_CAP_USD; // 5
  const SOFT = COST_SOFT_REMINDER_RATIO; // 0.8

  /**
   * Build a CeilingState the way QuotaService would for a FREE user at a given
   * fraction of the cap, classifying warningLevel against the same 80%/100%
   * thresholds QuotaService uses.
   */
  function ceilingAt(ratio: number): CeilingState {
    const currentCost = Number((CAP * ratio).toFixed(4));
    let warningLevel: CeilingState['warningLevel'] = 'none';
    if (currentCost >= CAP) {
      warningLevel = 'hard_block';
    } else if (currentCost >= CAP * SOFT) {
      warningLevel = 'soft_warning';
    }
    return { warningLevel, currentCost, ceiling: CAP };
  }

  // ──────────────────────────────────────────────────────────
  // Boundary: 79% → none → null
  // ──────────────────────────────────────────────────────────
  it('returns null below the 80% soft-reminder threshold (79%)', () => {
    expect(buildQuotaWarning(ceilingAt(0.79))).toBeNull();
  });

  it('returns null for an explicit `none` warningLevel', () => {
    expect(
      buildQuotaWarning({ warningLevel: 'none', currentCost: 0, ceiling: CAP }),
    ).toBeNull();
  });

  // ──────────────────────────────────────────────────────────
  // Boundary: 80% → soft_warning (R12.2)
  // ──────────────────────────────────────────────────────────
  it('emits a soft_warning exactly at the 80% threshold', () => {
    const warning = buildQuotaWarning(ceilingAt(0.8));

    expect(warning).not.toBeNull();
    expect(warning!.warningLevel).toBe('soft_warning');
    expect(warning!.currentCost).toBe(4);
    expect(warning!.ceiling).toBe(CAP);
    expect(warning!.ratioUsed).toBeCloseTo(0.8, 10);
    // Soft reminder reports the % used and does NOT announce a block.
    expect(warning!.message).toContain('80%');
    expect(warning!.message).not.toMatch(/blocked until/i);
  });

  // ──────────────────────────────────────────────────────────
  // Boundary: 100% → hard_block (R12.3)
  // ──────────────────────────────────────────────────────────
  it('emits a hard_block exactly at the 100% cap', () => {
    const warning = buildQuotaWarning(ceilingAt(1.0));

    expect(warning).not.toBeNull();
    expect(warning!.warningLevel).toBe('hard_block');
    expect(warning!.currentCost).toBe(5);
    expect(warning!.ceiling).toBe(CAP);
    expect(warning!.ratioUsed).toBeCloseTo(1, 10);
    // Hard block announces generation is blocked until next cycle / upgrade.
    expect(warning!.message).toMatch(/blocked until the next billing cycle/i);
  });

  it('emits a hard_block when over the cap (>100%)', () => {
    const warning = buildQuotaWarning({
      warningLevel: 'hard_block',
      currentCost: 7.5,
      ceiling: CAP,
    });

    expect(warning!.warningLevel).toBe('hard_block');
    expect(warning!.ratioUsed).toBeCloseTo(1.5, 10);
  });

  // ──────────────────────────────────────────────────────────
  // ratioUsed robustness
  // ──────────────────────────────────────────────────────────
  it('clamps ratioUsed to a non-negative value', () => {
    const warning = buildQuotaWarning({
      warningLevel: 'soft_warning',
      currentCost: -1,
      ceiling: CAP,
    });

    expect(warning!.ratioUsed).toBeGreaterThanOrEqual(0);
  });

  it('falls back to the FREE cap when ceiling is non-finite (non-FREE tier)', () => {
    const warning = buildQuotaWarning({
      warningLevel: 'soft_warning',
      currentCost: 4,
      ceiling: Infinity,
    });

    expect(warning!.ceiling).toBe(FREE_MONTHLY_COST_CAP_USD);
    expect(warning!.ratioUsed).toBeCloseTo(0.8, 10);
  });
});
