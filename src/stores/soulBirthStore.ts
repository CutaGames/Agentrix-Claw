/**
 * soulBirthStore — 「灵魂诞生(Soul_Birth)」首跑引导五段编排器。
 *
 * spec:   .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * design: §2.1 / §2.2,Correctness Properties 3/4/5
 *
 * 由旧的 4 步 `firstRunStore`(含 battle)改造而来:
 *   - 砍掉「拍照 → 3D → 回合战斗」的 wow 主线,移除 `battle` 步骤(C1/C8/R1.8)。
 *   - 固定顺序:birth → first_words → connect_desktop → settle_aeon(R1.2)。
 *   - 2026-06 产品决策:邮箱/日历 OAuth「连接」从首跑主线中**移除**(Google 敏感权限审核 /
 *     access_denied / 回跳摩擦过于脆弱,不适合放进 90s 首跑)。原 `first_task` 段(内联
 *     OAuth + 播报 + AXP)已删除;连接日历/邮箱改为「连接器中心」(ConnectorHub)内的
 *     **按需**动作,由用户主动触发(后端幂等奖励路径保留,只是不再由首跑调用)。
 *   - 新增 `terminated` 终止标志(完成或跳过后不再自动触发,R1.6/C9)。
 *   - 新增 `recompute(ExternalFacts)`:用外部事实回填已达成的较后步骤,实现
 *     "skip-earlier-if-later-done"(R1.2a)。
 *
 * 持久化使用全新 key `agentrix-soul-birth-v1`,不复用旧 `agentrix-first-run-v1`
 * 数据(旧 4 步语义含 battle,无法平滑映射)。沿用 `mmkvStorage` + zustand persist。
 *
 * 不变式(任何改动都应保持):
 *   - Property 3 步骤单调推进:`completed[step]` 一旦为真,同一生命周期内不会被自动
 *     置假;只有 `reset()` 能整体清空。`complete`/`recompute` 只会把步骤置真。
 *   - Property 4 指针=第一个未完成:`currentStep` 返回固定顺序中第一个 false 的步骤,
 *     全部为真返回 null(触发终止)。
 *   - Property 5 较后已达成则跳过较早:经 `recompute` 回填后,指针自动跳过其之前未完成项。
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from './mmkvStorage';

/** Soul_Birth 四段之一(不含 battle R1.8;不含已移除的 first_task OAuth 段)。 */
export type OnboardingStep =
  | 'birth'
  | 'first_words'
  | 'connect_desktop'
  | 'settle_aeon';

/** 固定编排顺序(R1.2)。currentStep 依此顺序解析"第一个未完成"。 */
export const SOUL_BIRTH_STEPS: OnboardingStep[] = [
  'birth',
  'first_words',
  'connect_desktop',
  'settle_aeon',
];

/**
 * 外部事实:由 `SoulBirthHost` 挂载时拉取(getMyInstances / relay 历史 / claimPlot 历史)
 * 并通过 `recompute` 回填,实现 skip-earlier-if-later-done(R1.2a)。
 */
export interface ExternalFacts {
  /** 已有可用 Claw_Instance → birth 视为完成。 */
  hasInstance: boolean;
  /** 曾成功配对过桌面端 → connect_desktop 视为完成。 */
  desktopPairedBefore: boolean;
  /** 已圈过地 → settle_aeon 视为完成。 */
  hasClaimedPlot: boolean;
}

/** birth 段产出的可持久化信息。 */
export interface BirthArtifacts {
  instanceId: string | null;
  petName: string | null;
  avatarId: string | null;
}

interface SoulBirthState extends BirthArtifacts {
  /** 已完成的步骤集合。 */
  completed: Record<OnboardingStep, boolean>;
  /** 完成或跳过后置真,不再自动触发(R1.6/C9)。 */
  terminated: boolean;
  /**
   * 「重看引导」显式重放意图(R1.7)。`reset()` 置真,任一终止路径置假。
   *
   * 为何需要:`SoulBirthHost` 挂载时会用 `recompute(ExternalFacts)` 做
   * "skip-earlier-if-later-done"(R1.2a)——而重看时用户**仍持有**已孵化的
   * Claw_Instance(hasInstance=true),若照常回填会把 `birth` 置真从而**跳过诞生段**,
   * 违反 R1.7「从 birth 步骤重新开始」。因此重放期间需抑制 recompute 回填。
   *
   * 语义:仅 `reset()` 置真(用户主动重看);`skip()` / `markTerminated()` /
   * `complete()` 触发终止时一并清假,使下一次正常首跑/续跑恢复 R1.2a 回填。
   */
  replaying: boolean;

