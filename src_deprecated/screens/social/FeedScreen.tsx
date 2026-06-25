import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  RefreshControl, ActivityIndicator, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import type { SocialStackParamList, MainTabParamList } from '../../navigation/types';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<SocialStackParamList, 'Feed'>,
  BottomTabNavigationProp<MainTabParamList>
>;

type Post = {
  id: string;
  authorId?: string;
  author: string;
  avatar?: string;
  content: string;
  tags?: string[];
  likes: number;
  comments: number;
  time: string;
  isLiked?: boolean;
  badges?: string[];
};

const FEED_TABS = ['Hot', 'Latest', 'Following'];
const TRENDING_TAGS = ['showcase', 'skill', 'productivity', 'dev', 'ai', 'workflow', 'agent', 'github'];

const BADGE_CONFIG: Record<string, { icon: string; color: string }> = {
  'Top Creator': { icon: '⭐', color: '#F59E0B' },
  'Genesis Node': { icon: '⚡', color: '#00d4ff' },
  'Skill Wizard': { icon: '🔮', color: '#7c3aed' },
};

const PLACEHOLDER_POSTS: Post[] = [
  {
    id: '1', authorId: 'u1', author: 'openclaw_fan', avatar: '🦀',
    content: 'Just deployed my first cloud agent via ClawLink! Running a research agent 24/7 now 🚀',
    likes: 42, comments: 7, time: '2h', isLiked: false,
    tags: ['showcase', 'cloud'], badges: ['Top Creator'],
  },
  {
    id: '2', authorId: 'u2', author: 'ai_builder', avatar: '🤖',
    content: 'Built a custom skill that auto-summarizes my emails every morning. 10/10 would recommend OpenClaw for productivity workflows.',
    likes: 87, comments: 15, time: '4h', isLiked: false,
    tags: ['skill', 'productivity'], badges: [],
  },
  {
    id: '3', authorId: 'u3', author: 'claw_dev', avatar: '💻',
    content: 'New MCP skill published: "GitHub Auto-Review". Installs in 1-click from ClawLink Market. Check it out!',
    likes: 120, comments: 23, time: '6h', isLiked: false,
    tags: ['skill', 'github', 'dev'], badges: ['Genesis Node'],
  },
  {
    id: '4', authorId: 'u4', author: 'skill_wizard', avatar: '⚡',
    content: 'Hot take: the best agent workflow is one you set and forget. Here\'s my zero-maintenance research pipeline →',
    likes: 64, comments: 9, time: '8h', isLiked: false,
    tags: ['workflow', 'ai'], badges: ['Skill Wizard'],
  },
];

async function fetchFeedPage(tab: string, tag: string | null, page: number): Promise<Post[]> {
  const params = new URLSearchParams({ sort: tab.toLowerCase(), page: String(page) });
  if (tag) params.set('tag', tag);
  const endpoint = tab === 'Following' ? `/social/feed/following?${params}` : `/social/posts?${params}`;
  try { return apiFetch<Post[]>(endpoint); }
  catch { return []; }
}

async function likePost(postId: string) {
  return apiFetch(`/social/posts/${postId}/like`, { method: 'POST' });
}

