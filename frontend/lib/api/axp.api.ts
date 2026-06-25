/**
 * AXP Points API client — shared with Mobile (same backend endpoints).
 * Per docs/WEB_REFACTOR_PLAN_2026-05.zh-CN.md §4.2
 */

import axios from 'axios';
import { API_BASE_URL } from '../../utils/api-config';

const http = axios.create({ baseURL: API_BASE_URL, withCredentials: true });

export interface AxpBalance {
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  expiring_soon: number;
  expiring_at: string;
}

export interface AxpLedgerEntry {
  id: string;
  amount: number;
  source:
    | 'daily_checkin' | 'chat_rounds' | 'co_raising_feed' | 'referral_signup'
    | 'referral_gmv' | 'subscription_cashback' | 'game_reward' | 'achievement'
    | 'subscription_redeem' | 'skill_redeem' | 'skin_redeem' | 'feature_redeem'
    | 'lottery' | 'expired';
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface CheckinResult {
  earned: number;
  balance: number;
  streak: number;
}

export interface CheckinStatus {
  canCheckin: boolean;
  streak: number;
  lastCheckinAt?: string;
  nextRewardAt?: string;
}

export interface AxpShopItem {
  id: string;
  category: 'skin' | 'boost' | 'feature' | 'quota' | 'ticket' | 'frame';
  name: { zh: string; en: string };
  description?: { zh: string; en: string };
  cost: number;
  stock: number;
  image?: string;
  limited?: boolean;
}

export interface RedeemResult {
  ok: boolean;
  newBalance: number;
  redeemedId: string;
  message?: string;
}

export const axpApi = {
  getBalance: () =>
    http.get<AxpBalance>('/api/v1/axp/balance').then((r) => r.data),

  listHistory: (cursor?: string, limit = 50) =>
    http.get<{ items: AxpLedgerEntry[]; nextCursor?: string }>('/api/v1/axp/history', {
      params: { cursor, limit },
    }).then((r) => r.data),

  checkin: () =>
    http.post<CheckinResult>('/api/v1/axp/checkin').then((r) => r.data),

  /** Get current check-in status (whether user can check in today + current streak). */
  getCheckinStatus: () =>
    http.get<CheckinStatus>('/api/v1/axp/checkin/status').then((r) => r.data),

  /** List available items in the AXP reward shop. */
  listShopItems: () =>
    http.get<{ items: AxpShopItem[] }>('/api/v1/axp/shop').then((r) => r.data),

  /** Redeem an AXP shop item by id. Backend deducts AXP atomically. */
  redeem: (itemId: string) =>
    http.post<RedeemResult>(`/api/v1/axp/shop/${itemId}/redeem`).then((r) => r.data),
};

// ---------- Localized labels for ledger sources ----------
export const AXP_SOURCE_LABELS: Record<AxpLedgerEntry['source'], { zh: string; en: string; icon: string }> = {
  daily_checkin:        { zh: '每日签到',       en: 'Daily check-in',         icon: '🎁' },
  chat_rounds:          { zh: '聊天奖励',       en: 'Chat rounds',            icon: '💬' },
  co_raising_feed:      { zh: '共养喂宠',       en: 'Co-raising feed',        icon: '👬' },
  referral_signup:      { zh: '推广注册',       en: 'Referral signup',        icon: '🔗' },
  referral_gmv:         { zh: '推广 GMV 分成',  en: 'Referral GMV',           icon: '💼' },
  subscription_cashback:{ zh: '订阅返现',       en: 'Subscription cashback',  icon: '💰' },
  game_reward:          { zh: '游戏奖励',       en: 'Game reward',            icon: '🎮' },
  achievement:          { zh: '成就解锁',       en: 'Achievement',            icon: '🏆' },
  subscription_redeem:  { zh: '订阅抵扣',       en: 'Subscription redeem',    icon: '💳' },
  skill_redeem:         { zh: '技能抵扣',       en: 'Skill redeem',           icon: '⚡' },
  skin_redeem:          { zh: '皮肤抵扣',       en: 'Skin redeem',            icon: '👕' },
  feature_redeem:       { zh: '功能抵扣',       en: 'Feature redeem',         icon: '🎯' },
  lottery:              { zh: '抽奖',           en: 'Lottery',                icon: '🎰' },
  expired:              { zh: '过期',           en: 'Expired',                icon: '⏰' },
};
