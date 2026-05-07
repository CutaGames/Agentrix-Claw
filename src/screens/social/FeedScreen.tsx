import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { socialShareService } from '../../services/socialShare';
import { useI18n } from '../../stores/i18nStore';
import type { SocialStackParamList, MainTabParamList } from '../../navigation/types';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<SocialStackParamList, 'Feed'>,
  BottomTabNavigationProp<MainTabParamList>
>;

// ── Types ────────────────────────────────────────────────────────────────────

type ShowcaseCardType =
  | 'skill_share'
  | 'workflow_result'
  | 'task_complete'
  | 'agent_deploy'
  | 'conversation_highlight'
  | 'install_success'
  | 'text';

type ShowcasePost = {
  id: string;
  authorId?: string;
  authorName?: string;
  authorAvatar?: string;
  content: string;
  type: ShowcaseCardType;
  referenceId?: string;
  referenceName?: string;
  tags?: string[];
  likeCount: number;
  commentCount: number;
  shareCount: number;
  likedByMe?: boolean;
  metadata?: Record<string, any>;
  createdAt: string;
};

function formatRelativeTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

// ── Config ───────────────────────────────────────────────────────────────────

const FEED_TABS = ['Hot', 'Latest', 'Following'] as const;

const CARD_TYPE_CONFIG: Record<ShowcaseCardType, { icon: string; label: string; labelZh: string; accent: string }> = {
  skill_share:             { icon: '⚡', label: 'Skill Published',       labelZh: '技能发布',   accent: '#F59E0B' },
  workflow_result:         { icon: '🔄', label: 'Workflow Result',       labelZh: '工作流成果', accent: '#8B5CF6' },
  task_complete:           { icon: '✅', label: 'Task Completed',        labelZh: '任务完成',   accent: '#10B981' },
  agent_deploy:            { icon: '🚀', label: 'Agent Deployed',        labelZh: 'Agent 上线', accent: '#3B82F6' },
  conversation_highlight:  { icon: '💬', label: 'Conversation Highlight', labelZh: '对话精华',   accent: '#EC4899' },
  install_success:         { icon: '📦', label: 'Skill Installed',       labelZh: '技能安装',   accent: '#06B6D4' },
  text:                    { icon: '📝', label: 'Post',                  labelZh: '动态',       accent: colors.accent },
};

const CTA_CONFIG: Record<ShowcaseCardType, { label: string; labelZh: string; icon: string } | null> = {
  skill_share:            { label: 'Install', labelZh: '安装', icon: '⚡' },
  workflow_result:        { label: 'Copy Workflow', labelZh: '复制工作流', icon: '📋' },
  task_complete:          { label: 'Hire Agent', labelZh: '雇佣 Agent', icon: '🤖' },
  agent_deploy:           { label: 'Try Agent', labelZh: '试用', icon: '🚀' },
  conversation_highlight: { label: 'Try Same Agent', labelZh: '试用同款', icon: '💬' },
  install_success:        { label: 'Install Too', labelZh: '我也安装', icon: '📦' },
  text:                   null,
};

// ── API ──────────────────────────────────────────────────────────────────────

async function fetchShowcaseFeed(sort: string, page: number) {
  try {
    const res = await apiFetch<{ posts: ShowcasePost[]; total: number }>(
      `/social/showcase?sort=${sort.toLowerCase()}&page=${page}&limit=20`,
    );
    return res.posts ?? [];
  } catch {
    return [];
  }
}

async function likePost(postId: string) {
  return apiFetch(`/social/posts/${postId}/like`, { method: 'POST' });
}

// ── Component ────────────────────────────────────────────────────────────────

