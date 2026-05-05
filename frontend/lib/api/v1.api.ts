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
    acceptInvitation: (code: string) =>
      apiClient.post<FamilyAccount>('/v1/family/invitations/accept', { code }),
    setupPet: (id: string, name: string, emotion: PetEmotion = 'happy') =>
      apiClient.post<FamilyAccount>(`/v1/family/${id}/pet`, { name, emotion }),
    createHouseholdAgent: (
      id: string,
      body: { name: string; role: string; visible_to_roles?: string[] },
    ) => apiClient.post<FamilyAccount>(`/v1/family/${id}/agents`, body),
  },

  cosign: {
    list: (status: 'pending' | 'signed' | 'rejected' = 'pending') =>
      apiClient.get<CoSignRequest[]>('/v1/cosign', { params: { status } }),
    get: (id: string) => apiClient.get<CoSignRequest>(`/v1/cosign/${id}`),
    create: (body: { action: { kind: string; payload?: Record<string, unknown> }; required_surfaces: string[] }) =>
      apiClient.post<CoSignRequest>('/v1/cosign', body),
    sign: (id: string, surface: string, method: 'biometric' | 'pin' | 'wrist-tap' = 'biometric') =>
      apiClient.post<CoSignRequest>(`/v1/cosign/${id}/sign`, { surface, method }),
    reject: (id: string, reason?: string) =>
      apiClient.post<CoSignRequest>(`/v1/cosign/${id}/reject`, { reason }),
  },

  privacy: {
    listItems: (category?: PrivacyCategory) =>
      apiClient.get<PrivacyItem[]>('/v1/privacy/items', {
        params: category ? { category } : undefined,
      }),
    grant: (body: { item_id: string; grantee_id: string; ttl_ms?: number }) =>
      apiClient.post<PrivacyGrant>('/v1/privacy/grants', body),
    revoke: (id: string) => apiClient.post<PrivacyGrant>(`/v1/privacy/grants/${id}/revoke`, {}),
    audit: (limit = 50) =>
      apiClient.get<PrivacyAuditEntry[]>('/v1/privacy/audit', { params: { limit } }),
  },

  memory: {
    stats: () => apiClient.get<MemoryStats>('/v1/memory/stats'),
    list: (tier: MemoryTier, params?: { tag?: string; agent_id?: string; limit?: number }) =>
      apiClient.get<MemoryItem[]>(`/v1/memory/${tier}`, { params }),
    search: (q: string, tier?: MemoryTier, limit = 20) =>
      apiClient.get<MemoryItem[]>('/v1/memory/search', { params: { q, tier, limit } }),
    upsert: (body: {
      tier: MemoryTier;
      text: string;
      key?: string;
      tags?: string[];
      agent_id?: string;
      ttl_ms?: number;
    }) => apiClient.post<MemoryItem>('/v1/memory/upsert', body),
    delete: (id: string) => apiClient.delete<{ ok: boolean }>(`/v1/memory/item/${id}`),
  },
};

// ---------- additional v3 types ----------

export interface CoSignRequest {
  id: string;
  user_id: string;
  action: { kind: string; payload?: Record<string, unknown> };
  required_surfaces: string[];
  signed_surfaces: string[];
  status: 'pending' | 'signed' | 'rejected' | 'expired';
  created_at: string;
}

export type PrivacyCategory = 'financial' | 'health' | 'relationship' | 'location';

export interface PrivacyItem {
  id: string;
  category: PrivacyCategory;
  key: string;
  preview?: string;
  family_partition?: string | null;
  created_at: string;
}

export interface PrivacyGrant {
  id: string;
  item_id: string;
  grantee_id: string;
  expires_at: string;
  status: 'active' | 'revoked' | 'expired';
}

export interface PrivacyAuditEntry {
  id: string;
  actor_id: string;
  action: 'read' | 'write' | 'grant' | 'revoke';
  item_id?: string;
  grant_id?: string;
  created_at: string;
}

export type MemoryTier = 'working' | 'episodic' | 'semantic' | 'procedural';

export interface MemoryStats {
  working: number;
  episodic: number;
  semantic: number;
  procedural: number;
  total_bytes?: number;
}

export interface MemoryItem {
  id: string;
  tier: MemoryTier;
  key?: string;
  text: string;
  tags?: string[];
  agent_id?: string;
  ttl_ms?: number;
  created_at: string;
}

export default v1Api;
