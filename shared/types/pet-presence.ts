/**
 * Agentrix Pet Presence — Cross-End Realtime Event Contract (P0-1)
 *
 * 跨端唯一的宠物实时事件契约。后端 emit / 三端 subscribe 必须 import 本文件，
 * 不得在客户端各自硬编码 topic 字符串或 payload 形状。
 *
 * 来源审计：docs/PET_PHASE6_P0-P2_REMEDIATION_PLAN_2026-05-08.zh-CN.md
 *
 *   后端 producers:
 *     - living-pet.service.ts          presence:pet.state / soul.changed / skin.changed
 *     - pet-companion-engine.service   presence:pet.proactive
 *     - pet-energy.service             presence:pet.energy
 *     - pet-achievement.service        presence:pet.achievement.unlocked
 *     - pet-memory-album.service       presence:pet.memory.added
 *     - pet-breeding.service           presence:pet.breeding.invited / hatching / hatched
 *
 *   传输：emitDesktopSyncEvent → desktopSyncEventBus → PresenceGateway
 *         → server.to(`user:${userId}`).emit(event, payload)
 *
 *   客户端：socket.io-client('/presence', { auth: { token, deviceId, deviceType } })
 *
 * 版本: v1.0
 * 创建: 2026-05-08 (Pet Phase 6 P0)
 */

import type { PetEmotion, EmotionIntensity, PetState } from './agentrix-presence';

// ============================================================
// §1 事件枚举 — 所有 presence:pet.* 必须列在这里
// ============================================================

export const PET_PRESENCE_TOPICS = {
  STATE: 'presence:pet.state',
  SOUL_CHANGED: 'presence:pet.soul.changed',
  SKIN_CHANGED: 'presence:pet.skin.changed',
  PROACTIVE: 'presence:pet.proactive',
  ENERGY: 'presence:pet.energy',
  ACHIEVEMENT_UNLOCKED: 'presence:pet.achievement.unlocked',
  MEMORY_ADDED: 'presence:pet.memory.added',
  BREEDING_INVITED: 'presence:pet.breeding.invited',
  BREEDING_HATCHING: 'presence:pet.breeding.hatching',
  BREEDING_HATCHED: 'presence:pet.breeding.hatched',
  /** P2-6 远程社交动作（visit / touch / feed / co_play） */
  SOCIAL_VISIT: 'presence:pet.social.visit',
} as const;

export type PetPresenceTopic =
  (typeof PET_PRESENCE_TOPICS)[keyof typeof PET_PRESENCE_TOPICS];

// ============================================================
// §2 各事件 payload 形状
//
// 所有字段使用 snake_case，与后端 emitDesktopSyncEvent 调用点一致。
// 客户端务必按本文件类型解析；新增字段时先改本文件，再改 producer/consumer。
// ============================================================

/** presence:pet.state — 宠物核心状态（情绪 + 亲密度 + 当前灵魂/皮肤） */
export type PetStatePayload = PetState;

export interface PetSoulChangedPayload {
  pet_id: string;
  user_id: string;
  soul_template_id: string | null;
  updated_at: number;
}

export interface PetSkinChangedPayload {
  user_id: string;
  active_skin_id: string;
  updated_at: number;
}

export interface PetProactivePayload {
  event_id: string;
  kind: string;
  title: string;
  body: string;
  cta: string | null;
  intimacy_level: number;
  sent_at: number;
}

export interface PetEnergyPayload {
  pet_skin_id: string;
  energy: number;
  energy_max: number;
  daily_spend_cents: number;
  paused: boolean;
  paused_reason: string | null;
  updated_at: number;
}

export interface PetAchievementUnlockedPayload {
  key: string;
  label_zh: string;
  label_en: string;
  icon: string;
  unlocked_at: number;
}

export interface PetMemoryAddedPayload {
  id: string;
  category: string;
  title: string;
  thumbnail_url: string;
  created_at: number;
}

export interface PetBreedingInvitedPayload {
  egg_id: string;
  initiator_user_id: string;
}

export interface PetBreedingHatchingPayload {
  egg_id: string;
  hatch_at: string;
}

export interface PetBreedingHatchedPayload {
  egg_id: string;
  /** 该端用户领到的幼崽皮肤 id（initiator/partner 不同） */
  child_skin_id: string | null;
  /** 兼容字段：旧 producer 曾使用 pet_id / owner_id，新代码统一走 child_skin_id。*/
  pet_id?: string;
  owner_id?: string;
}

/**
 * P2-6 远程社交动作 —— 来自其他用户对本宠物的访问、抚摸、投喂、共玩邀请。
 */
export type PetSocialAction = 'visit' | 'touch' | 'feed' | 'co_play';

