import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import type { SocialStackParamList, MainTabParamList } from '../../navigation/types';

type RouteT = RouteProp<SocialStackParamList, 'UserProfile'>;
type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<SocialStackParamList, 'UserProfile'>,
  BottomTabNavigationProp<MainTabParamList>
>;

type UserProfile = {
  id: string;
  nickname: string;
  avatar?: string;
  bio?: string;
  badges?: string[];
  followers: number;
  following: number;
  postCount: number;
  skillCount: number;
  isFollowing?: boolean;
};

type Skill = {
  id: string;
  name: string;
  description: string;
  price: number;
  priceUnit: string;
  downloads?: number;
};

type Post = {
  id: string;
  content: string;
  tags?: string[];
  likes: number;
  comments: number;
  time: string;
};

const PLACEHOLDER_PROFILE: UserProfile = {
  id: 'u1', nickname: 'openclaw_fan', avatar: '🦀',
  bio: 'AI builder & agent enthusiast. Building automation workflows with OpenClaw. Top Creator on Agentrix.',
  badges: ['Top Creator', 'Genesis Node'],
  followers: 1240, following: 87, postCount: 42, skillCount: 5,
  isFollowing: false,
};

const PLACEHOLDER_POSTS: Post[] = [
  { id: 'p1', content: 'Just deployed my first cloud agent via ClawLink! Running a research agent 24/7 now 🚀', tags: ['showcase', 'cloud'], likes: 42, comments: 7, time: '2h' },
  { id: 'p2', content: 'New workflow: GitHub PR auto-review + Slack notify. Drop-and-run in 5 min.', tags: ['dev', 'workflow'], likes: 58, comments: 11, time: '1d' },
];

const PLACEHOLDER_SKILLS: Skill[] = [
  { id: 's1', name: 'Web Search Pro', description: 'Enhanced search with source citations', price: 0, priceUnit: 'free', downloads: 3200 },
  { id: 's2', name: 'GitHub Auto-Review', description: 'Automatically reviews PRs and posts comments', price: 2, priceUnit: 'USDT', downloads: 890 },
  { id: 's3', name: 'Email Summarizer', description: 'Reads and summarizes email threads daily', price: 1, priceUnit: 'USDT', downloads: 1500 },
];

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  try { return apiFetch<UserProfile>(`/social/users/${userId}`); }
  catch { return null; }
}
async function fetchUserPosts(userId: string): Promise<Post[]> {
  try { return apiFetch<Post[]>(`/social/users/${userId}/posts`); }
  catch { return []; }
}
async function fetchUserSkills(userId: string): Promise<Skill[]> {
  try { return apiFetch<Skill[]>(`/social/users/${userId}/skills`); }
  catch { return []; }
}
async function toggleFollow(userId: string) {
  return apiFetch(`/social/users/${userId}/follow`, { method: 'POST' });
}

const BADGE_CONFIG: Record<string, { icon: string; color: string }> = {
  'Top Creator': { icon: '⭐', color: '#F59E0B' },
  'Genesis Node': { icon: '⚡', color: '#00d4ff' },
  'Skill Wizard': { icon: '🔮', color: '#7c3aed' },
  'Task Hunter': { icon: '🎯', color: '#10B981' },
};

