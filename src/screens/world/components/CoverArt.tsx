/**
 * CoverArt — 无预览图 / 封面不可渲染时的**生成式兜底封面**(跨屏共享)。
 *
 * spec: .kiro/specs/world-growth-mobile-experience/{requirements,design}.md
 *   - R7.5 / Property 5「卡片永不黑屏」:任意封面缺失 / 非 https / `generated://` 句柄 /
 *     加载失败时,以「确定性渐变 + 大表意图标 + 标题 + 类型角标」渲染可读占位,绝不黑屏。
 *
 * 由 world-creation-feed task 3.4 的 `CreationCard` 内联实现抽出为**单一来源**,
 * 供:
 *   - Feed 卡体 `CreationCard`(全屏沉浸封面,task 5.2 三态的 error 分支);
 *   - `CreationDetailScreen` 详情封面(world-growth-mobile-experience task 6.1)。
 * 两处复用同一渐变/图标/标题口径,避免重复实现与视觉漂移。
 *
 * 纯展示组件:无副作用、无数据请求;渐变色按 `id`(退化用 `title`)哈希确定性挑选,
 * 保证同一创作的兜底封面稳定不闪烁。
 */
import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import type { CreationType } from '../../../../shared/types/creation';

/** 创作类型 → 预览占位表意 emoji(无预览图时的轻量兜底)。 */
export const TYPE_EMOJI: Record<CreationType, string> = {
  game: '🎮',
  drama: '🎭',
  shop: '🛒',
  livestream: '🔴',
  stage: '🎤',
  place: '🚪',
};

/** 创作类型 → 角标中文短标签(封面右上)。 */
export const TYPE_LABEL: Record<CreationType, string> = {
  game: '游戏',
  drama: '互动剧',
  shop: '店铺',
  livestream: '直播',
  stage: '舞台',
  place: '场所',
};

/** 一组沉稳的封面渐变色(按 id 哈希确定性挑选,保证同一创作封面稳定)。 */
export const COVER_PALETTES: [string, string][] = [
  ['#4b2a6b', '#7c3aed'],
  ['#1e3a8a', '#2563eb'],
  ['#0f5132', '#16a34a'],
  ['#7a3b2e', '#ea580c'],
  ['#4a148c', '#c2185b'],
  ['#0e3a4a', '#0891b2'],
  ['#3a1f3d', '#9d174d'],
];

/** 确定性哈希:把字符串映射到 [0, mod) 的下标(挑渐变色 / emoji)。 */
export function hashIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

/** 按标题关键字挑一个更贴题的封面图标(避免所有游戏都是同一个 🎮)。 */
export function pickCoverEmoji(title: string, fallback: string): string {
  const s = (title || '').toLowerCase();
  const rules: [RegExp, string][] = [
    [/2048/, '🔢'],
    [/俄罗斯方块|tetris|方块/, '🧱'],
    [/五子棋|gomoku|围棋|象棋|棋/, '⚫'],
    [/消消乐|match|宝石|消除/, '💎'],
    [/飞行射击|雷电|射击|shoot|弹幕|战机/, '🚀'],
    [/pong|弹球|乒乓|打砖块|breakout/, '🏓'],
    [/hextris|六边形|hex/, '🔷'],
    [/塔防|tower\s*defense/, '🗼'],
    [/贪吃蛇|snake/, '🐍'],
    [/扑克|poker|德州|纸牌|card/, '🃏'],
    [/赛车|race|racing|drift/, '🏎️'],
    [/拼图|puzzle|益智/, '🧩'],
    [/迷宫|maze/, '🧭'],
    [/钢琴|音乐|music|节奏|rhythm/, '🎹'],
    [/恋爱|心动|甜宠|romance|爱情/, '💗'],
    [/悬疑|推理|侦探|mystery|案/, '🕵️'],
    [/剧|drama|story/, '🎭'],
  ];
  for (const [re, emoji] of rules) if (re.test(s)) return emoji;
  return fallback;
}

export interface CoverArtProps {
  /** 创作 id(优先用于挑渐变色,保证稳定)。 */
  id: string;
  /** 标题(渲染在封面中央 + 退化用于挑色)。 */
  title: string;
  /** 中央大表意图标(建议用 {@link pickCoverEmoji} 依标题挑选)。 */
  emoji: string;
  /** 右上类型角标短标签(可空时不渲染)。 */
  typeLabel: string;
  /** 容器样式覆盖(Feed 用 absoluteFill 全屏;详情用固定高 banner)。 */
  style?: StyleProp<ViewStyle>;
}

/**
 * CoverArt — 生成式兜底封面(确定性渐变 + 大表意图标 + 标题 + 类型角标)。
 * 让所有缺图 / 封面不可渲染的种子/创作都有一个像样的“封面”,分享海报与卡片均受益
 * (无需后端/图床)。绝不黑屏(R7.5)。
 */
export function CoverArt({ id, title, emoji, typeLabel, style }: CoverArtProps) {
  const [c1, c2] = COVER_PALETTES[hashIndex(id || title, COVER_PALETTES.length)];
  return (
    <View style={[styles.coverBase, { backgroundColor: c1 }, style]}>
      <View style={[styles.coverHalf, { backgroundColor: c1 }]} />
      <View style={[styles.coverHalf, { backgroundColor: c2 }]} />
      <View style={styles.coverOverlay} pointerEvents="none">
        {typeLabel ? (
          <View style={styles.coverTypeChip}>
            <Text style={styles.coverTypeText}>{typeLabel}</Text>
          </View>
        ) : null}
        <Text style={styles.coverEmoji}>{emoji}</Text>
        <Text style={styles.coverTitle} numberOfLines={2}>
          {title}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 容器:纵向两段渐变(上 c1 / 下 c2)。尺寸由调用方经 style 提供
  // (Feed:absoluteFill 全屏;详情:固定高 banner)。overflow hidden 裁剪圆角。
  coverBase: { overflow: 'hidden' },
  coverHalf: { flex: 1 },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  coverTypeChip: {
    position: 'absolute',
    top: '18%',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  coverTypeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  coverEmoji: {
    fontSize: 96,
    marginBottom: 18,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  coverTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
});

export default CoverArt;
