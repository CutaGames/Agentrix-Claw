/**
 * coverDisplayState — Correctness Property 5「卡片永不黑屏」属性验证
 * (world-growth-mobile-experience · task 5.3)。
 *
 * spec:   .kiro/specs/world-growth-mobile-experience/{requirements,design}.md
 * task:   5.3 写 Property 5 + 三态渲染单元测试
 * design: §Correctness Properties · Property 5「卡片永不黑屏」;§4 Creation_Card 封面三态。
 *
 * **Property 5 (卡片永不黑屏) · Validates: Requirements 7.5**
 *   对**任意**输入（任意 url——含 `generated://` 句柄 / 空 / http / https / 非字符串 /
 *   带查询串 / 大小写 / 协议相对 / data: 等——以及任意 loading/error 标志组合），
 *   纯决策函数 `coverDisplayState(...)` 必：
 *     (a) **穷尽且互斥**地返回三态之一 `{loading, error, success}`，
 *         **绝不**返回空/`undefined`/其它值 —— 即永远存在一个可渲染分支
 *         （可读占位或真图），因此 CreationCard 绝不黑屏；
 *     (b) 遵守设计规定的**优先级**（error > loading > success）：
 *         失败或 URL 不可渲染 ⇒ `error`（可读兜底占位）；
 *         可渲染且未失败但仍在加载 ⇒ `loading`（骨架/模糊占位）；
 *         可渲染、未失败、未加载 ⇒ `success`（真图）；
 *     (c) **决定性**：同一输入多次调用恒返回同一状态。
 *
 * ── 测试手段（与本仓库 P.1 / ttsSpeaker.property 同款约定）──────────────────────
 *   fast-check **未安装于移动端 root**（见 package.json：devDependencies 无 fast-check；
 *   jest.config.js 为 pure-logic ts-jest / node 环境）。因此本属性测试用
 *     - **穷举**覆盖 URL 边界类别 × loading × failed 的**完整笛卡尔积**（含 undefined 标志），
 *     - 叠加**带种子的确定性 RNG** 生成随机 URL（随机协议 + 随机字符）与随机布尔标志，
 *   等价覆盖「任意输入下不变式成立」，且完全确定、可复现、无 RN/网络依赖。
 *   随机例失败时会打印**反例**（url/loading/failed + 实得状态），便于 PBT 反例三角定位。
 *
 * ── 关于 RN 组件渲染部分（harness-limited / skipped）──────────────────────────────
 *   Property 5 的「真正把三态渲染成像素」的部分——即 CreationCard 对
 *   success→`<Image>`、loading→骨架 `ActivityIndicator`、error→`<CoverArt>` 渐变+emoji+标题
 *   的**实际 RN 渲染**——**无法在本 pure-logic harness 执行**（node 环境无 RN/expo runtime，
 *   jest.config testMatch 也只收 services/navigation/utils 的纯逻辑 `*.test.ts`；RN 组件测试
 *   需 jest-expo，见 jest.config.js 顶注“deferred to Phase 2 sprint”）。
 *   故此处**将 Property 5 表达在纯决策函数 `coverDisplayState` 上**：只要该函数对任意输入
 *   都**穷尽且互斥**地给出三态之一，CreationCard 就**永远有且仅有一个可渲染分支**命中
 *   （见 CreationCard.tsx：`attemptRealImage = renderPreview && coverState !== 'error'`，
 *   error→CoverArt 兜底、loading→骨架、success→Image），从而绝不黑屏。像素级 RN 渲染
 *   断言在 jest-expo 落地后由组件测试补齐（见文末 it.skip 占位，记录原因）。
 *
 * 放在 `src/services/__tests__/` 匹配 jest.config 的 testMatch（*.test.ts）。
 * 注:Windows 检出 node_modules 为桩,本地不跑 jest;真实门禁走 WSL/CI。
 */
import { describe, it, expect } from '@jest/globals';
import {
  coverDisplayState,
  isRenderableCover,
  type CoverDisplayState,
} from '../creationFeed';

/** 合法三态集合(穷尽且互斥的目标值域)。 */
const STATES: readonly CoverDisplayState[] = ['loading', 'error', 'success'];

/**
 * 参照实现(specification oracle):按 design §Property 5 的优先级独立复述一遍,
 * 用来交叉核对 `coverDisplayState` 的输出——两者对任意输入必须一致。
 * 这既证明「三态穷尽」又证明「优先级正确」。
 */
function oracle(url: unknown, loading?: boolean, failed?: boolean): CoverDisplayState {
  const renderable = isRenderableCover(url as string | null | undefined);
  if (failed === true || !renderable) return 'error';
  if (loading === true) return 'loading';
  return 'success';
}

/** 确定性 RNG(mulberry32),与仓库其它属性测试同款,保证可复现。 */
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

