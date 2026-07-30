/**
 * creationEnterFlow 纯逻辑单测 —— Feed → Detail → Enter 导航与降级
 * (world-growth-mobile-experience · task 6.4)。
 *
 * spec: .kiro/specs/world-growth-mobile-experience/{requirements,design}.md
 *   - R4.1 Feed 点进 → Creation_Detail（透传 item/title）。
 *   - R4.2 Detail「进入」→ Creation_Experience（透传 type/title/item）。
 *   - R4.4 enterCreation 失败/超时 → 可读错误 + **重试**入口，绝不停留空白。
 *   - R4.5 无可进入体验内容 → 降级为可预览详情视图，**不黑屏**。
 *
 * 覆盖范围（本 harness = node 纯逻辑；见文件尾「Harness 限制」）：
 *   ① 导航跳转决策（目标屏 + 参数透传无损）；
 *   ② enter 失败/超时 → 可重试 error 分支 + 重试计数递增；
 *   ③ 无体验内容 → 降级判定；
 *   ④ 「永不黑屏」不变量：任意进入结果都落在 {loading,error,experience} 且 error 有出口。
 *
 * ⚠️ 无 fast-check 依赖（root 移动端未安装），故属性以**穷尽/不变量循环**表达。
 */
import {
  navFeedToDetail,
  navDetailToExperience,
  navExperienceToDetail,
  decideEnterState,
  nextRetryTick,
  hasEnterableContent,
  shouldDegradeToDetail,
  experienceRenderBranch,
  enterErrorActions,
  ENTER_ERROR_ACTIONS,
  type EnterSettleInput,
  type EnterDecision,
} from '../creationEnterFlow';
import type { CreationDiscoveryItem } from '../../../shared/types/creation';
import type { EnterCreationResponse } from '../../../shared/types/creation-api';

function item(over: Partial<CreationDiscoveryItem> = {}): CreationDiscoveryItem {
  return {
    id: 'c-shop-1',
    type: 'shop',
    title: '手冲咖啡小店',
    preview: { kind: 'cover', url: 'https://cdn.agentrix.top/covers/coffee.png' },
    creator: { accountId: 'owner-1', name: '豆豆' },
    metrics: { views: 0, likes: 0, sales: 0, comments: 0 },
    canEnter: true,
    ...over,
  };
}

function session(over: Partial<EnterCreationResponse> = {}): EnterCreationResponse {
  return {
    sessionId: 's-1',
    ecsWorld: { ecsVersion: '1.0', entities: [] } as any,
    isolationLevel: 'shared' as any,
    readonlyAssetHandles: [],
    offerings: [],
    ...over,
  };
}

// ============================================================
// ① 导航跳转决策（R4.1 / R4.2 / R4.5）
// ============================================================

describe('navFeedToDetail — Feed 卡片点击 → Creation_Detail（R4.1）', () => {
  it('目标为 CreationDetail，并透传 creationId/title/item（不丢参数、免二次请求）', () => {
    const it0 = item();
    const intent = navFeedToDetail(it0);
    expect(intent.screen).toBe('CreationDetail');
    expect(intent.params.creationId).toBe('c-shop-1');
    expect(intent.params.title).toBe('手冲咖啡小店');
    expect(intent.params.item).toBe(it0); // 同一引用透传，发现投影项无损
  });
});

describe('navDetailToExperience — Detail「进入」→ Creation_Experience（R4.2）', () => {
  it('目标为 CreationExperience，透传 type/title/item', () => {
    const it0 = item({ type: 'place', title: '午夜书店' });
    const intent = navDetailToExperience('c-place-1', '午夜书店', it0);
    expect(intent.screen).toBe('CreationExperience');
    expect(intent.params).toEqual({
      creationId: 'c-place-1',
      type: 'place',
      title: '午夜书店',
      item: it0,
    });
  });

  it('无 item 时优雅降级：type 为 undefined，仍带 creationId/title', () => {
    const intent = navDetailToExperience('c-x', '某创作', undefined);
    expect(intent.screen).toBe('CreationExperience');
    if (intent.screen !== 'CreationExperience') throw new Error('unexpected screen');
    expect(intent.params.creationId).toBe('c-x');
    expect(intent.params.title).toBe('某创作');
    expect(intent.params.type).toBeUndefined();
    expect(intent.params.item).toBeUndefined();
  });
});

describe('navExperienceToDetail — 进入失败/无内容 → 降级回 Creation_Detail（R4.4/R4.5）', () => {
  it('目标为 CreationDetail，透传 creationId/title/item（降级不丢参数、不黑屏）', () => {
    const it0 = item();
    const intent = navExperienceToDetail('c-shop-1', '手冲咖啡小店', it0);
    expect(intent.screen).toBe('CreationDetail');
    expect(intent.params).toEqual({
      creationId: 'c-shop-1',
      title: '手冲咖啡小店',
      item: it0,
    });
  });
});

