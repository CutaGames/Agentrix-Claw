/**
 * v1.api.ts — v3 platform API client
 *
 * Wraps the unified `/api/v1/*` REST surface introduced by the v3
 * implementation plan (pet state, handoff, approval, wallet projection,
 * auto-earn timeline, split plans, budget pools, family account, etc.).
 *
 * All entries return `null` on transient backend unavailability so callers
 * can render skeleton / empty states without a hard error boundary trigger.
 */

import { apiClient } from './client';

// ---------- shared types (mirrors shared/types/agentrix-presence.ts) ----------

export type PetEmotion =
  | 'calm'
  | 'happy'
  | 'excited'
  | 'focused'
  | 'concerned'
  | 'tired'
  | 'love'
  | 'sad'
  | 'angry'
  | 'sleepy';

export interface PetState {
  pet_id: string;
  user_id: string;
  emotion: PetEmotion;
  emotion_intensity: number; // 0-3
  intimacy_level: number;
  intimacy_xp: number;
  primary_agent_id?: string;
  engine_switching?: boolean;
  updated_at: string;
}

export interface WalletProjection {
  user_id: string;
  total_balance_cents?: number;
  available_balance_cents?: number;
  pending_balance_cents?: number;
  fiat?: { currency: string; balance_cents: number };
  crypto?: Array<{ symbol: string; chain: string; balance: string; usd_value: number }>;
  recent_txs?: Array<{
    id: string;
    kind: string;
    amount_cents: number;
    currency: string;
    status: string;
    created_at: string;
  }>;
  auto_earn?: { mrr_cents: number; last_24h_cents: number; active_executors: number };
  updated_at?: string;
}

export interface HandoffRecord {
  id: string;
  from_device_id: string;
  to_device_id?: string;
  mode: 'handoff' | 'mirror' | 'ignore';
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  created_at: string;
  context_snapshot?: Record<string, unknown>;
}

export interface ApprovalRequest {
  id: string;
  user_id: string;
  risk_level: 'L0' | 'L1' | 'L2' | 'L3';
  action: { kind: string; payload?: Record<string, unknown> };
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  required_surfaces?: string[];
  signed_surfaces?: string[];
  created_at: string;
}

export interface AutoEarnSummary {
  total_cents: number;
  last_24h_cents: number;
  last_30d_cents: number;
  mrr_cents: number;
  active_executors?: number;
}

export interface AutoEarnEvent {
  id: string;
  source: 'skill_invoke' | 'a2a_trade' | 'commission' | string;
  amount_cents: number;
  agent_id?: string;
  description?: string;
  created_at: string;
}

export interface SplitPlan {
  id: string;
  name: string;
  recipients: Array<{ recipient_id: string; bps: number; label?: string }>;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
}

export interface BudgetPool {
  id: string;
  name: string;
  monthly_limit_cents: number;
  spent_this_month_cents: number;
  currency: string;
  status: 'active' | 'paused';
}

export interface FamilyAccount {
  id: string;
  name: string;
  owner_user_id: string;
  members: Array<{ user_id: string; role: 'owner' | 'admin' | 'member' | 'child'; display_name?: string }>;
  pet?: { pet_id: string; name: string; emotion?: PetEmotion };
  household_agents?: Array<{ id: string; name: string; role?: string }>;
}

// ---------- v3 endpoints ----------

export const v1Api = {
  pet: {
    getState: () => apiClient.get<PetState>('/v1/pet/state'),
    setEmotion: (emotion: PetEmotion, intensity = 2) =>
      apiClient.post<PetState>('/v1/pet/emotion', { emotion, intensity }),
    addIntimacyXp: (xp: number, source?: string) =>
      apiClient.post<PetState>('/v1/pet/intimacy', { xp, source }),
  },

  wallet: {
    getProjection: () => apiClient.get<WalletProjection>('/v1/wallet/projection'),
  },

  handoff: {
    list: () => apiClient.get<HandoffRecord[]>('/v1/handoff/recent'),
    accept: (id: string, deviceId: string, mode: 'handoff' | 'mirror' = 'handoff') =>
      apiClient.post<HandoffRecord>(`/v1/handoff/${id}/accept`, { device_id: deviceId, mode }),
    cancel: (id: string) => apiClient.post<HandoffRecord>(`/v1/handoff/${id}/cancel`, {}),
  },

  approval: {
    list: (status: 'pending' | 'approved' | 'rejected' = 'pending') =>
      apiClient.get<ApprovalRequest[]>('/v1/approval', { params: { status } }),
    approve: (
      id: string,
      surface: string,
      method: 'biometric' | 'pin' | 'wrist-tap' | 'password' = 'biometric',
    ) =>
      apiClient.post<ApprovalRequest>(`/v1/approval/${id}/approve`, {
        surface,
        method,
        device_id: surface,
        trust_level: 'high',
      }),
    reject: (id: string, reason?: string) =>
      apiClient.post<ApprovalRequest>(`/v1/approval/${id}/reject`, { reason }),
  },

  autoEarn: {
    summary: () => apiClient.get<AutoEarnSummary>('/v1/auto-earn/summary'),
    timeline: (limit = 20) =>
      apiClient.get<AutoEarnEvent[]>('/v1/auto-earn/timeline', { params: { limit } }),
  },

  splitPlans: {
    list: () => apiClient.get<SplitPlan[]>('/v1/split-plans'),
    create: (body: { name: string; recipients: Array<{ recipient_id: string; bps: number; label?: string }> }) =>
      apiClient.post<SplitPlan>('/v1/split-plans', body),
    preview: (id: string, amount_cents: number) =>
      apiClient.post<{ allocations: Array<{ recipient_id: string; amount_cents: number }> }>(
        `/v1/split-plans/${id}/preview`,
        { amount_cents },
      ),
  },

  budgetPools: {
    list: () => apiClient.get<BudgetPool[]>('/v1/budget-pools'),
    create: (body: { name: string; monthly_limit_cents: number; currency?: string }) =>
      apiClient.post<BudgetPool>('/v1/budget-pools', body),
    spend: (id: string, amount_cents: number, memo?: string) =>
      apiClient.post<BudgetPool>(`/v1/budget-pools/${id}/spend`, { amount_cents, memo }),
  },

  family: {
    list: () => apiClient.get<FamilyAccount[]>('/v1/family'),
    get: (id: string) => apiClient.get<FamilyAccount>(`/v1/family/${id}`),
    create: (name: string) => apiClient.post<FamilyAccount>('/v1/family', { name }),
    invite: (id: string, role: 'admin' | 'member' | 'child') =>
      apiClient.post<{ invitation_code: string }>(`/v1/family/${id}/invite`, { role }),
  },
};

export default v1Api;
