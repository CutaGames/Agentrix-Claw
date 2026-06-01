// 技能详情页 — 含评价区、Agent标识、推广CTA
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Share,
} from 'react-native';
import { colors } from '../theme/colors';
import { marketplaceApi, SkillDetail, ReviewItem } from '../services/marketplace.api';
import { referralApi } from '../services/referral.api';
import { ShareSheet } from '../components/promote/ShareSheet';

interface Props {
  route: { params: { skillId: string; skillName: string } };
  navigation: any;
}

export function SkillDetailScreen({ route, navigation }: Props) {
  const { skillId } = route.params;
  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [favorited, setFavorited] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ name: string; shortUrl: string; price?: number; priceUnit?: string } | null>(null);

  useEffect(() => {
    loadDetail();
  }, [skillId]);

  const loadDetail = async () => {
    try {
      const data = await marketplaceApi.getDetail(skillId);
      setSkill(data);
      setLiked(data.isLiked || false);
      setLikeCount(data.likeCount);
      setFavorited(data.isFavorited || false);
    } catch (e) {
      console.error('Failed to load skill detail:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    if (!skill) return;
    const prev = liked;
    setLiked(!liked);
    setLikeCount(c => liked ? c - 1 : c + 1);
    try {
      const result = await marketplaceApi.toggleLike(skill.id);
      setLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch {
      setLiked(prev);
    }
  };

  const handleFavorite = async () => {
    if (!skill) return;
    setFavorited(!favorited);
    try {
      const result = await marketplaceApi.toggleFavorite(skill.id);
      setFavorited(result.favorited);
    } catch {
      setFavorited(favorited);
    }
  };

  const handleBuy = () => {
    if (!skill) return;
    navigation.navigate('Checkout', { skillId: skill.id, skillName: skill.name });
  };

  const handlePromote = async () => {
    if (!skill) return;
    try {
      const link = await referralApi.createLink({
        name: skill.name,
        targetType: 'skill',
        targetId: skill.id,
      });
      setShareTarget({
        name: skill.name,
        shortUrl: link.shortUrl,
        price: skill.price,
        priceUnit: skill.priceUnit,
      });
      setShowShare(true);
    } catch {
      // Fallback to native share
      const text = referralApi.generateShareText();
      await Share.share({ message: text });
    }
  };

  const formatCount = (n: number | string): string => {
    const v = Number(n) || 0;
    if (v >= 10000) return (v / 10000).toFixed(1) + 'W';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
    return String(v);
  };

  const renderStars = (rating: number) => {
    const full = Math.floor(rating);
    const stars = [];
    for (let i = 0; i < 5; i++) {
      stars.push(i < full ? '⭐' : '☆');
    }
    return stars.join('');
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return `${diff}d ago`;
    if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
    return `${Math.floor(diff / 30)}mo ago`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!skill) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Failed to load</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* 头部信息 */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.skillName}>{skill.name}</Text>
            {skill.agentCompatible && (
              <View style={styles.agentBadge}>
                <Text style={styles.agentBadgeText}>🤖 Agent</Text>
              </View>
            )}
          </View>
          <Text style={styles.author}>by {skill.author}</Text>

          {/* 评分 + 社交信号 */}
          <View style={styles.statsRow}>
            <Text style={styles.rating}>⭐ {Number(skill.rating || 0).toFixed(1)}</Text>
            <Text style={styles.reviewCount}>({skill.reviewCount} reviews)</Text>
            <Text style={styles.separator}>·</Text>
            <Text style={styles.callCount}>{formatCount(skill.callCount)} calls</Text>
          </View>
          <View style={styles.socialRow}>
            <TouchableOpacity style={styles.socialBtn} onPress={handleLike}>
              <Text style={styles.socialIcon}>{liked ? '👍' : '👍'}</Text>
              <Text style={[styles.socialText, liked && styles.socialTextActive]}>
                {formatCount(likeCount)}
              </Text>
            </TouchableOpacity>
            <Text style={styles.separator}>·</Text>
            <Text style={styles.usageText}>🔥 {formatCount(skill.usageCount)} users</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={styles.socialBtn} onPress={handleFavorite}>
              <Text style={styles.socialIcon}>{favorited ? '❤️' : '🤍'}</Text>
              <Text style={styles.socialText}>{favorited ? 'Saved' : 'Save'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.price}>
            ${Number(skill.price) < 1 ? Number(skill.price || 0).toFixed(4) : Number(skill.price || 0).toFixed(2)}
            <Text style={styles.priceUnit}> / {skill.priceUnit}</Text>
          </Text>
        </View>

        {/* Agent 兼容说明 */}
        {skill.agentCompatible && (
          <View style={styles.agentNote}>
            <Text style={styles.agentNoteText}>
              🤖 This skill supports Agent auto-invocation — both humans and agents can use it after purchase
            </Text>
          </View>
        )}

        {/* 描述 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📝 Description</Text>
          <Text style={styles.description}>{skill.longDescription}</Text>
        </View>

        {/* 标签 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏷️ Tags</Text>
          <View style={styles.tagsRow}>
            {skill.tags.map(tag => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 使用统计 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Usage Stats</Text>
          <View style={styles.usageStats}>
            <View style={styles.usageStat}>
              <Text style={styles.usageStatValue}>{formatCount(skill.weeklyCallCount)}</Text>
              <Text style={styles.usageStatLabel}>This Week</Text>
            </View>
            <View style={styles.usageStat}>
              <Text style={styles.usageStatValue}>{skill.successRate}%</Text>
              <Text style={styles.usageStatLabel}>Success</Text>
            </View>
            <View style={styles.usageStat}>
              <Text style={styles.usageStatValue}>{(Number(skill.avgLatency || 0) / 1000).toFixed(1)}s</Text>
              <Text style={styles.usageStatLabel}>Avg Latency</Text>
            </View>
          </View>
        </View>

        {/* 用户评价 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>💬 Reviews ({skill.reviewCount})</Text>
          </View>
          {skill.reviews.slice(0, 3).map((review: ReviewItem) => (
            <View key={review.id} style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewUser}>{review.userName}</Text>
                <Text style={styles.reviewStars}>{renderStars(review.rating)}</Text>
                <Text style={styles.reviewDate}>{formatDate(review.createdAt)}</Text>
              </View>
              <Text style={styles.reviewComment}>"{review.comment}"</Text>
            </View>
          ))}
          <View style={styles.reviewActions}>
            <TouchableOpacity
              style={styles.reviewActionBtn}
              onPress={() => navigation.navigate('Reviews', { skillId: skill.id })}
            >
              <Text style={styles.reviewActionText}>All Reviews</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.reviewActionBtn, styles.reviewActionBtnPrimary]}
              onPress={() => navigation.navigate('WriteReview', { skillId: skill.id })}
            >
              <Text style={[styles.reviewActionText, styles.reviewActionTextPrimary]}>Write Review</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 佣金预估 */}
        <View style={styles.commissionHint}>
          <Text style={styles.commissionHintText}>
            📢 Promote this skill to earn ${Number(skill.commissionPerCall || 0).toFixed(4)}/{skill.priceUnit} commission
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* 底部固定 CTA */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.buyButton} onPress={handleBuy}>
          <Text style={styles.buyButtonText}>Buy Now</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.promoteButton} onPress={handlePromote}>
          <Text style={styles.promoteButtonText}>Promote & Earn</Text>
        </TouchableOpacity>
      </View>

      {/* ShareSheet Modal */}
      {shareTarget && (
        <ShareSheet
          visible={showShare}
          onClose={() => setShowShare(false)}
          target={shareTarget}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: colors.muted,
    fontSize: 16,
  },
  // Header
  header: {
    padding: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  skillName: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    flex: 1,
    marginRight: 8,
  },
  agentBadge: {
    backgroundColor: '#8B5CF6' + '25',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#8B5CF6' + '50',
  },
  agentBadgeText: {
    color: '#A78BFA',
    fontSize: 12,
    fontWeight: '600',
  },
  author: {
    color: colors.muted,
    fontSize: 14,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  rating: {
    color: '#FBBF24',
    fontSize: 14,
    fontWeight: '600',
  },
  reviewCount: {
    color: colors.muted,
    fontSize: 13,
    marginLeft: 4,
  },
  separator: {
    color: colors.muted,
    fontSize: 13,
    marginHorizontal: 8,
  },
  callCount: {
    color: colors.muted,
    fontSize: 13,
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  socialIcon: {
    fontSize: 14,
  },
  socialText: {
    color: colors.muted,
    fontSize: 13,
    marginLeft: 4,
  },
  socialTextActive: {
    color: colors.primary,
  },
  usageText: {
    color: '#F97316',
    fontSize: 13,
    fontWeight: '500',
  },
  price: {
    color: colors.success,
    fontSize: 24,
    fontWeight: '800',
  },
  priceUnit: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '400',
  },
  // Agent note
  agentNote: {
    backgroundColor: '#8B5CF6' + '10',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#8B5CF6' + '25',
  },
  agentNoteText: {
    color: '#A78BFA',
    fontSize: 13,
    lineHeight: 18,
  },
  // Section
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  description: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  // Tags
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: colors.primary + '15',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  tagText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '500',
  },
  // Usage stats
  usageStats: {
    flexDirection: 'row',
    gap: 12,
  },
  usageStat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  usageStatValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  usageStatLabel: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 4,
  },
  // Reviews
  reviewCard: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  reviewUser: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginRight: 8,
  },
  reviewStars: {
    fontSize: 10,
    marginRight: 8,
  },
  reviewDate: {
    color: colors.muted,
    fontSize: 11,
  },
  reviewComment: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  reviewActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reviewActionBtnPrimary: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  reviewActionText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  reviewActionTextPrimary: {
    color: colors.primary,
  },
  // Commission hint
  commissionHint: {
    backgroundColor: '#F97316' + '10',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F97316' + '25',
  },
  commissionHintText: {
    color: '#FB923C',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 30,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 12,
  },
  buyButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  promoteButton: {
    flex: 1,
    backgroundColor: '#F97316' + '20',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F97316' + '50',
  },
  promoteButtonText: {
    color: '#FB923C',
    fontSize: 16,
    fontWeight: '700',
  },
  // Modals
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    width: '100%', backgroundColor: colors.card,
    borderRadius: 20, padding: 24, gap: 12,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  modalDesc: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  modalPrice: { fontSize: 16, fontWeight: '700', color: colors.success },
  payOptionBtn: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    backgroundColor: colors.bg, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border, gap: 14,
  },
  payOptionIcon: { fontSize: 24 },
  payOptionInfo: { flex: 1 },
  payOptionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  payOptionDesc: { fontSize: 12, color: colors.muted, marginTop: 2 },
  modalCancelBtn: {
    width: '100%', borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border, marginTop: 4,
  },
  modalCancelText: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  successIcon: { fontSize: 48, marginBottom: 4 },
  successHint: { fontSize: 13, color: '#FB923C', fontWeight: '500', textAlign: 'center' },
  successActions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 },
  successActionBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', backgroundColor: colors.primary,
  },
  successActionBtnOutline: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
  },
  successActionPrimary: { color: '#fff', fontSize: 15, fontWeight: '700' },
  successActionSecondary: { color: colors.muted, fontSize: 15, fontWeight: '600' },
});
