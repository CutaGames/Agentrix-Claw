/**
 * WorldFeedScreen — 🌍 星语小镇(活的 AI 世界）。
 *
 * design: docs/WORLD_ENGINE_X_AGENTRIX_ABILITY_BINDING_DESIGN_2026-05-29 §7。
 *
 * 不再是按钮宫格 / 纯事件列表。进来就是一个"活着的小镇":
 *   - 顶部:小镇名 + 人口 + 主宠状态(亲密度/情绪)
 *   - 小镇场景:你的居民(角色)+ 常驻系统 NPC 作为角色块站在镇上,头顶冒泡(在忙什么)
 *     → 点居民看完整属性面板;点 NPC 触发互动(向导发任务/教官开训练战/商人/守卫)
 *   - 单人也热闹(有 NPC),不依赖别人在线
 *   - 底部:剧情时间线("你不在时发生了什么")
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Image,
  Modal,
  TouchableOpacity,
  Alert,
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
  type WorldNpc,
} from '../../services/worldEngineApi';
import type { WorldStackParamList } from '../../navigation/WorldStackNavigator';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PetSpriteImage } from '../../components/PetSpriteImage';
import { useActivePet } from '../../services/activePet.service';
import { themedStyles } from '../../theme/useTheme';

type Nav = NativeStackNavigationProp<WorldStackParamList, 'WorldFeed'>;

const EVENT_EMOJI: Record<WorldEventType, string> = {
  work: '💼', social: '🤝', greet: '👋', reflect: '🌙', explore: '🧭', conflict: '⚡', levelup: '⭐',
};
const MOOD_EMOJI: Record<string, string> = {
  happy: '😊', focused: '🎯', tired: '😪', excited: '🤩', calm: '😌', lonely: '🥺', proud: '😎', love: '🥰',
};
const JOB_LABEL: Record<string, string> = {
  trader: '商人', researcher: '研究员', builder: '工匠', drifter: '漫游者',
};

function outcomeColor(o: WorldEventOutcome): string {
  return o === 'positive' ? '#34D399' : o === 'negative' ? '#F87171' : colors.textMuted;
}
function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  return `${Math.floor(h / 24)}天前`;
}

export function WorldFeedScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const activePet = useActivePet();
  const [selectedResident, setSelectedResident] = useState<WorldResidentSummary | null>(null);

  const feedQ = useQuery({
    queryKey: ['world-feed'],
    queryFn: () => fetchWorldFeed({ limit: 60 }),
    staleTime: 30_000,
    retry: 1,
  });

  const onRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['world-feed'] });
  }, [queryClient]);

  const data = feedQ.data;
  const events = data?.events ?? [];
  const residents = data?.residents ?? [];
  const npcs = data?.npcs ?? [];
  const town = data?.town;
  const newEventCount = data?.newEventCount ?? 0;

  const onNpcAction = useCallback(
    async (npc: WorldNpc, action: string) => {
      if (action === 'train') {
        if (residents.length === 0) {
          Alert.alert('还没有角色', '先拍一个物体生成角色,再来共创你的世界。');
          return;
        }
        // 战斗子系统已退役(需求 11.1):原"训练对战"改为进资产库管理角色。
        (navigation as any).navigate('WorldAssetInventory');
      } else if (action === 'quest') {
        Alert.alert(npc.name, npc.line);
      } else {
        Alert.alert(npc.name, npc.line);
      }
    },
    [residents, navigation],
  );

  if (feedQ.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>正在唤醒你的小镇…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={feedQ.isFetching} onRefresh={onRefresh} tintColor={colors.primary} />}
      testID="world-feed-scroll"
    >
      {/* 小镇头部 */}
      <View style={styles.townHeader}>
        <Text style={styles.townName}>🏘️ {town?.name ?? '星语小镇'}</Text>
        <Text style={styles.townPop}>人口 {town?.population ?? npcs.length}</Text>
      </View>

      {/* 主宠状态条 */}
      {town?.mainPet ? (
        <View style={styles.petBar}>
          <Text style={styles.petBarEmoji}>{MOOD_EMOJI[town.mainPet.emotion] ?? '🦊'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.petBarName}>{town.mainPet.name}（主宠）</Text>
            <Text style={styles.petBarMeta}>亲密度 Lv.{town.mainPet.intimacyLevel} · 心情 {town.mainPet.emotion}</Text>
          </View>
        </View>
      ) : null}

      {/* "你不在时发生了 N 件事" */}
      {newEventCount > 0 ? (
        <View style={styles.newBanner}>
          <Text style={styles.newBannerText}>✨ 你离开期间,小镇发生了 {newEventCount} 件新鲜事</Text>
        </View>
      ) : null}

      {/* 我的居民 */}
      <Text style={styles.sectionHeader}>🧑‍🤝‍🧑 我的居民 {residents.length > 0 ? `(${residents.length})` : ''}</Text>
      {residents.length === 0 ? (
        <View style={styles.emptyResident}>
          <Text style={styles.emptyText}>小镇还没有你的居民。拍一个物体,让它在这里安家。</Text>
          <Pressable style={styles.emptyCta} onPress={() => navigation.navigate('WorldEngineScanner', { mode: 'quick' })}>
            <Text style={styles.emptyCtaText}>📷 立即扫描</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
          {residents.map((r) => (
            <Pressable key={r.assetId} style={styles.charCard} onPress={() => setSelectedResident(r)}>
              <View style={styles.charThumb}>
                {r.portraitUrl ? (
                  <Image source={{ uri: r.portraitUrl }} style={styles.charImg} resizeMode="cover" />
                ) : (
                  <PetSpriteImage sprite="idle" size={56} clan={activePet.clan} />
                )}
                <Text style={styles.charMood}>{MOOD_EMOJI[r.state?.mood ?? 'calm'] ?? '😌'}</Text>
              </View>
              <Text style={styles.charName} numberOfLines={1}>{r.name}</Text>
              <Text style={styles.charJob} numberOfLines={1}>{JOB_LABEL[r.state?.job ?? 'drifter']} Lv.{r.level}</Text>
              <Text style={styles.charBubble} numberOfLines={2}>💬 {r.state?.activity ?? '刚安顿下来'}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* 小镇 NPC(单人也热闹) */}
      <Text style={styles.sectionHeader}>🏛️ 镇上的居民</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
        {npcs.map((npc) => (
          <View key={npc.id} style={styles.npcCard}>
            <Text style={styles.npcEmoji}>{npc.emoji}</Text>
            <Text style={styles.npcName} numberOfLines={1}>{npc.name}</Text>
            <Text style={styles.npcLoc} numberOfLines={1}>📍{npc.location}</Text>
            <Text style={styles.npcLine} numberOfLines={3}>{npc.line}</Text>
            <View style={styles.npcActions}>
              {npc.actions.map((a) => (
                <TouchableOpacity key={a} style={styles.npcBtn} onPress={() => onNpcAction(npc, a)}>
                  <Text style={styles.npcBtnText}>
                    {a === 'train' ? '⚔ 训练' : a === 'trade' ? '🛒 交易' : a === 'quest' ? '❗ 任务' : '💬 交谈'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* 剧情时间线 */}
      <Text style={styles.sectionHeader}>📜 小镇动态</Text>
      {events.length === 0 ? (
        <Text style={styles.noEvents}>下拉刷新,推进小镇时间线。</Text>
      ) : (
        <View style={styles.timeline}>
          {events.map((e) => (
            <View key={e.id} style={styles.eventRow}>
              <View style={styles.eventTimeline}>
                <View style={[styles.eventDot, { backgroundColor: outcomeColor(e.outcome) }]} />
                <View style={styles.eventLine} />
              </View>
              <View style={styles.eventBody}>
                <Text style={styles.eventSummary}>{EVENT_EMOJI[e.type] ?? '•'} {e.summary}</Text>
                <View style={styles.eventMetaRow}>
                  <Text style={styles.eventTime}>{timeAgo(e.createdAt)}</Text>
                  {e.deltaAxp > 0 ? <Text style={styles.eventReward}>+{e.deltaAxp} AXP</Text> : null}
                  {e.deltaXp > 0 ? <Text style={styles.eventXp}>+{e.deltaXp} XP</Text> : null}
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* 居民属性面板 */}
      <Modal visible={!!selectedResident} transparent animationType="slide" onRequestClose={() => setSelectedResident(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedResident(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            {selectedResident ? (
              <ResidentDetail
                resident={selectedResident}
                onTrain={() => {
                  setSelectedResident(null);
                  onNpcAction({ id: 'npc-trainer' } as any, 'train');
                }}
                onClose={() => setSelectedResident(null)}
              />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function ResidentDetail({ resident, onTrain, onClose }: {
  resident: WorldResidentSummary; onTrain: () => void; onClose: () => void;
}) {
  const activePet = useActivePet();
  return (
    <View>
      <View style={styles.sheetHeader}>
        <View style={styles.sheetThumb}>
          {resident.portraitUrl ? (
            <Image source={{ uri: resident.portraitUrl }} style={styles.sheetImg} resizeMode="cover" />
          ) : (
            <PetSpriteImage sprite="idle" size={56} clan={activePet.clan} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sheetName}>{resident.name}</Text>
          <Text style={styles.sheetSub}>{JOB_LABEL[resident.state?.job ?? 'drifter']} · Lv.{resident.level} · {MOOD_EMOJI[resident.state?.mood ?? 'calm']} {resident.state?.mood ?? 'calm'}</Text>
        </View>
      </View>

      <Text style={styles.sheetActivity}>💬 {resident.state?.activity ?? '刚安顿下来'}</Text>
      <View style={styles.sheetStatRow}>
        <Stat label="所在地" value={resident.state?.location ?? '中央广场'} />
        <Stat label="累计 AXP" value={`💰 ${resident.state?.axp ?? 0}`} />
      </View>

      <TouchableOpacity style={styles.sheetTrainBtn} onPress={onTrain}>
        <Text style={styles.sheetTrainText}>⚔ 带它去训练场试试身手</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.sheetCloseBtn} onPress={onClose}>
        <Text style={styles.sheetCloseText}>关闭</Text>
      </TouchableOpacity>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgPrimary },
  loadingText: { color: colors.textMuted, marginTop: 12, fontSize: 13 },

  townHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  townName: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  townPop: { fontSize: 13, color: colors.textMuted },

  petBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(167,139,250,0.10)', borderColor: 'rgba(167,139,250,0.3)', borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14, gap: 10 },
  petBarEmoji: { fontSize: 32 },
  petBarName: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  petBarMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  newBanner: { backgroundColor: 'rgba(52,211,153,0.12)', borderColor: 'rgba(52,211,153,0.35)', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 },
  newBannerText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },

  sectionHeader: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: 10, marginTop: 8 },
  row: { marginBottom: 18 },

  charCard: { width: 130, marginRight: 12, backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 10 },
  charThumb: { width: 60, height: 60, borderRadius: 12, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center', marginBottom: 8, overflow: 'hidden' },
  charImg: { width: '100%', height: '100%' },
  charThumbEmoji: { fontSize: 32 },
  charMood: { position: 'absolute', bottom: -2, right: -2, fontSize: 18 },
  charName: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  charJob: { color: colors.accent, fontSize: 11, marginBottom: 4 },
  charBubble: { color: colors.textMuted, fontSize: 11, lineHeight: 15, minHeight: 30 },

  npcCard: { width: 150, marginRight: 12, backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12 },
  npcEmoji: { fontSize: 34, marginBottom: 4 },
  npcName: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  npcLoc: { color: colors.textMuted, fontSize: 11, marginBottom: 4 },
  npcLine: { color: colors.textSecondary, fontSize: 11, lineHeight: 15, minHeight: 45 },
  npcActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  npcBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
  npcBtnText: { color: '#fff', fontSize: 11, fontWeight: '600' },

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

  emptyResident: { backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 20, alignItems: 'center', marginBottom: 18 },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 14, lineHeight: 19 },
  emptyCta: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 28 },
  emptyCtaText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  sheetHeader: { flexDirection: 'row', gap: 14, marginBottom: 14 },
  sheetThumb: { width: 64, height: 64, borderRadius: 14, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sheetImg: { width: '100%', height: '100%' },
  sheetName: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  sheetSub: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  sheetActivity: { color: colors.textSecondary, fontSize: 13, marginBottom: 14 },
  sheetStatRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  statCell: { flex: 1, backgroundColor: colors.bgCard, borderRadius: 12, padding: 12 },
  statLabel: { color: colors.textMuted, fontSize: 11, marginBottom: 4 },
  statValue: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  sheetTrainBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 10 },
  sheetTrainText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sheetCloseBtn: { paddingVertical: 10, alignItems: 'center' },
  sheetCloseText: { color: colors.textMuted, fontSize: 14 },
}));

export default WorldFeedScreen;
