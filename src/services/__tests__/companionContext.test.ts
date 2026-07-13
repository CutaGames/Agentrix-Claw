/**
 * companionContext — Companion_QA 上下文构造器单元测试(R9.3,Design §8)。
 *
 * spec:  .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * task:  5.1 移动端 Companion_QA 上下文 + 流式
 *
 * 验证:
 *   - buildCompanionChatContext 采集 device/scene/route + 引导任务态(R9.3)。
 *   - withCompanionContext 把 companion 上下文附加进既有 context 而不丢 sessionId。
 *   - 路由/store 读取失败时降级为安全默认值,绝不抛错(Error Handling:外部失败不卡主线)。
 *
 * 放在 `src/services/__tests__/` 匹配 jest testMatch;mock navigationRef 与 soulBirthStore
 * 以隔离 react-navigation / zustand-persist/MMKV 依赖。
 * 注:Windows 检出 node_modules 为桩,本地不跑 jest;真实门禁走 WSL/CI。
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const getCurrentRouteName = jest.fn() as jest.MockedFunction<() => string | null>;
const getState = jest.fn() as jest.MockedFunction<() => any>;

jest.mock('../../navigation/navigationRef', () => ({
  getCurrentRouteName: () => getCurrentRouteName(),
}));

jest.mock('../../stores/soulBirthStore', () => ({
  useSoulBirthStore: { getState: () => getState() },
  // 真实的 currentStep 纯函数语义:固定顺序第一个未完成。
  currentStep: (completed: Record<string, boolean>) => {
    const order = ['birth', 'first_words', 'connect_desktop', 'settle_aeon'];
    for (const step of order) {
      if (!completed[step]) return step;
    }
    return null;
  },
}));

import { buildCompanionChatContext, withCompanionContext } from '../companionContext';

const ALL_FALSE = {
  birth: false,
  first_words: false,
  connect_desktop: false,
  settle_aeon: false,
};

describe('buildCompanionChatContext', () => {
  beforeEach(() => {
    getCurrentRouteName.mockReset();
    getState.mockReset();
  });

  it('采集当前终端 / 场景 / 引导步骤(R9.3)', () => {
    getCurrentRouteName.mockReturnValue('WorldHub');
    getState.mockReturnValue({ completed: { ...ALL_FALSE }, terminated: false });

    const ctx = buildCompanionChatContext('mobile');

    expect(ctx.device).toBe('mobile');
    expect(ctx.scene).toBe('WorldHub');
    expect(ctx.route).toBe('WorldHub');
    expect(ctx.taskState.onboardingActive).toBe(true);
    expect(ctx.taskState.onboardingStep).toBe('birth');
    expect(ctx.taskState.onboardingTerminated).toBe(false);
  });

  it('引导已终止 → onboardingActive 假,step 解析仍正确', () => {
    getCurrentRouteName.mockReturnValue('Plaza');
    getState.mockReturnValue({
      completed: { ...ALL_FALSE, birth: true },
      terminated: true,
    });

    const ctx = buildCompanionChatContext();

    expect(ctx.scene).toBe('Plaza');
    expect(ctx.taskState.onboardingActive).toBe(false);
    expect(ctx.taskState.onboardingTerminated).toBe(true);
    // 第一个未完成仍是 first_words(birth 已完成)。
    expect(ctx.taskState.onboardingStep).toBe('first_words');
  });

  it('全部完成 → step 为 null、onboardingActive 假', () => {
    getCurrentRouteName.mockReturnValue('AgentChat');
    getState.mockReturnValue({
      completed: {
        birth: true,
        first_words: true,
        connect_desktop: true,
        settle_aeon: true,
      },
      terminated: true,
    });

    const ctx = buildCompanionChatContext();
    expect(ctx.taskState.onboardingStep).toBeNull();
    expect(ctx.taskState.onboardingActive).toBe(false);
  });

  it('路由未就绪(null)+ store 读取抛错 → 降级安全默认值,不抛错', () => {
    getCurrentRouteName.mockReturnValue(null);
    getState.mockImplementation(() => {
      throw new Error('store not ready');
    });

    const ctx = buildCompanionChatContext();
    expect(ctx.scene).toBeNull();
    expect(ctx.route).toBeNull();
    expect(ctx.taskState).toEqual({
      onboardingActive: false,
      onboardingStep: null,
      onboardingTerminated: false,
    });
  });
});

describe('withCompanionContext', () => {
  beforeEach(() => {
    getCurrentRouteName.mockReturnValue('WorldHub');
    getState.mockReturnValue({ completed: { ...ALL_FALSE }, terminated: false });
  });

  it('附加 companion 字段同时保留既有 context(如 sessionId)', () => {
    const merged = withCompanionContext({ sessionId: 's-1', enableComputerUse: true });

    expect(merged.sessionId).toBe('s-1');
    expect(merged.enableComputerUse).toBe(true);
    expect(merged.device).toBe('mobile');
    expect(merged.scene).toBe('WorldHub');
    expect(merged.taskState.onboardingStep).toBe('birth');
  });

  it('既有 context 缺省时也能工作', () => {
    const merged = withCompanionContext(undefined, 'mobile');
    expect(merged.device).toBe('mobile');
    expect(merged.scene).toBe('WorldHub');
  });
});
