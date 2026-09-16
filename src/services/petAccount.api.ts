/**
 * Multi-Agent v2.1 — Pet "经济身份" mobile API client.
 *
 * Wraps `GET /api/v1/pet/:livingPetId/account` returned by the backend
 * `pet-account.controller.ts` (LivingPetModule).
 *
 * Spec: MULTI_AGENT_V2_1_PRODUCT_DECISIONS §4 (mobile shows full view,
 * "全部展示" per PM decision).
 */

import { apiFetch } from './api';

export type AgentAccountStatus = 'draft' | 'active' | 'suspended' | 'revoked';
export type AgentRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface PetAccountAgentBlock {
  agentUniqueId: string;
  creditScore: number;
  riskLevel: AgentRiskLevel;
  spendingLimits: {
    singleTxLimit: number;
    dailyLimit: number;
    monthlyLimit: number;
    currency: string;
  } | null;
  usedTodayAmount: number;
  usedMonthAmount: number;
  preferredModel: string | null;
  preferredProvider: string | null;
  status: AgentAccountStatus;
}

export interface PetAccountMarketplaceBlock {
  listed: boolean;
  publishedHireCostUsd: number | null;
  lifetimeHireCount: number;
  lifetimeEarnedUsd: number;
}

export interface PetAccountArenaBlock {
  currentElo: number;
  wins: number;
  losses: number;
  rankGlobal: number | null;
  rankInUserPool: number | null;
  productivityScore: number;
  snapshotDate: string;
}

export interface PetAccountView {
  livingPetId: string;
  petName: string;
  ownerUserId: string;
  agent: PetAccountAgentBlock | null;
  marketplace: PetAccountMarketplaceBlock;
  arena: PetAccountArenaBlock | null;
}

/**
 * Fetch the AgentAccount + marketplace stats + arena ladder snapshot for
 * one of the user's own LivingPets.
 *
 * Throws if the pet is not owned by the caller (backend returns 404).
 */
export async function fetchPetAccount(livingPetId: string): Promise<PetAccountView> {
  return apiFetch(`/v1/pet/${encodeURIComponent(livingPetId)}/account`);
}

/**
 * v2.1 — User preferences (subscription tier, arena anonymous, etc.)
 */

export type SubscriptionTier = 'free' | 'pro' | 'business' | 'enterprise';

export interface UserPreferences {
  subscriptionTier: SubscriptionTier;
  arenaAnonymous: boolean;
  [k: string]: any;
}

export async function fetchUserPreferences(): Promise<UserPreferences> {
  return apiFetch('/users/me/preferences');
}

export async function updateUserPreferences(
  patch: Partial<Pick<UserPreferences, 'arenaAnonymous' | 'subscriptionTier'>>,
): Promise<UserPreferences> {
  return apiFetch('/users/me/preferences', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}