export function FeedScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();
  const [feedTab, setFeedTab] = useState<typeof FEED_TABS[number]>('Hot');
  const qc = useQueryClient();

  React.useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const { data, isLoading, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['showcase-feed', feedTab],
      queryFn: ({ pageParam }) => fetchShowcaseFeed(feedTab, pageParam as number),
      initialPageParam: 1,
      getNextPageParam: (lastPage, allPages) =>
        Array.isArray(lastPage) && lastPage.length >= 20 ? allPages.length + 1 : undefined,
      retry: false,
    });

  const allPosts = data?.pages?.flatMap((p) => (Array.isArray(p) && p.length > 0 ? p : [])) ?? [];
  const posts = allPosts;

  const likeMut = useMutation({
    mutationFn: (postId: string) => likePost(postId),
    onMutate: (postId) => {
      qc.setQueryData(['showcase-feed', feedTab], (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: ShowcasePost[]) =>
            page.map((p) =>
              p.id === postId
                ? { ...p, likedByMe: !p.likedByMe, likeCount: p.likedByMe ? p.likeCount - 1 : p.likeCount + 1 }
                : p,
            ),
          ),
        };
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['showcase-feed', feedTab] }),
  });

  const handleShare = useCallback(async (post: ShowcasePost) => {
    const result = await socialShareService.share({
      title: post.referenceName ?? post.authorName ?? 'Agentrix Showcase',
      message: post.content,
      url: `https://agentrix.top/social/posts/${post.id}`,
    });

    if (result.success) {
      await apiFetch(`/social/posts/${post.id}/share`, { method: 'POST' }).catch(() => null);
      qc.invalidateQueries({ queryKey: ['showcase-feed', feedTab] });
    }
  }, [feedTab, qc]);

  const handleCTA = useCallback((post: ShowcasePost) => {
    const { type, referenceId, referenceName } = post;
    if (type === 'skill_share' || type === 'install_success') {
      if (referenceId) {
        (navigation as any).navigate('Discover', {
          screen: 'SkillDetail',
          params: { skillId: referenceId, skillName: referenceName ?? 'Skill' },
        });
      }
    } else if (type === 'agent_deploy' || type === 'conversation_highlight') {
      (navigation as any).navigate('Agent', { screen: 'AgentChat' });
    } else if (type === 'task_complete') {
      (navigation as any).navigate('Discover', { screen: 'TaskMarket' });
    } else if (type === 'workflow_result') {
      (navigation as any).navigate('Agent', { screen: 'WorkflowList' });
    }
  }, [navigation]);

  const renderCard = useCallback(({ item: post }: { item: ShowcasePost }) => {
    const cardCfg = CARD_TYPE_CONFIG[post.type] ?? CARD_TYPE_CONFIG.text;
    const cta = CTA_CONFIG[post.type];

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('PostDetail', { postId: post.id })}
      >
        {/* Type badge */}
        <View style={[styles.typeBadge, { backgroundColor: cardCfg.accent + '18' }]}>
          <Text style={styles.typeBadgeIcon}>{cardCfg.icon}</Text>
          <Text style={[styles.typeBadgeLabel, { color: cardCfg.accent }]}>
            {t({ en: cardCfg.label, zh: cardCfg.labelZh })}
          </Text>
        </View>

        {/* Author row */}
        <TouchableOpacity
          style={styles.authorRow}
          onPress={() => post.authorId && navigation.navigate('UserProfile', { userId: post.authorId })}
        >
          <Text style={styles.avatar}>{post.authorAvatar ?? '🤖'}</Text>
          <Text style={styles.authorName}>{post.authorName ?? 'Agent'}</Text>
          <Text style={styles.time}>{formatRelativeTime(post.createdAt)}</Text>
        </TouchableOpacity>

        {/* Content */}
        <Text style={styles.content} numberOfLines={6}>{post.content}</Text>

        {/* Reference card (for skills/tasks) */}
        {post.referenceName && (
          <View style={[styles.refCard, { borderLeftColor: cardCfg.accent }]}>
            <Text style={styles.refName}>{cardCfg.icon} {post.referenceName}</Text>
            {post.metadata?.price !== undefined && (
              <Text style={styles.refMeta}>
                {post.metadata.price === 0 ? 'Free' : `${post.metadata.price} ${post.metadata.priceUnit ?? 'USDT'}`}
                {post.metadata.downloads ? ` · ${post.metadata.downloads} installs` : ''}
              </Text>
            )}
            {post.metadata?.rating && (
              <Text style={styles.refMeta}>{'⭐'.repeat(post.metadata.rating)} · {post.metadata.earnings ?? ''}</Text>
            )}
            {post.metadata?.duration && (
              <Text style={styles.refMeta}>⏱ {post.metadata.duration} · {post.metadata.itemsProcessed ?? 0} items</Text>
            )}
          </View>
        )}

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {post.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Actions bar */}
        <View style={styles.actionsBar}>
          <View style={styles.actionsLeft}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => likeMut.mutate(post.id)}
            >
              <Text style={[styles.actionText, post.likedByMe && styles.actionLiked]}>
                {post.likedByMe ? '❤️' : '🤍'} {post.likeCount}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => navigation.navigate('PostDetail', { postId: post.id })}
            >
              <Text style={styles.actionText}>💬 {post.commentCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleShare(post)}>
              <Text style={styles.actionText}>🔗 {post.shareCount}</Text>
            </TouchableOpacity>
          </View>

          {/* CTA Button */}
          {cta && (
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: cardCfg.accent + '22', borderColor: cardCfg.accent + '55' }]}
              onPress={() => handleCTA(post)}
            >
              <Text style={[styles.ctaText, { color: cardCfg.accent }]}>
                {cta.icon} {t({ en: cta.label, zh: cta.labelZh })}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [navigation, likeMut, handleCTA, t]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>🤖 {t({ en: 'Agent Showcase', zh: 'Agent 展示墙' })}</Text>
          <Text style={styles.headerSub}>{t({ en: 'Discover what agents are building', zh: '发现 Agent 正在做什么' })}</Text>
        </View>
      </View>

      {/* Feed Tabs */}
      <View style={styles.tabs}>
        {FEED_TABS.map((tabLabel) => (
          <TouchableOpacity
            key={tabLabel}
            style={[styles.tab, feedTab === tabLabel && styles.tabActive]}
            onPress={() => setFeedTab(tabLabel)}
          >
            <Text style={[styles.tabText, feedTab === tabLabel && styles.tabTextActive]}>
              {tabLabel === 'Hot' ? `🔥 ${t({ en: 'Hot', zh: '热门' })}`
                : tabLabel === 'Latest' ? `🆕 ${t({ en: 'Latest', zh: '最新' })}`
                : `👥 ${t({ en: 'Following', zh: '关注' })}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={renderCard}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>{t({ en: 'No showcase posts yet', zh: '暂无展示墙内容' })}</Text>
              <Text style={styles.emptyText}>{t({ en: 'Real agent activity, installs, and workflow results will appear here after users publish them.', zh: '真实的 Agent 动态、安装记录和工作流成果会在发布后显示在这里。' })}</Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={() => { qc.removeQueries({ queryKey: ['showcase-feed'] }); refetch(); }}
              tintColor={colors.accent}
            />
          }
          showsVerticalScrollIndicator={false}
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isFetchingNextPage ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} /> : null
          }
        />
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 8,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  headerSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },

  tabs: { flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: colors.bgCard },
  tabActive: { backgroundColor: colors.accent + '22', borderWidth: 1, borderColor: colors.accent },
  tabText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  tabTextActive: { color: colors.accent },

  list: { padding: 12, gap: 12 },
  emptyState: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  emptyText: { fontSize: 13, lineHeight: 20, color: colors.textMuted, textAlign: 'center' },

  card: {
    backgroundColor: colors.bgCard, borderRadius: 16, padding: 14, gap: 10,
    borderWidth: 1, borderColor: colors.border,
  },

  typeBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  typeBadgeIcon: { fontSize: 12 },
  typeBadgeLabel: { fontSize: 11, fontWeight: '700' },

  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { fontSize: 22 },
  authorName: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  time: { fontSize: 11, color: colors.textMuted },

  content: { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },

  refCard: {
    backgroundColor: colors.bgSecondary, borderRadius: 10, padding: 10,
    borderLeftWidth: 3, gap: 3,
  },
  refName: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  refMeta: { fontSize: 11, color: colors.textMuted },

  tagsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tag: { backgroundColor: colors.bgSecondary, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 11, color: colors.accent, fontWeight: '600' },

  actionsBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10,
  },
  actionsLeft: { flexDirection: 'row', gap: 6 },
  actionBtn: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.bgSecondary, borderRadius: 14 },
  actionText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  actionLiked: { color: '#ef4444' },

  ctaBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  ctaText: { fontSize: 12, fontWeight: '700' },
});
