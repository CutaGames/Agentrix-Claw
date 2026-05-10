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
]);
