/**
 * Mobile Pet Soul SDK (Phase 1 · MVP)
 *
 * 与桌面 `desktop/src/services/petSoulSdk.ts` 形态对齐。
 * 后端契约：
 *   GET  /v1/pet/state               获取主宠（含 soul_template_id）
 *   GET  /v1/pet/souls?clan=         列出灵魂
 *   GET  /v1/pet/souls/:id           取灵魂详情
 *   POST /v1/pet/soul/switch         切换灵魂（保留 intimacy/xp/记忆/钱包）
 *   GET  /v1/pet/skins               我的皮肤
 *   POST /v1/pet/skin/activate       激活皮肤
 *
 * PRD: docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md MB-1.x / MB-2.x
 */
import { apiFetch } from './api';
import type { PetClan, PetSoulTemplate } from '../../shared/types/pet';
import type { PetState } from '../../shared/types/agentrix-presence';

export type { PetClan } from '../../shared/types/pet';

export interface PetSoulSummary {
  id: string;
  clan: PetClan;
  display_name: string;
  display_name_en: string;
  tagline: string;
  archetype: string;
  marketing_hook: string;
  recommended_skin_tags: string[];
  default_idle_emotion: string;
  tier: string;
  age_rating: string;
}

export interface PetSkinSummary {
  id: string;
  owner_user_id: string | null;
  source: 'platform' | 'generated' | 'purchased' | 'remixed' | 'gifted';
  display_name: string;
  url: string;
  thumbnail_url: string | null;
  format: 'svg' | 'rive' | 'vrm' | 'live2d';
  manifest: Record<string, unknown>;
  visibility?: 'public' | 'private' | 'unlisted';
  moderation_status?: 'pending' | 'approved' | 'rejected';
  price_cents?: number;
  parent_skin_id?: string | null;
  original_creator_user_id?: string | null;
  royalty_rate_bps?: number;
  created_at: number;
}

/** 取主宠当前状态（含 soul_template_id）。后端：GET /v1/pet/state */
export async function getPetState(): Promise<PetState> {
  return apiFetch<PetState>('/v1/pet/state');
}

/** 列出可用灵魂模板（Phase 1：A 族群 7 只） */
export async function listSouls(opts: { clan?: PetClan } = {}): Promise<PetSoulSummary[]> {
  const qs = opts.clan ? `?clan=${encodeURIComponent(opts.clan)}` : '';
  const json = await apiFetch<{ items: PetSoulSummary[] }>(`/v1/pet/souls${qs}`);
  return json.items ?? [];
}

/** 取单只灵魂详情 */
export async function getSoul(id: string): Promise<PetSoulTemplate & { id: string }> {
  return apiFetch<PetSoulTemplate & { id: string }>(`/v1/pet/souls/${encodeURIComponent(id)}`);
}

/**
 * 切换灵魂。
 * 契约：保留 intimacy / xp / 记忆 / 钱包；后端广播 pet.soul.changed + pet.state。
 */
export async function switchSoul(templateId: string): Promise<PetState> {
  return apiFetch<PetState>('/v1/pet/soul/switch', {
    method: 'POST',
    body: JSON.stringify({ templateId }),
  });
}

/** 当前用户拥有的皮肤（含平台共享） */
export async function listSkins(): Promise<PetSkinSummary[]> {
  const json = await apiFetch<{ items: PetSkinSummary[] }>('/v1/pet/skins');
  return json.items ?? [];
}

/** 当前激活皮肤 id */
export async function getActiveSkinId(): Promise<string | null> {
  const json = await apiFetch<{ active_skin_id: string | null }>('/v1/pet/skins/active');
  return json.active_skin_id ?? null;
}

/** 激活某只皮肤 */
export async function activateSkin(skinId: string): Promise<PetState> {
  return apiFetch<PetState>('/v1/pet/skin/activate', {
    method: 'POST',
    body: JSON.stringify({ skinId }),
  });
}

// ───────── V4 §3.2 / §3.4 — Marketplace, Upload, Breed ─────────

export interface PetSkinMarketplaceResponse {
  items: PetSkinSummary[];
  total: number;
}

/** V4 §3.2 — 列出可安装的市场皮肤 */
export async function listMarketplaceSkins(opts: {
  limit?: number;
  offset?: number;
  source?: 'platform' | 'generated' | 'remixed';
} = {}): Promise<PetSkinMarketplaceResponse> {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.offset != null) params.set('offset', String(opts.offset));
  if (opts.source) params.set('source', opts.source);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<PetSkinMarketplaceResponse>(`/v1/pet/skins/marketplace${qs}`);
}

/** V4 §3.2 — 从市场安装皮肤到当前用户衣柜。
 *  付费皮肤需传 acknowledgedPriceCents 与服务端价格匹配。 */
export async function installMarketplaceSkin(
  skinId: string,
  acknowledgedPriceCents?: number,
): Promise<PetSkinSummary> {
  const body =
    acknowledgedPriceCents != null ? JSON.stringify({ acknowledgedPriceCents }) : JSON.stringify({});
  const res = await apiFetch<{ skin: PetSkinSummary }>(
    `/v1/pet/skins/marketplace/${encodeURIComponent(skinId)}/install`,
    { method: 'POST', body },
  );
  return res.skin;
}