export function UserProfileScreen() {
  const route = useRoute<RouteT>();
  const navigation = useNavigation<Nav>();
  const { userId } = route.params;
  const me = useAuthStore((s) => s.user);
  const isMe = me?.id === userId;
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'posts' | 'skills'>('posts');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: () => fetchProfile(userId),
    retry: false,
    select: (d) => d ?? PLACEHOLDER_PROFILE,
  });

  const { data: posts } = useQuery({
    queryKey: ['user-posts', userId],
    queryFn: () => fetchUserPosts(userId),
    retry: false,
    select: (d) => (Array.isArray(d) && d.length > 0 ? d : PLACEHOLDER_POSTS),
  });

  const { data: skills } = useQuery({
    queryKey: ['user-skills', userId],
    queryFn: () => fetchUserSkills(userId),
    retry: false,
    select: (d) => (Array.isArray(d) && d.length > 0 ? d : PLACEHOLDER_SKILLS),
  });

  const followMut = useMutation({
    mutationFn: () => toggleFollow(userId),
    onMutate: () => {
      qc.setQueryData(['user-profile', userId], (old: UserProfile | undefined) =>
        old ? {
          ...old,
          isFollowing: !old.isFollowing,
          followers: old.isFollowing ? old.followers - 1 : old.followers + 1,
        } : old
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['user-profile', userId] }),
  });

  if (isLoading) {
    return <View style={styles.loading}><ActivityIndicator color={colors.accent} size="large" /></View>;
  }
  if (!profile) return null;

  const ProfileHeader = () => (
    <View style={styles.profileHeader}>
      {/* Avatar + action */}
      <View style={styles.avatarRow}>
        <Text style={styles.avatar}>{profile.avatar ?? '👤'}</Text>
        {!isMe ? (
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.followBtn, profile.isFollowing && styles.followingBtn]}
              onPress={() => followMut.mutate()}
            >
              <Text style={[styles.followBtnText, profile.isFollowing && styles.followingBtnText]}>
                {profile.isFollowing ? 'Following ✓' : 'Follow'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dmBtn}
              onPress={() => navigation.navigate('Chat', { screen: 'DirectMessage', params: { userId, userName: profile.nickname } })}
            >
              <Text style={styles.dmBtnText}>✉️</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.editBtn}>
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Name + badges */}
      <Text style={styles.nickname}>{profile.nickname}</Text>
      <View style={styles.badgesRow}>
        {profile.badges?.map((b) => {
          const cfg = BADGE_CONFIG[b] ?? { icon: '🏅', color: colors.accent };
          return (
            <View key={b} style={[styles.badge, { borderColor: cfg.color + '66', backgroundColor: cfg.color + '1a' }]}>
              <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.icon} {b}</Text>
            </View>
          );
        })}
      </View>

      {/* Bio */}
      {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{profile.postCount}</Text>
          <Text style={styles.statLabel}>Posts</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{profile.skillCount}</Text>
          <Text style={styles.statLabel}>Skills</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{profile.followers >= 1000 ? (profile.followers / 1000).toFixed(1) + 'k' : profile.followers}</Text>
          <Text style={styles.statLabel}>Followers</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{profile.following}</Text>
          <Text style={styles.statLabel}>Following</Text>
        </View>
      </View>

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.profileTab, activeTab === 'posts' && styles.profileTabActive]}
          onPress={() => setActiveTab('posts')}
        >
          <Text style={[styles.profileTabText, activeTab === 'posts' && styles.profileTabTextActive]}>📝 Posts</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.profileTab, activeTab === 'skills' && styles.profileTabActive]}
          onPress={() => setActiveTab('skills')}
        >
          <Text style={[styles.profileTabText, activeTab === 'skills' && styles.profileTabTextActive]}>⚡ Skills</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPost = ({ item }: { item: Post }) => (
    <TouchableOpacity
      style={styles.postCard}
      onPress={() => navigation.navigate('PostDetail', { postId: item.id })}
    >
      <Text style={styles.postContent} numberOfLines={3}>{item.content}</Text>
      {item.tags && item.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {item.tags.map((t) => (
            <View key={t} style={styles.tag}><Text style={styles.tagText}>#{t}</Text></View>
          ))}
        </View>
      )}
      <View style={styles.postMeta}>
        <Text style={styles.postMetaText}>❤️ {item.likes}</Text>
        <Text style={styles.postMetaText}>💬 {item.comments}</Text>
        <Text style={styles.postMetaText}>{item.time}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderSkill = ({ item }: { item: Skill }) => (
    <View style={styles.skillCard}>
      <View style={styles.skillInfo}>
        <Text style={styles.skillName}>{item.name}</Text>
        <Text style={styles.skillDesc} numberOfLines={2}>{item.description}</Text>
        {item.downloads != null && (
          <Text style={styles.skillDownloads}>⬇ {item.downloads >= 1000 ? (item.downloads / 1000).toFixed(1) + 'k' : item.downloads} installs</Text>
        )}
      </View>
      <View style={styles.skillRight}>
        <Text style={styles.skillPrice}>
          {item.price === 0 ? 'Free' : `${item.price} ${item.priceUnit}`}
        </Text>
        <TouchableOpacity style={styles.installBtn}>
          <Text style={styles.installBtnText}>Install</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={activeTab === 'posts' ? (posts ?? []) : (skills ?? [])}
        keyExtractor={(item) => item.id}
        renderItem={activeTab === 'posts' ? renderPost : renderSkill}
        ListHeaderComponent={<ProfileHeader />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>{activeTab === 'posts' ? '📝' : '⚡'}</Text>
            <Text style={styles.emptyText}>No {activeTab} yet</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  loading: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 24 },

  profileHeader: { padding: 16, gap: 10 },
  avatarRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  avatar: { fontSize: 60 },
  headerActions: { flexDirection: 'row', gap: 8 },
  followBtn: { paddingHorizontal: 20, paddingVertical: 9, backgroundColor: colors.accent, borderRadius: 20 },
  followingBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  followBtnText: { color: '#000', fontSize: 14, fontWeight: '700' },
  followingBtnText: { color: colors.textMuted },
  dmBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  dmBtnText: { fontSize: 18 },
  editBtn: { paddingHorizontal: 16, paddingVertical: 9, backgroundColor: colors.bgCard, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  editBtnText: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  nickname: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginTop: 4 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  bio: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  statsRow: { flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: 14, padding: 14, marginTop: 4 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: colors.border },
  tabRow: { flexDirection: 'row', gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 0, marginTop: 4 },
  profileTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  profileTabActive: { borderBottomColor: colors.accent },
  profileTabText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  profileTabTextActive: { color: colors.accent },

  postCard: { marginHorizontal: 12, marginBottom: 8, backgroundColor: colors.bgCard, borderRadius: 12, padding: 14, gap: 8, borderWidth: 1, borderColor: colors.border },
  postContent: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tag: { backgroundColor: colors.bgSecondary, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { fontSize: 11, color: colors.accent, fontWeight: '600' },
  postMeta: { flexDirection: 'row', gap: 12 },
  postMetaText: { fontSize: 12, color: colors.textMuted },

  skillCard: { marginHorizontal: 12, marginBottom: 8, backgroundColor: colors.bgCard, borderRadius: 12, padding: 14, flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: colors.border },
  skillInfo: { flex: 1, gap: 4 },
  skillName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  skillDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  skillDownloads: { fontSize: 11, color: colors.textMuted },
  skillRight: { alignItems: 'flex-end', gap: 8 },
  skillPrice: { fontSize: 13, fontWeight: '700', color: colors.accent },
  installBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  installBtnText: { color: '#000', fontSize: 12, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyIcon: { fontSize: 36 },
  emptyText: { fontSize: 14, color: colors.textMuted },
});

