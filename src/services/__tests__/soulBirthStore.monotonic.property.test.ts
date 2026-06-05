/**
 * soulBirthStore — Correctness Properties 3 / 4 / 5 属性验证(P.2)。
 *
 * spec:   .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * task:   P.2 验证步骤单调推进 + 指针解析 + skip-earlier
 * design: Correctness Properties 3(步骤单调推进)/ 4(指针=第一个未完成)/ 5(较后已达成则跳过较早)
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.6, 1.7**
 *
 * 三条不变式:
 *   - Property 3(步骤单调推进):`completed[step]` 一旦为真,同一生命周期内不会被
 *     自动置假;`complete()` 幂等(对已完成步骤再调用不改变状态、不回退);
 *     `recompute()` 单调(只置真、绝不置假);**只有** `reset()` 能整体清空。
 *     **Validates: Requirements 1.3, 1.7**
 *   - Property 4(指针=第一个未完成):`currentStep` 永远返回固定顺序中第一个 false
 *     的步骤;全 true 时返回 null 并触发 `terminated`。
 *     **Validates: Requirements 1.1, 1.2, 1.6**
 *   - Property 5(较后已达成则跳过较早):经 `recompute` 用外部事实回填后,已达成的
 *     步骤为 true,指针「取第一个未完成」即自动跳过较早但已达成的步骤;并覆盖
 *     续跑(从部分完成集恢复到第一个未完成)与 `reset()`(回到 birth + 置 replaying,
 *     抑制回填使重看从 birth 重启)。
 *     **Validates: Requirements 1.2, 1.4**
 *
 * 测试手段:fast-check 未安装于移动端 root(仅 backend 有),因此对 5 步的**有限**
 * 状态空间做**穷举**(2^5 = 32 个 completed-set;facts 组合 2^3 = 8),并辅以**带种子
 * 的确定性 RNG** 做**小规模**随机动作序列模糊测试(≤3 种子、≤15 次/种子),等价覆盖
 * 「任意输入下不变式成立」而保持套件快速。
 *
 * 放在 `src/services/__tests__/` 以匹配 jest.config 的 testMatch;`react-native-mmkv`
 * 经 moduleNameMapper 走内存 mock,store 可在 node 环境直接驱动。
 * 注:Windows 检出 node_modules 为桩,本地不跑 jest;真实门禁走 WSL/CI。
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  useSoulBirthStore,
  currentStep,
  allStepsComplete,
  SOUL_BIRTH_STEPS,
  type OnboardingStep,
  type ExternalFacts,
} from '../../stores/soulBirthStore';

type Completed = Record<OnboardingStep, boolean>;

const ALL_FALSE: Completed = {
  birth: false,
  first_words: false,
  first_task: false,
  connect_desktop: false,
  settle_aeon: false,
};

/** 把 0..31 的位掩码映射为一个 completed-set(穷举有限状态空间)。 */
function subsetFromMask(mask: number): Completed {
  const out = { ...ALL_FALSE };
  SOUL_BIRTH_STEPS.forEach((step, i) => {
    out[step] = (mask & (1 << i)) !== 0;
  });
  return out;
}

function countTrue(c: Completed): number {
  return SOUL_BIRTH_STEPS.reduce((n, s) => n + (c[s] ? 1 : 0), 0);
}

function factsFromBits(f: number): ExternalFacts {
  return {
    hasInstance: (f & 1) !== 0,
    desktopPairedBefore: (f & 2) !== 0,
    hasClaimedPlot: (f & 4) !== 0,
  };
}

/** recompute 的回填映射(测试侧的"应然"参照):事实 → 较后步骤置真,且只置真。 */
function expectedAfterBackfill(start: Completed, facts: ExternalFacts): Completed {
  const out = { ...start };
  if (facts.hasInstance) out.birth = true;
  if (facts.desktopPairedBefore) out.connect_desktop = true;
  if (facts.hasClaimedPlot) out.settle_aeon = true;
  return out;
}

/** 重置 store 到干净状态(不经 reset(),避免 replaying=true 的副作用)。 */
function resetStoreTo(completed: Completed, replaying = false): void {
  useSoulBirthStore.setState({
    completed: { ...completed },
    terminated: false,
    replaying,
    instanceId: null,
    petName: null,
    avatarId: null,
  });
}

