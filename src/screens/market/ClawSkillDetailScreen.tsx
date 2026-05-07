/**
 * ClawSkillDetailScreen V2 — Full-featured skill detail
 *
 * Features:
 *  - Hero + Stats + Description + Tags
 *  - Like / Favorite toggles
 *  - Reviews section (top 3 + View All)
 *  - Commission hint (Promote & Earn)
 *  - Share button → ShareCard screen
 *  - Bottom CTA: Install / Buy Now + Promote & Earn
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Share,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { marketplaceApi, ReviewItem } from '../../services/marketplace.api';
import { getHubSkillDetail } from '../../services/openclawHub.service';
import { installSkillToInstance } from '../../services/openclaw.service';
import { useAuthStore } from '../../stores/authStore';
import { useI18n, type Language } from '../../stores/i18nStore';
import type { MarketStackParamList, ShareCardRouteParams } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MarketStackParamList, 'SkillDetail'>;
type RouteT = RouteProp<MarketStackParamList, 'SkillDetail'>;

// ── Helpers ────────────────────────────────────────────────────────────────

const formatCount = (n: number | string): string => {
  const v = Number(n) || 0;
  if (v >= 10000) return (v / 10000).toFixed(1) + 'W';
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
  return String(v);
};

const renderStars = (rating: number) => {
  const full = Math.floor(rating);
  return Array.from({ length: 5 }, (_, i) => (i < full ? '⭐' : '☆')).join('');
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

const buildSkillShareCardParams = (skill: any, skillId: string, language: Language, refId?: string): ShareCardRouteParams => {
  const shareUrl = `https://agentrix.top/skill/${skillId}?ref=${refId || 'guest'}`;
  const isResource = skill?.category === 'resources';
  const title = skill?.displayName || skill?.name || 'Agentrix Listing';
  const authorName = typeof skill?.author === 'string'
    ? skill.author
    : skill?.author?.nickname || skill?.vendorName || 'Agentrix Creator';
  const price = skill?.pricing?.pricePerCall ?? skill?.price ?? 0;
  const priceUnit = skill?.pricing?.currency ?? skill?.priceUnit ?? 'USD';
  const rating = Number(skill?.rating || 0);
  const installs = skill?.installCount ?? skill?.usageCount ?? skill?.callCount ?? 0;

  return {
    shareUrl,
    title,
    userName: authorName,
    subtitle: isResource
      ? (language === 'zh' ? '面向 AI 工作流的优质资源' : 'Premium resource for your AI workflow')
      : (language === 'zh' ? '为你的智能体打造的高转化 AI 技能' : 'High-conversion AI skill for your agent'),
    headerEmoji: skill?.icon || (isResource ? '📦' : '⚡'),
    categoryLabel: isResource ? (language === 'zh' ? '资源' : 'RESOURCE') : (language === 'zh' ? '技能' : 'SKILL'),
    priceLabel: price === 0 ? (language === 'zh' ? '免费' : 'Free') : `$${price < 1 ? price.toFixed(4) : price.toFixed(2)} / ${priceUnit}`,
    statsLabel: `${rating.toFixed(1)}★ · ${formatCount(installs)} installs`,
    description: skill?.description || skill?.longDescription || undefined,
    tags: skill?.tags || [],
    ctaLabel: isResource
      ? (language === 'zh' ? '扫码解锁这个资源' : 'Scan to unlock this resource')
      : (language === 'zh' ? '扫码安装这个技能' : 'Scan to install this skill'),
    accentFrom: isResource ? '#0F766E' : '#2563EB',
    accentTo: isResource ? '#14B8A6' : '#7C3AED',
  };
};

// ── Main Component ─────────────────────────────────────────────────────────

export function ClawSkillDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const { language } = useI18n();
  const { skillId } = route.params;
  const activeInstance = useAuthStore((s) => s.activeInstance);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const queryClient = useQueryClient();
  const [installing, setInstalling] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [favorited, setFavorited] = useState(false);

  // ── Load skill detail ──
  const { data: skill, isLoading } = useQuery<any>({
    queryKey: ['skill', skillId],
    queryFn: async () => {
      if (skillId.startsWith('oc-') || skillId.startsWith('s')) {
        const hubSkill = await getHubSkillDetail(skillId);
        if (hubSkill) return hubSkill;
      }
      return marketplaceApi.getDetail(skillId);
    },
    enabled: !!skillId,
  });

  useEffect(() => {
    if (skill) {
      setLiked(skill.isLiked || false);
      setLikeCount(skill.likeCount || 0);
      setFavorited(skill.isFavorited || false);
    }
  }, [skill]);

  // ── Load reviews ──
  const { data: reviewsData } = useQuery<{ reviews: ReviewItem[]; total: number }>({
    queryKey: ['skill-reviews', skillId],
    queryFn: () => marketplaceApi.getReviews(skillId),
    enabled: !!skillId,
  });
  const reviews: ReviewItem[] = reviewsData?.reviews ?? skill?.reviews ?? [];

  // ── Actions ──

  const handleShare = useCallback(() => {
    if (!skill) return;
    try {
      navigation.navigate('ShareCard', buildSkillShareCardParams(skill, skillId, language, activeInstance?.id));
    } catch {
      // Fallback to native share
      Share.share({
        message: `Check out "${skill.displayName || skill.name}" on Agentrix Claw!\nhttps://agentrix.top/skill/${skillId}`,
      });
    }
  }, [skill, skillId, activeInstance, language, navigation]);

  const handleLike = useCallback(async () => {
    if (!skill) return;
    const prev = liked;
    setLiked(!liked);
    setLikeCount(c => liked ? c - 1 : c + 1);
    try {
      const result = await marketplaceApi.toggleLike(skill.id ?? skillId);
      setLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch {
      setLiked(prev);
    }
  }, [skill, skillId, liked]);

  const handleFavorite = useCallback(async () => {
    if (!skill) return;
    const prev = favorited;
    setFavorited(!favorited);
    try {
      const result = await marketplaceApi.toggleFavorite(skill.id ?? skillId);
      setFavorited(result.favorited);
    } catch {
      setFavorited(prev);
    }
  }, [skill, skillId, favorited]);

  const handleInstallToAgent = useCallback(async () => {
    if (!activeInstance) {
      Alert.alert(
        'No Agent',
        'Connect an OpenClaw instance first to install skills.',
        [
          { text: 'Connect Agent', onPress: () => (navigation as any).navigate('Agent', { screen: 'DeploySelect' }) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }
    if (!isAuthenticated) {
      Alert.alert('Sign in required', 'Please sign in to install skills.');
      return;
    }
    setInstalling(true);
    try {
      const result = await installSkillToInstance(activeInstance.id, skillId);
      const skillName = skill?.name || skill?.displayName || 'Skill';

      void queryClient.invalidateQueries({ queryKey: ['instance-skills', activeInstance.id] });
      void queryClient.invalidateQueries({ queryKey: ['my-skills', activeInstance.id] });

      // Both dbRecorded (marketplace) and pendingDeploy (live push) are acceptable success states
      if (result?.dbRecorded || result?.pendingDeploy) {
        Alert.alert(
          '✅ Installed!',
          `${skillName} has been added to ${activeInstance.name}.${result?.pendingDeploy ? '\n\nIt will sync automatically when the agent reconnects.' : ''}`,
        );
      } else {
        Alert.alert('✅ Installed!', `${skillName} has been installed to ${activeInstance.name}!`);
      }
    } catch (e: any) {
      const msg = e?.message || 'Install failed';
      if (msg.includes('payment') || msg.includes('balance') || msg.includes('buy') || (skill?.price && skill.price > 0)) {
        navigation.navigate('Checkout', { skillId, skillName: skill?.name || skill?.displayName || '' });
      } else {
        Alert.alert('Install Failed', msg);
      }
    } finally {
      setInstalling(false);
    }
  }, [activeInstance, isAuthenticated, skillId, skill, navigation]);

  const handleBuy = useCallback(() => {
    if (!skill) return;
    navigation.navigate('Checkout', { skillId, skillName: skill.name || skill.displayName || '' });
  }, [skill, skillId, navigation]);

  const handlePromote = useCallback(async () => {
    if (!skill) return;
    const shareUrl = `https://agentrix.top/skill/${skillId}?ref=${activeInstance?.id || 'guest'}`;
    const skillDisplayName = skill.displayName || skill.name;
    const shareCardParams = buildSkillShareCardParams(skill, skillId, language, activeInstance?.id);
    
    // Show share options: Social post, Native share, and Poster
    Alert.alert(
      '🔗 Share & Promote',
      `Share "${skillDisplayName}" to earn commission!`,
      [
        {
          text: '📱 Share via Apps',
          onPress: async () => {
            await Share.share({
              message: `🔥 Check out "${skillDisplayName}" on Agentrix Claw!\n\nDownload Agentrix: https://agentrix.top/download\n\nSkill link: ${shareUrl}`,
              url: shareUrl,
              title: skillDisplayName,
            });
          },
        },
        {
          text: '🖼️ Share Poster',
          onPress: () => {
            try {
              navigation.navigate('ShareCard', shareCardParams);
            } catch {
              Share.share({
                message: `🔥 "${skillDisplayName}" on Agentrix Claw\n\nDownload: https://agentrix.top/download\n${shareUrl}`,
              });
            }
          },
        },
        {
          text: '📋 Copy Link',
          onPress: async () => {
            try {
              const Clipboard = require('expo-clipboard');
              await Clipboard.setStringAsync(shareUrl);
              Alert.alert('Copied!', 'Share link copied to clipboard');
            } catch {
              Alert.alert('Share Link', shareUrl);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, [skill, skillId, activeInstance, navigation]);

  // ── Loading / Error states ──

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!skill) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Skill not found</Text>
      </View>
    );
  }

  const authorName = typeof skill.author === 'string'
    ? skill.author
    : skill.author?.nickname || skill.vendorName || 'Unknown';
  const price = skill.pricing?.pricePerCall ?? skill.price ?? 0;
  const priceUnit = skill.pricing?.currency ?? skill.priceUnit ?? 'USD';
  const commissionPerCall = skill.commissionPerCall ?? (price * 0.01);
  const rating = Number(skill.rating || 0);
  const installCount = skill.installCount ?? skill.usageCount ?? skill.callCount ?? 0;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* ── Hero ── */}
        <View style={styles.hero}>
          <Text style={styles.heroIcon}>{skill.icon || (skill.category === 'resources' ? '📦' : '⚡')}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{skill.name || skill.displayName}</Text>
            <Text style={styles.heroAuthor}>by {authorName}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.ratingText}>⭐ {rating.toFixed(1)}</Text>
              <Text style={styles.metaSeparator}>·</Text>
              <Text style={styles.metaText}>{formatCount(installCount)} installs</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Text style={styles.shareBtnText}>🔗 Share</Text>
          </TouchableOpacity>
        </View>

        {/* ── Social Actions Row ── */}
        <View style={styles.socialRow}>
          <TouchableOpacity style={styles.socialBtn} onPress={handleLike}>
            <Text style={styles.socialIcon}>{liked ? '👍' : '👍'}</Text>
            <Text style={[styles.socialText, liked && styles.socialTextActive]}>
              {formatCount(likeCount)}
            </Text>
          </TouchableOpacity>
          <Text style={styles.metaSeparator}>·</Text>
          <Text style={styles.usageText}>🔥 {formatCount(installCount)} users</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={styles.socialBtn} onPress={handleFavorite}>
            <Text style={styles.socialIcon}>{favorited ? '❤️' : '🤍'}</Text>
            <Text style={styles.socialText}>{favorited ? 'Saved' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Price ── */}
        <View style={styles.priceRow}>
          <Text style={styles.priceText}>
            {price === 0 ? 'Free' : `$${price < 1 ? price.toFixed(4) : price.toFixed(2)}`}
          </Text>
          {price > 0 && <Text style={styles.priceUnit}> / {priceUnit}</Text>}
        </View>

        {/* ── Stats ── */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statVal}>⭐ {rating.toFixed(1)}</Text>
            <Text style={styles.statLbl}>Rating</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{formatCount(installCount)}</Text>
            <Text style={styles.statLbl}>Installs</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{price === 0 ? 'Free' : `$${price.toFixed(2)}`}</Text>
            <Text style={styles.statLbl}>Price</Text>
          </View>
        </View>

        {/* ── Description ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📝 About</Text>
          <Text style={styles.description}>
            {skill.longDescription || skill.description || 'No description available.'}
          </Text>
        </View>

        {/* ── Features ── */}
        {skill.features?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>✨ Features</Text>
            {skill.features.map((f: string, i: number) => (
              <Text key={i} style={styles.featureItem}>• {f}</Text>
            ))}
          </View>
        )}

        {/* ── Tags ── */}
        {skill.tags?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏷️ Tags</Text>
            <View style={styles.tagsRow}>
              {skill.tags.map((tag: string) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Reviews ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            💬 Reviews ({reviewsData?.total ?? reviews.length ?? 0})
          </Text>
          {reviews.length === 0 ? (
            <Text style={styles.emptyReviews}>No reviews yet. Be the first!</Text>
          ) : (
            reviews.slice(0, 3).map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewUser}>{review.userName}</Text>
                  <Text style={styles.reviewStars}>{renderStars(review.rating)}</Text>
                  <Text style={styles.reviewDate}>{formatDate(review.createdAt)}</Text>
                </View>
                <Text style={styles.reviewComment}>"{review.comment}"</Text>
              </View>
            ))
          )}
          <View style={styles.reviewActions}>
            {reviews.length > 0 && (
              <TouchableOpacity
                style={styles.reviewActionBtn}
                onPress={() => {
                  try { navigation.navigate('Reviews' as any, { skillId }); }
                  catch {}
                }}
              >
                <Text style={styles.reviewActionText}>View All</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.reviewActionBtn, styles.reviewActionBtnPrimary]}
              onPress={() => {
                try { navigation.navigate('WriteReview' as any, { skillId }); }
                catch { Alert.alert('Coming Soon', 'Review submission will be available soon.'); }
              }}
            >
              <Text style={[styles.reviewActionText, styles.reviewActionTextPrimary]}>Write Review</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Commission Hint ── */}
        {commissionPerCall > 0 && (
          <View style={styles.commissionHint}>
            <Text style={styles.commissionHintText}>
              📢 Promote this skill to earn ${commissionPerCall.toFixed(4)}/{priceUnit} commission
            </Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Bottom Fixed CTA ── */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.buyBtn, installing && styles.btnDisabled]}
          onPress={price === 0 ? handleInstallToAgent : handleBuy}
          disabled={installing}
        >
          {installing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buyBtnText}>
              {!activeInstance
                ? '🔗 Connect Agent First'
                : price === 0
                  ? '⚡ Install (Free)'
                  : `💳 Buy $${price < 1 ? price.toFixed(4) : price.toFixed(2)}`}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.promoteBtn} onPress={handlePromote}>
          <Text style={styles.promoteBtnText}>Promote & Earn</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  scrollView: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary },
  errorText: { color: colors.error, fontSize: 15 },

  hero: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 20, paddingBottom: 10 },
  heroIcon: { fontSize: 48 },
  heroName: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  heroAuthor: { fontSize: 13, color: colors.textMuted, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingText: { color: '#FBBF24', fontSize: 13, fontWeight: '600' },
  metaSeparator: { color: colors.textMuted, fontSize: 13 },
  metaText: { color: colors.textMuted, fontSize: 13 },

  shareBtn: { backgroundColor: colors.bgSecondary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  shareBtnText: { color: colors.accent, fontSize: 13, fontWeight: '600' },

  socialRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10 },
  socialBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  socialIcon: { fontSize: 14 },
  socialText: { color: colors.textMuted, fontSize: 13 },
  socialTextActive: { color: colors.primary },
  usageText: { color: '#F97316', fontSize: 13 },

  priceRow: { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 20, paddingBottom: 12 },
  priceText: { fontSize: 22, fontWeight: '800', color: colors.accent },
  priceUnit: { fontSize: 14, color: colors.textMuted },

  statsRow: { flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: 14, padding: 16, marginHorizontal: 20, gap: 8, borderWidth: 1, borderColor: colors.border },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statVal: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  statLbl: { fontSize: 11, color: colors.textMuted, textTransform: 'uppercase' },

  section: { paddingHorizontal: 20, paddingTop: 16, gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  description: { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
  featureItem: { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: colors.bgCard, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: colors.border },
  tagText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },

  emptyReviews: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },
  reviewCard: { backgroundColor: colors.bgCard, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  reviewUser: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  reviewStars: { fontSize: 12 },
  reviewDate: { fontSize: 11, color: colors.textMuted, marginLeft: 'auto' },
  reviewComment: { fontSize: 13, color: colors.textSecondary, lineHeight: 20, fontStyle: 'italic' },
  reviewActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  reviewActionBtn: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center', backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border },
  reviewActionBtnPrimary: { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44' },
  reviewActionText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  reviewActionTextPrimary: { color: colors.primary },

  commissionHint: { backgroundColor: '#f97316' + '18', borderRadius: 12, padding: 14, marginHorizontal: 20, marginTop: 16, borderWidth: 1, borderColor: '#f97316' + '33' },
  commissionHintText: { fontSize: 13, color: '#fb923c', fontWeight: '600', textAlign: 'center' },

  bottomBar: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 14, gap: 10, backgroundColor: colors.bgPrimary, borderTopWidth: 1, borderTopColor: colors.border },
  buyBtn: { flex: 2, backgroundColor: colors.primary, borderRadius: 14, padding: 16, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  buyBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  promoteBtn: { flex: 1, backgroundColor: '#f97316' + '20', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#f97316' + '55' },
  promoteBtnText: { color: '#fb923c', fontWeight: '700', fontSize: 14 },
});
