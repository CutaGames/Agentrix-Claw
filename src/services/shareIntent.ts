/**
 * shareIntent — 统一分享意图 → { ShareCardView props, 带归因的 URL, 归因元数据 }。
 *
 * spec: .kiro/specs/unified-growth-attribution-layer/{requirements,design}.md（Task 1）
 *
 * 复用不重建:
 *   - 海报渲染复用 `src/components/ShareCardView.tsx`(参数化模板,本文件只产出其 props)。
 *   - 归因复用 `GrowthModule`(attributionRef 贯穿 分享→落地→转化);URL 用 `?ref=<attributionRef>`
 *     与既有 referral `?ref` 归一。
 *
 * 各来源(prediction/digest/marketplace/creation/referral/invite/pet)只写一个薄 mapper
 * 产出 {@link ShareIntent},再统一经 {@link buildShareIntent} 产出 props + attributedUrl。
 *
 * 纯逻辑、无 RN 依赖(ShareCardProps 为 type-only 引入,编译期擦除)→ 可 node 单测。
 */

import type { ShareCardProps } from '../components/ShareCardView';

/** 归因来源类型(与后端 GrowthSourceType 对齐)。 */
export type ShareSourceType =
  | 'creation'
  | 'prediction'
  | 'digest'
  | 'marketplace'
  | 'referral'
  | 'invite'
  | 'pet'
  | 'other';

/** 站点基址(与 shareCard.ts / POSTER_SITE_BASE 一致的对外域名)。 */
export const SHARE_SITE_BASE = 'https://agentrix.top';

/**
 * 统一分享意图 —— 各来源 mapper 的产物。槽位与 ShareCardView 对齐(按来源填其一部分)。
 */
export interface ShareIntent {
  sourceType: ShareSourceType;
  /** 来源实体 id(creationId/marketId/listingId/date/skinId…);无自然 id 可空。 */
  sourceEntityId?: string;
  /** 落地目标路径(如 `/lsm/market/123`、`/c/ABC`、`/digest/2026-07-05`)。 */
  targetPath: string;
  /** 归因标识;缺省时由 builder 生成稳定短码。 */
  attributionRef?: string;
  /** 分享渠道(social/copy/qr…)。 */
  channel?: string;

  // ── ShareCardView 槽位(按来源选填)──
  title?: string;
  subtitle?: string;
  description?: string;
  headerEmoji?: string;
  imageUrl?: string;
  categoryLabel?: string;
  priceLabel?: string;
  priceCaption?: string;
  statsLabel?: string;
  statsCaption?: string;
  tags?: string[];
  userName?: string;
  ctaLabel?: string;
  accentFrom?: string;
  accentTo?: string;
  leftImageUrl?: string;
  rightImageUrl?: string;
  oddsList?: ShareCardProps['oddsList'];
}

/** buildShareIntent 产物。 */
export interface BuiltShareIntent {
  /** 直接喂 ShareCardView。 */
  shareCardProps: ShareCardProps;
  /** 带 `?ref=<attributionRef>` 的分享 URL。 */
  attributedUrl: string;
  sourceType: ShareSourceType;
  sourceEntityId?: string;
  attributionRef: string;
}

/**
 * 从来源信息派生稳定短码(6–12 位大写字母数字):有自然 id → 基于 (sourceType,id) 确定性派生;
 * 否则回退时间戳 + 随机。确定性保证同一实体多次分享归因一致。
 */
export function deriveAttributionRef(sourceType: string, sourceEntityId?: string): string {
  if (sourceEntityId && sourceEntityId.trim()) {
    let h = 0;
    const seed = `${sourceType}:${sourceEntityId}`;
    for (let i = 0; i < seed.length; i++) {
      h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    }
    // 32-bit hash → base36 大写,补足到 8 位。
    const code = h.toString(36).toUpperCase().padStart(8, '0').slice(0, 8);
    return code;
  }
  return (
    Date.now().toString(36).toUpperCase().slice(-6) +
    Math.random().toString(36).toUpperCase().slice(2, 4)
  ).slice(0, 8);
}