/** 确定性 RNG(mulberry32):无外部依赖,可复现的「属性测试」种子流。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

beforeEach(() => {
  resetStoreTo(ALL_FALSE);
});

// ──────────────────────────────────────────────────────────────────────────
// Property 3:步骤单调推进(Validates: Requirements 1.3, 1.7)
// ──────────────────────────────────────────────────────────────────────────
describe('Property 3:complete() 幂等且单调,只置真不回退', () => {
  it('穷举 32×5:complete(step) 仅把目标步骤置真,其余位不变,已为真的位绝不回退', () => {
    for (let mask = 0; mask < 32; mask++) {
      for (const step of SOUL_BIRTH_STEPS) {
        const start = subsetFromMask(mask);
        resetStoreTo(start);
        useSoulBirthStore.getState().complete(step);
        const after = useSoulBirthStore.getState().completed;

        SOUL_BIRTH_STEPS.forEach((s) => {
          if (s === step) {
            expect(after[s]).toBe(true); // 目标步骤置真
          } else {
            expect(after[s]).toBe(start[s]); // 其余位原样保留
          }
          // 单调:任何原本为真的位都不会被置假。
          if (start[s]) expect(after[s]).toBe(true);
        });
      }
    }
  });

  it('幂等:对已完成步骤再次 complete 不改变 completed(且引用稳定)', () => {
    for (const step of SOUL_BIRTH_STEPS) {
      // 起始让该步骤已完成。
      const start = { ...ALL_FALSE, [step]: true };
      resetStoreTo(start);
      const before = useSoulBirthStore.getState().completed;
      useSoulBirthStore.getState().complete(step);
      const after = useSoulBirthStore.getState().completed;
      expect(after).toEqual(before);
      // 幂等无变化时保持引用稳定(实现上 return s)。
      expect(after).toBe(before);
    }
  });

  it('重复多次 complete 同一步骤:完成计数只增长一次', () => {
    resetStoreTo(ALL_FALSE);
    useSoulBirthStore.getState().complete('first_task');
    const once = countTrue(useSoulBirthStore.getState().completed);
    useSoulBirthStore.getState().complete('first_task');
    useSoulBirthStore.getState().complete('first_task');
    const thrice = countTrue(useSoulBirthStore.getState().completed);
    expect(once).toBe(1);
    expect(thrice).toBe(1);
  });
});

describe('Property 3:recompute() 单调回填,只置真不置假', () => {
  it('穷举 32×8:recompute 后任何原本为真的步骤仍为真(永不回退)', () => {
    for (let mask = 0; mask < 32; mask++) {
      for (let f = 0; f < 8; f++) {
        const start = subsetFromMask(mask);
        resetStoreTo(start);
        useSoulBirthStore.getState().recompute(factsFromBits(f));
        const after = useSoulBirthStore.getState().completed;
        SOUL_BIRTH_STEPS.forEach((s) => {
          if (start[s]) expect(after[s]).toBe(true); // 不回退
        });
        // 与"应然"回填一致(只置真,且恰好按 facts 映射)。
        expect(after).toEqual(expectedAfterBackfill(start, factsFromBits(f)));
      }
    }
  });
});

describe('Property 3:只有 reset() 能整体清空(其它动作不清除已完成位)', () => {
  it('skip / markTerminated / recompute(all-false) / setBirth 均不清空已完成步骤', () => {
    const start = subsetFromMask(0b10101); // birth, first_task, settle_aeon = true
    const allFalseFacts: ExternalFacts = {
      hasInstance: false,
      desktopPairedBefore: false,
      hasClaimedPlot: false,
    };

    resetStoreTo(start);
    useSoulBirthStore.getState().skip();
    expect(useSoulBirthStore.getState().completed).toEqual(start);

    resetStoreTo(start);
    useSoulBirthStore.getState().markTerminated();
    expect(useSoulBirthStore.getState().completed).toEqual(start);

    resetStoreTo(start);
    useSoulBirthStore.getState().recompute(allFalseFacts);
    expect(useSoulBirthStore.getState().completed).toEqual(start);

    resetStoreTo(start);
    useSoulBirthStore.getState().setBirth({ petName: '灵狐', avatarId: 'clanA' });
    expect(useSoulBirthStore.getState().completed).toEqual(start);
  });

  it('穷举 32:reset() 把任意 completed-set 整体清空为全 false', () => {
    for (let mask = 0; mask < 32; mask++) {
      resetStoreTo(subsetFromMask(mask));
      useSoulBirthStore.getState().reset();
      expect(useSoulBirthStore.getState().completed).toEqual(ALL_FALSE);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Property 4:指针 = 第一个未完成(Validates: Requirements 1.1, 1.2, 1.6)
// ──────────────────────────────────────────────────────────────────────────
describe('Property 4:currentStep 返回固定顺序第一个未完成,全 true 返回 null', () => {
  it('穷举 32:currentStep === 固定顺序中第一个 false;全 true → null', () => {
    for (let mask = 0; mask < 32; mask++) {
      const c = subsetFromMask(mask);
      const expected = SOUL_BIRTH_STEPS.find((s) => !c[s]) ?? null;
      expect(currentStep(c)).toBe(expected);
      if (mask === 31) {
        expect(currentStep(c)).toBeNull();
        expect(allStepsComplete(c)).toBe(true);
      }
    }
  });

  it('指针在 store 上与纯函数一致(穷举 32)', () => {
    for (let mask = 0; mask < 32; mask++) {
      const c = subsetFromMask(mask);
      resetStoreTo(c);
      expect(currentStep(useSoulBirthStore.getState().completed)).toBe(currentStep(c));
    }
  });

  it('complete 推进到全 true 时:currentStep 为 null 且自动 terminated(R1.6)', () => {
    // 仅差最后一步 settle_aeon。
    resetStoreTo(subsetFromMask(0b01111));
    expect(currentStep(useSoulBirthStore.getState().completed)).toBe('settle_aeon');
    useSoulBirthStore.getState().complete('settle_aeon');
    const after = useSoulBirthStore.getState();
    expect(currentStep(after.completed)).toBeNull();
    expect(allStepsComplete(after.completed)).toBe(true);
    expect(after.terminated).toBe(true); // 全部完成自动终止
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Property 5:较后已达成则跳过较早 + 续跑 + reset(Validates: Requirements 1.2, 1.4)
// ──────────────────────────────────────────────────────────────────────────
describe('Property 5:recompute 回填后,指针跳过较早但已达成的步骤', () => {
  it('hasInstance → birth 回填:指针跳过 birth 落到 first_words', () => {
    resetStoreTo(ALL_FALSE);
    useSoulBirthStore.getState().recompute({
      hasInstance: true,
      desktopPairedBefore: false,
      hasClaimedPlot: false,
    });
    expect(useSoulBirthStore.getState().completed.birth).toBe(true);
    expect(currentStep(useSoulBirthStore.getState().completed)).toBe('first_words');
  });

  it('desktopPairedBefore → connect_desktop 回填:推进时跳过 connect_desktop', () => {
    resetStoreTo(ALL_FALSE);
    useSoulBirthStore.getState().recompute({
      hasInstance: false,
      desktopPairedBefore: true,
      hasClaimedPlot: false,
    });
    // 第一个未完成仍是 birth(connect_desktop 在更后)。
    expect(currentStep(useSoulBirthStore.getState().completed)).toBe('birth');
    // 真实完成 birth/first_words/first_task 后,指针跳过已回填的 connect_desktop。
    ['birth', 'first_words', 'first_task'].forEach((s) =>
      useSoulBirthStore.getState().complete(s as OnboardingStep),
    );
    expect(currentStep(useSoulBirthStore.getState().completed)).toBe('settle_aeon');
  });

  it('三事实全真:仅剩 first_words/first_task 需走,2 步后终止', () => {
    resetStoreTo(ALL_FALSE);
    useSoulBirthStore.getState().recompute({
      hasInstance: true,
      desktopPairedBefore: true,
      hasClaimedPlot: true,
    });
    const c = useSoulBirthStore.getState().completed;
    expect(c.birth).toBe(true);
    expect(c.connect_desktop).toBe(true);
    expect(c.settle_aeon).toBe(true);
    // 指针跳过较早已达成的 birth,落到 first_words。
    expect(currentStep(c)).toBe('first_words');
    useSoulBirthStore.getState().complete('first_words');
    expect(currentStep(useSoulBirthStore.getState().completed)).toBe('first_task');
    useSoulBirthStore.getState().complete('first_task');
    expect(currentStep(useSoulBirthStore.getState().completed)).toBeNull();
    expect(useSoulBirthStore.getState().terminated).toBe(true);
  });

  it('穷举 8 种 facts(从全空起):指针 = 回填后第一个未完成', () => {
    for (let f = 0; f < 8; f++) {
      resetStoreTo(ALL_FALSE);
      useSoulBirthStore.getState().recompute(factsFromBits(f));
      const expected = expectedAfterBackfill(ALL_FALSE, factsFromBits(f));
      const expectedStep = SOUL_BIRTH_STEPS.find((s) => !expected[s]) ?? null;
      expect(currentStep(useSoulBirthStore.getState().completed)).toBe(expectedStep);
    }
  });
});

describe('Property 5:续跑(resume)— 从部分完成集恢复到第一个未完成', () => {
  it('穷举 32:重进后 currentStep 恢复到固定顺序第一个未完成(R1.4)', () => {
    for (let mask = 0; mask < 32; mask++) {
      const persisted = subsetFromMask(mask);
      // 模拟「杀进程后重进」:store 以持久化的 completed 重新水合。
      resetStoreTo(persisted);
      const resumed = currentStep(useSoulBirthStore.getState().completed);
      const expected = SOUL_BIRTH_STEPS.find((s) => !persisted[s]) ?? null;
      expect(resumed).toBe(expected);
    }
  });

  it('典型续跑:已完成 birth+first_words → 从 first_task 续跑', () => {
    resetStoreTo({ ...ALL_FALSE, birth: true, first_words: true });
    expect(currentStep(useSoulBirthStore.getState().completed)).toBe('first_task');
  });
});

describe('Property 5:reset() 回到 birth 并置 replaying,抑制 recompute 回填(R1.7)', () => {
  it('reset 后:全清空、未终止、replaying=true、currentStep=birth', () => {
    // 起始为一个"已大半完成"的状态。
    resetStoreTo(subsetFromMask(0b00111));
    useSoulBirthStore.getState().reset();
    const s = useSoulBirthStore.getState();
    expect(s.completed).toEqual(ALL_FALSE);
    expect(s.terminated).toBe(false);
    expect(s.replaying).toBe(true);
    expect(currentStep(s.completed)).toBe('birth');
  });

  it('重放期间 recompute 被抑制:即便 hasInstance 也不回填 birth,重看仍从 birth 起', () => {
    useSoulBirthStore.getState().reset();
    expect(useSoulBirthStore.getState().replaying).toBe(true);
    // 用户仍持有已孵化实例 + 已配对 + 已圈地,但重放期间一律不回填。
    useSoulBirthStore.getState().recompute({
      hasInstance: true,
      desktopPairedBefore: true,
      hasClaimedPlot: true,
    });
    expect(useSoulBirthStore.getState().completed).toEqual(ALL_FALSE);
    expect(currentStep(useSoulBirthStore.getState().completed)).toBe('birth');
  });

  it('终止动作清除 replaying,使下次首跑/续跑恢复回填', () => {
    // reset 进入重放态。
    useSoulBirthStore.getState().reset();
    expect(useSoulBirthStore.getState().replaying).toBe(true);
    // 走完整条主线 → 全 true 触发自动终止,replaying 清零。
    for (const step of SOUL_BIRTH_STEPS) {
      useSoulBirthStore.getState().complete(step);
    }
    expect(useSoulBirthStore.getState().terminated).toBe(true);
    expect(useSoulBirthStore.getState().replaying).toBe(false);

    // 终止清零后,recompute 恢复正常回填能力。
    resetStoreTo(ALL_FALSE, false);
    useSoulBirthStore.getState().recompute({
      hasInstance: true,
      desktopPairedBefore: false,
      hasClaimedPlot: false,
    });
    expect(useSoulBirthStore.getState().completed.birth).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 小规模确定性模糊测试:交错动作下三条不变式联合成立(≤3 种子、≤15 次/种子)
// ──────────────────────────────────────────────────────────────────────────
describe('随机动作序列模糊测试(确定性种子,小规模)', () => {
  const SEEDS = [7, 91, 2024];

  it('交错 complete/recompute 下:已完成位永不回退(Property 3),指针恒等于第一个未完成(Property 4)', () => {
    for (const seed of SEEDS) {
      const rng = mulberry32(seed);
      resetStoreTo(subsetFromMask(Math.floor(rng() * 32)));

      const ops = 10 + Math.floor(rng() * 5); // 10..14 次,保持快速
      for (let k = 0; k < ops; k++) {
        const prev = { ...useSoulBirthStore.getState().completed };
        if (rng() < 0.5) {
          const step = SOUL_BIRTH_STEPS[Math.floor(rng() * SOUL_BIRTH_STEPS.length)];
          useSoulBirthStore.getState().complete(step);
        } else {
          useSoulBirthStore.getState().recompute(factsFromBits(Math.floor(rng() * 8)));
        }
        const now = useSoulBirthStore.getState().completed;
        // Property 3:单调,任何原本为真的位仍为真。
        SOUL_BIRTH_STEPS.forEach((s) => {
          if (prev[s]) expect(now[s]).toBe(true);
        });
        // Property 4:指针恒等于固定顺序第一个未完成。
        const expected = SOUL_BIRTH_STEPS.find((s) => !now[s]) ?? null;
        expect(currentStep(now)).toBe(expected);
      }
    }
  });
});
