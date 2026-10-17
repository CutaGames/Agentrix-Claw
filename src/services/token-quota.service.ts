/**
 * token-quota.service.ts — Layer 0: Token Usage API
 * Wraps GET /api/token-quota/me
 */
import { apiFetch } from './api';

export type TokenPlanType = 'free_trial' | 'starter' | 'pro' | 'unlimited';

export interface QuotaStatus {
  planType: TokenPlanType;
  totalQuota: number;
  usedTokens: number;
  remainingTokens: number;
  usagePercent: number;   // 0–100
  callCount: number;
  periodStart: string;
  periodEnd: string;
  quotaExhausted: boolean;
  energyLevel: number;    // 0–100 (battery metaphor)
}

export const fetchQuotaStatus = (): Promise<QuotaStatus> =>
  apiFetch<QuotaStatus>('/token-quota/me');

export const PLAN_LABEL: Record<TokenPlanType, string> = {
  free_trial: 'Free Trial',
  starter: 'Starter',
  pro: 'Pro',
  unlimited: 'Unlimited',
};

export const PLAN_COLOR: Record<TokenPlanType, string> = {
  free_trial: '#64748b',
  starter: '#7c3aed',
  pro: '#2563eb',
  unlimited: '#059669',
};