export interface PetSocialVisitPayload {
  pet_id: string;
  /** 接收方（被访问的宠物所有者） */
  owner_user_id: string;
  /** 发起方匿名/公开身份 */
  visitor_user_id: string;
  visitor_display_name?: string | null;
  action: PetSocialAction;
  /** 投喂/抚摸时的能量增益（已写入 energy ledger） */
  energy_delta?: number;
  /** 自由文本（最多 80 字符） */
  message?: string | null;
  created_at: number;
}

// ============================================================
// §3 Topic → Payload 映射（用于 typed dispatcher / hook）
// ============================================================

export interface PetPresenceEventMap {
  [PET_PRESENCE_TOPICS.STATE]: PetStatePayload;
  [PET_PRESENCE_TOPICS.SOUL_CHANGED]: PetSoulChangedPayload;
  [PET_PRESENCE_TOPICS.SKIN_CHANGED]: PetSkinChangedPayload;
  [PET_PRESENCE_TOPICS.PROACTIVE]: PetProactivePayload;
  [PET_PRESENCE_TOPICS.ENERGY]: PetEnergyPayload;
  [PET_PRESENCE_TOPICS.ACHIEVEMENT_UNLOCKED]: PetAchievementUnlockedPayload;
  [PET_PRESENCE_TOPICS.MEMORY_ADDED]: PetMemoryAddedPayload;
  [PET_PRESENCE_TOPICS.BREEDING_INVITED]: PetBreedingInvitedPayload;
  [PET_PRESENCE_TOPICS.BREEDING_HATCHING]: PetBreedingHatchingPayload;
  [PET_PRESENCE_TOPICS.BREEDING_HATCHED]: PetBreedingHatchedPayload;
  [PET_PRESENCE_TOPICS.SOCIAL_VISIT]: PetSocialVisitPayload;
}

export type PetPresenceEventName = keyof PetPresenceEventMap;
export type PetPresencePayloadOf<T extends PetPresenceEventName> = PetPresenceEventMap[T];

/** Discriminated union of every pet presence event (event + payload). */
export type PetPresenceEvent = {
  [K in PetPresenceEventName]: { event: K; payload: PetPresenceEventMap[K] };
}[PetPresenceEventName];

// ============================================================
// §4 Helpers — 类型守卫与列表
// ============================================================

export const PET_PRESENCE_TOPIC_LIST: PetPresenceTopic[] = Object.values(PET_PRESENCE_TOPICS);

export function isPetPresenceTopic(s: string): s is PetPresenceTopic {
  return (PET_PRESENCE_TOPIC_LIST as string[]).includes(s);
}

// ============================================================
// §5 客户端 handshake 约定
//
// 所有非桌面客户端连接 `/presence` namespace 必须遵守同一握手约定，
// 与 desktop/src/services/agentPresence.ts 保持一致。
// ============================================================

export interface PetPresenceHandshakeAuth {
  /** 用户 JWT */
  token: string;
  /** 设备唯一 id（mobile uuid / web sessionStorage） */
  deviceId: string;
  /** 设备类型 */
  deviceType: 'desktop' | 'web' | 'mobile' | 'watch' | 'glass';
  /** 浏览器/平台标识 */
  platform?: string;
  /** 友好名 */
  deviceName?: string;
  /** 客户端版本 */
  appVersion?: string;
  /** 能力声明，仅用于 PresenceGateway 上线广播 */
  capabilities?: string[];
}

// 重新导出基础情绪类型，方便客户端只 import 本文件即可拿到完整宠物事件类型
export type { PetEmotion, EmotionIntensity, PetState };

// 兼容旧代码：PetPresenceTopicConst 别名
export const PRESENCE_PET_STATE = PET_PRESENCE_TOPICS.STATE;
export const PRESENCE_PET_SOUL_CHANGED = PET_PRESENCE_TOPICS.SOUL_CHANGED;
export const PRESENCE_PET_SKIN_CHANGED = PET_PRESENCE_TOPICS.SKIN_CHANGED;
export const PRESENCE_PET_PROACTIVE = PET_PRESENCE_TOPICS.PROACTIVE;
export const PRESENCE_PET_ENERGY = PET_PRESENCE_TOPICS.ENERGY;
export const PRESENCE_PET_ACHIEVEMENT_UNLOCKED = PET_PRESENCE_TOPICS.ACHIEVEMENT_UNLOCKED;
export const PRESENCE_PET_MEMORY_ADDED = PET_PRESENCE_TOPICS.MEMORY_ADDED;
export const PRESENCE_PET_BREEDING_INVITED = PET_PRESENCE_TOPICS.BREEDING_INVITED;
export const PRESENCE_PET_BREEDING_HATCHING = PET_PRESENCE_TOPICS.BREEDING_HATCHING;
export const PRESENCE_PET_BREEDING_HATCHED = PET_PRESENCE_TOPICS.BREEDING_HATCHED;
export const PRESENCE_PET_SOCIAL_VISIT = PET_PRESENCE_TOPICS.SOCIAL_VISIT;
