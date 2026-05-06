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

/** V4 §3.2 — 从市场安装皮肤到当前用户衣柜 */
export async function installMarketplaceSkin(skinId: string): Promise<PetSkinSummary> {
  const res = await apiFetch<{ skin: PetSkinSummary }>(
    `/v1/pet/skins/marketplace/${encodeURIComponent(skinId)}/install`,
    { method: 'POST', body: JSON.stringify({}) },
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
