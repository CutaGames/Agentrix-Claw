/**
 * WorldFeedScreen — 🌍 活世界 feed (Phase A2)。
 *
 * design: docs/WORLD_ENGINE_X_AGENTRIX_ABILITY_BINDING_DESIGN_2026-05-29 §7.4。
 *
 * 打开即调 GET /v1/world-engine/world/feed —— 后端先做离线时间快进(tick)再返回:
 *   - 顶部:"你不在时发生了 N 件事" 横幅(newEventCount > 0 时)
 *   - 居民卷轴:每个角色当前职业/心情/在忙什么/累计 AXP(吃能力飞轮的打工产出)
 *   - 时间线:倒序剧情事件(work/social/conflict/greet/reflect/explore),按 outcome 配色
 *
 * 这是"追剧式日常留存"的载体:用户隔天回来看自己的角色今天发生了什么。
 */
import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import {
  fetchWorldFeed,
  type WorldEventItem,
  type WorldEventType,
  type WorldEventOutcome,
  type WorldResidentSummary,
} from '../../services/worldEngineApi';
import type { WorldStackParamList } from '../../navigation/WorldStackNavigator';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Nav = NativeStackNavigationProp<WorldStackParamList, 'WorldFeed'>;

const EVENT_EMOJI: Record<WorldEventType, string> = {
  work: '💼',
  social: '🤝',
  greet: '👋',
  reflect: '🌙',
  explore: '🧭',
  conflict: '⚡',
  levelup: '⭐',
};

const MOOD_EMOJI: Record<string, string> = {
  happy: '😊',
  focused: '🎯',
  tired: '😪',
  excited: '🤩',
  calm: '😌',
  lonely: '🥺',
  proud: '😎',
};

function outcomeColor(outcome: WorldEventOutcome): string {
  switch (outcome) {
    case 'positive':
      return '#34D399';
    case 'negative':
      return '#F87171';
    default:
      return colors.textMuted;
  }
}

function timeAgo(iso: string, t: (m: { en: string; zh: string }) => string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return t({ en: 'just now', zh: '刚刚' });
  if (mins < 60) return t({ en: `${mins}m ago`, zh: `${mins} 分钟前` });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t({ en: `${hours}h ago`, zh: `${hours} 小时前` });
  const days = Math.floor(hours / 24);
  return t({ en: `${days}d ago`, zh: `${days} 天前` });
}

function ResidentCard({ resident }: { resident: WorldResidentSummary }) {
  const { t } = useI18n();
  const mood = resident.state?.mood ?? 'calm';
  const moodEmoji = MOOD_EMOJI[mood] ?? '😌';
  return (
    <View style={styles.residentCard}>
      <View style={styles.residentThumb}>
        <Text style={styles.residentThumbEmoji}>🦊</Text>
        <Text style={styles.residentMood}>{moodEmoji}</Text>
      </View>
      <Text style={styles.residentName} numberOfLines={1}>
        {resident.name}
      </Text>
      <Text style={styles.residentJob} numberOfLines={1}>
        {jobLabel(resident.state?.job, t)} · Lv.{resident.level}
      </Text>
      <Text style={styles.residentActivity} numberOfLines={2}>
        {resident.state?.activity ?? t({ en: 'settling in', zh: '刚安顿下来' })}
      </Text>
      {typeof resident.state?.axp === 'number' && resident.state.axp > 0 ? (
        <Text style={styles.residentAxp}>💰 {resident.state.axp} AXP</Text>
      ) : null}
    </View>
  );
}

function jobLabel(job: string | undefined, t: (m: { en: string; zh: string }) => string): string {
  switch (job) {
    case 'trader':
      return t({ en: 'Trader', zh: '商人' });
    case 'researcher':
      return t({ en: 'Researcher', zh: '研究员' });
    case 'builder':
      return t({ en: 'Builder', zh: '工匠' });
    default:
      return t({ en: 'Drifter', zh: '漫游者' });
  }
}

