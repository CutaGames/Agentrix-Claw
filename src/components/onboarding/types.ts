/**
 * Soul_Birth Step 组件共享契约。
 *
 * spec:   .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * design: §2.2(SoulBirthHost 渲染决策)
 *
 * `SoulBirthHost` 按 currentStep 渲染对应 Step 组件,并向其注入两个统一回调:
 *   - `onComplete`:Step 在「真实完成点」调用 → `soulBirthStore.complete(step)` 推进(R1.3)。
 *   - `onSkip`:统一「跳过」入口 → `soulBirthStore.skip()` 结束整条 Soul_Birth 主线(R1.5)。
 *
 * 真正的 Step 实现分散在后续任务(3.3–3.6 / 4.2);它们只需实现本契约即可被 host
 * 无缝挂载,无需改动 host。
 */
export interface SoulBirthStepProps {
  /** Step 在其定义的真实完成条件达成时调用,推进到下一步(R1.3)。 */
  onComplete: () => void;
  /** 统一「跳过」入口:结束 Soul_Birth 主线并进入常规主界面(R1.5)。 */
  onSkip: () => void;
}
