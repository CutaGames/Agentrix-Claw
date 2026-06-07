import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, FlatList,
  TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { socialShareService } from '../../services/socialShare';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../stores/i18nStore';
import type { SocialStackParamList } from '../../navigation/types';

type RouteT = RouteProp<SocialStackParamList, 'PostDetail'>;
type Nav = NativeStackNavigationProp<SocialStackParamList, 'PostDetail'>;

type Comment = {
  id: string;
  authorId: string;
  authorName?: string;
  authorAvatar?: string;
  content: string;
  likeCount: number;
  createdAt: string;
  likedByMe?: boolean;
};

type PostDetail = {
  id: string;
  authorId: string;
  authorName?: string;
  authorAvatar?: string;
  content: string;
  tags?: string[];
  likeCount: number;
  commentCount: number;
  shareCount: number;
  createdAt: string;
  likedByMe?: boolean;
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

async function fetchPost(postId: string): Promise<PostDetail | null> {
  try { return apiFetch<PostDetail>(`/social/posts/${postId}`); }
  catch { return null; }
}
async function fetchComments(postId: string): Promise<Comment[]> {
  try { return apiFetch<Comment[]>(`/social/posts/${postId}/comments`); }
  catch { return []; }
}
async function toggleLikePost(postId: string) {
  return apiFetch(`/social/posts/${postId}/like`, { method: 'POST' });
}
async function postComment(postId: string, content: string) {
  return apiFetch(`/social/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ content }) });
}
async function toggleLikeComment(commentId: string) {
  return apiFetch(`/social/comments/${commentId}/like`, { method: 'POST' });
}
async function recordShare(postId: string) {
  return apiFetch(`/social/posts/${postId}/share`, { method: 'POST' });
}

export function PostDetailScreen() {
  const route = useRoute<RouteT>();
  const navigation = useNavigation<Nav>();
  const { postId } = route.params;
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { t } = useI18n();
  const [comment, setComment] = useState('');
  const inputRef = useRef<TextInput>(null);

  const { data: post, isLoading: postLoading } = useQuery({
    queryKey: ['post', postId],
    queryFn: () => fetchPost(postId),
    retry: false,
  });

  const { data: comments, isLoading: commentsLoading } = useQuery({
    queryKey: ['post-comments', postId],
    queryFn: () => fetchComments(postId),
    retry: false,
  });

  const likeMut = useMutation({
    mutationFn: () => toggleLikePost(postId),
    onMutate: () => {
      qc.setQueryData(['post', postId], (old: PostDetail | undefined) =>
        old ? {
          ...old,
          likeCount: old.likedByMe ? old.likeCount - 1 : old.likeCount + 1,
          likedByMe: !old.likedByMe,
        } : old
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['post', postId] }),
  });

  const commentLikeMut = useMutation({
    mutationFn: (commentId: string) => toggleLikeComment(commentId),
    onMutate: (commentId) => {
      qc.setQueryData(['post-comments', postId], (old: Comment[] | undefined) =>
        (old ?? []).map((item) => item.id === commentId
          ? {
              ...item,
              likeCount: item.likedByMe ? item.likeCount - 1 : item.likeCount + 1,
              likedByMe: !item.likedByMe,
            }
          : item)
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['post-comments', postId] }),
  });

  const commentMut = useMutation({
    mutationFn: (content: string) => postComment(postId, content),
    onMutate: async (content) => {
      const opt: Comment = {
        id: `opt-${Date.now()}`, authorId: me?.id ?? 'me',
        authorName: me?.nickname ?? 'You', content, likeCount: 0, createdAt: new Date().toISOString(),
      };
      qc.setQueryData(['post-comments', postId], (old: Comment[] | undefined) => [...(old ?? []), opt]);
      qc.setQueryData(['post', postId], (old: PostDetail | undefined) =>
        old ? { ...old, commentCount: old.commentCount + 1 } : old
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['post-comments', postId] });
      qc.invalidateQueries({ queryKey: ['post', postId] });
    },
  });

  const handleComment = useCallback(() => {
    const text = comment.trim();
    if (!text) return;
    setComment('');
    commentMut.mutate(text);
  }, [comment, commentMut]);

  const handleShare = useCallback(async () => {
    if (!post) return;
    const result = await socialShareService.share({
      title: post.authorName ?? 'Agentrix Post',
      message: post.content,
      url: `https://agentrix.top/social/posts/${post.id}`,
    });
    if (result.success) {
      await recordShare(post.id).catch(() => null);
      qc.invalidateQueries({ queryKey: ['post', postId] });
    }
  }, [post, postId, qc]);

  const ListHeader = () => {
    if (!post) return null;
    return (
      <View style={styles.postCard}>
        {/* Author row */}
        <TouchableOpacity
          style={styles.authorRow}
          onPress={() => navigation.navigate('UserProfile', { userId: post.authorId })}
        >
          <Text style={styles.avatar}>{post.authorAvatar ?? '👤'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.authorName}>{post.authorName ?? 'Agent'}</Text>
            <Text style={styles.postTime}>{formatRelativeTime(post.createdAt)}</Text>
          </View>
        </TouchableOpacity>

        {/* Content */}
        <Text style={styles.postContent}>{post.content}</Text>

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

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => likeMut.mutate()}>
            <Text style={[styles.actionText, post.likedByMe && styles.actionActive]}>
              {post.likedByMe ? '❤️' : '🤍'} {post.likeCount}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => inputRef.current?.focus()}>
            <Text style={styles.actionText}>💬 {post.commentCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
            <Text style={styles.actionText}>🔗 {post.shareCount}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />
        <Text style={styles.commentsTitle}>{t({ en: 'Comments', zh: '评论' })}</Text>
      </View>
    );
  };

  const renderComment = ({ item }: { item: Comment }) => (
    <View style={styles.commentRow}>
      <Text style={styles.commentAvatar}>{item.authorAvatar ?? '👤'}</Text>
      <View style={styles.commentBody}>
        <View style={styles.commentHeader}>
          <Text style={styles.commentAuthor}>{item.authorName ?? 'User'}</Text>
          <Text style={styles.commentTime}>{formatRelativeTime(item.createdAt)}</Text>
        </View>
        <Text style={styles.commentContent}>{item.content}</Text>
        <TouchableOpacity onPress={() => commentLikeMut.mutate(item.id)}>
          <Text style={[styles.commentLike, item.likedByMe && styles.actionActive]}>
            {item.likedByMe ? '❤️' : '🤍'} {item.likeCount}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (postLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.loading}>
        <Text style={styles.emptyStateTitle}>{t({ en: 'Post not found', zh: '动态不存在' })}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          data={comments ?? []}
          keyExtractor={(c) => c.id}
          renderItem={renderComment}
          ListHeaderComponent={<ListHeader />}
          ListEmptyComponent={!commentsLoading ? <Text style={styles.emptyComments}>{t({ en: 'No comments yet', zh: '还没有评论' })}</Text> : null}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={commentsLoading ? <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} /> : null}
        />
        {/* Comment Input */}
        <View style={styles.inputBar}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={t({ en: 'Write a comment...', zh: '写下你的评论...' })}
            placeholderTextColor={colors.textMuted}
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !comment.trim() && styles.sendBtnDisabled]}
            onPress={handleComment}
            disabled={!comment.trim()}
          >
            <Text style={styles.sendIcon}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  loading: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 12 },
  postCard: { padding: 16, gap: 12 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { fontSize: 36 },
  authorNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  authorName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  postTime: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  badge: { backgroundColor: colors.accent + '22', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: colors.accent + '55' },
  badgeText: { fontSize: 10, color: colors.accent, fontWeight: '700' },
  postContent: { fontSize: 15, color: colors.textSecondary, lineHeight: 24 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: colors.bgCard, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 11, color: colors.accent, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.bgCard, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  actionText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  actionActive: { color: '#ef4444' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  commentsTitle: { fontSize: 14, fontWeight: '700', color: colors.textMuted, paddingBottom: 4 },
  commentRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border + '55' },
  commentAvatar: { fontSize: 28, marginTop: 2 },
  commentBody: { flex: 1, gap: 4 },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  commentAuthor: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  commentTime: { fontSize: 11, color: colors.textMuted },
  commentContent: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  commentLike: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bgSecondary,
  },
  input: {
    flex: 1, backgroundColor: colors.bgCard, color: colors.textPrimary,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, maxHeight: 100, borderWidth: 1, borderColor: colors.border,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon: { color: '#fff', fontSize: 17, marginLeft: 2 },
  emptyComments: { paddingHorizontal: 16, paddingVertical: 20, color: colors.textMuted, textAlign: 'center' },
  emptyStateTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
});
