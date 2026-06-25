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
import { useAuthStore } from '../../stores/authStore';
import type { SocialStackParamList } from '../../navigation/types';

type RouteT = RouteProp<SocialStackParamList, 'PostDetail'>;
type Nav = NativeStackNavigationProp<SocialStackParamList, 'PostDetail'>;

type Comment = {
  id: string;
  authorId: string;
  author: string;
  avatar?: string;
  content: string;
  likes: number;
  time: string;
  isLiked?: boolean;
};

type PostDetail = {
  id: string;
  authorId: string;
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

const PLACEHOLDER_POST: PostDetail = {
  id: '1', authorId: 'u1', author: 'openclaw_fan', avatar: '🦀',
  content: 'Just deployed my first cloud agent via ClawLink! Running a research agent 24/7 now 🚀\n\nHere\'s my setup:\n- Web Search skill\n- Summarizer skill\n- Scheduled via Cron trigger\n\nTotal cost: ~$0.03 / day. Absolutely worth it.',
  tags: ['showcase', 'cloud', 'agent'],
  likes: 42, comments: 3, time: '2h', isLiked: false,
  badges: ['Top Creator'],
};

const PLACEHOLDER_COMMENTS: Comment[] = [
  { id: 'c1', authorId: 'u2', author: 'ai_builder', avatar: '🤖', content: 'That\'s a great setup! Which Web Search skill did you use?', likes: 5, time: '1h' },
  { id: 'c2', authorId: 'u3', author: 'claw_dev', avatar: '💻', content: 'Try the "Exa Search" skill — way better for research queries.', likes: 8, time: '45m' },
  { id: 'c3', authorId: 'u4', author: 'skill_wizard', avatar: '⚡', content: 'Followed! Would love to see your workflow diagram.', likes: 2, time: '20m' },
];

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

export function PostDetailScreen() {
  const route = useRoute<RouteT>();
  const navigation = useNavigation<Nav>();
  const { postId } = route.params;
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const inputRef = useRef<TextInput>(null);

  const { data: post, isLoading: postLoading } = useQuery({
    queryKey: ['post', postId],
    queryFn: () => fetchPost(postId),
    retry: false,
    select: (d) => d ?? PLACEHOLDER_POST,
  });

  const { data: comments, isLoading: commentsLoading } = useQuery({
    queryKey: ['post-comments', postId],
    queryFn: () => fetchComments(postId),
    retry: false,
    select: (d) => (Array.isArray(d) && d.length > 0 ? d : PLACEHOLDER_COMMENTS),
  });

  const likeMut = useMutation({
    mutationFn: () => toggleLikePost(postId),
    onMutate: () => {
      qc.setQueryData(['post', postId], (old: PostDetail | undefined) =>
        old ? { ...old, likes: old.isLiked ? old.likes - 1 : old.likes + 1, isLiked: !old.isLiked } : old
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['post', postId] }),
  });

  const commentMut = useMutation({
    mutationFn: (content: string) => postComment(postId, content),
    onMutate: async (content) => {
      const opt: Comment = {
        id: `opt-${Date.now()}`, authorId: me?.id ?? 'me',
        author: me?.nickname ?? 'You', content, likes: 0, time: 'just now',
      };
      qc.setQueryData(['post-comments', postId], (old: Comment[] | undefined) => [...(old ?? []), opt]);
      qc.setQueryData(['post', postId], (old: PostDetail | undefined) =>
        old ? { ...old, comments: old.comments + 1 } : old
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

  const ListHeader = () => {
    if (!post) return null;
    return (
      <View style={styles.postCard}>
        {/* Author row */}
        <TouchableOpacity
          style={styles.authorRow}
          onPress={() => navigation.navigate('UserProfile', { userId: post.authorId })}
        >
          <Text style={styles.avatar}>{post.avatar ?? '👤'}</Text>
          <View style={{ flex: 1 }}>
            <View style={styles.authorNameRow}>
              <Text style={styles.authorName}>{post.author}</Text>
              {post.badges?.map((b) => (
                <View key={b} style={styles.badge}>
                  <Text style={styles.badgeText}>{b === 'Top Creator' ? '⭐' : b === 'Genesis Node' ? '⚡' : '🏅'} {b}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.postTime}>{post.time}</Text>
          </View>
        </TouchableOpacity>

        {/* Content */}
        <Text style={styles.postContent}>{post.content}</Text>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {post.tags.map((t) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>#{t}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => likeMut.mutate()}>
            <Text style={[styles.actionText, post.isLiked && styles.actionActive]}>
              {post.isLiked ? '❤️' : '🤍'} {post.likes}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => inputRef.current?.focus()}>
            <Text style={styles.actionText}>💬 {post.comments}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <Text style={styles.actionText}>🔗 Share</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />
        <Text style={styles.commentsTitle}>Comments</Text>
      </View>
    );
  };

  const renderComment = ({ item }: { item: Comment }) => (
    <View style={styles.commentRow}>
      <Text style={styles.commentAvatar}>{item.avatar ?? '👤'}</Text>
      <View style={styles.commentBody}>
        <View style={styles.commentHeader}>
          <Text style={styles.commentAuthor}>{item.author}</Text>
          <Text style={styles.commentTime}>{item.time}</Text>
        </View>
        <Text style={styles.commentContent}>{item.content}</Text>
        <TouchableOpacity>
          <Text style={styles.commentLike}>🤍 {item.likes}</Text>
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

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          data={comments ?? []}
          keyExtractor={(c) => c.id}
          renderItem={renderComment}
          ListHeaderComponent={<ListHeader />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={commentsLoading ? <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} /> : null}
        />
        {/* Comment Input */}
        <View style={styles.inputBar}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Write a comment..."
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
});
