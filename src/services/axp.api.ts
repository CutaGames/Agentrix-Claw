/**
 * AXP client — per docs §4.
 */
import { apiFetch } from './api';

export interface AxpBalanceView {
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  lifetime_expired: number;
  usd_value_cents: number;
  updated_at: number;
}

export interface AxpLedgerEntry {
  id: string;
  direction: 'earn' | 'spend' | 'expire' | 'adjust';
  amount: number;
  source: string;
  ref_id: string | null;
  note: string | null;
  expires_at: number | null;
  created_at: number;
}

export interface AxpHistory {
  items: AxpLedgerEntry[];
  next_cursor: string | null;
}

export async function fetchAxpBalance(): Promise<AxpBalanceView> {
  return apiFetch<AxpBalanceView>('/v1/axp/balance');
}

export async function fetchAxpHistory(limit = 50, cursor?: string): Promise<AxpHistory> {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (cursor) qs.set('cursor', cursor);
  return apiFetch<AxpHistory>(`/v1/axp/history?${qs.toString()}`);
}

export async function spendAxp(input: {
  source: string;
  amount: number;
  ref_id?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ ledger_id: string; balance: number }> {
  return apiFetch<{ ledger_id: string; balance: number }>('/v1/axp/spend', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Internal: earn is normally server-side only; exposed for test harnesses. */
export async function earnAxp(input: {
  source: string;
  amount: number;
  ref_id?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ ledger_id: string; balance: number }> {
  return apiFetch<{ ledger_id: string; balance: number }>('/v1/axp/earn', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ── Daily check-in ───────────────────────────────────────────

export interface CheckinStatus {
  last_checkin_date: string | null;
  streak: number;
  can_checkin_today: boolean;
  pending_amount: number;
  base_amount: number;
  streak_bonus: number;
  streak_bonus_cap: number;
}

export interface CheckinResult extends CheckinStatus {
  earned: number;
  balance: number;
  ledger_id: string;
}

export async function fetchCheckinStatus(): Promise<CheckinStatus> {
  return apiFetch<CheckinStatus>('/v1/axp/checkin/status');
}

export async function doCheckin(): Promise<CheckinResult> {
  return apiFetch<CheckinResult>('/v1/axp/checkin', { method: 'POST' });
}
