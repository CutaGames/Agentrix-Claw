/**
 * aggregatedMarketView — 萌宠「全网可接机会」移动端入口冒烟测试
 * （Agent Protocol Stack 需求 10.2，task 21.2）。
 *
 * 移动端「我的」→ 萌宠赚钱 →「全网机会」列表 → 接单弹窗 的渲染决策走纯视图模型
 * （`aggregatedMarketView`），本测试据此冒烟断言：
 *   1. 列表项**来源徽标**：内部条目锚定 Agentrix、外部条目展示连接器来源（需求 10.1/10.2）；
 *   2. 接单弹窗**限额围栏**：单笔/日额度视图与超限拦截（需求 10.2）；
 *   3. 接单弹窗**费率**：FeeResolverService 单一口径产出的抽佣率/平台费/净收（需求 10.3）。
 *
 * 根 jest 为 node 环境（RN 组件渲染 deferred，见 jest.config.js），故对驱动渲染的纯函数
 * 冒烟，而非挂载组件——与仓库既有 service/logic 测试约定一致。
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const apiFetch = jest.fn() as jest.MockedFunction<
  (path: string, options?: RequestInit) => Promise<any>
>;

jest.mock('../api', () => ({
  apiFetch: (path: string, options?: RequestInit) => apiFetch(path, options),
}));

import { searchAggregatedOpportunities, AggregatedListing } from '../aggregatedMarket.api';
import {
  CATEGORY_LABELS,
  actionForCategory,
  actionLabel,
  sourceBadgeLabel,
  readPetLimits,
  computeLimitGuard,
  feeLines,
} from '../aggregatedMarketView';

/** 模拟屏幕侧的 `t({en,zh})`（默认中文，与 i18nStore 行为一致）。 */
const tZh = (d: { en: string; zh: string }) => d.zh;
const tEn = (d: { en: string; zh: string }) => d.en;

const internalEntry = {
  identifier: 'urn:air:agentrix.io:task:design-bounty',
  displayName: 'Logo design bounty',
  type: 'application/ai-skill',
  score: 88,
  source: 'internal',
  data: { category: 'task', gmv: 100, currency: 'USDC' },
};

const externalEntry = {
  identifier: 'urn:air:agenton.io:task:ext-1',
  displayName: 'External outsourcing task',
  type: 'application/a2a-agent-card+json',
  score: 60,
  source: 'agenton',
  url: 'https://agenton.io/tasks/ext-1',
  data: { category: 'task', source: 'agenton', aggregated: true, externalId: 'ext-1' },
};

// ── 1. 列表渲染来源徽标（需求 10.1/10.2）─────────────────────────────────────
describe('全网机会列表 — 来源徽标渲染', () => {
  beforeEach(() => apiFetch.mockReset());

  it('混合检索结果渲染出内部 + 外部来源徽标', async () => {
    apiFetch.mockResolvedValueOnce({ results: [internalEntry, externalEntry] });
    const listings = await searchAggregatedOpportunities({});
    expect(listings).toHaveLength(2);

    const badges = listings.map((l) => tZh(sourceBadgeLabel(l.source, l.internal)));
    // 内部条目锚定 Agentrix；外部条目带连接器名。
    expect(badges).toContain('内部 · Agentrix');
    expect(badges).toContain('外部 · agenton');
  });

  it('内部条目徽标恒锚定 Agentrix（中英文）', () => {
    expect(tZh(sourceBadgeLabel('internal', true))).toBe('内部 · Agentrix');
    expect(tEn(sourceBadgeLabel('internal', true))).toBe('Internal · Agentrix');
  });

  it('外部条目徽标带连接器来源名', () => {
    expect(tZh(sourceBadgeLabel('polymarket', false))).toBe('外部 · polymarket');
    expect(tEn(sourceBadgeLabel('polymarket', false))).toBe('External · polymarket');
  });

  it('每个品类都有可渲染的中英文标签', () => {
    (['task', 'prediction', 'skill', 'agent_rental', 'resource'] as const).forEach((c) => {
      expect(CATEGORY_LABELS[c].en.length).toBeGreaterThan(0);
      expect(CATEGORY_LABELS[c].zh.length).toBeGreaterThan(0);
    });
  });

  it('代成交动作按品类映射（任务/预测→接单，技能/资源→购买，租赁→订阅）', () => {
    expect(actionForCategory('task')).toBe('accept');
    expect(actionForCategory('prediction')).toBe('accept');
    expect(actionForCategory('skill')).toBe('purchase');
    expect(actionForCategory('resource')).toBe('purchase');
    expect(actionForCategory('agent_rental')).toBe('subscribe');
    expect(tZh(actionLabel('skill'))).toBe('购买');
    expect(tZh(actionLabel('agent_rental'))).toBe('订阅');
    expect(tZh(actionLabel('task'))).toBe('接单');
  });
});

