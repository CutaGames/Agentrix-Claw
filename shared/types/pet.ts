/**
 * Agentrix ClawBuddy · Pet Soul × Skin SSoT (Phase 1)
 *
 * 跨端共享类型源。Backend / Desktop / Mobile / Web 必须 import 本文件，
 * 不得复制定义。对应 PRD：
 *   docs/PRD_DESKTOP_PET_AGENTRIX_CLAW.zh-CN.md §2.1 §3.1
 *   docs/PRD_PET_6_CLANS_PERSONA.zh-CN.md §1
 *   docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md Phase 1
 *
 * 灵魂层 (Soul) = 人格、专长、口吻、行为倾向（绑定 user_id，不可让渡）
 * 皮肤层 (Skin) = 视觉外观（VRM / Rive 资产，可上架 / 交易 / 租赁）
 * 绑定关系：1 LivingPet ↔ 1 SoulTemplate ↔ 1 ActiveSkin
 *
 * 版本: v1.0
 * 创建: 2026-05-06 (Phase 1 W1)
 */

// ============================================================
// §1 6 族群（PetClan）
// ============================================================

export type PetClan =
  | 'A_office'   // 办公军团 (7 只: Claw / Tinker / Sentry / Hawk / Owl / Fox / Dragon)
  | 'B_life'     // 生活伙伴 (5 只: Sprout / Mochi / Bunbun / Coco / Nova)
  | 'C_learn'    // 学习成长 (4 只: Pino / Lumi / Sage / Pixel)
  | 'D_play'     // 娱乐玩伴 (4 只: Goblin / Vibe / Pixel-G / Otaku)
  | 'E_web3'     // Web3 投资 (4 只: Whale / Diamond / Bull / Doge-X)
  | 'F_family';  // 家庭亲情 (3 只: Teddy / Granny / Furry)

export const PET_CLAN_LABELS: Record<PetClan, { zh: string; en: string }> = {
  A_office: { zh: '办公军团', en: 'Office Squad' },
  B_life:   { zh: '生活伙伴', en: 'Life Partners' },
  C_learn:  { zh: '学习成长', en: 'Learning Growth' },
  D_play:   { zh: '娱乐玩伴', en: 'Play Crew' },
  E_web3:   { zh: 'Web3 投资', en: 'Web3 Investors' },
  F_family: { zh: '家庭亲情', en: 'Family Care' },
};

/**
 * Single-letter clan code (A..F) used by visual renderers (sprite gradients,
 * Rive asset keys) that predate the canonical `A_office..F_family` slugs.
 * This is the ONE authoritative bridge between the two representations so we
 * don't scatter ad-hoc `as 'A'|'B'|'C'` casts across the mobile/web/desktop
 * clients (see audit: clan dual-track P1).
 */
export type PetClanShortCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

const CLAN_SHORT_CODE: Record<PetClan, PetClanShortCode> = {
  A_office: 'A',
  B_life: 'B',
  C_learn: 'C',
  D_play: 'D',
  E_web3: 'E',
  F_family: 'F',
};

/**
 * Map a canonical PetClan (or anything that starts with a known prefix, or
 * an already-short 'A'..'F') to its single-letter renderer code. Falls back
 * to 'A' (the default office/kitsune clan) for unknown/missing input so
 * renderers never receive an invalid key.
 */
export function clanShortCode(clan: string | null | undefined): PetClanShortCode {
  if (!clan) return 'A';
  if (clan in CLAN_SHORT_CODE) return CLAN_SHORT_CODE[clan as PetClan];
  const first = clan.charAt(0).toUpperCase();
  if (first >= 'A' && first <= 'F') return first as PetClanShortCode;
  return 'A';
}

// ============================================================
// §2 灵魂模板（SoulTemplate）
// ============================================================

/** 灵魂模板 ID（snake_case，对应 seed slug） */
export type PetSoulTemplateId = string;

export type PetTier = 'high_arpu' | 'high_dau' | 'edu' | 'viral' | 'web3' | 'family';

export type PetAgeRating = 'all' | '13+' | '18+';

