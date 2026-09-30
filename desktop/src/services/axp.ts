/**
 * AXP client (Desktop) — mirrors mobile src/services/axp.api.ts.
 * Sprint DA per docs/DESKTOP_AUDIT_AND_REFACTOR_PLAN_2026-05.
 */
import { API_BASE, apiFetch } from "./store";

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
  direction: "earn" | "spend" | "expire" | "adjust";
  amount: number;
  source: string;
  ref_id: string | null;
  note: string | null;
  expires_at: number | null;
  created_at: number;
}

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

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${body}`.slice(0, 300));
  }
  return res.json();
}

export async function fetchAxpBalance(): Promise<AxpBalanceView> {
  const res = await apiFetch(`${API_BASE}/v1/axp/balance`);
  return json<AxpBalanceView>(res);
}

export async function fetchAxpHistory(limit = 50, cursor?: string): Promise<{
  items: AxpLedgerEntry[];
  next_cursor: string | null;
}> {
  const qs = new URLSearchParams();
  qs.set("limit", String(limit));
  if (cursor) qs.set("cursor", cursor);
  const res = await apiFetch(`${API_BASE}/v1/axp/history?${qs.toString()}`);
  return json(res);
}

export async function fetchCheckinStatus(): Promise<CheckinStatus> {
  const res = await apiFetch(`${API_BASE}/v1/axp/checkin/status`);
  return json<CheckinStatus>(res);
}

export async function doCheckin(): Promise<CheckinResult> {
  const res = await apiFetch(`${API_BASE}/v1/axp/checkin`, { method: "POST" });
  return json<CheckinResult>(res);
}

export async function earnAxp(input: {
  source: string;
  amount: number;
  ref_id?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ ledger_id: string; balance: number }> {
  const res = await apiFetch(`${API_BASE}/v1/axp/earn`, {
    method: "POST",
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
  });
  return json(res);
}

export async function spendAxp(input: {
  source: string;
  amount: number;
  ref_id?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ ledger_id: string; balance: number }> {
  const res = await apiFetch(`${API_BASE}/v1/axp/spend`, {
    method: "POST",
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
  });
  return json(res);
}