const baseListing: AggregatedListing = {
  identifier: 'urn:air:agentrix.io:task:design-bounty',
  displayName: 'Logo design bounty',
  score: 88,
  source: 'internal',
  internal: true,
  category: 'task',
  canAccept: true,
  canDiscover: true,
  canPublish: false,
  aggregated: false,
  gmv: 100,
  currency: 'USDC',
  regulated: null,
  externalId: 'design-bounty',
  connectorSource: 'internal',
};

// ── 2. 接单弹窗显示限额（spendingLimits 双围栏，需求 10.2）───────────────────
describe('接单弹窗 — 限额围栏', () => {
  it('归一化 spendingLimits（兼容 snake/camel）', () => {
    expect(readPetLimits({ single_tx_limit: 50, daily_limit: 200, used_today_amount: 30, currency: 'USDC' })).toEqual({
      singleTxLimit: 50,
      dailyLimit: 200,
      usedTodayAmount: 30,
      currency: 'USDC',
    });
    expect(readPetLimits({ singleTxLimit: 50, dailyLimit: 200 }, 30)).toMatchObject({
      singleTxLimit: 50,
      dailyLimit: 200,
      usedTodayAmount: 30,
    });
  });

  it('计算今日剩余额度 = 日限额 - 今日已用', () => {
    const guard = computeLimitGuard(baseListing, { dailyLimit: 200, usedTodayAmount: 30, currency: 'USDC' });
    expect(guard.dailyRemaining).toBe(170);
    expect(guard.hasLimits).toBe(true);
    expect(guard.currency).toBe('USDC');
  });

  it('限额内不拦截（GMV 未超单笔/日剩余）', () => {
    const guard = computeLimitGuard(baseListing, { singleTxLimit: 150, dailyLimit: 200, usedTodayAmount: 0 });
    expect(guard.overSingle).toBe(false);
    expect(guard.overDaily).toBe(false);
    expect(guard.blockedByLimit).toBe(false);
  });

  it('超单笔上限 → 围栏拦截', () => {
    const guard = computeLimitGuard({ ...baseListing, gmv: 500 }, { singleTxLimit: 100, dailyLimit: 1000, usedTodayAmount: 0 });
    expect(guard.overSingle).toBe(true);
    expect(guard.blockedByLimit).toBe(true);
  });

  it('超今日剩余额度 → 围栏拦截', () => {
    const guard = computeLimitGuard({ ...baseListing, gmv: 80 }, { singleTxLimit: 1000, dailyLimit: 100, usedTodayAmount: 40 });
    expect(guard.dailyRemaining).toBe(60);
    expect(guard.overDaily).toBe(true);
    expect(guard.blockedByLimit).toBe(true);
  });

  it('未开通赚钱 / 无限额 → hasLimits=false（弹窗提示开通）', () => {
    expect(computeLimitGuard(baseListing, {}, false).hasLimits).toBe(false);
    expect(computeLimitGuard(baseListing, {}, true).hasLimits).toBe(false);
  });

  it('币种回退：listing.currency > limits.currency > USDC', () => {
    expect(computeLimitGuard({ ...baseListing, currency: 'USDT' }, { currency: 'EUR' }).currency).toBe('USDT');
    expect(computeLimitGuard(null, { currency: 'EUR' }).currency).toBe('EUR');
    expect(computeLimitGuard(null, {}).currency).toBe('USDC');
  });
});

// ── 3. 接单弹窗显示费率（FeeResolverService 单一口径，需求 10.3）─────────────
describe('接单弹窗 — 费率', () => {
  it('渲染抽佣率 / 平台费 / 净收三行（带币种）', () => {
    const lines = feeLines({ baseRate: 0.05, poolRate: 0.01, platformFee: 5, poolAmount: 1, sellerNet: 95 }, 'USDC');
    expect(lines.map((l) => l.key)).toEqual(['rate', 'fee', 'net']);
    const byKey = Object.fromEntries(lines.map((l) => [l.key, l.value]));
    expect(byKey.rate).toBe('5.00%');
    expect(byKey.fee).toBe('5 USDC');
    expect(byKey.net).toBe('95 USDC');
    // 文案中英文齐备。
    lines.forEach((l) => {
      expect(l.label.en.length).toBeGreaterThan(0);
      expect(l.label.zh.length).toBeGreaterThan(0);
    });
  });

  it('无 feeBreakdown（未结算）→ 空数组，屏幕回退「结算时由统一费率源计算」', () => {
    expect(feeLines(undefined, 'USDC')).toEqual([]);
  });
});
