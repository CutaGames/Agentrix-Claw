/**
 * m0FirstRun — which Soul_Birth steps the first run walks when the four-zone home (M0) is on.
 *
 * T7 r1 (10-16): a new owner went 诞生你的 AI → 连接你的电脑 → 安家永曜城 → 需要你. 永曜城 (claim a
 * plot, people nearby, +15 check-in) is not one of the four zones, and M0 already hides the World tab
 * (`MOBILE_M0_RETIRED_HIDDEN_TABS`), so the first run stopped sending people to a place the home no
 * longer shows. With M0 on, `settle_aeon` counts as done for the first run only; the store's fixed
 * order and its invariants (soulBirthStore Properties 3–5) are unchanged, and nothing is written back.
 */
import { MOBILE_M0_ENABLED } from '../../services/mobileM0';
import type { OnboardingStep } from '../../stores/soulBirthStore';

export function firstRunCompleted(
  completed: Record<OnboardingStep, boolean>,
  m0Enabled: boolean = MOBILE_M0_ENABLED,
): Record<OnboardingStep, boolean> {
  if (!m0Enabled || completed.settle_aeon) return completed;
  return { ...completed, settle_aeon: true };
}