  /**
   * 暂挂标志 —— 当某个 Step 需要把用户**带离**覆盖层去到另一个全屏路由
   * (如 BirthStep 的「拍一张」→ WorldEngineScanner、「去市场选」→ PetsSkins)时置真,
   * 使 `SoulBirthHost` 临时返回 null,避免不透明覆盖层遮挡目标屏(原 task 3.3 已知缺陷)。
   *
   * **瞬态、绝不持久化**:故意不进 `partialize` 白名单 —— App 重启后必为 false,
   * 这样即便用户在外出导航途中崩溃/被杀进程,也不会让引导覆盖层被永久隐藏。
   *
   * 恢复由 `SoulBirthHost` 监听导航返回 / App 回前台触发 `resume()`,保证不会卡死隐藏。
   * 进度(step)与 birth 段产出(petName/avatarId)均不受影响,返回后在同一步原样续展。
   */
  suspended: boolean;

  /**
   * 本次 Soul_Birth 进度所归属的用户 id(R1.6/C9 的「每用户一次性」语义落地点)。
   *
   * 为何需要(2026-06 生产真机 Bug 修复):`terminated`/`completed` 通过 MMKV
   * (key `agentrix-soul-birth-v1`)按**安装**持久化,而非按**用户**。于是只要本机上
   * 任一账号曾完成/跳过 Soul_Birth(terminated=true),之后**任何新登录的用户**——包括
   * 全新 Google 账号——都会被该残留 terminated 直接抑制,引导永不出现。这正是真机测试
   * 「登录后不进入 birth/90s 语音」的根因之一。
   *
   * 修复:记录进度所属用户;`bindUser(userId)` 在登录用户变化时把进度重置为全新,
   * 使「未自己完成/终止过的新用户」必得引导(R1.1),同时**不破坏**同一用户的
   * 「完成后不再触发」(R1.6/C9)与 recompute 的 skip-earlier(R1.2a)。
   *
   * null = 尚未绑定(全新安装 / 旧版本升级):此时**不清空**已有进度,只认领当前用户,
   * 避免升级用户在 birth 途中被误重置。
   */
  boundUserId: string | null;

  /**
   * 将当前 Soul_Birth 进度绑定到指定用户。登录后由 `SoulBirthHost` 调用:
   *   - boundUserId 为 null(全新/升级)→ 仅认领,不清空既有进度。
   *   - boundUserId === userId(同一用户)→ no-op,保留其 completed/terminated(R1.6/C9)。
   *   - boundUserId !== userId(本机换了账号)→ 为新用户开启全新 Soul_Birth(清空进度/终止/
   *     重放/挂起与 birth 产出),使其必得引导(R1.1)。
   */
  bindUser: (userId: string | null) => void;

  /** 幂等标记一步完成并推进;全部完成时自动终止(R1.3/R1.6)。 */
  complete: (step: OnboardingStep) => void;
  /** 结束 Soul_Birth 主线(用户在任一步选择"跳过",R1.5)。 */
  skip: () => void;
  /** 临时挂起覆盖层(Step 带用户去到另一全屏路由前调用),不影响进度与产出。 */
  suspend: () => void;
  /** 解除挂起,覆盖层在原步骤原样恢复(由 host 监听返回/回前台触发)。 */
  resume: () => void;
  /** 显式终止(全部完成时由 host 兜底调用;complete 也会自动终止,R1.6)。 */
  markTerminated: () => void;
  /** 重看引导:清空进度并从 birth 重新开始(R1.7)。 */
  reset: () => void;
  /** 用外部事实回填已达成的较后步骤(R1.2a);单调,只会置真。 */
  recompute: (facts: ExternalFacts) => void;
  /** 存储 birth 段产出(名称 / 皮肤 / 实例 id,R2.7/R2.8)。 */
  setBirth: (info: Partial<BirthArtifacts>) => void;
}

const EMPTY_COMPLETED: Record<OnboardingStep, boolean> = {
  birth: false,
  first_words: false,
  connect_desktop: false,
  settle_aeon: false,
};

/**
 * 当前应引导的步骤:固定顺序中第一个未完成的步骤;全部完成返回 null。
 * 纯函数,便于单测(Property 4)。
 */
export function currentStep(
  completed: Record<OnboardingStep, boolean>,
): OnboardingStep | null {
  for (const step of SOUL_BIRTH_STEPS) {
    if (!completed[step]) return step;
  }
  return null;
}

/** 是否全部步骤都已完成(纯函数,便于复用与单测)。 */
export function allStepsComplete(
  completed: Record<OnboardingStep, boolean>,
): boolean {
  return SOUL_BIRTH_STEPS.every((step) => completed[step]);
}

