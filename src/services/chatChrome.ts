/**
 * chatChrome — what the 伙伴 chat shows around the conversation (T7 r1, 10-16). Pure, so the rules are pinned by a test.
 *
 * The first simulated-user round on the phone found the composer carrying a "执行 🔒端侧 / 🤖智能 / ☁️云端" switch and a
 * permanent "LLM 预算 $0.00 / $0.30 FREE 0%" strip under it for every chat, in the default 入门 interface mode.
 */
import type { ExecutionMode, UiComplexity } from '../stores/settingsStore';

/**
 * The "where does it run" switch: shown in 进阶 and 专业, and in 入门 only once a tier other than the default 自动 is
 * chosen (so the choice stays visible and can be undone).
 */
export function chatExecutionModeVisible(uiComplexity: UiComplexity, executionMode: ExecutionMode): boolean {
  return uiComplexity !== 'beginner' || executionMode !== 'auto';
}

/** The monthly AI usage strip: shown when it matters (80 % used or more, or used up), and always in 专业. */
export function llmBudgetBarVisible(input: { usagePercent: number; quotaExhausted: boolean; uiComplexity: UiComplexity }): boolean {
  if (input.quotaExhausted) return true;
  if (input.uiComplexity === 'professional') return true;
  return Number.isFinite(input.usagePercent) && input.usagePercent >= 80;
}