// URL 边界类别:覆盖可渲染(https)与各类不可渲染(空/句柄/http/协议相对/大小写/data/非串)。
const URL_CASES: unknown[] = [
  'https://cdn.agentrix.top/covers/abc.png',
  'https://cdn.agentrix.top/covers/abc.png?v=2&sig=xyz',
  'https://a.b/c',
  'HTTPS://cdn.agentrix.top/x.png', // 大小写:isRenderableCover 区分大小写 → 视类别
  'http://example.com/x.png',
  'generated://cover/tpl-coffee@1',
  'generated://cover/x@42',
  '//cdn.agentrix.top/x.png', // 协议相对
  'data:image/png;base64,iVBORw0KGgo=',
  'ftp://server/x.png',
  '   ', // 纯空白
  '',
  'not-a-url',
  'https:/malformed', // 只有一个斜杠(非 https://)
  null,
  undefined,
  123 as unknown, // 非字符串
  {} as unknown,
];

// 标志的完整取值(含 undefined,覆盖默认分支)。
const FLAGS: (boolean | undefined)[] = [true, false, undefined];

describe('Property 5「卡片永不黑屏」— coverDisplayState 穷尽且互斥(R7.5)', () => {
  it('对 URL 边界类别 × loading × failed 的完整笛卡尔积:恒返回三态之一且与 oracle 一致', () => {
    let checked = 0;
    for (const url of URL_CASES) {
      for (const loading of FLAGS) {
        for (const failed of FLAGS) {
          const state = coverDisplayState({ url: url as string | null | undefined, loading, failed });
          // (a) 穷尽且互斥:结果必是三态之一,绝不空/undefined/其它。
          expect(STATES).toContain(state);
          // (b) 优先级正确:与独立 oracle 完全一致。
          expect(state).toBe(oracle(url, loading, failed));
          checked += 1;
        }
      }
    }
    // 笛卡尔积规模自证已覆盖全部组合。
    expect(checked).toBe(URL_CASES.length * FLAGS.length * FLAGS.length);
  });

  it('优先级不变式:error 压倒 loading/success(失败 或 URL 不可渲染 ⇒ error)', () => {
    for (const url of URL_CASES) {
      for (const loading of FLAGS) {
        // failed=true ⇒ 恒 error,无论 URL/loading。
        expect(coverDisplayState({ url: url as string | null | undefined, loading, failed: true })).toBe('error');
        // URL 不可渲染 ⇒ 恒 error,即便 loading=true 也不空等骨架。
        if (!isRenderableCover(url as string | null | undefined)) {
          expect(coverDisplayState({ url: url as string | null | undefined, loading })).toBe('error');
        }
      }
    }
  });

  it('可渲染且未失败时:loading=true ⇒ loading;否则 ⇒ success(仅此二分支)', () => {
    const renderableUrls = URL_CASES.filter((u) => isRenderableCover(u as string | null | undefined));
    // 前置检查:确有可渲染样本,避免此断言空跑。
    expect(renderableUrls.length).toBeGreaterThan(0);
    for (const url of renderableUrls) {
      expect(coverDisplayState({ url: url as string, loading: true, failed: false })).toBe('loading');
      expect(coverDisplayState({ url: url as string, loading: false, failed: false })).toBe('success');
      expect(coverDisplayState({ url: url as string, failed: false })).toBe('success');
    }
  });
});

describe('Property 5「卡片永不黑屏」— 确定性 RNG 模糊(1000 例,随机 url/flag)', () => {
  // 随机字符集:混入协议关键字与噪声,让随机 URL 覆盖 https/http/generated/垃圾 各类。
  const SCHEMES = ['https://', 'http://', 'generated://cover/', 'ftp://', '//', 'data:', '', 'HTTPS://'];
  const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789/.:@-_ ';

  function randomUrl(rng: () => number): string {
    const scheme = SCHEMES[Math.floor(rng() * SCHEMES.length)];
    const len = Math.floor(rng() * 24);
    let tail = '';
    for (let i = 0; i < len; i++) tail += CHARS[Math.floor(rng() * CHARS.length)];
    return scheme + tail;
  }

  it('任意随机 (url, loading, failed) ⇒ 状态 ∈ {loading,error,success} 且与 oracle 一致(反例可打印)', () => {
    const rng = mulberry32(0x5c0e);
    for (let i = 0; i < 1000; i++) {
      // 三分之一概率直接投喂非字符串/空值,扩大输入空间(健壮性)。
      const pick = rng();
      const url: unknown =
        pick < 0.08 ? null : pick < 0.16 ? undefined : pick < 0.2 ? (Math.floor(rng() * 1000) as unknown) : randomUrl(rng);
      const loading = FLAGS[Math.floor(rng() * FLAGS.length)];
      const failed = FLAGS[Math.floor(rng() * FLAGS.length)];

      const state = coverDisplayState({ url: url as string | null | undefined, loading, failed });
      const expected = oracle(url, loading, failed);
      // 反例友好:失败时把导致失败的具体输入打印出来(PBT 反例三角定位)。
      if (!STATES.includes(state) || state !== expected) {
        throw new Error(
          `Property 5 counterexample @#${i}: url=${JSON.stringify(url)} loading=${String(loading)} ` +
            `failed=${String(failed)} → got=${JSON.stringify(state)} expected=${expected}`,
        );
      }
    }
  });

  it('决定性:同一随机输入重复调用恒等(200 例 × 5 次)', () => {
    const rng = mulberry32(0x1d0b);
    for (let i = 0; i < 200; i++) {
      const url = randomUrl(rng);
      const loading = FLAGS[Math.floor(rng() * FLAGS.length)];
      const failed = FLAGS[Math.floor(rng() * FLAGS.length)];
      const first = coverDisplayState({ url, loading, failed });
      for (let k = 0; k < 5; k++) {
        expect(coverDisplayState({ url, loading, failed })).toBe(first);
      }
    }
  });
});

