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

// ── 萌宠经济主体（需求 3）──
export interface PetEconomicProfile {
  pet: { id: string; name: string; species: string; intimacyLevel: number };
  earning: {
    enabled: boolean;
    agentAccountId?: string;
    creditScore?: number;
    spendingLimits?: any;
    usedTodayAmount?: number;
    totalTransactions?: number;
  };
  earnings: EarningSummary | null;
}

export async function fetchPetEconomicProfile(): Promise<PetEconomicProfile> {
  return apiFetch<PetEconomicProfile>('/v1/pet-earnings/economic-profile');
}

export async function enablePetEarning(): Promise<{
  ok: boolean;
  boundAgentAccountId: string;
  alreadyBound: boolean;
}> {
  return apiFetch('/v1/pet-earnings/enable-earning', { method: 'POST' });
}

// ── 半自主接活（需求 6）──
export interface Opportunity {
  taskId: string;
  title: string;
  type: string;
  budget: number;
  currency: string;
  tags: string[];
  matchScore: number;
}

export async function fetchOpportunities(limit = 10): Promise<Opportunity[]> {
  try {
    return await apiFetch<Opportunity[]>(`/v1/pet-earnings/opportunities?limit=${limit}`);
  } catch {
    return [];
  }
}

export async function acceptOpportunity(taskId: string): Promise<{
  ok: boolean;
  bidId: string;
  taskId: string;
  proposedBudget: number;
}> {
  return apiFetch(`/v1/pet-earnings/opportunities/${taskId}/accept`, { method: 'POST' });
}
