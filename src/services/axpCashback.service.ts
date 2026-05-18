/**
 * axpCashback.service.ts — Sprint G #16
 *
 * AXP cashback real-time integration.
 * Per cross-platform PRD §13.6.4:
 *   - Every purchase in the ecosystem returns AXP based on subscription tier
 *   - Free: 0%, Lite: 5%, Plus: 10%, Pro: 15%, Elite: 20%
 *
 * This service:
 *   1. Listens for purchase completion events (via socket.io)
 *   2. Triggers AXP toast notification showing cashback earned
 *   3. Invalidates AXP balance cache
 *
 * The actual cashback calculation happens server-side; this service
 * only handles the client-side notification and cache invalidation.
 */
import { QueryClient } from '@tanstack/react-query';
import { useAxpToastStore } from '../stores/axpToastStore';

export interface CashbackEvent {
  type: 'axp_cashback';
  amount: number;
  source: string; // e.g. 'skin_purchase', 'skill_purchase', 'subscription_renewal'
  purchase_amount_cents: number;
  cashback_rate_bps: number; // basis points (500 = 5%)
  tier: string;
}

/**
 * Handle an incoming cashback event from the realtime socket.
 * Shows a toast and invalidates the AXP balance query.
 */
export function handleCashbackEvent(
  event: CashbackEvent,
  queryClient: QueryClient,
): void {
  // Show AXP toast
  const { push } = useAxpToastStore.getState();
  const ratePct = (event.cashback_rate_bps / 100).toFixed(0);
  push({
    amount: event.amount,
    reason: {
      en: `+${event.amount} AXP (${ratePct}% cashback)`,
      zh: `+${event.amount} AXP（${ratePct}% 返现）`,
    },
    emoji: '💸',
    direction: 'earn',
  });

  // Invalidate balance cache so UI updates
  queryClient.invalidateQueries({ queryKey: ['axp-balance'] });
  queryClient.invalidateQueries({ queryKey: ['axp-history'] });
}

/**
 * Calculate expected cashback for a given purchase amount and tier.
 * Used for preview in checkout UI.
 */
export function calculateExpectedCashback(
  purchaseAmountCents: number,
  tierCashbackBps: number,
): number {
  // 1 AXP = $0.001 = 0.1 cents
  // cashback in AXP = (purchaseAmountCents * cashbackBps / 10000) / 0.1
  // Simplified: purchaseAmountCents * cashbackBps / 1000
  return Math.floor(purchaseAmountCents * tierCashbackBps / 1000);
}

/**
 * Get the cashback rate label for display.
 */
export function getCashbackLabel(bps: number): string {
  if (bps === 0) return '0%';
  return `${(bps / 100).toFixed(0)}%`;
}

/**
 * Tier → cashback BPS mapping (mirrors backend).
 */
export const TIER_CASHBACK_BPS: Record<string, number> = {
  free: 0,
  lite: 500,
  plus: 1000,
  pro: 1500,
  elite: 2000,
};