/** V4 §3.2 — 查看购买某只皮肤时的版税拆分预览。 */
export interface PetRoyaltyPreview {
  ok: boolean;
  priceCents?: number;
  split?: {
    payouts: Array<{
      recipientUserId: string;
      amountCents: number;
      reason: 'platform' | 'royalty' | 'seller';
      ancestorLayer?: number;
    }>;
    totalRoyaltyCents: number;
    platformCents: number;
    sellerCents: number;
    scaledDown: boolean;
  };
  error?: string;
}
export async function previewSkinRoyalty(skinId: string): Promise<PetRoyaltyPreview> {
  return apiFetch<PetRoyaltyPreview>(
    `/v1/pet/skins/marketplace/${encodeURIComponent(skinId)}/royalty-preview`,
  );
}

/** V4 §3.2 — 设置皮肤可见性（仅 owner） */
export async function setSkinVisibility(
  skinId: string,
  visibility: 'public' | 'private' | 'unlisted',
): Promise<PetSkinSummary> {
  const res = await apiFetch<{ skin: PetSkinSummary }>(
    `/v1/pet/skins/${encodeURIComponent(skinId)}/visibility`,
    { method: 'POST', body: JSON.stringify({ visibility }) },
  );
  return res.skin;
}

/** V4 §3.2 — 设置皮肤售价（USD cents，仅 owner） */
export async function setSkinPrice(skinId: string, priceCents: number): Promise<PetSkinSummary> {
  const res = await apiFetch<{ skin: PetSkinSummary }>(
    `/v1/pet/skins/${encodeURIComponent(skinId)}/price`,
    { method: 'POST', body: JSON.stringify({ priceCents }) },
  );
  return res.skin;
}

/** V4 §3.2 — 用户上传自定义皮肤（前端先上传到 CDN 后调用） */
export async function uploadSkin(input: {
  displayName: string;
  url: string;
  format?: 'svg' | 'rive' | 'vrm' | 'live2d';
  thumbnailUrl?: string;
  manifest?: Record<string, unknown>;
}): Promise<PetSkinSummary> {
  const res = await apiFetch<{ skin: PetSkinSummary }>('/v1/pet/skins/upload', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.skin;
}

export interface PetBreedResult {
  accepted?: boolean;
  taskId?: string;
  status?: string;
  message?: string;
  error?: string;
  [k: string]: unknown;
}

/** V4 §3.4 — 双图繁殖 */
export async function breedPet(input: {
  parentSkinIdA: string;
  parentSkinIdB: string;
  prompt?: string;
  style?: string;
}): Promise<PetBreedResult> {
  return apiFetch<PetBreedResult>('/v1/pet/breed', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 6 M2 — Pet Team (Lv5+) — multi-pet delegation under a parent pet
// ────────────────────────────────────────────────────────────────────────────

export type PetTeamRole =
  | 'finance'
  | 'concierge'
  | 'researcher'
  | 'creative'
  | 'guardian'
  | 'tutor';

export type PetTeamMemberStatus = 'active' | 'paused' | 'revoked';

export interface PetTeamMemberDto {
  id: string;
  parent_living_pet_id: string;
  member_user_id: string;
  display_name: string;
  role: PetTeamRole;
  scope: Record<string, unknown>;
  daily_budget_usd: number;
  status: PetTeamMemberStatus;
  created_at: string;
  updated_at: string;
}

export async function listTeamRoles(): Promise<PetTeamRole[]> {
  const r = await apiFetch<{ roles: PetTeamRole[] }>('/v1/pet/team/roles');
  return r.roles ?? [];
}

export async function listTeamMembers(parentLivingPetId: string): Promise<PetTeamMemberDto[]> {
  const r = await apiFetch<{ items: PetTeamMemberDto[] }>(
    `/v1/pet/team/${encodeURIComponent(parentLivingPetId)}`,
  );
  return r.items ?? [];
}

export async function grantTeamMember(
  parentLivingPetId: string,
  body: {
    member_user_id: string;
    display_name: string;
    role: PetTeamRole;
    scope?: Record<string, unknown>;
    daily_budget_usd?: number;
  },
): Promise<PetTeamMemberDto> {
  return apiFetch<PetTeamMemberDto>(
    `/v1/pet/team/${encodeURIComponent(parentLivingPetId)}/members`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export async function pauseTeamMember(
  parentLivingPetId: string,
  memberId: string,
): Promise<PetTeamMemberDto> {
  return apiFetch<PetTeamMemberDto>(
    `/v1/pet/team/${encodeURIComponent(parentLivingPetId)}/members/${encodeURIComponent(memberId)}/pause`,
    { method: 'PUT' },
  );
}

export async function resumeTeamMember(
  parentLivingPetId: string,
  memberId: string,
): Promise<PetTeamMemberDto> {
  return apiFetch<PetTeamMemberDto>(
    `/v1/pet/team/${encodeURIComponent(parentLivingPetId)}/members/${encodeURIComponent(memberId)}/resume`,
    { method: 'PUT' },
  );
}

export async function revokeTeamMember(
  parentLivingPetId: string,
  memberId: string,
): Promise<PetTeamMemberDto> {
  return apiFetch<PetTeamMemberDto>(
    `/v1/pet/team/${encodeURIComponent(parentLivingPetId)}/members/${encodeURIComponent(memberId)}`,
    { method: 'DELETE' },
  );
}
