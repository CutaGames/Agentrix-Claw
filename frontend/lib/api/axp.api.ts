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

export const axpApi = {
  getBalance: () =>
    http.get<AxpBalance>('/api/v1/axp/balance').then((r) => r.data),

  listHistory: (cursor?: string, limit = 50) =>
    http.get<{ items: AxpLedgerEntry[]; nextCursor?: string }>('/api/v1/axp/history', {
      params: { cursor, limit },
    }).then((r) => r.data),

  checkin: () =>
    http.post<CheckinResult>('/api/v1/axp/checkin').then((r) => r.data),
};
