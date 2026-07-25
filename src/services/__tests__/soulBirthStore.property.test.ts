/**
 * soulBirthStore — Correctness Property 1「主线必达」属性验证(P.1)。
 *
 * spec:   .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * task:   P.1 验证主线必达与第一句话纯本地
 * design: Correctness Property 1(主线必达),§2.1 / §2.2
 *
 * **Validates: Requirements 1.5, 3.4, 3.6**
 *
 * Property 1(主线必达):无论 provision / TTS / 定位 / 天气 / presence
 * 任一外部依赖失败,Soul_Birth 主线都不会卡死——`currentStep` 始终能因「真实完成」
 * 或「用户跳过」而推进或终止。
 *
 * 2026-06 产品决策:邮箱/日历 OAuth「连接」(原 first_task 段)已从首跑主线移除,
 * 改为「连接器中心」按需触发。故步骤集由 5 步收敛为 4 步(birth → first_words →
 * connect_desktop → settle_aeon)。本测试不再硬编码步数:状态空间穷举的掩码上限由
 * `SOUL_BIRTH_STEPS.length` 推导(MASK_COUNT = 2^N、FULL_MASK = 2^N − 1),从而对
 * 任意步数都成立、且随步骤增删自动适配。
 *
 * 在 **store 层** 证明状态机始终存在前进路径:
 *   - 从任一可达的 completed-set,反复对 `complete(currentStep)` 施加,必在有限步内
 *     到达终止(currentStep == null 且 terminated == true)。
 *   - `skip()` 从任意状态都立即终止。
 *   - 即便 `recompute` 被喂入「全部外部事实失败(all-false)」,指针仍能解析到某一步,
 *     `complete()` / `skip()` 仍可推进 / 终止;任意 facts 组合都不破坏可终止性。
 *
 * 测试手段:fast-check 未安装于移动端 root(仅 backend 有),因此对有限状态空间做
 * **穷举**(2^N 个 completed-set),并用**带种子的确定性 RNG** 做随机动作序列模糊测试,
 * 等价覆盖「任意输入下不变式成立」。
 *
 * 放在 `src/services/__tests__/` 以匹配 jest.config 的 testMatch;`react-native-mmkv`
 * 经 moduleNameMapper 走内存 mock,store 可在 node 环境直接驱动。
 * 注:Windows 检出 node_modules 为桩,本地不跑 jest;真实门禁走 WSL/CI。
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  useSoulBirthStore,
  currentStep,
  allStepsComplete,
  SOUL_BIRTH_STEPS,
  type OnboardingStep,
  type ExternalFacts,
} from '../../stores/soulBirthStore';

type Completed = Record<OnboardingStep, boolean>;

/** 步骤数驱动的穷举边界:对任意步数都成立(移除 first_task 后 N=4 → 16 个掩码)。 */
const STEP_COUNT = SOUL_BIRTH_STEPS.length;
const MASK_COUNT = 1 << STEP_COUNT; // 2^N
const FULL_MASK = MASK_COUNT - 1; // 全部完成的掩码(全 1)

const ALL_FALSE: Completed = SOUL_BIRTH_STEPS.reduce((acc, step) => {
  acc[step] = false;
  return acc;
}, {} as Completed);

/** 把 0..(2^N-1) 的位掩码映射为一个 completed-set(穷举有限状态空间)。 */
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

/** 重置 store 到干净状态(不经 reset(),避免 replaying=true 的副作用)。 */
function resetStoreTo(completed: Completed): void {
  useSoulBirthStore.setState({
    completed: { ...completed },
    terminated: false,
    replaying: false,
    instanceId: null,
    petName: null,
    avatarId: null,
  });
}

/**
 * 反复对 currentStep 施加 complete(),模拟「每步真实完成」直至终止。
 * 当 currentStep 为 null 时,host 兜底调用 markTerminated()(Design §2.2)。
 * 返回所用迭代次数;若超过 bound 未终止则抛错(防止卡死回归)。
 */
