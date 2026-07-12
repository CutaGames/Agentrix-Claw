// 技能卡片组件 — 含评分/点赞/使用人数/🤖Agent标识/推广按钮/分佣标识
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { SkillItem, marketplaceApi } from '../../services/marketplace.api';
import { themedStyles } from '../../theme/useTheme';

interface Props {
  skill: SkillItem;
  onPress: () => void;
  onPromote: () => void;
  onInstallToAgent?: () => void;
  showInstallBtn?: boolean;
}

export function SkillCard({ skill, onPress, onPromote, onInstallToAgent, showInstallBtn }: Props) {
  const [liked, setLiked] = useState(skill.isLiked || false);
  const [likeCount, setLikeCount] = useState(skill.likeCount);

  const handleLike = async () => {
    const prev = liked;
    setLiked(!liked);
    setLikeCount(c => liked ? c - 1 : c + 1);
    try {
      const result = await marketplaceApi.toggleLike(skill.id);
      setLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch {
      setLiked(prev);
      setLikeCount(skill.likeCount);
    }
  };

  const formatCount = (n: number | string): string => {
    const v = Number(n) || 0;
    if (v >= 10000) return (v / 10000).toFixed(1) + 'W';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
    return String(v);
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      {/* 顶部行: 名称 + Agent 标识 */}
      <View style={styles.topRow}>
        <Text style={styles.name} numberOfLines={1}>{skill.name}</Text>
        {skill.agentCompatible && (
          <View style={styles.agentBadge}>
            <Text style={styles.agentBadgeText}>🤖 Agent</Text>
          </View>
        )}
      </View>

      {/* 评分 + 调用次数 */}
      <View style={styles.statsRow}>
        <Text style={styles.rating}>⭐ {Number(skill.rating || 0).toFixed(1)}</Text>
        <Text style={styles.reviewCount}>({skill.reviewCount})</Text>
        <Text style={styles.separator}>·</Text>
        <Text style={styles.callCount}>{formatCount(skill.callCount)} calls</Text>
      </View>

      {/* 社交信号: 点赞 + 使用人数 */}
      <View style={styles.socialRow}>
        <TouchableOpacity style={styles.likeBtn} onPress={handleLike}>
          <Text style={[styles.likeIcon, liked && styles.likeIconActive]}>
            {liked ? '👍' : '👍'}
          </Text>
          <Text style={[styles.likeText, liked && styles.likeTextActive]}>
            {formatCount(likeCount)}
          </Text>
        </TouchableOpacity>
        <Text style={styles.separator}>·</Text>
        <Text style={styles.usageText}>🔥 {formatCount(skill.usageCount)} users</Text>
      </View>

      {/* 底部行: 价格 + 操作按钮 */}
      <View style={styles.bottomRow}>
        <View>
          <Text style={styles.price}>
            {Number(skill.price) === 0 ? 'Free' : `$${Number(skill.price) < 1 ? Number(skill.price || 0).toFixed(4) : Number(skill.price || 0).toFixed(2)}`}
            {Number(skill.price) > 0 && <Text style={styles.priceUnit}>/{skill.priceUnit}</Text>}
          </Text>
          {(skill as any).commissionPerCall > 0 && (
            <Text style={styles.commission}>💸 ${Number((skill as any).commissionPerCall || 0).toFixed(4)}/call commission</Text>
          )}
        </View>
        <View style={styles.actions}>
          {showInstallBtn && skill.agentCompatible && onInstallToAgent && (
            <TouchableOpacity style={styles.installBtn} onPress={onInstallToAgent}>
              <Text style={styles.installBtnText}>+ Agent</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.buyBtn} onPress={onPress}>
            <Text style={styles.buyBtnText}>{Number(skill.price) === 0 ? 'Free' : 'Buy'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.promoteBtn} onPress={onPromote}>
            <Text style={styles.promoteBtnText}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Top row
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  agentBadge: {
    backgroundColor: '#8B5CF6' + '25',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#8B5CF6' + '50',
  },
  agentBadgeText: {
    color: '#A78BFA',
    fontSize: 11,
    fontWeight: '600',
  },
  // Stats row
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  rating: {
    color: '#FBBF24',
    fontSize: 13,
    fontWeight: '600',
  },
  reviewCount: {
    color: colors.muted,
    fontSize: 12,
    marginLeft: 2,
  },
  separator: {
    color: colors.muted,
    fontSize: 12,
    marginHorizontal: 6,
  },
  callCount: {
    color: colors.muted,
    fontSize: 12,
  },
  // Social row
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  likeIcon: {
    fontSize: 13,
    opacity: 0.6,
  },
  likeIconActive: {
    opacity: 1,
  },
  likeText: {
    color: colors.muted,
    fontSize: 12,
    marginLeft: 3,
  },
  likeTextActive: {
    color: colors.primary,
  },
  usageText: {
    color: '#F97316',
    fontSize: 12,
    fontWeight: '500',
  },
  // Bottom row
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: {
    color: colors.success,
    fontSize: 15,
    fontWeight: '700',
  },
  priceUnit: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '400',
  },
  commission: {
    fontSize: 11, color: '#F97316', fontWeight: '500', marginTop: 1,
  },
  installBtn: {
    backgroundColor: '#10b98120',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#10b98150',
  },
  installBtnText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  buyBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  buyBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  promoteBtn: {
    backgroundColor: '#F97316' + '20',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#F97316' + '50',
  },
  promoteBtnText: {
    color: '#FB923C',
    fontSize: 13,
    fontWeight: '600',
  },
}));
