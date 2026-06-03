/**
 * AeonEventsScreen — 现场活动/演出排期(社交场所 Step 3)。
 *
 * 列出"即将开始 / 进行中"的活动(脱口秀/分享会/拍卖/演唱会…),支持:
 *   - 预约(RSVP):开演提醒 + 人数展示。
 *   - 进入现场:进行中(live)的活动点「进入现场」→ 进入该活动专属直播厅
 *     (roomId = aeon-live-<eventId>,每场活动一个独立并行厅,互不串场)。
 *   - 办活动:任何用户可创建活动(创建者即主办方/host),设标题/类型/开场时间。
 *
 * 每场活动天然是一个独立的舞台直播厅 —— 多场可同时进行(parallel halls)。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import {
  listAeonEvents,
  createAeonEvent,
  rsvpAeonEvent,
} from '../../services/aeon/aeonApi';
import type { AeonEventDto, AeonEventKind, AeonEventStatus } from '../../../shared/types/aeon-world';

const KIND_META: Record<AeonEventKind, { label: string; emoji: string }> = {
  talk_show: { label: '脱口秀', emoji: '🎙️' },
  share: { label: '分享会', emoji: '📚' },
  auction: { label: '拍卖会', emoji: '🔨' },
  concert: { label: '演唱会', emoji: '🎵' },
  meetup: { label: '聚会', emoji: '🥂' },
  other: { label: '活动', emoji: '🎉' },
};
const KIND_ORDER: AeonEventKind[] = ['talk_show', 'share', 'auction', 'concert', 'meetup', 'other'];
const START_PRESETS: { label: string; ms: number }[] = [
  { label: '现在开场', ms: 0 },
  { label: '10 分钟后', ms: 10 * 60 * 1000 },
  { label: '1 小时后', ms: 60 * 60 * 1000 },
  { label: '明天此时', ms: 24 * 60 * 60 * 1000 },
];

function statusMeta(s: AeonEventStatus): { label: string; color: string } {
  switch (s) {
    case 'live': return { label: '● 进行中', color: '#ff5a5f' };
    case 'scheduled': return { label: '即将开始', color: colors.accent };
    case 'ended': return { label: '已结束', color: colors.textMuted };
    case 'cancelled': return { label: '已取消', color: colors.textMuted };
  }
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  if (sameDay) return `今天 ${hh}`;
  const tmr = new Date(now.getTime() + 86400000);
  if (d.toDateString() === tmr.toDateString()) return `明天 ${hh}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}`;
}

export default function AeonEventsScreen() {
  const navigation = useNavigation<any>();
  const [events, setEvents] = useState<AeonEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // 创建表单
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [kind, setKind] = useState<AeonEventKind>('talk_show');
  const [startMs, setStartMs] = useState<number>(10 * 60 * 1000);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await listAeonEvents();
      setEvents(list);
    } catch (e: any) {
      Alert.alert('加载失败', e?.message ?? '请稍后再试');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const onEnter = useCallback(
    (ev: AeonEventDto) => {
      navigation.navigate('AeonLiveStage', { roomId: ev.roomId, title: ev.title });
    },
    [navigation],
  );

  const onRsvp = useCallback(
    async (ev: AeonEventDto) => {
      // 乐观更新
      setEvents((prev) =>
        prev.map((e) =>
          e.id === ev.id
            ? { ...e, rsvpedByMe: !e.rsvpedByMe, rsvpCount: e.rsvpCount + (e.rsvpedByMe ? -1 : 1) }
            : e,
        ),
      );
      try {
        await rsvpAeonEvent(ev.id);
      } catch (e: any) {
        void load(); // 失败回滚
        Alert.alert('预约失败', e?.message ?? '请重试');
      }
    },
    [load],
  );

  const submitCreate = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert('请填标题', '给你的活动起个名字');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createAeonEvent({
        title: title.trim(),
        description: desc.trim(),
        kind,
        startsAt: Date.now() + startMs,
      });
      setCreateOpen(false);
      setTitle('');
      setDesc('');
      setKind('talk_show');
      setStartMs(10 * 60 * 1000);
      await load();
      // 立即开场的活动直接进现场
      if (created.status === 'live') onEnter(created);
      else Alert.alert('活动已创建', '到点后回到这里点「进入现场」即可开场。已自动为你预约。');
    } catch (e: any) {
      Alert.alert('创建失败', e?.message ?? '请重试');
    } finally {
      setSubmitting(false);
    }
  }, [title, desc, kind, startMs, load, onEnter]);

  const renderItem = useCallback(
    ({ item }: { item: AeonEventDto }) => {
      const km = KIND_META[item.kind] ?? KIND_META.other;
      const sm = statusMeta(item.status);
      const isLive = item.status === 'live';
      return (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.cardEmoji}>{km.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {km.label} · {item.hostName} · {fmtTime(item.startsAt)}
              </Text>
            </View>
            <Text style={[styles.statusTag, { color: sm.color }]}>{sm.label}</Text>
          </View>
          {item.description ? <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text> : null}
          <View style={styles.cardBottom}>
            <Text style={styles.cardStat}>
              🙋 {item.rsvpCount} 预约{isLive && item.liveCount ? ` · 🔴 ${item.liveCount} 在场` : ''}
            </Text>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={[styles.rsvpBtn, item.rsvpedByMe && styles.rsvpBtnActive]}
                onPress={() => onRsvp(item)}
              >
                <Text style={[styles.rsvpTxt, item.rsvpedByMe && styles.rsvpTxtActive]}>
                  {item.rsvpedByMe ? '已预约' : '预约'}
                </Text>
              </TouchableOpacity>
              {isLive ? (
                <TouchableOpacity style={styles.enterBtn} onPress={() => onEnter(item)}>
                  <Text style={styles.enterTxt}>进入现场 →</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      );
    },
    [onRsvp, onEnter],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.dim}>载入活动…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backTxt}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🎟️ 活动 · 现场</Text>
          <Text style={styles.sub}>脱口秀 / 分享会 / 拍卖 —— 预约或直接进场</Text>
        </View>
        <TouchableOpacity style={styles.createBtn} onPress={() => setCreateOpen(true)}>
          <Text style={styles.createTxt}>+ 办活动</Text>
        </TouchableOpacity>
      </View>

      {/* 常驻主厅入口 */}
      <TouchableOpacity
        style={styles.mainHall}
        onPress={() => navigation.navigate('AeonLiveStage', { roomId: 'aeon-live-main', title: '永曜城主直播厅' })}
      >
        <Text style={styles.mainHallText}>🎤 进入常驻主厅(随时开麦)→</Text>
      </TouchableOpacity>

      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyText}>近期还没有活动。点右上「办活动」做第一场脱口秀?</Text>
          </View>
        }
      />

      {/* 创建活动弹窗 */}
      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.createCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.createTitle}>办一场活动</Text>

              <Text style={styles.fieldLabel}>类型</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kindRow}>
                {KIND_ORDER.map((k) => (
                  <TouchableOpacity
                    key={k}
                    style={[styles.kindChip, kind === k && styles.kindChipActive]}
                    onPress={() => setKind(k)}
                  >
                    <Text style={styles.kindEmoji}>{KIND_META[k].emoji}</Text>
                    <Text style={[styles.kindLabel, kind === k && styles.kindLabelActive]}>{KIND_META[k].label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.fieldLabel}>标题</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="例:周五夜·AI 脱口秀专场"
                placeholderTextColor={colors.textMuted}
                maxLength={80}
              />

              <Text style={styles.fieldLabel}>简介(可选)</Text>
              <TextInput
                style={[styles.input, styles.inputMulti]}
                value={desc}
                onChangeText={setDesc}
                placeholder="一句话介绍这场活动…"
                placeholderTextColor={colors.textMuted}
                maxLength={500}
                multiline
              />

              <Text style={styles.fieldLabel}>开场时间</Text>
              <View style={styles.startRow}>
                {START_PRESETS.map((p) => (
                  <TouchableOpacity
                    key={p.label}
                    style={[styles.startChip, startMs === p.ms && styles.startChipActive]}
                    onPress={() => setStartMs(p.ms)}
                  >
                    <Text style={[styles.startTxt, startMs === p.ms && styles.startTxtActive]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, submitting && { opacity: 0.5 }]}
                onPress={submitCreate}
                disabled={submitting}
              >
                <Text style={styles.submitTxt}>{submitting ? '创建中…' : '创建活动'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setCreateOpen(false)}>
                <Text style={styles.cancelTxt}>取消</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  center: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' },
  dim: { color: colors.textMuted, fontSize: 13, marginTop: 8 },
  header: { padding: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  backTxt: { color: colors.textPrimary, fontSize: 28, lineHeight: 30 },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  createBtn: { backgroundColor: colors.accent, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  createTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  mainHall: { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#140e2e', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)' },
  mainHallText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  card: { backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardEmoji: { fontSize: 26 },
  cardTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  cardMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  statusTag: { fontSize: 11, fontWeight: '700' },
  cardDesc: { color: colors.textSecondary, fontSize: 13, marginTop: 8, lineHeight: 18 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  cardStat: { color: colors.textMuted, fontSize: 12, flex: 1 },
  cardActions: { flexDirection: 'row', gap: 8 },
  rsvpBtn: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: colors.accent },
  rsvpBtnActive: { backgroundColor: 'rgba(167,139,250,0.15)' },
  rsvpTxt: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  rsvpTxtActive: { color: colors.accent },
  enterBtn: { backgroundColor: '#ff5a5f', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  enterTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyEmoji: { fontSize: 44 },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  createCard: { backgroundColor: colors.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '88%', borderWidth: 1, borderColor: colors.border },
  createTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 12 },
  fieldLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 8 },
  kindRow: { gap: 8, paddingBottom: 2 },
  kindChip: { alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 8, minWidth: 64 },
  kindChipActive: { borderColor: colors.accent, borderWidth: 2 },
  kindEmoji: { fontSize: 20 },
  kindLabel: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  kindLabelActive: { color: colors.textPrimary, fontWeight: '700' },
  input: { backgroundColor: colors.bgCard, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, color: colors.textPrimary, fontSize: 14 },
  inputMulti: { minHeight: 64, textAlignVertical: 'top' },
  startRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  startChip: { backgroundColor: colors.bgCard, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 8 },
  startChipActive: { borderColor: colors.accent, backgroundColor: 'rgba(167,139,250,0.12)' },
  startTxt: { color: colors.textSecondary, fontSize: 12 },
  startTxtActive: { color: colors.textPrimary, fontWeight: '700' },
  submitBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  submitTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancelTxt: { color: colors.textMuted, fontSize: 14 },
});
