import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../services/api';

export interface QuotaStatus {
  planType: string;
  totalQuota: number;
  usedTokens: number;
  remainingTokens: number;
  usagePercent: number;
  callCount: number;
  periodStart: string;
  periodEnd: string;
  quotaExhausted: boolean;
  energyLevel: number;  // 0–100 for UI bar
}

/**
 * Fetches the current user's token quota status.
 * Polls every 30 seconds so the bar stays roughly up-to-date.
 */
export function useTokenQuota() {
  return useQuery<QuotaStatus>({
    queryKey: ['token-quota'],
    queryFn: async () => {
      return apiFetch<QuotaStatus>('/token-quota/me');
    },
    refetchInterval: 30_000,   // refresh every 30 seconds
    staleTime: 20_000,
  });
}

/**
 * Format token count for display.
 * 5_000_000 → "5M"   1_250_000 → "1.25M"   500_000 → "500K"
 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
