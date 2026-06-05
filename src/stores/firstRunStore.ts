/**
 * firstRunStore — 新手 90 秒任务编排器(把核心玩法串成一条引导线)。
 *
 * design: docs/business/FIRST_90S_WOW_FLOW.zh-CN.md
 *
 * 现有玩法是"散"的:拍照创角 / 战斗 / 圈地 / AXP 各自独立,新用户做完一步不知道
 * 下一步该干嘛。这个 store 维护一条 4 步的新手任务线,World tab 顶部用一条进度条
 * 永远指向"下一步",并在各完成点(角色卡出现 / 首胜 / 圈地成功)自动推进。
 *
 * 90s 脚本对应:
 *   create   — 拍一下造出第一个角色(游客即可,核心 wow)
 *   save     — 保存角色(=注册转化点)
 *   battle   — 带 TA 打一场训练战并获胜(首胜 + XP)
 *   settle   — 把角色安置到永曜城(圈第一块地 + 看附近的人)
 *
 * 持久化到 MMKV(每安装一次性);完成或跳过后不再打扰。
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from './mmkvStorage';

export type FirstRunStep = 'create' | 'save' | 'battle' | 'settle';

export const FIRST_RUN_STEPS: FirstRunStep[] = ['create', 'save', 'battle', 'settle'];

export interface FirstRunStepMeta {
  key: FirstRunStep;
  /** 进度条短标题。 */
  title: string;
  /** 一句话引导(下一步该干什么)。 */
  hint: string;
  /** CTA 文案。 */
  cta: string;
  emoji: string;
}

export const FIRST_RUN_META: Record<FirstRunStep, FirstRunStepMeta> = {
  create: { key: 'create', emoji: '📷', title: '造一个角色', hint: '拍一下身边任意物品,几秒变成会战斗的 AI 角色', cta: '拍一下' },
  save: { key: 'save', emoji: '💾', title: '保存角色', hint: '保存 TA,解锁战斗、永曜城和钱包', cta: '保存 / 登录' },
  battle: { key: 'battle', emoji: '⚔️', title: '打一场首胜', hint: '带 TA 跟训练假人打一场,赢取经验升级', cta: '去战斗' },
  settle: { key: 'settle', emoji: '🏙️', title: '安家永曜城', hint: '在地图上圈下你的第一块地,让 TA 住进真实世界', cta: '去圈地' },
};

interface FirstRunState {
  /** 已完成的步骤集合。 */
  completed: Record<FirstRunStep, boolean>;
  /** 用户主动关掉了引导条(不再显示)。 */
  dismissed: boolean;
  /** 标记一步完成(幂等)。 */
  complete: (step: FirstRunStep) => void;
  /** 关闭引导条。 */
  dismiss: () => void;
  /** 重新打开(用于"我的→重看新手引导")。 */
  reset: () => void;
}

const EMPTY: Record<FirstRunStep, boolean> = { create: false, save: false, battle: false, settle: false };

export const useFirstRunStore = create<FirstRunState>()(
  persist(
    (set) => ({
      completed: { ...EMPTY },
      dismissed: false,
      complete: (step) =>
        set((s) => (s.completed[step] ? s : { completed: { ...s.completed, [step]: true } })),
      dismiss: () => set({ dismissed: true }),
      reset: () => set({ completed: { ...EMPTY }, dismissed: false }),
    }),
    {
      name: 'agentrix-first-run-v1',
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);

/** 当前应引导的下一步;全部完成返回 null。 */
export function nextFirstRunStep(completed: Record<FirstRunStep, boolean>): FirstRunStep | null {
  for (const k of FIRST_RUN_STEPS) {
    if (!completed[k]) return k;
  }
  return null;
}

/** 非 React 调用点(事件处理 / 导航回调)直接推进一步。 */
export function markFirstRunStep(step: FirstRunStep): void {
  useFirstRunStore.getState().complete(step);
}