// ============================================================
// ② enter 失败 / 超时 → 可重试 error 分支（R4.2 成功 / R4.4 失败重试）
// ============================================================

describe('decideEnterState — 进入结果分支判定（R4.2/R4.4）', () => {
  it('resolved 且无 error → experience（成功打开体验，不可重试）', () => {
    const d = decideEnterState({ kind: 'resolved', response: session() });
    expect(d.branch).toBe('experience');
    expect(d.reasonCode).toBeNull();
    expect(d.retryable).toBe(false);
  });

  it('resolved 且带 error → error，携带服务端可读 detail', () => {
    const d = decideEnterState({
      kind: 'resolved',
      response: { error: { code: 'ENTER_FAILED', detail: '世界暂不可进入' } as any },
    });
    expect(d.branch).toBe('error');
    expect(d.reasonCode).toBe('entry-error');
    expect(d.detail).toBe('世界暂不可进入');
    expect(d.retryable).toBe(true);
  });

  it('timeout（LOAD_TIMEOUT）→ 可重试 error', () => {
    const d = decideEnterState({ kind: 'timeout' });
    expect(d.branch).toBe('error');
    expect(d.reasonCode).toBe('timeout');
    expect(d.retryable).toBe(true);
  });

  it('threw（网络/未知异常）→ 可重试 error，透传 message 作 detail', () => {
    const d = decideEnterState({ kind: 'threw', message: 'Network request failed' });
    expect(d.branch).toBe('error');
    expect(d.reasonCode).toBe('threw');
    expect(d.detail).toBe('Network request failed');
    expect(d.retryable).toBe(true);
  });

  it('missing-id（路由参数缺失）→ 可重试 error', () => {
    const d = decideEnterState({ kind: 'missing-id' });
    expect(d.branch).toBe('error');
    expect(d.reasonCode).toBe('missing-id');
    expect(d.retryable).toBe(true);
  });

  it('任一失败输入都恒 retryable=true（R4.4：失败绝不是死路）', () => {
    const failing: EnterSettleInput[] = [
      { kind: 'missing-id' },
      { kind: 'timeout' },
      { kind: 'threw', message: 'x' },
      { kind: 'threw' },
      { kind: 'resolved', response: { error: { code: 'E', detail: 'd' } as any } },
    ];
    for (const input of failing) {
      const d = decideEnterState(input);
      expect(d.branch).toBe('error');
      expect(d.retryable).toBe(true);
    }
  });
});

describe('nextRetryTick — 重试计数递增（onRetry 语义）', () => {
  it('每次递增 1（用于 useFocusEffect 依赖 → 重跑 enterCreation）', () => {
    expect(nextRetryTick(0)).toBe(1);
    expect(nextRetryTick(4)).toBe(5);
    // 连续重试单调递增，保证每次都会重新触发进入
    let tick = 0;
    for (let i = 1; i <= 5; i += 1) {
      tick = nextRetryTick(tick);
      expect(tick).toBe(i);
    }
  });
});

// ============================================================
// ③ 无体验内容 → 降级为可预览详情视图（R4.5）
// ============================================================

describe('hasEnterableContent / shouldDegradeToDetail — 降级判定（R4.5）', () => {
  it('有 ECS 实体 → 有内容，不降级', () => {
    const s = session({ ecsWorld: { ecsVersion: '1.0', entities: [{ id: 'shelf_1', components: {} }] } as any });
    expect(hasEnterableContent(s)).toBe(true);
    expect(shouldDegradeToDetail(s)).toBe(false);
  });

  it('有 offerings → 有内容，不降级', () => {
    const s = session({ offerings: [{ id: 'o1', kind: 'ticket', name: '门票', verbs: ['order'] } as any] });
    expect(hasEnterableContent(s)).toBe(true);
    expect(shouldDegradeToDetail(s)).toBe(false);
  });

  it('有定价商品实体（components.price）→ 有内容', () => {
    const s = session({
      ecsWorld: { ecsVersion: '1.0', entities: [{ id: 'good_1', components: { price: { axp: 10 } } }] } as any,
    });
    expect(hasEnterableContent(s)).toBe(true);
  });

  it('无实体、无 offerings → 无内容，应降级为可预览详情视图（不黑屏）', () => {
    const s = session({ ecsWorld: { ecsVersion: '1.0', entities: [] } as any, offerings: [] });
    expect(hasEnterableContent(s)).toBe(false);
    expect(shouldDegradeToDetail(s)).toBe(true);
  });

  it('session 为 null/undefined → 无内容，不误判为「已就绪需降级」', () => {
    expect(hasEnterableContent(null)).toBe(false);
    expect(hasEnterableContent(undefined)).toBe(false);
    // 无会话时（还没进去/进入失败）不算「已进入但需降级」——降级仅针对已就绪会话。
    expect(shouldDegradeToDetail(null)).toBe(false);
    expect(shouldDegradeToDetail(undefined)).toBe(false);
  });
});

