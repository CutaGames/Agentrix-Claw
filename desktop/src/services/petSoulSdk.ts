/**
 * Pet Soul SDK (Desktop · Phase 1)
 *
 * 灵魂层（族群人格）操作。Phase 1 W1-W2 落地。
 *
 * 后端契约：
 *   GET  /api/v1/pet/souls?clan=A_office
 *   GET  /api/v1/pet/souls/:id
 *   POST /api/v1/pet/soul/switch    body: { templateId }
 *   GET  /api/v1/pet/skins
 *   POST /api/v1/pet/skin/activate  body: { skinId }
 *
 * Realtime topic（已通过 agentPresence.ts 转发到 window 事件）：
 *   presence:pet.soul.changed   →  agentrix:pet-soul-changed
 *   presence:pet.skin.changed   →  agentrix:pet-skin-changed
 *
 * PRD: docs/PRD_DESKTOP_PET_AGENTRIX_CLAW.zh-CN.md §2.1 §3.1
 */
import { API_BASE, useAuthStore } from "./store";
import type { PetClan, PetSoulTemplate } from "../../../shared/types/pet";

export type { PetClan, PetSoulTemplate } from "../../../shared/types/pet";

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
  source: "platform" | "generated" | "purchased" | "remixed" | "gifted";
  display_name: string;
  url: string;
  thumbnail_url: string | null;
  format: "svg" | "rive" | "vrm" | "live2d";
  manifest: Record<string, unknown>;
  created_at: number;
}

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  if (!token) throw new Error("not authenticated");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function asJson<T>(resp: Response, label: string): Promise<T> {
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`${label} failed (${resp.status}): ${body || resp.statusText}`);
  }
  return resp.json() as Promise<T>;
}

/** 列出可用灵魂模板（Phase 1: A 族群 7 只） */
export async function listSouls(opts: { clan?: PetClan } = {}): Promise<PetSoulSummary[]> {
  const url = new URL(`${API_BASE}/v1/pet/souls`);
  if (opts.clan) url.searchParams.set("clan", opts.clan);
  const resp = await fetch(url.toString(), { headers: authHeaders() });
  const json = await asJson<{ items: PetSoulSummary[] }>(resp, "listSouls");
  return json.items ?? [];
}

/** 获取单只灵魂模板（含完整 system prompt 模板，用于详情面板） */
export async function getSoul(id: string): Promise<PetSoulTemplate & { id: string }> {
  const resp = await fetch(`${API_BASE}/v1/pet/souls/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
  });
  return asJson<PetSoulTemplate & { id: string }>(resp, "getSoul");
}

/**
 * 切换灵魂。
 * 后端契约：保留 intimacy / xp / 记忆 / 钱包；广播 pet.soul.changed + pet.state。
 */
export async function switchSoul(templateId: string): Promise<void> {
  const resp = await fetch(`${API_BASE}/v1/pet/soul/switch`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ templateId }),
  });
  await asJson(resp, "switchSoul");
}

/** 当前用户拥有的皮肤（含平台共享） */
export async function listSkins(): Promise<PetSkinSummary[]> {
  const resp = await fetch(`${API_BASE}/v1/pet/skins`, { headers: authHeaders() });
  const json = await asJson<{ items: PetSkinSummary[] }>(resp, "listSkins");
  return json.items ?? [];
}

/** 当前激活皮肤 id */
export async function getActiveSkinId(): Promise<string | null> {
  const resp = await fetch(`${API_BASE}/v1/pet/skins/active`, { headers: authHeaders() });
  const json = await asJson<{ active_skin_id: string | null }>(resp, "getActiveSkinId");
  return json.active_skin_id ?? null;
}

/** 激活某只皮肤 */
export async function activateSkin(skinId: string): Promise<void> {
  const resp = await fetch(`${API_BASE}/v1/pet/skin/activate`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ skinId }),
  });
  await asJson(resp, "activateSkin");
}