export function FeedScreen() {
  const navigation = useNavigation<Nav>();
  const [feedTab, setFeedTab] = useState('Hot');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const qc = useQueryClient();

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const { data, isLoading, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['feed', feedTab, activeTag],
      queryFn: ({ pageParam }) => fetchFeedPage(feedTab, activeTag, pageParam as number),
      initialPageParam: 1,
      getNextPageParam: (lastPage, allPages) =>
        Array.isArray(lastPage) && lastPage.length >= 10 ? allPages.length + 1 : undefined,
      retry: false,
    });

  const allPosts: Post[] = data?.pages?.flatMap((p) => (Array.isArray(p) && p.length > 0 ? p : []))
    ?? [];
  const posts = allPosts.length > 0 ? allPosts : PLACEHOLDER_POSTS.filter((p) => !activeTag || p.tags?.includes(activeTag));

  const likeMut = useMutation({
    mutationFn: (postId: string) => likePost(postId),
    onMutate: (postId) => {
      qc.setQueryData(['feed', feedTab, activeTag], (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: Post[]) =>
            page.map((p: Post) =>
              p.id === postId
                ? { ...p, isLiked: !p.isLiked, likes: p.isLiked ? p.likes - 1 : p.likes + 1 }
                : p
            )
          ),
        };
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['feed', feedTab, activeTag] }),
  });

  const handleTagPress = useCallback((tag: string) => {
    setActiveTag((prev) => (prev === tag ? null : tag));
  }, []);

  const renderPost = useCallback(({ item: post }: { item: Post }) => (
    <TouchableOpacity
      style={styles.postCard}
      activeOpacity={0.85}
      onPress={() => navigation.navigate('PostDetail', { postId: post.id })}
    >
      {/* Author row */}
      <TouchableOpacity
        style={styles.postHeader}
        onPress={() => post.authorId && navigation.navigate('UserProfile', { userId: post.authorId })}
      >
        <Text style={styles.postAvatar}>{post.avatar ?? '👤'}</Text>
        <View style={{ flex: 1 }}>
          <View style={styles.authorNameRow}>
            <Text style={styles.postAuthor}>{post.author}</Text>
            {post.badges?.map((b) => {
              const cfg = BADGE_CONFIG[b];
              if (!cfg) return null;
              return (
                <View key={b} style={[styles.badgePill, { backgroundColor: cfg.color + '22', borderColor: cfg.color + '66' }]}>
                  <Text style={[styles.badgePillText, { color: cfg.color }]}>{cfg.icon}</Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.postTime}>{post.time}</Text>
        </View>
      </TouchableOpacity>

      {/* Content */}
      <Text style={styles.postContent} numberOfLines={5}>{post.content}</Text>

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {post.tags.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tag, activeTag === t && styles.tagActive]}
              onPress={() => handleTagPress(t)}
            >
              <Text style={[styles.tagText, activeTag === t && styles.tagTextActive]}>#{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={styles.postActions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={(e) => { e.stopPropagation(); likeMut.mutate(post.id); }}
        >
          <Text style={[styles.actionText, post.isLiked && styles.actionLiked]}>
            {post.isLiked ? '❤️' : '🤍'} {post.likes}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <Text style={styles.actionText}>💬 {post.comments}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <Text style={styles.actionText}>🔗 Share</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  ), [navigation, activeTag, handleTagPress, likeMut]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Community</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.navigate('CreatePost' as any)}>
            <Text style={styles.headerIcon}>✏️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.navigate('Chat')}>
            <Text style={styles.headerIcon}>💬</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Feed Tabs */}
      <View style={styles.tabs}>
        {FEED_TABS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, feedTab === t && styles.tabActive]}
            onPress={() => { setFeedTab(t); setActiveTag(null); }}
          >
            <Text style={[styles.tabText, feedTab === t && styles.tabTextActive]}>
              {t === 'Hot' ? '🔥 Hot' : t === 'Latest' ? '🆕 Latest' : '👥 Following'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Trending Tags */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tagScroll}
        contentContainerStyle={styles.tagScrollContent}
      >
        {TRENDING_TAGS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.trendingTag, activeTag === t && styles.trendingTagActive]}
            onPress={() => handleTagPress(t)}
          >
            <Text style={[styles.trendingTagText, activeTag === t && styles.trendingTagTextActive]}>#{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={renderPost}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => { qc.removeQueries({ queryKey: ['feed'] }); refetch(); }} tintColor={colors.accent} />}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 8 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  headerRight: { flexDirection: 'row', gap: 4 },
  headerIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  headerIcon: { fontSize: 16 },
  tabs: { flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: colors.bgCard },
  tabActive: { backgroundColor: colors.accent + '22', borderWidth: 1, borderColor: colors.accent },
  tabText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  tabTextActive: { color: colors.accent },
  tagScroll: { maxHeight: 40 },
  tagScrollContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: 'row' },
  trendingTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  trendingTagActive: { backgroundColor: colors.accent + '22', borderColor: colors.accent },
  trendingTagText: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  trendingTagTextActive: { color: colors.accent },
  list: { padding: 12, gap: 10 },
  postCard: { backgroundColor: colors.bgCard, borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.border },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  postAvatar: { fontSize: 28 },
  authorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  postAuthor: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  badgePill: { borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1 },
  badgePillText: { fontSize: 10, fontWeight: '700' },
  postTime: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  postContent: { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
  tagsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tag: { backgroundColor: colors.bgSecondary, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'transparent' },
  tagActive: { borderColor: colors.accent, backgroundColor: colors.accent + '1a' },
  tagText: { fontSize: 11, color: colors.accent, fontWeight: '600' },
  tagTextActive: { color: colors.accent },
  postActions: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  actionBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.bgSecondary, borderRadius: 16 },
  actionText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  actionLiked: { color: '#ef4444' },
});