// ============================================================
// ④ 「永不黑屏」不变量（R4.4/R4.5 底线）
// 任意进入结果 → 渲染分支恒 ∈ {loading,error,experience}；error 分支恒有可操作出口。
// 以穷尽/不变量循环表达（无 fast-check 依赖）。
// ============================================================

describe('experienceRenderBranch — 永不黑屏不变量', () => {
  const ALL_BRANCHES = ['loading', 'error', 'experience'] as const;

  it('仍在进入中（loading 且无决策）→ loading', () => {
    expect(experienceRenderBranch({ loading: true, decision: null })).toBe('loading');
  });

  it('尚无决策（保护）→ loading，绝不空白', () => {
    expect(experienceRenderBranch({ loading: false, decision: null })).toBe('loading');
  });

  it('已结算：分支等于 decision.branch', () => {
    const exp: EnterDecision = { branch: 'experience', retryable: false, reasonCode: null };
    const err: EnterDecision = { branch: 'error', retryable: true, reasonCode: 'timeout' };
    expect(experienceRenderBranch({ loading: false, decision: exp })).toBe('experience');
    expect(experienceRenderBranch({ loading: false, decision: err })).toBe('error');
    // loading 但已结算为 error（竞态保护）：仍落 error 分支，不空白
    expect(experienceRenderBranch({ loading: true, decision: err })).toBe('error');
  });

  it('对所有 (loading × 每种进入输入) 组合，分支恒是三个可渲染分支之一（穷尽 → 永不黑屏）', () => {
    const inputs: EnterSettleInput[] = [
      { kind: 'missing-id' },
      { kind: 'timeout' },
      { kind: 'threw', message: 'boom' },
      { kind: 'threw' },
      { kind: 'resolved', response: null },
      { kind: 'resolved', response: session() },
      { kind: 'resolved', response: { error: { code: 'E', detail: 'd' } as any } },
    ];
    for (const loading of [true, false]) {
      // 进入中：无决策
      expect(ALL_BRANCHES).toContain(experienceRenderBranch({ loading, decision: null }));
      // 已结算：每种输入
      for (const input of inputs) {
        const decision = decideEnterState(input);
        const branch = experienceRenderBranch({ loading, decision });
        expect(ALL_BRANCHES).toContain(branch);
      }
    }
  });
});

describe('enterErrorActions — 失败页恒有可操作出口（R4.4：不停留空白）', () => {
  it('恒返回非空且包含「重试」', () => {
    const actions = enterErrorActions();
    expect(actions.length).toBeGreaterThan(0);
    expect(actions).toContain('retry');
  });

  it('提供重试 + 查看详情降级 + 返回三条出口', () => {
    expect(ENTER_ERROR_ACTIONS).toEqual(['retry', 'view-detail', 'back']);
  });
});

// ============================================================
// Harness 限制（RN-only，本 node 纯逻辑 harness 无法执行 —— 记录而非硬造）
// ------------------------------------------------------------
// 以下属于 React Native 渲染/导航，需 jest-expo + @testing-library/react-native
// （本仓库 jest.config.js 明确只跑 services/navigation/utils 纯逻辑，RN 组件测试
//   deferred 到 jest-expo sprint），故本文件仅覆盖其**决策纯函数**，渲染/跳转副作用
// 在真机 / Maestro 流（task 11.2 · .maestro/）验证：
//   • CreationCard.onPress → navigation.navigate('CreationDetail', …) 实际跳转；
//   • CreationDetailScreen「进入」按钮 press → navigation.navigate('CreationExperience', …)；
//   • enterCreation 失败页 <ActivityIndicator>/⚠️/「重试」按钮 press → 重跑 useFocusEffect；
//   • 降级提示 <View testID="experience-degrade-notice"> 的实际渲染与「查看详情」跳转；
//   • 三态封面 <Image> onError / onLoad 真实事件下的可读占位（绝不黑屏）。
// 本文件已把上述屏幕行为背后的**判定**（跳哪、带什么参、成功/失败/超时/降级、永不黑屏）
// 全部抽为纯函数并覆盖；屏幕已重构为消费这些纯函数，行为逐字等价。
// ============================================================