/** 拼接带归因的 URL:targetPath 已带 query 用 &,否则用 ?。 */
export function appendRef(targetPath: string, attributionRef: string, base = SHARE_SITE_BASE): string {
  const path = targetPath.startsWith('http') ? targetPath : `${base}${targetPath.startsWith('/') ? '' : '/'}${targetPath}`;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}ref=${encodeURIComponent(attributionRef)}`;
}

/**
 * 统一构造:ShareIntent → { ShareCardView props, attributedUrl, 归因元数据 }。
 * 无 attributionRef 时生成稳定短码(Requirement 1.5);URL 一律带 `?ref`(Requirement 1.2)。
 */
export function buildShareIntent(intent: ShareIntent): BuiltShareIntent {
  const attributionRef = intent.attributionRef?.trim() || deriveAttributionRef(intent.sourceType, intent.sourceEntityId);
  const attributedUrl = appendRef(intent.targetPath, attributionRef);

  const shareCardProps: ShareCardProps = {
    shareUrl: attributedUrl,
    title: intent.title,
    subtitle: intent.subtitle,
    description: intent.description,
    headerEmoji: intent.headerEmoji,
    imageUrl: intent.imageUrl,
    categoryLabel: intent.categoryLabel,
    priceLabel: intent.priceLabel,
    priceCaption: intent.priceCaption,
    statsLabel: intent.statsLabel,
    statsCaption: intent.statsCaption,
    tags: intent.tags,
    userName: intent.userName,
    ctaLabel: intent.ctaLabel,
    accentFrom: intent.accentFrom,
    accentTo: intent.accentTo,
    leftImageUrl: intent.leftImageUrl,
    rightImageUrl: intent.rightImageUrl,
    oddsList: intent.oddsList,
  };

  return {
    shareCardProps,
    attributedUrl,
    sourceType: intent.sourceType,
    sourceEntityId: intent.sourceEntityId,
    attributionRef,
  };
}

// ============================================================
// 各来源薄 mapper（领域字段 → ShareIntent）。参数用最小显式字段,不耦合领域实体,保持纯 + 可测。
// 各调用屏把本地已有字段传入,再 buildShareIntent(mapper(...)) 喂 ShareCardView + 归因。
// ============================================================

/** prediction（LSM/世界杯赔率）→ ShareIntent（Task 2）。 */
export function predictionToShareIntent(p: {
  marketId: string;
  title: string;
  subtitle?: string;
  oddsList?: ShareCardProps['oddsList'];
  homeImageUrl?: string;
  awayImageUrl?: string;
  channel?: string;
}): ShareIntent {
  return {
    sourceType: 'prediction',
    sourceEntityId: p.marketId,
    targetPath: `/lsm/market/${encodeURIComponent(p.marketId)}`,
    title: p.title,
    subtitle: p.subtitle ?? '赔率 · 隐含概率',
    headerEmoji: '🔮',
    oddsList: p.oddsList,
    leftImageUrl: p.homeImageUrl,
    rightImageUrl: p.awayImageUrl,
    channel: p.channel,
    accentFrom: '#5B8CFF',
    accentTo: '#7C3AED',
  };
}

/** 集市日报（digest）→ ShareIntent（Task 3）。 */
export function digestToShareIntent(p: {
  date: string;
  title?: string;
  statsLabel?: string;
  channel?: string;
}): ShareIntent {
  return {
    sourceType: 'digest',
    sourceEntityId: p.date,
    targetPath: `/digest/${encodeURIComponent(p.date)}`,
    title: p.title ?? `Agentrix 机会日报 · ${p.date}`,
    headerEmoji: '🗞️',
    statsLabel: p.statsLabel,
    statsCaption: '今日亮点',
    channel: p.channel,
  };
}

/** 集市机会（opportunity）→ ShareIntent（Task 3）。externalUrl 优先,否则站内 /opportunity/:urn。 */
export function opportunityToShareIntent(p: {
  identifier: string;
  title: string;
  categoryLabel?: string;
  priceLabel?: string;
  statsLabel?: string;
  headerEmoji?: string;
  externalUrl?: string;
  channel?: string;
}): ShareIntent {
  return {
    sourceType: 'marketplace',
    sourceEntityId: p.identifier,
    targetPath: p.externalUrl || `/opportunity/${encodeURIComponent(p.identifier)}`,
    title: p.title,
    categoryLabel: p.categoryLabel,
    priceLabel: p.priceLabel,
    statsLabel: p.statsLabel,
    headerEmoji: p.headerEmoji ?? '🌐',
    channel: p.channel,
  };
}

/** 推荐/短链（referral）→ ShareIntent（Task 4）。ref 归一为 attributionRef,复用既有佣金归因。 */
export function referralToShareIntent(p: {
  refCode: string;
  targetPath?: string;
  title?: string;
  userName?: string;
  channel?: string;
}): ShareIntent {
  return {
    sourceType: 'referral',
    sourceEntityId: p.refCode,
    attributionRef: p.refCode, // 归一:referral ?ref 即 attributionRef
    targetPath: p.targetPath ?? '/',
    title: p.title ?? '加入 Agentrix · 拥有你自己的 agent',
    subtitle: '你邀请的人和你都能赚 AXP',
    headerEmoji: '🎁',
    userName: p.userName,
    channel: p.channel,
  };
}

/** 共养邀请（co-raising invite）→ ShareIntent（Task 4）。 */
export function inviteToShareIntent(p: {
  inviteCode: string;
  petName?: string;
  userName?: string;
  channel?: string;
}): ShareIntent {
  return {
    sourceType: 'invite',
    sourceEntityId: p.inviteCode,
    attributionRef: p.inviteCode,
    targetPath: `/invite/${encodeURIComponent(p.inviteCode)}`,
    title: p.petName ? `帮我喂养「${p.petName}」` : '帮我一起共养 AI 宠物',
    subtitle: '一起喂养 · 未来收益按比例分你',
    headerEmoji: '🐾',
    userName: p.userName,
    channel: p.channel,
  };
}

/** 宠物皮肤（pet skin）→ ShareIntent（Task 5）。 */
export function petSkinToShareIntent(p: {
  skinId: string;
  name: string;
  imageUrl?: string;
  rarityLabel?: string;
  priceLabel?: string;
  channel?: string;
}): ShareIntent {
  return {
    sourceType: 'pet',
    sourceEntityId: p.skinId,
    targetPath: `/market/skin/${encodeURIComponent(p.skinId)}`,
    title: p.name,
    imageUrl: p.imageUrl,
    headerEmoji: '🎨',
    categoryLabel: p.rarityLabel,
    priceLabel: p.priceLabel,
    channel: p.channel,
  };
}
