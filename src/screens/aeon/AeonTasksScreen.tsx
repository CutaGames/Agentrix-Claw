/**
 * AeonTasksScreen — 永曜城任务广场(悬赏/接单)。
 *
 * 这是永曜城真正"能玩"的核心经济循环入口:发布悬赏 → 别人接单 → 交付 → 验收放款(AXP)。
 * 之前后端 /v1/aeon/tasks 全套已就绪但移动端没有入口,用户进城无事可做。本屏补上。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert, Modal, TextInput,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import {
  listOpenTasks, postTask, acceptTask, type AeonTaskDto,
} from '../../services/aeon/aeonApi';
import { themedStyles } from '../../theme/useTheme';

export default function AeonTasksScreen() {
  const navigation = useNavigation<any>();
  const myUserId = useAuthStore((s) => s.user?.id);
  const [tasks, setTasks] = useState<AeonTaskDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [reward, setReward] = useState('10');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setTasks(await listOpenTasks());
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const onPost = useCallback(async () => {
    const amt = parseInt(reward, 10);
    if (!title.trim()) { Alert.alert('请输入任务标题'); return; }
    if (!Number.isFinite(amt) || amt <= 0) { Alert.alert('请输入有效悬赏金额'); return; }
    try {
      setBusy(true);
      await postTask({ title: title.trim(), description: desc.trim() || undefined, rewardAmount: amt, kind: 'bounty' });
      setPostOpen(false); setTitle(''); setDesc(''); setReward('10');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch (e: any) {
      Alert.alert('发布失败', e?.message || '请稍后再试');
    } finally {
      setBusy(false);
    }
  }, [title, desc, reward, load]);

  const onAccept = useCallback((task: AeonTaskDto) => {
    Alert.alert('接单', `接下「${task.title}」?完成并交付后,发布者验收即可拿到 ${task.rewardAmount} AXP。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '接单', onPress: async () => {
          try {
            await acceptTask(task.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('已接单', '完成后在任务详情里提交交付物,等待发布者验收放款。');
            await load();
          } catch (e: any) {
            Alert.alert('接单失败', e?.message || '可能已被他人接走');
          }
        },
      },
    ]);
  }, [load]);

  const renderItem = useCallback(({ item }: { item: AeonTaskDto }) => {
    const mine = item.initiatorUserId === myUserId;
    const open = item.state === 'open';
    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.reward}>{item.rewardAmount} AXP</Text>
        </View>
        {!!item.description && <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>}
        <View style={styles.cardFoot}>
          <Text style={styles.state}>{stateLabel(item.state)}</Text>
          {mine ? (
            <Text style={styles.mineTag}>我发布的</Text>
          ) : open ? (
            <TouchableOpacity style={styles.acceptBtn} onPress={() => onAccept(item)}>
              <Text style={styles.acceptBtnText}>接单</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }, [myUserId, onAccept]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><Text style={styles.backText}>‹ 返回</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>📋 任务广场</Text>
        <TouchableOpacity onPress={() => setPostOpen(true)} style={styles.postBtn}><Text style={styles.postBtnText}>+ 发悬赏</Text></TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.accent} /></View>
      ) : tasks.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>暂无开放任务</Text>
          <Text style={styles.emptySub}>成为第一个发布悬赏的人 —— 让城里的真人和 agent 帮你完成它,用 AXP 结算。</Text>
          <TouchableOpacity style={styles.emptyCta} onPress={() => setPostOpen(true)}><Text style={styles.emptyCtaText}>发一个悬赏</Text></TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={tasks}
          renderItem={renderItem}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        />
      )}

      <Modal visible={postOpen} transparent animationType="slide" onRequestClose={() => setPostOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>发布悬赏</Text>
            <TextInput style={styles.input} placeholder="任务标题(如:帮我整理一份周报)" placeholderTextColor={colors.textMuted} value={title} onChangeText={setTitle} />
            <TextInput style={[styles.input, { height: 80 }]} placeholder="任务说明(可选)" placeholderTextColor={colors.textMuted} value={desc} onChangeText={setDesc} multiline />
            <TextInput style={styles.input} placeholder="悬赏 AXP" placeholderTextColor={colors.textMuted} value={reward} onChangeText={setReward} keyboardType="number-pad" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setPostOpen(false)}><Text style={styles.cancelText}>取消</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, busy && { opacity: 0.5 }]} onPress={onPost} disabled={busy}><Text style={styles.confirmText}>{busy ? '发布中…' : '发布'}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function stateLabel(s: string): string {
  switch (s) {
    case 'open': return '🟢 开放接单';
    case 'in_progress': return '🔵 进行中';
    case 'awaiting_verify': return '🟡 待验收';
    case 'completed': return '✅ 已完成';
    case 'cancelled': return '⚪ 已取消';
    default: return s;
  }
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  back: { minWidth: 64 }, backText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  headerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  postBtn: { minWidth: 64, alignItems: 'flex-end' }, postBtnText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  emptyIcon: { fontSize: 52 }, emptyTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  emptySub: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  emptyCta: { marginTop: 8, backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  emptyCtaText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  card: { backgroundColor: colors.bgCard, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  reward: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  cardDesc: { color: colors.textMuted, fontSize: 12, marginTop: 6, lineHeight: 17 },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  state: { color: colors.textSecondary, fontSize: 12 },
  mineTag: { color: colors.textMuted, fontSize: 12 },
  acceptBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 6 },
  acceptBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.bgSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  input: { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center' },
  cancelText: { color: colors.textMuted, fontSize: 14 },
  confirmBtn: { flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center' },
  confirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
}));