function driveToTermination(bound = SOUL_BIRTH_STEPS.length + 1): number {
  let iters = 0;
  while (iters <= bound) {
    const step = currentStep(useSoulBirthStore.getState().completed);
    if (step === null) {
      useSoulBirthStore.getState().markTerminated();
      return iters;
    }
    useSoulBirthStore.getState().complete(step);
    iters += 1;
  }
  throw new Error('main line failed to terminate within bound — possible deadlock');
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

describe('纯函数:指针总能解析(Property 1 基石)', () => {
  it('currentStep 永远返回固定顺序中第一个未完成的步骤;全 true 返回 null', () => {
    for (let mask = 0; mask < MASK_COUNT; mask++) {
      const c = subsetFromMask(mask);
      const step = currentStep(c);
      const firstFalse = SOUL_BIRTH_STEPS.find((s) => !c[s]) ?? null;
      expect(step).toBe(firstFalse);
      // 解析结果要么是一个真实步骤(可推进),要么是 null(可终止)——绝不卡在中间。
      if (step !== null) {
        expect(c[step]).toBe(false);
        expect(SOUL_BIRTH_STEPS).toContain(step);
      } else {
        expect(allStepsComplete(c)).toBe(true);
      }
    }
  });

  it('allStepsComplete 当且仅当全部为真', () => {
    for (let mask = 0; mask < MASK_COUNT; mask++) {
      const c = subsetFromMask(mask);
      expect(allStepsComplete(c)).toBe(mask === FULL_MASK);
    }
  });
});

describe('Property 1:complete(currentStep) 从任一状态都能终止', () => {
  it('穷举全部 2^N 个起始 completed-set:有限步内到达终止', () => {
    for (let mask = 0; mask < MASK_COUNT; mask++) {
      const start = subsetFromMask(mask);
      resetStoreTo(start);

      const remaining = SOUL_BIRTH_STEPS.length - countTrue(start);
      const iters = driveToTermination();

      // 每个未完成步骤恰好被推进一次(单调前进,无空转)。
      expect(iters).toBe(remaining);
      const after = useSoulBirthStore.getState();
      expect(currentStep(after.completed)).toBeNull();
      expect(allStepsComplete(after.completed)).toBe(true);
      expect(after.terminated).toBe(true);
    }
  });

  it('每次 complete(currentStep) 严格多完成一步(保证有限步终止)', () => {
    resetStoreTo(ALL_FALSE);
    let prev = countTrue(useSoulBirthStore.getState().completed);
    while (currentStep(useSoulBirthStore.getState().completed) !== null) {
      const step = currentStep(useSoulBirthStore.getState().completed)!;
      useSoulBirthStore.getState().complete(step);
      const now = countTrue(useSoulBirthStore.getState().completed);
      expect(now).toBe(prev + 1);
      prev = now;
    }
    expect(useSoulBirthStore.getState().terminated).toBe(true);
  });
});

describe('Property 1:skip() 从任一状态都立即终止', () => {
  it('穷举全部 2^N 个起始 completed-set:skip 后 terminated 为真', () => {
    for (let mask = 0; mask < MASK_COUNT; mask++) {
      resetStoreTo(subsetFromMask(mask));
      useSoulBirthStore.getState().skip();
      expect(useSoulBirthStore.getState().terminated).toBe(true);
      // 用户跳过结束主线,replaying 同步清零。
      expect(useSoulBirthStore.getState().replaying).toBe(false);
    }
  });
});

describe('Property 1:外部依赖失败(recompute all-false)不卡主线', () => {
  it('全部外部事实失败 → 不回填、不抛错,指针仍可解析且仍能驱动至终止', () => {
    const allFailed: ExternalFacts = {
      hasInstance: false,
      desktopPairedBefore: false,
      hasClaimedPlot: false,
    };
    for (let mask = 0; mask < MASK_COUNT; mask++) {
      const start = subsetFromMask(mask);
      resetStoreTo(start);

      expect(() => useSoulBirthStore.getState().recompute(allFailed)).not.toThrow();
      // all-false:不应把任何步骤置真(完全不回填)。
      expect(useSoulBirthStore.getState().completed).toEqual(start);

      // 指针仍解析,complete 仍能终止。
      const step = currentStep(useSoulBirthStore.getState().completed);
      if (step === null) {
        expect(allStepsComplete(start)).toBe(true);
      } else {
        expect(start[step]).toBe(false);
      }
      driveToTermination();
      expect(useSoulBirthStore.getState().terminated).toBe(true);
    }
  });

  it('任意 facts 组合下 recompute 后仍可终止(穷举 2^N × 8)', () => {
    for (let mask = 0; mask < MASK_COUNT; mask++) {
      for (let f = 0; f < 8; f++) {
        const facts: ExternalFacts = {
          hasInstance: (f & 1) !== 0,
          desktopPairedBefore: (f & 2) !== 0,
          hasClaimedPlot: (f & 4) !== 0,
        };
        resetStoreTo(subsetFromMask(mask));
        useSoulBirthStore.getState().recompute(facts);
        // recompute 单调:只置真不置假。
        const c = useSoulBirthStore.getState().completed;
        const start = subsetFromMask(mask);
        SOUL_BIRTH_STEPS.forEach((s) => {
          if (start[s]) expect(c[s]).toBe(true);
        });
        driveToTermination();
        expect(useSoulBirthStore.getState().terminated).toBe(true);
      }
    }
  });
});

describe('Property 1:随机动作序列模糊测试(确定性种子)', () => {
  const SEEDS = [1, 42, 1337];

  it('交错 complete / recompute(随机 facts)后,主线始终可驱动至终止', () => {
    for (const seed of SEEDS) {
      const rng = mulberry32(seed);
      // 随机起始 completed-set。
      resetStoreTo(subsetFromMask(Math.floor(rng() * MASK_COUNT)));

      const ops = 12 + Math.floor(rng() * 12);
      for (let k = 0; k < ops; k++) {
        if (rng() < 0.5) {
          // 真实完成:对当前指针推进(若已终止则对随机步骤幂等 complete)。
          const step =
            currentStep(useSoulBirthStore.getState().completed) ??
            SOUL_BIRTH_STEPS[Math.floor(rng() * SOUL_BIRTH_STEPS.length)];
          useSoulBirthStore.getState().complete(step);
        } else {
          // 外部事实回填(可能全失败,也可能部分成功)。
          useSoulBirthStore.getState().recompute({
            hasInstance: rng() < 0.5,
            desktopPairedBefore: rng() < 0.5,
            hasClaimedPlot: rng() < 0.5,
          });
        }
        // 任意中间态:指针要么可推进要么为 null(可终止),绝不卡死。
        const step = currentStep(useSoulBirthStore.getState().completed);
        if (step !== null) {
          expect(useSoulBirthStore.getState().completed[step]).toBe(false);
        }
      }

      // 收尾:必能在有限步内终止。
      driveToTermination();
      expect(useSoulBirthStore.getState().terminated).toBe(true);
    }
  });

  it('随机插入 skip:无论何时跳过都立即终止', () => {
    for (const seed of SEEDS) {
      const rng = mulberry32(seed ^ 0x5a5a5a5a);
      resetStoreTo(subsetFromMask(Math.floor(rng() * MASK_COUNT)));

      const stepsBeforeSkip = Math.floor(rng() * SOUL_BIRTH_STEPS.length);
      for (let k = 0; k < stepsBeforeSkip; k++) {
        const step = currentStep(useSoulBirthStore.getState().completed);
        if (step === null) break;
        useSoulBirthStore.getState().complete(step);
      }
      useSoulBirthStore.getState().skip();
      expect(useSoulBirthStore.getState().terminated).toBe(true);
    }
  });
});