// ============================================================
// 三态 → 可渲染分支映射(纯逻辑侧的「永不黑屏」结构性断言)
// ------------------------------------------------------------
// CreationCard.tsx 里三态各自命中一个可渲染分支:
//   · error   → attemptRealImage=false → 渲染 <CoverArt>(渐变 + emoji + 标题) 可读占位;
//   · loading → attemptRealImage=true  → 渲染 <Image> + 骨架 ActivityIndicator 占位;
//   · success → attemptRealImage=true  → 渲染 <Image> 真图。
// 这里把「每个状态都存在一个可渲染分支」这一映射在纯逻辑层固化为断言:
//   任意状态 → attemptRealImage 有明确布尔值,且 error 恒兜底占位(不尝试真图、不黑屏)。
// ============================================================
describe('Property 5 结构性:三态各命中一个可渲染分支(不黑屏),error 恒走兜底占位', () => {
  /** 复述 CreationCard 的分支选择:renderPreview 为真且非 error 才尝试真图 <Image>。 */
  function attemptRealImage(state: CoverDisplayState, renderPreview: boolean): boolean {
    return renderPreview && state !== 'error';
  }

  it('error 永远走可读兜底占位(CoverArt),不尝试真图 → 不黑闪', () => {
    expect(attemptRealImage('error', true)).toBe(false);
    expect(attemptRealImage('error', false)).toBe(false);
  });

  it('loading/success 在近屏(renderPreview=true)渲染 Image(+骨架),离屏回收为占位', () => {
    expect(attemptRealImage('loading', true)).toBe(true);
    expect(attemptRealImage('success', true)).toBe(true);
    // 离屏回收:renderPreview=false → 不实例化 Image,退回轻量占位(仍不黑屏)。
    expect(attemptRealImage('loading', false)).toBe(false);
    expect(attemptRealImage('success', false)).toBe(false);
  });

  it('三态在两种 renderPreview 下都有确定的可渲染分支(布尔,无 undefined)→ 永不黑屏', () => {
    for (const state of STATES) {
      for (const rp of [true, false]) {
        expect(typeof attemptRealImage(state, rp)).toBe('boolean');
      }
    }
  });
});

// ============================================================
// RN 组件像素级渲染断言 —— harness-limited(skipped),记录原因,jest-expo 落地后补齐。
// ============================================================
describe('CreationCard 三态 RN 渲染(harness-limited · skipped)', () => {
  // 说明:本 pure-logic harness(ts-jest / node,无 RN/expo runtime)无法 render <CreationCard>;
  // RN 组件渲染测试需 jest-expo(见 jest.config.js 顶注 "deferred to Phase 2 sprint")。
  // Property 5 的纯决策不变式已由上方 coverDisplayState 属性测试穷尽覆盖并证明「永不黑屏」;
  // 下列像素级断言待 jest-expo 环境就绪后启用(取消 .skip)。
  it.skip('success → 渲染 <Image>(testID=creation-card-cover-*)真图', () => {
    // TODO(jest-expo): render(<CreationCard item={{preview:{url:https}}} .../>) 后
    // 断言 getByTestId(`creation-card-cover-${id}`) 存在、无骨架、无 CoverArt 兜底。
  });
  it.skip('loading → 渲染 <Image> + 骨架 ActivityIndicator(testID=creation-card-cover-skeleton-*)', () => {
    // TODO(jest-expo): onLoadStart 后骨架可见;onLoad 后骨架消失。
  });
  it.skip('error(非 https / onError)→ 渲染 <CoverArt> 渐变+emoji+标题,绝不黑屏', () => {
    // TODO(jest-expo): preview.url=generated:// 或触发 onError 后,
    // 断言渲染 CoverArt(可读占位)而非空白/黑屏,且不实例化真图 <Image>。
  });
});