export interface PetSoulTemplate {
  /** slug，如 'claw' / 'tinker' / 'whale' */
  id: PetSoulTemplateId;
  clan: PetClan;
  /** 显示名（zh-CN 默认） */
  displayName: string;
  /** 英文名 */
  displayNameEn: string;
  /** 一句话标语 */
  tagline: string;
  /** 人格原型，如 ENTJ / INTP */
  archetype: string;
  /** 口吻关键词 */
  toneKeywords: string[];
  /** 禁止口吻 */
  forbiddenTone: string[];
  /** LLM system prompt 模板（含变量占位） */
  systemPromptTemplate: string;
  /** 默认接单标签 */
  defaultSkillTags: string[];
  /** 工具白名单（对应 ToolPermissionRegistry） */
  toolWhitelist: string[];
  /** 单宠物日 / 单任务预算（USD），由订阅计划进一步收紧 */
  budgetDailyUSD: number;
  budgetPerTaskUSD: number;
  /** 默认 idle 情绪 */
  defaultIdleEmotion: string;
  /** 情绪倾向分布（10 情绪 → 0-1 概率，和应 ≤ 1） */
  emotionTendency: Record<string, number>;
  /** 推荐皮肤关键词（PetCreator 推荐 prompt） */
  recommendedSkinTags: string[];
  /** 营销 Hook */
  marketingHook: string;
  /** 商业层级 */
  tier: PetTier;
  /** 年龄分级 */
  ageRating: PetAgeRating;
  /** 合规标记，如 ['coppa', 'kyc_required'] */
  complianceFlags: string[];
  /** 模板版本（内容修订时递增） */
  version: number;
}

// ============================================================
// §3 皮肤资产（PetSkin）
// ============================================================

export type PetSkinSource =
  | 'platform'    // 平台 dogfood 默认
  | 'generated'   // 用户用 PetCreator 生成
  | 'purchased'   // Marketplace 购买
  | 'remixed'     // 双图融合二创
  | 'gifted';     // 赠送

export type PetSkinFormat = 'svg' | 'rive' | 'vrm' | 'live2d';

export interface PetSkinManifest {
  /** 格式 */
  format: PetSkinFormat;
  /** 资源主 URL（.vrm / .riv / .svg） */
  url: string;
  /** 缩略图 */
  thumbnailUrl?: string;
  /** 多边形数（VRM 用，用于保真度匹配） */
  polyCount?: number;
  /** 是否含 PBR 材质 */
  pbr?: boolean;
  /** BlendShape 标准映射校验是否通过（happy/sad/angry/.../busy/earn） */
  blendShapeStandard?: boolean;
  /** 资源大小 (bytes) */
  bytes?: number;
}

export interface PetSkinRef {
  /** skin id (uuid) */
  id: string;
  /** 拥有者 user_id */
  ownerUserId: string;
  /** 来源 */
  source: PetSkinSource;
  /** 显示名 */
  displayName: string;
  /** 资源清单 */
  manifest: PetSkinManifest;
  /** 关联的生成任务（来自 pet_generation_tasks）或购买记录 */
  sourceRefId?: string;
  /** 修订版本 */
  version: number;
  /** 创建时间 (unix ms) */
  createdAt: number;
}

// ============================================================
// §4 LivingPet 扩展（v1 → v2 字段补充）
// ============================================================

/** PetState 扩展字段（叠加于 agentrix-presence.ts 的 PetState） */
export interface PetSoulSkinSnapshot {
  /** 当前灵魂模板 id（如 'claw'） */
  soul_template_id: PetSoulTemplateId | null;  /** 当前激活皮肤 id（uuid） */
  active_skin_id: string | null;
  /** 用户对默认 SystemPrompt 的覆写片段 */
  personality_overrides: Record<string, unknown>;
}

// ============================================================
// §5 Realtime topic 名称（Phase 1 新增）
// ============================================================

// 2026-05-10 cleanup: the canonical `PET_PRESENCE_TOPICS` + `PetPresenceTopic`
// live in `./pet-presence.ts` (richer 10-topic schema). Removing the
// narrower 3-topic duplicate that used to live here to fix the barrel
// re-export conflict (TS2308).

// ============================================================
// §6 API 输入 / 输出 DTO
// ============================================================

export interface SwitchSoulInput {
  templateId: PetSoulTemplateId;
}

export interface ActivateSkinInput {
  skinId: string;
}

export interface ListSoulsQuery {
  /** 按族群过滤 */
  clan?: PetClan;
  /** 按订阅计划过滤（隐藏不可解锁的） */
  planLevel?: 'free' | 'pro' | 'pro_plus' | 'enterprise';
}
