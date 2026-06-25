import { AXP_EARN_SOURCES } from '../axp/axp.constants';

/**
 * 收益中心展示分类（Pet Earning Flywheel 需求 1）。
 * 把 AXP earn source 归到面向用户的收入分类。**单一事实源**——
 * 收益中心 breakdown、移动端拆分、飞轮指标都用此映射，避免各处口径不一。
 */
export const EARNING_CATEGORIES = {
  TASK: '任务',
  SKIN: '皮肤',
  CREATION: '创作',
  PREDICTION: '预测市场',
  CONTEST: '赛事/对赛',
  WORLD: '世界/Plot',
  REFERRAL: '拉新',
  OTHER: '其他',
} as const;

export type EarningCategory =
  (typeof EARNING_CATEGORIES)[keyof typeof EARNING_CATEGORIES];

/**
 * AXP earn source → 展示分类。未显式列出的 source 归「其他」（签到/聊天/陪伴等
 * 非集市收入）。新增赚钱线 earn source 时在此登记分类。
 */
export const EARN_SOURCE_CATEGORY: Record<string, EarningCategory> = {
  // 任务
  task_complete: EARNING_CATEGORIES.TASK,
  aeon_task: EARNING_CATEGORIES.TASK,
  aeon_bounty: EARNING_CATEGORIES.TASK,
  // 皮肤
  skin_sold: EARNING_CATEGORIES.SKIN,
  // 创作
  creation_tip: EARNING_CATEGORIES.CREATION,
  creation_unlock: EARNING_CATEGORIES.CREATION,
  creation_purchase: EARNING_CATEGORIES.CREATION,
  remix_royalty: EARNING_CATEGORIES.CREATION,
  // 预测市场（LSM）
  lsm_payout: EARNING_CATEGORIES.PREDICTION,
  lsm_refund: EARNING_CATEGORIES.PREDICTION,
  lsm_vault_redeem: EARNING_CATEGORIES.PREDICTION,
  // 赛事/对赛
  contest_win: EARNING_CATEGORIES.CONTEST,
  arena_prize: EARNING_CATEGORIES.CONTEST,
  arena_refund: EARNING_CATEGORIES.CONTEST,
  prediction_payout: EARNING_CATEGORIES.CONTEST,
  prediction_refund: EARNING_CATEGORIES.CONTEST,
  // 世界/Plot
  aeon_market_sale: EARNING_CATEGORIES.WORLD,
  aeon_wage: EARNING_CATEGORIES.WORLD,
  plot_revenue: EARNING_CATEGORIES.WORLD,
  plot_payout: EARNING_CATEGORIES.WORLD,
  // 拉新裂变
  referral_signup: EARNING_CATEGORIES.REFERRAL,
  referral_gmv_pct: EARNING_CATEGORIES.REFERRAL,
};

/** 解析 earn source 的展示分类，未登记归「其他」。 */
export function categoryForSource(source: string): EarningCategory {
  return EARN_SOURCE_CATEGORY[source] ?? EARNING_CATEGORIES.OTHER;
}

/** 全部已知 AXP earn source（校验映射不遗漏用）。 */
export function allEarnSources(): string[] {
  return Array.from(AXP_EARN_SOURCES);
}
