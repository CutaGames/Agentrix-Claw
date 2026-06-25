/**
 * 萌宠收益中心 client（Pet Earning Flywheel 需求 2）。
 * 对接后端 GET /api/v1/pet-earnings/summary|breakdown|timeline。
 */
import { apiFetch } from './api';

export type EarningRange = '7d' | '30d' | 'all';

export interface EarningSummary {
  axp: {
    balance: number;
    lifetimeEarned: number;
    lifetimeSpent: number;
    lifetimeExpired: number;
    usdValueCents: number;
  };
  usdt: {
    lifetimeEarned: number;
    chain: string;
  };
  updatedAt: number;
}

export interface EarningBreakdownItem {
  category: string;
  unit: 'AXP' | 'USDT';
  amount: number;
  count: number;
  pctOfUnit: number;
}

export interface EarningTimelinePoint {
  date: string; // YYYY-MM-DD
  axpEarned: number;
  usdtEarned: number;
}

export async function fetchEarningSummary(): Promise<EarningSummary> {
  return apiFetch<EarningSummary>('/v1/pet-earnings/summary');
}

export async function fetchEarningBreakdown(
  range: EarningRange = '30d',
): Promise<EarningBreakdownItem[]> {
  return apiFetch<EarningBreakdownItem[]>(`/v1/pet-earnings/breakdown?range=${range}`);
}

export async function fetchEarningTimeline(
  range: EarningRange = '30d',
): Promise<EarningTimelinePoint[]> {
  return apiFetch<EarningTimelinePoint[]>(`/v1/pet-earnings/timeline?range=${range}`);
}
