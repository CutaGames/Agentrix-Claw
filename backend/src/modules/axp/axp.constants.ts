/**
 * AXP constants — per docs/MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05.zh-CN.md §4.
 *
 * 1 AXP = $0.001 USD (redeems to subscription / purchase discount).
 * Soft ledger, off-chain. Expires after 12 months (§4.6).
 */

export const AXP_VERSION = '1.0.0';
export const AXP_USD_CENTS_PER_POINT = 0.1; // 10 AXP == 1 cent == $0.01
export const AXP_DEFAULT_EXPIRY_DAYS = 365;

/** Daily limits to prevent farming abuse. */
export const AXP_DAILY_CAPS: Record<string, number> = {
  daily_checkin: 1, // one check-in/day
  chat_active: 1, // one "chat 10 rounds" bonus/day
  coraising_feed: 10, // at most 10 feeds/day per feeder (across all invites)
  feed_post_liked: 200, // max 200 AXP from likes/day
  game_participate: 5, // 5 game plays/day
  greeting_sent: 3, // 3 free greeting sends/day (premium templates cost AXP)
  greeting_received: 20, // 20 greeting receives/day
};

/** Fixed AXP amounts for common actions. Can be overridden per-call. */
export const AXP_AMOUNTS = {
  daily_checkin_base: 20,
  daily_checkin_streak_bonus: 5, // +5 AXP per consecutive day (cap at 100)
  chat_active: 20,
  pet_lvl_up_per_level: 50,
  coraising_feed_receive: 5, // feeder gets this
  coraising_feed_owner: 2, // pet owner gets a smaller share per feed
  referral_signup: 500,
  feed_post_liked_base: 3,
  task_complete_per_usd: 10,
  skin_sold: 50,
  greeting_sent: 10,
  greeting_received: 20,
  game_participate_base: 30,
  contest_win: 5000,
} as const;

/** Subscription cashback rates — AXP earned per USD cent spent (§4.4). */
export const AXP_CASHBACK_BPS: Record<string, number> = {
  free: 0,
  lite: 500, // +5%  → 500 basis points
  plus: 1000, // +10%
  pro: 1500, // +15%
  elite: 2000, // +20%
  enterprise: 1500, // parity with pro for now
};

/** Spend categories (§4.3). */
export const AXP_SPEND_SOURCES = new Set([
  'sub_discount', // subscription checkout discount
  'skill_discount',
  'skin_discount',
  'create_pet_slot',
  'task_priority',
  'card_pin', // plaza post pin
  'skin_preorder',
  'l3_cosign_fee_waiver',
  'lottery_pull',
  'redeem_skin',
  'greeting_template_premium',
  'aeon_stage_tip', // 永曜城现场活动打赏支出(观众→台上发言者)
  'creation_tip', // 创作打赏支出(观众→创作 owner)
  'creation_unlock', // 互动剧按集解锁支出(观众→创作 owner)
  'creation_purchase', // 店铺商品购买支出(买家→创作 owner)
  // ── World Creation (v6) Plot 体验内经济 spend 来源 (R7/R15/R16) ──
  'plot_purchase', // 访客在 Plot 体验内结账支出 (如超市购物 / 塔防升级 / 竞技场下注)
  // ── World Arena / Prediction (2026-06) ──
  'arena_entry', // 技能对赛报名费(进奖池)
  'prediction_stake', // 事件预测下注(进彩池;parimutuel)
  // ── Leverage Sports Market (LSM, 2026-06) ──
  'lsm_stake', // 杠杆滚球下注保证金支出(用户→金库)
  'lsm_vault_deposit', // LP 存入金库(用户→金库份额)
]);

/** Earn sources (§4.2). Caller-provided strings are validated against this. */
export const AXP_EARN_SOURCES = new Set([
  'daily_checkin',
  'chat_active',
  'pet_lvl_up',
  'coraising_feed',
  'coraising_owner',
  'referral_signup',
  'referral_gmv_pct',
  'feed_post_liked',
  'task_complete',
  'skin_sold',
  'greeting_sent',
  'greeting_received',
  'game_participate',
  'contest_win',
  'sub_cashback',
  'admin_grant',
  // ── Aeon(永曜城)世界经济 earn 来源(R20.1/R20.4 现实↔游戏闭环钱包桥接)──
  'aeon_wage', // 公司发薪 / 打卡结算
  'aeon_bounty', // 悬赏完成奖励
  'aeon_task', // 任务广场完成奖励
  'aeon_market_sale', // 世界市场卖货收入
  'aeon_reality_reward', // 现实 agent 任务 / Computer Use 完成 → 世界奖励
  'aeon_stage_tip', // 永曜城现场活动被打赏收入(台上发言者收)
  'creation_tip', // 创作被打赏收入(创作 owner 收)
  'creation_unlock', // 互动剧被解锁收入(创作 owner 收)
  'creation_purchase', // 店铺商品销售收入(创作 owner 收)
  'remix_royalty', // Remix 血缘分润:衍生作品成交,上游母版创作者分得
  // ── World Creation (v6) Plot 体验内经济 earn 来源 (R7.5/R16.5) ──
  'plot_revenue', // Plot owner 体验内营收 (扣平台抽成后净额入账)
  'plot_payout', // 服务端权威打款 (如竞技场下注结算 / 奖励发放)
  // ── World Arena / Prediction (2026-06) ──
  'arena_prize', // 技能对赛奖池瓜分(服务端权威结算)
  'arena_refund', // 技能对赛取消/未达成退报名费
  'prediction_payout', // 事件预测命中分得彩池(parimutuel,服务端权威)
  'prediction_refund', // 事件预测取消/作废退款
  // ── Leverage Sports Market (LSM, 2026-06) ──
  'lsm_payout', // 杠杆滚球结算派彩(金库→用户:本金+杠杆盈利)
  'lsm_refund', // 杠杆滚球取消/作废/平局退款(金库→用户)
  'lsm_vault_redeem', // LP 赎回金库份额(金库→用户)
]);