export const useSoulBirthStore = create<SoulBirthState>()(
  persist(
    (set) => ({
      completed: { ...EMPTY_COMPLETED },
      terminated: false,
      replaying: false,
      suspended: false,
      boundUserId: null,
      instanceId: null,
      petName: null,
      avatarId: null,

      bindUser: (userId) =>
        set((s) => {
          if (!userId) return s;
          // 全新安装 / 旧版本升级(从未绑定):只认领当前用户,保留既有进度,
          // 避免把正处于 birth 途中的升级用户误重置。
          if (s.boundUserId == null) {
            return { boundUserId: userId };
          }
          // 同一用户重新进入:保留其 completed/terminated(完成后不再触发,R1.6/C9)。
          if (s.boundUserId === userId) return s;
          // 本机切换到另一账号:为新用户开启全新 Soul_Birth(R1.1),
          // 不沿用上一账号的 terminated/completed(这正是真机 Bug 的根因)。
          return {
            boundUserId: userId,
            completed: { ...EMPTY_COMPLETED },
            terminated: false,
            replaying: false,
            suspended: false,
            instanceId: null,
            petName: null,
            avatarId: null,
          };
        }),

      complete: (step) =>
        set((s) => {
          // 单调:只置真,已完成则不再变更(幂等)。
          const completed = s.completed[step]
            ? s.completed
            : { ...s.completed, [step]: true };
          // 全部完成 → 自动终止(R1.6);否则保持原终止态。
          const terminated = s.terminated || allStepsComplete(completed);
          // 终止即结束本次(可能是)重放(R1.7);未终止则保持重放态不变。
          const replaying = terminated ? false : s.replaying;
          if (
            completed === s.completed &&
            terminated === s.terminated &&
            replaying === s.replaying
          ) {
            return s; // 无变化,保持引用稳定
          }
          return { completed, terminated, replaying };
        }),

      skip: () => set({ terminated: true, replaying: false, suspended: false }),

      markTerminated: () => set({ terminated: true, replaying: false, suspended: false }),

      // 临时挂起/恢复覆盖层(瞬态)。挂起仅遮挡判定,不触碰 completed/terminated/产出,
      // 因此从相机/市场返回后由 host 调 resume() 即在同一步原样恢复(返回后名称/形象保留)。
      suspend: () => set((s) => (s.suspended ? s : { suspended: true })),
      resume: () => set((s) => (s.suspended ? { suspended: false } : s)),

      reset: () =>
        // 重看引导:清空步骤进度、解除终止,并置 `replaying` 抑制 recompute 回填,
        // 从而真正从 birth 步骤重新开始(R1.7;否则 hasInstance 会回填 birth 跳过诞生段)。
        // 同时清除任何残留的 `suspended`:reset 会令 active 重新为真,若挂起态遗留为真
        // 会导致覆盖层被错误隐藏。保留 birth 段产出(instanceId/petName/avatarId 为真实
        // 已孵化数据,非引导"进度",不在此销毁)。
        set({
          completed: { ...EMPTY_COMPLETED },
          terminated: false,
          replaying: true,
          suspended: false,
        }),

      recompute: (facts) =>
        set((s) => {
          // 重放期间(R1.7)不回填:用户已持有实例,回填会跳过 birth,违反"从头重看"。
          if (s.replaying) return s;
          // 单调回填:仅在事实为真时置真,绝不置假(保持 Property 3)。
          const completed = { ...s.completed };
          if (facts.hasInstance) completed.birth = true;
          if (facts.desktopPairedBefore) completed.connect_desktop = true;
          if (facts.hasClaimedPlot) completed.settle_aeon = true;
          const changed = SOUL_BIRTH_STEPS.some(
            (step) => completed[step] !== s.completed[step],
          );
          return changed ? { completed } : s;
        }),

      setBirth: (info) =>
        set((s) => ({
          instanceId: info.instanceId !== undefined ? info.instanceId : s.instanceId,
          petName: info.petName !== undefined ? info.petName : s.petName,
          avatarId: info.avatarId !== undefined ? info.avatarId : s.avatarId,
        })),
    }),
    {
      name: 'agentrix-soul-birth-v1',
      storage: createJSONStorage(() => mmkvStorage),
      // 只持久化数据字段,不持久化 action 函数。
      partialize: (s) => ({
        completed: s.completed,
        terminated: s.terminated,
        replaying: s.replaying,
        boundUserId: s.boundUserId,
        instanceId: s.instanceId,
        petName: s.petName,
        avatarId: s.avatarId,
      }),
    },
  ),
);
