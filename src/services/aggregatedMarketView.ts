/**
 * aggregatedMarketView — 萌宠「全网可接机会」展示层纯函数视图模型
 * （Agent Protocol Stack 需求 10.2 / 10.3，task 21.2）。
 *
 * 把 PetEarningsScreen 的接单弹窗 / 列表项里**与渲染相关的纯计算**抽出来，作为单一真源：
 *   - 来源徽标文案（内部 · Agentrix / 外部 · {connector}）—— 需求 10.1/10.2 来源徽标；
 *   - 品类 / 代成交动作标签；
 *   - spendingLimits 双围栏视图（单笔上限 / 今日剩余 / 已用 + 是否超限）—— 需求 10.2 限额；
 *   - 费率明细行（平台抽佣率 / 平台费 / 卖家净收）—— 需求 10.3 费率。
 *
 * 这些函数返回 i18n 文案对（`{ en, zh }`）与格式化字符串，屏幕侧用 `t(pair)` 渲染。
 * 抽到 `src/services/` 下后可被根 jest（node 环境，无 RN 渲染）冒烟覆盖。
 */
import { AggregatedListing, AggCategory, FeeBreakdownView, ParticipationAction } from './aggregatedMarket.api';

/** i18n 文案对（与 i18nStore 的 TranslationDescriptor 兼容）。 */
export interface I18nText {
  en: string;
  zh: string;
}

/** 聚合品类 i18n 标签（与 universal-agent-marketplace-aggregation 5 品类对齐）。 */
export const CATEGORY_LABELS: Record<AggCategory, I18nText> = {
  task: { en: 'Task', zh: '任务' },
  prediction: { en: 'Prediction', zh: '预测' },
  skill: { en: 'Skill', zh: '技能' },
  agent_rental: { en: 'Rental', zh: '租赁' },
  resource: { en: 'Resource', zh: '资源' },
};

/** 按品类映射代成交动作（task/prediction→接单，skill/resource→购买，agent_rental→订阅）。 */
export function actionForCategory(category: AggCategory | null): ParticipationAction {
  if (category === 'skill' || category === 'resource') return 'purchase';
  if (category === 'agent_rental') return 'subscribe';
  return 'accept';
}

/** 代成交动作的按钮文案（接单 / 购买 / 订阅）。 */
export function actionLabel(category: AggCategory | null): I18nText {
  const a = actionForCategory(category);
  if (a === 'purchase') return { en: 'Buy', zh: '购买' };
  if (a === 'subscribe') return { en: 'Rent', zh: '订阅' };
  return { en: 'Accept', zh: '接单' };
}

/**
 * 来源徽标文案：内部条目锚定 Agentrix，外部条目展示连接器来源（需求 10.1/10.2）。
 * 渲染入口（PetEarningsScreen 的 `SourceBadge`）据此区分内/外部样式与文案。
 */
export function sourceBadgeLabel(source: string, internal: boolean): I18nText {
  if (internal) return { en: 'Internal · Agentrix', zh: '内部 · Agentrix' };
  return { en: `External · ${source}`, zh: `外部 · ${source}` };
}

/** spendingLimits 归一化视图（兼容 snake/camel；萌宠经济档案中为 any）。 */
export interface PetLimitsView {
  singleTxLimit?: number;
  dailyLimit?: number;
  usedTodayAmount?: number;
  currency?: string;
}

/** 从萌宠经济档案的 spendingLimits（any）归一化出限额视图。 */
export function readPetLimits(sl: any, usedToday?: number): PetLimitsView {
  const s = sl && typeof sl === 'object' ? sl : {};
  const single = s.singleTxLimit ?? s.single_tx_limit ?? s.perTransaction ?? s.single;
  const daily = s.dailyLimit ?? s.daily_limit ?? s.daily;
  const used = usedToday ?? s.usedTodayAmount ?? s.used_today_amount;
  return {
    singleTxLimit: typeof single === 'number' ? single : undefined,
    dailyLimit: typeof daily === 'number' ? daily : undefined,
    usedTodayAmount: typeof used === 'number' ? used : undefined,
    currency: typeof s.currency === 'string' ? s.currency : undefined,
  };
}

/**
 * 接单弹窗的限额围栏视图（需求 10.2 双围栏）：今日剩余额度 + 是否超单笔/日额度。
 * `blockedByLimit` 驱动弹窗的「将被围栏拦截」警示与确认按钮禁用。
 */
export interface LimitGuardView {
  /** 结算币种（listing 优先，回退 limits.currency，再回退 USDC）。 */
  currency: string;
  /** 今日剩余额度（dailyLimit - usedToday）；无 dailyLimit 时 undefined。 */
  dailyRemaining?: number;
  /** 是否有任何可展示的限额（开通赚钱 + 至少一项限额）。 */
  hasLimits: boolean;
  overSingle: boolean;
  overDaily: boolean;
  blockedByLimit: boolean;
}

export function computeLimitGuard(
  listing: AggregatedListing | null,
  limits: PetLimitsView,
  petEnabled = true,
): LimitGuardView {
  const dailyRemaining =
    typeof limits.dailyLimit === 'number'
      ? limits.dailyLimit - (limits.usedTodayAmount ?? 0)
      : undefined;
  const currency = listing?.currency || limits.currency || 'USDC';
  const overSingle =
    typeof limits.singleTxLimit === 'number' && !!listing && listing.gmv > limits.singleTxLimit;
  const overDaily =
    typeof dailyRemaining === 'number' && !!listing && listing.gmv > dailyRemaining;
  const hasLimits = petEnabled && (limits.singleTxLimit != null || limits.dailyLimit != null);
  return {
    currency,
    dailyRemaining,
    hasLimits,
    overSingle,
    overDaily,
    blockedByLimit: overSingle || overDaily,
  };
}

/** 费率明细行（label 为 i18n 对，value 为已格式化字符串）。 */
export interface FeeLine {
  key: 'rate' | 'fee' | 'net';
  label: I18nText;
  value: string;
}

/**
 * 接单弹窗费率行（需求 10.3：单一费率源 FeeResolverService 产出）。
 * 无 feeBreakdown（尚未结算）时返回空数组，屏幕侧展示「结算时由统一费率源计算」提示。
 */
export function feeLines(fee: FeeBreakdownView | undefined, currency: string): FeeLine[] {
  if (!fee) return [];
  return [
    {
      key: 'rate',
      label: { en: 'Platform rate', zh: '平台抽佣率' },
      value: `${(fee.baseRate * 100).toFixed(2)}%`,
    },
    {
      key: 'fee',
      label: { en: 'Platform fee', zh: '平台费' },
      value: `${fee.platformFee.toLocaleString()} ${currency}`,
    },
    {
      key: 'net',
      label: { en: 'You net', zh: '你的净收' },
      value: `${fee.sellerNet.toLocaleString()} ${currency}`,
    },
  ];
}