function EventRow({ event }: { event: WorldEventItem }) {
  const { t } = useI18n();
  const emoji = EVENT_EMOJI[event.type] ?? '•';
  const dotColor = outcomeColor(event.outcome);
  return (
    <View style={styles.eventRow}>
      <View style={styles.eventTimeline}>
        <View style={[styles.eventDot, { backgroundColor: dotColor }]} />
        <View style={styles.eventLine} />
      </View>
      <View style={styles.eventBody}>
        <Text style={styles.eventSummary}>
          {emoji} {event.summary}
        </Text>
        <View style={styles.eventMetaRow}>
          <Text style={styles.eventTime}>{timeAgo(event.createdAt, t)}</Text>
          {event.deltaAxp > 0 ? (
            <Text style={styles.eventReward}>+{event.deltaAxp} AXP</Text>
          ) : null}
          {event.deltaXp > 0 ? (
            <Text style={styles.eventXp}>+{event.deltaXp} XP</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function WorldFeedScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const feedQ = useQuery({
    queryKey: ['world-feed'],
    queryFn: () => fetchWorldFeed({ limit: 60 }),
    staleTime: 30_000,
    retry: 1,
  });

  const onRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['world-feed'] });
  }, [queryClient]);

  const events = feedQ.data?.events ?? [];
  const residents = feedQ.data?.residents ?? [];
  const newEventCount = feedQ.data?.newEventCount ?? 0;

  const hasResidents = residents.length > 0;

  if (feedQ.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>{t({ en: 'Loading your world…', zh: '正在唤醒你的世界…' })}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={feedQ.isFetching}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
      testID="world-feed-scroll"
    >
      <View style={styles.header}>
        <Text style={styles.title}>🌍 {t({ en: 'My World', zh: '我的世界' })}</Text>
        <Text style={styles.subtitle}>
          {t({ en: 'What your characters did while you were away.', zh: '你不在时,你的角色们经历了这些。' })}
        </Text>
      </View>

      {/* "你不在时发生了 N 件事" 横幅 */}
      {newEventCount > 0 ? (
        <View style={styles.newBanner}>
          <Text style={styles.newBannerText}>
            ✨ {t({
              en: `${newEventCount} new things happened while you were away`,
              zh: `你离开期间发生了 ${newEventCount} 件新鲜事`,
            })}
          </Text>
        </View>
      ) : null}

      {!hasResidents ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🌱</Text>
          <Text style={styles.emptyTitle}>
            {t({ en: 'Your world is empty', zh: '你的世界还空空如也' })}
          </Text>
          <Text style={styles.emptyBody}>
            {t({
              en: 'Scan something to create your first resident. They will start living, working and earning here.',
              zh: '扫描一个物体来创造第一位居民。它会在这里生活、打工、赚取 AXP。',
            })}
          </Text>
          <Pressable
            style={styles.emptyCta}
            onPress={() => navigation.navigate('WorldEngineScanner', { mode: 'quick' })}
          >
            <Text style={styles.emptyCtaText}>{t({ en: 'Scan now', zh: '立即扫描' })}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* 居民卷轴 */}
          <Text style={styles.sectionHeader}>
            🏘️ {t({ en: 'Residents', zh: '居民' })}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.residentRow}>
            {residents.map((r) => (
              <ResidentCard key={r.assetId} resident={r} />
            ))}
          </ScrollView>

          {/* 时间线 */}
          <Text style={styles.sectionHeader}>
            📜 {t({ en: 'Story Timeline', zh: '剧情时间线' })}
          </Text>
          {events.length === 0 ? (
            <Text style={styles.noEvents}>
              {t({ en: 'Pull down to advance your world.', zh: '下拉刷新,推进你的世界。' })}
            </Text>
          ) : (
            <View style={styles.timeline}>
              {events.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary },
  loadingText: { color: colors.textMuted, marginTop: 12, fontSize: 13 },

  header: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.textMuted },

  newBanner: {
    backgroundColor: 'rgba(52,211,153,0.12)',
    borderColor: 'rgba(52,211,153,0.35)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  newBannerText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },

  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 10,
    marginTop: 6,
  },

  residentRow: { marginBottom: 20 },
  residentCard: {
    width: 132,
    marginRight: 12,
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  residentThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  residentThumbEmoji: { fontSize: 30 },
  residentMood: { position: 'absolute', bottom: -2, right: -2, fontSize: 16 },
  residentName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  residentJob: { fontSize: 11, color: colors.accent, marginBottom: 4 },
  residentActivity: { fontSize: 11, color: colors.textMuted, lineHeight: 15, minHeight: 30 },
  residentAxp: { fontSize: 11, color: '#FBBF24', fontWeight: '600', marginTop: 4 },

  timeline: { marginTop: 4 },
  eventRow: { flexDirection: 'row', marginBottom: 4 },
  eventTimeline: { width: 20, alignItems: 'center' },
  eventDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  eventLine: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 },
  eventBody: { flex: 1, paddingBottom: 16, paddingLeft: 8 },
  eventSummary: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  eventMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  eventTime: { fontSize: 11, color: colors.textMuted },
  eventReward: { fontSize: 11, color: '#FBBF24', fontWeight: '600' },
  eventXp: { fontSize: 11, color: '#A78BFA', fontWeight: '600' },

  noEvents: { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: 24 },

  empty: { padding: 24, alignItems: 'center', marginTop: 32 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  emptyBody: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  emptyCta: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 32 },
  emptyCtaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export default WorldFeedScreen;
