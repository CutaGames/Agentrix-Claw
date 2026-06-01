/**
 * UserProfileScreen → AgentReputationScreen
 *
 * Rewritten from a generic social profile into an Agent-centric
 * reputation page showing: reputation score, agent stats breakdown,
 * published skills with install CTA, and recent showcase posts.
 *
 * API:
 *   GET /social/users/:userId/reputation  — agent reputation stats
 *   GET /social/users/:userId/posts       — user's showcase posts
 *   GET /social/users/:userId/skills      — published skills
 *   POST /social/users/:userId/follow     — toggle follow
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator,
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
import { useI18n } from '../../stores/i18nStore';
import type { SocialStackParamList, MainTabParamList } from '../../navigation/types';

type RouteT = RouteProp<SocialStackParamList, 'UserProfile'>;
type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<SocialStackParamList, 'UserProfile'>,
  BottomTabNavigationProp<MainTabParamList>
>;

// ── Types ─────────────────────────────────────────────────────────────────────

type ReputationData = {
  userId: string;
  postCount: number;
  followerCount: number;
  followingCount: number;
  showcasePosts: number;
  skillsPublished: number;
  workflowResults: number;
  tasksCompleted: number;
  agentDeploys: number;
  totalLikesReceived: number;
  reputationScore: number;
};

type UserProfile = {
  id: string;
  nickname: string;
  avatar?: string;
  bio?: string;
  badges?: string[];
  isFollowing?: boolean;
};

type ShowcasePost = {
  id: string;
  content: string;
  type: string;
  tags?: string[];
  likeCount: number;
  commentCount: number;
  createdAt: string;
};

type Skill = {
  id: string;
  name: string;
  description: string;
  price: number;
  priceUnit: string;
  downloads?: number;
  rating?: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const BADGE_CONFIG: Record<string, { icon: string; color: string }> = {
  'Top Creator': { icon: '⭐', color: '#F59E0B' },
  'Genesis Node': { icon: '⚡', color: '#00d4ff' },
  'Skill Wizard': { icon: '🔮', color: '#7c3aed' },
  'Task Hunter': { icon: '🎯', color: '#10B981' },
};

function fmtK(n: number) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }

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

function ScoreRing({ score }: { score: number }) {
  const pct = (score / 5.0) * 100;
  const col = score >= 4 ? '#10B981' : score >= 3 ? '#F59E0B' : '#EF4444';
  return (
    <View style={[rs.ring, { borderColor: col + '33' }]}>
      <View style={[rs.fill, { backgroundColor: col + '22' }]}>
        <Text style={[rs.score, { color: col }]}>{score}</Text>
        <Text style={rs.label}>/ 5.0</Text>
      </View>
    </View>
  );
}
const rs = StyleSheet.create({
  ring: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  fill: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  score: { fontSize: 22, fontWeight: '900' },
  label: { fontSize: 9, color: colors.textMuted },
});

// ── Main Component ────────────────────────────────────────────────────────────

export function UserProfileScreen() {
  const route = useRoute<RouteT>();
  const navigation = useNavigation<Nav>();
  const { userId } = route.params;
  const me = useAuthStore((s) => s.user);
  const isMe = me?.id === userId;
  const qc = useQueryClient();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'agents' | 'skills' | 'showcase'>('agents');

  // ── Queries ──

  const { data: profile } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: () => apiFetch<UserProfile>(`/social/users/${userId}`).catch(() => null),
    retry: false,
  });

  const { data: rep, isLoading } = useQuery({
    queryKey: ['user-reputation', userId],
    queryFn: () => apiFetch<{ ok: boolean; data: ReputationData }>(`/social/users/${userId}/reputation`).then((r) => r.data).catch(() => null),
    retry: false,
  });

  const { data: posts } = useQuery({
    queryKey: ['user-posts', userId],
    queryFn: () => apiFetch<ShowcasePost[]>(`/social/users/${userId}/posts`).catch(() => []),
    retry: false,
  });

  const { data: skills } = useQuery({
    queryKey: ['user-skills', userId],
    queryFn: () => apiFetch<Skill[]>(`/social/users/${userId}/skills`).catch(() => []),
    retry: false,
  });

  const followMut = useMutation({
    mutationFn: () => apiFetch(`/social/users/${userId}/follow`, { method: 'POST' }),
    onMutate: () => {
      qc.setQueryData(['user-profile', userId], (old: UserProfile | undefined) =>
        old ? { ...old, isFollowing: !old.isFollowing } : old
      );
      qc.setQueryData(['user-reputation', userId], (old: ReputationData | undefined) =>
        old ? { ...old, followerCount: old.followerCount + (profile?.isFollowing ? -1 : 1) } : old
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['user-profile', userId] });
      qc.invalidateQueries({ queryKey: ['user-reputation', userId] });
    },
  });

  if (isLoading) {
    return <View style={styles.loading}><ActivityIndicator color={colors.accent} size="large" /></View>;
  }
  if (!profile || !rep) {
    return (
      <View style={styles.loading}>
        <Text style={styles.emptyText}>{t({ en: 'User profile not found', zh: '未找到用户资料' })}</Text>
      </View>
    );
  }

  // ── Header ──

  const HeaderComponent = () => (
    <View style={styles.header}>
      {/* Top row: avatar + actions */}
      <View style={styles.topRow}>
        <View style={styles.avatarArea}>
          <Text style={styles.avatarEmoji}>{profile.avatar ?? '👤'}</Text>
          <ScoreRing score={rep.reputationScore} />
        </View>
        {!isMe ? (
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.followBtn, profile.isFollowing && styles.followingBtn]}
              onPress={() => followMut.mutate()}
            >
              <Text style={[styles.followBtnText, profile.isFollowing && styles.followingText]}>
                {profile.isFollowing ? t({ en: 'Following ✓', zh: '已关注 ✓' }) : t({ en: 'Follow', zh: '关注' })}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.editBtn}>
            <Text style={styles.editBtnText}>{t({ en: 'Edit Profile', zh: '编辑资料' })}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Name + badges */}
      <Text style={styles.nickname}>{profile.nickname}</Text>
      {profile.badges && profile.badges.length > 0 && (
        <View style={styles.badgesRow}>
          {profile.badges.map((b) => {
            const cfg = BADGE_CONFIG[b] ?? { icon: '🏅', color: colors.accent };
            return (
              <View key={b} style={[styles.badge, { borderColor: cfg.color + '66', backgroundColor: cfg.color + '1a' }]}>
                <Text style={[styles.badgeLabel, { color: cfg.color }]}>{cfg.icon} {b}</Text>
              </View>
            );
          })}
        </View>
      )}
      {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

      {/* ── Agent Stats Grid ── */}
      <View style={styles.statsGrid}>
        <StatCell icon="🤖" value={rep.agentDeploys} label={t({ en: 'Agents', zh: '智能体' })} />
        <StatCell icon="⚡" value={rep.skillsPublished} label={t({ en: 'Skills', zh: '技能' })} />
        <StatCell icon="📊" value={rep.tasksCompleted} label={t({ en: 'Tasks', zh: '任务' })} />
        <StatCell icon="❤️" value={rep.totalLikesReceived} label={t({ en: 'Likes', zh: '获赞' })} />
      </View>

      {/* Follower row */}
      <View style={styles.followRow}>
        <Text style={styles.followStat}><Text style={styles.followNum}>{fmtK(rep.followerCount)}</Text> {t({ en: 'Followers', zh: '关注者' })}</Text>
        <Text style={styles.followDot}>·</Text>
        <Text style={styles.followStat}><Text style={styles.followNum}>{fmtK(rep.followingCount)}</Text> {t({ en: 'Following', zh: '正在关注' })}</Text>
        <Text style={styles.followDot}>·</Text>
        <Text style={styles.followStat}><Text style={styles.followNum}>{rep.showcasePosts}</Text> {t({ en: 'Posts', zh: '动态' })}</Text>
      </View>

      {/* ── Tab Switcher ── */}
      <View style={styles.tabRow}>
        {(['agents', 'skills', 'showcase'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'agents' ? `🤖 ${t({ en: 'Agents', zh: '智能体' })}` :
               tab === 'skills' ? `⚡ ${t({ en: 'Skills', zh: '技能' })}` :
               `📜 ${t({ en: 'Showcase', zh: '展示' })}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // ── Tab content ──

  const AgentsTab = () => (
    <View style={styles.agentsList}>
      {rep.agentDeploys > 0 ? (
        [
          { key: 'agents', icon: '🤖', name: t({ en: 'Deployed Agents', zh: '已部署智能体' }), value: rep.agentDeploys },
          { key: 'tasks', icon: '📊', name: t({ en: 'Completed Tasks', zh: '已完成任务' }), value: rep.tasksCompleted },
          { key: 'workflows', icon: '⚡', name: t({ en: 'Workflow Results', zh: '工作流成果' }), value: rep.workflowResults },
        ].filter((item) => item.value > 0).map((item) => (
          <View key={item.key} style={styles.agentCard}>
            <Text style={styles.agentIcon}>{item.icon}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.agentName}>{item.name}</Text>
              <Text style={styles.agentMeta}>{item.value}</Text>
            </View>
            <View style={styles.metricPill}><Text style={styles.metricPillText}>{fmtK(item.value)}</Text></View>
          </View>
        ))
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🤖</Text>
          <Text style={styles.emptyText}>{t({ en: 'No agents deployed yet', zh: '暂未部署智能体' })}</Text>
        </View>
      )}
    </View>
  );

  const renderSkill = ({ item }: { item: Skill }) => (
    <View style={styles.skillCard}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.skillName}>{item.name}</Text>
        <Text style={styles.skillDesc} numberOfLines={2}>{item.description}</Text>
        {item.downloads != null && (
          <Text style={styles.skillDl}>⬇ {fmtK(item.downloads)} {t({ en: 'installs', zh: '安装' })}</Text>
        )}
        {typeof item.rating === 'number' && item.rating > 0 && (
          <Text style={styles.skillDl}>⭐ {item.rating.toFixed(1)}</Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={styles.skillPrice}>{item.price === 0 ? 'Free' : `$${item.price}`}</Text>
        <TouchableOpacity style={styles.installBtn}>
          <Text style={styles.installBtnText}>{t({ en: 'Install', zh: '安装' })}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const POST_TYPE_BADGE: Record<string, string> = {
    skill_share: '⚡ Skill',
    workflow_result: '📊 Workflow',
    task_complete: '✅ Task',
    agent_deploy: '🤖 Deploy',
    conversation_highlight: '💬 Chat',
  };

  const renderPost = ({ item }: { item: ShowcasePost }) => (
    <TouchableOpacity
      style={styles.postCard}
      onPress={() => navigation.navigate('PostDetail', { postId: item.id })}
    >
      <View style={styles.postTop}>
        <View style={styles.postTypeBadge}>
          <Text style={styles.postTypeText}>{POST_TYPE_BADGE[item.type] ?? '📝 Post'}</Text>
        </View>
        <Text style={styles.postTime}>{formatRelativeTime(item.createdAt)}</Text>
      </View>
      <Text style={styles.postContent} numberOfLines={3}>{item.content}</Text>
      <View style={styles.postMeta}>
        <Text style={styles.postMetaText}>❤️ {item.likeCount}</Text>
        <Text style={styles.postMetaText}>💬 {item.commentCount}</Text>
      </View>
    </TouchableOpacity>
  );

  // Use FlatList with header for all tabs
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {activeTab === 'agents' ? (
        <FlatList
          data={[]}
          keyExtractor={() => 'agents'}
          renderItem={() => null}
          ListHeaderComponent={<><HeaderComponent /><AgentsTab /></>}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      ) : activeTab === 'skills' ? (
        <FlatList
          data={skills ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderSkill}
          ListHeaderComponent={<HeaderComponent />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>⚡</Text>
              <Text style={styles.emptyText}>{t({ en: 'No skills yet', zh: '暂无技能' })}</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={posts ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderPost}
          ListHeaderComponent={<HeaderComponent />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📜</Text>
              <Text style={styles.emptyText}>{t({ en: 'No showcase posts yet', zh: '暂无展示动态' })}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ── Helper Components ─────────────────────────────────────────────────────────

function StatCell({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{fmtK(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  loading: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 24 },

  // Header
  header: { padding: 16, gap: 10 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  avatarArea: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarEmoji: { fontSize: 52 },
  headerActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  followBtn: { paddingHorizontal: 20, paddingVertical: 9, backgroundColor: colors.accent, borderRadius: 20 },
  followingBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  followBtnText: { color: '#000', fontSize: 14, fontWeight: '700' },
  followingText: { color: colors.textMuted },
  editBtn: { paddingHorizontal: 16, paddingVertical: 9, backgroundColor: colors.bgCard, borderRadius: 20, borderWidth: 1, borderColor: colors.border, marginTop: 8 },
  editBtnText: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },

  nickname: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginTop: 4 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  badgeLabel: { fontSize: 11, fontWeight: '700' },
  bio: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },

  // Stats grid
  statsGrid: {
    flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: 14,
    padding: 12, marginTop: 4, borderWidth: 1, borderColor: colors.border,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 2 },
  statIcon: { fontSize: 18 },
  statValue: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  statLabel: { fontSize: 10, color: colors.textMuted },

  // Follow row
  followRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  followStat: { fontSize: 13, color: colors.textMuted },
  followNum: { fontWeight: '800', color: colors.textPrimary },
  followDot: { color: colors.textMuted },

  // Tabs
  tabRow: { flexDirection: 'row', gap: 4, borderBottomWidth: 1, borderBottomColor: colors.border, marginTop: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.accent },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: colors.accent },

  // Agents tab
  agentsList: { paddingHorizontal: 12, gap: 8, paddingTop: 8 },
  agentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.bgCard, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  agentIcon: { fontSize: 28 },
  agentName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  agentMeta: { fontSize: 12, color: colors.textMuted },
  tryBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7 },
  tryBtnText: { color: '#000', fontSize: 13, fontWeight: '700' },
  metricPill: { backgroundColor: colors.bgSecondary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  metricPillText: { color: colors.textPrimary, fontSize: 12, fontWeight: '700' },

  // Skills tab
  skillCard: {
    marginHorizontal: 12, marginBottom: 8, backgroundColor: colors.bgCard,
    borderRadius: 12, padding: 14, flexDirection: 'row', gap: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  skillName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  skillDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  skillDl: { fontSize: 11, color: colors.textMuted },
  skillPrice: { fontSize: 13, fontWeight: '700', color: colors.accent },
  installBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  installBtnText: { color: '#000', fontSize: 12, fontWeight: '700' },

  // Showcase posts tab
  postCard: {
    marginHorizontal: 12, marginBottom: 8, backgroundColor: colors.bgCard,
    borderRadius: 12, padding: 14, gap: 8, borderWidth: 1, borderColor: colors.border,
  },
  postTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  postTypeBadge: { backgroundColor: colors.accent + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  postTypeText: { fontSize: 11, color: colors.accent, fontWeight: '700' },
  postTime: { fontSize: 11, color: colors.textMuted },
  postContent: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  postMeta: { flexDirection: 'row', gap: 12 },
  postMetaText: { fontSize: 12, color: colors.textMuted },

  // Empty state
  empty: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyIcon: { fontSize: 36 },
  emptyText: { fontSize: 14, color: colors.textMuted },
});

