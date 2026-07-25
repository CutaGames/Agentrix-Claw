/**
 * MonitorsScreen — list monitors (type, condition summary, status,
 * lastCheckedAt, lastResult), create a monitor, pause / resume / delete.
 * Backed by /agent-ops/monitors.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, RefreshControl, Modal,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import {
  listMonitors, createMonitor, pauseMonitor, resumeMonitor, deleteMonitor,
  type Monitor, type MonitorType, type MonitorStatus,
} from '../../services/agentOpsApi';

const MONITOR_TYPES: Array<{ key: MonitorType; en: string; zh: string }> = [
  { key: 'price', en: 'Price', zh: '价格' },
  { key: 'liquidation', en: 'Liquidation', zh: '清算' },
  { key: 'unlock', en: 'Unlock', zh: '解锁' },
  { key: 'governance', en: 'Governance', zh: '治理' },
  { key: 'airdrop_window', en: 'Airdrop window', zh: '空投窗口' },
  { key: 'approval_anomaly', en: 'Approval anomaly', zh: '授权异常' },
];

const STATUS_COLOR: Record<string, keyof Palette> = {
  active: 'success',
  paused: 'textMuted',
  triggered: 'warning',
  error: 'error',
};

function monitorTypeLabel(type: MonitorType, t: (d: { en: string; zh: string }) => string): string {
  const found = MONITOR_TYPES.find((m) => m.key === type);
  return found ? t(found) : String(type);
}

function conditionText(m: Monitor): string {
  if (m.conditionSummary) return m.conditionSummary;
  try {
    return JSON.stringify(m.condition);
  } catch {
    return '—';
  }
}

export function MonitorsScreen() {
  const c = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const monitorsQ = useQuery({
    queryKey: ['agent-ops-monitors'],
    queryFn: listMonitors,
    retry: 1,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['agent-ops-monitors'] });

  const pauseM = useMutation({ mutationFn: pauseMonitor, onSuccess: invalidate });
  const resumeM = useMutation({ mutationFn: resumeMonitor, onSuccess: invalidate });
  const deleteM = useMutation({ mutationFn: deleteMonitor, onSuccess: invalidate });

  const handleDelete = useCallback((m: Monitor) => {
    Alert.alert(
      t({ en: 'Delete monitor', zh: '删除监控' }),
      t({ en: 'Delete this monitor? This cannot be undone.', zh: '删除该监控？此操作不可撤销。' }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        { text: t({ en: 'Delete', zh: '删除' }), style: 'destructive', onPress: () => deleteM.mutate(m.id) },
      ],
    );
  }, [deleteM, t]);

  const monitors = monitorsQ.data ?? [];

  return (
    <View style={styles.container} testID="ao-monitors-screen">
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={monitorsQ.isFetching} onRefresh={() => monitorsQ.refetch()} tintColor={c.accent} />
        }
      >
        <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(true)} testID="ao-monitor-create-btn">
          <Text style={styles.createBtnText}>＋ {t({ en: 'New monitor', zh: '新建监控' })}</Text>
        </TouchableOpacity>

        {monitorsQ.isLoading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 24 }} />
        ) : monitorsQ.isError ? (
          <Text style={styles.empty}>{t({ en: 'Failed to load monitors.', zh: '加载监控失败。' })}</Text>
        ) : monitors.length === 0 ? (
          <Text style={styles.empty}>
            {t({ en: 'No monitors yet. Create one to start watching.', zh: '暂无监控。新建一个开始守护。' })}
          </Text>
        ) : (
          monitors.map((m) => (
            <View key={m.id} style={styles.card} testID={`ao-monitor-${m.id}`}>
              <View style={styles.cardHead}>
                <Text style={styles.cardType}>{monitorTypeLabel(m.monitorType, t)}</Text>
                <View style={[styles.statusPill, { backgroundColor: c[STATUS_COLOR[m.status] ?? 'textMuted'] + '22' }]}>
                  <Text style={[styles.statusText, { color: c[STATUS_COLOR[m.status] ?? 'textMuted'] }]}>
                    {statusLabel(m.status, t)}
                  </Text>
                </View>
              </View>
              <Text style={styles.condition} numberOfLines={3}>{conditionText(m)}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.meta}>
                  {t({ en: 'Last checked', zh: '上次检查' })}: {m.lastCheckedAt ? new Date(m.lastCheckedAt).toLocaleString() : '—'}
                </Text>
              </View>
              {m.lastResult ? (
                <Text style={styles.lastResult} numberOfLines={2}>
                  {t({ en: 'Result', zh: '结果' })}: {m.lastResult}
                </Text>
              ) : null}
              <View style={styles.actions}>
                {m.status === 'paused' ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.resumeBtn]}
                    onPress={() => resumeM.mutate(m.id)}
                    testID={`ao-monitor-resume-${m.id}`}
                  >
                    <Text style={[styles.actionText, { color: c.success }]}>▶ {t({ en: 'Resume', zh: '恢复' })}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.pauseBtn]}
                    onPress={() => pauseM.mutate(m.id)}
                    testID={`ao-monitor-pause-${m.id}`}
                  >
                    <Text style={[styles.actionText, { color: c.warning }]}>⏸ {t({ en: 'Pause', zh: '暂停' })}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.actionBtn, styles.deleteBtn]}
                  onPress={() => handleDelete(m)}
                  testID={`ao-monitor-delete-${m.id}`}
                >
                  <Text style={[styles.actionText, { color: c.error }]}>🗑 {t({ en: 'Delete', zh: '删除' })}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <CreateMonitorModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); invalidate(); }}
        styles={styles}
        c={c}
        t={t}
      />
    </View>
  );
}

function statusLabel(status: MonitorStatus, t: (d: { en: string; zh: string }) => string): string {
  switch (status) {
    case 'active': return t({ en: 'Active', zh: '运行中' });
    case 'paused': return t({ en: 'Paused', zh: '已暂停' });
    case 'triggered': return t({ en: 'Triggered', zh: '已触发' });
    case 'error': return t({ en: 'Error', zh: '异常' });
    default: return String(status);
  }
}

function CreateMonitorModal({
  visible, onClose, onCreated, styles, c, t,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
  t: (d: { en: string; zh: string }) => string;
}) {
  const [type, setType] = useState<MonitorType>('price');
  const [target, setTarget] = useState('');
  const [threshold, setThreshold] = useState('');
  const [interval, setIntervalSec] = useState('300');

  const createM = useMutation({
    mutationFn: createMonitor,
    onSuccess: () => {
      setTarget(''); setThreshold(''); setIntervalSec('300'); setType('price');
      onCreated();
    },
    onError: (e: any) => {
      Alert.alert(t({ en: 'Error', zh: '错误' }), e?.message || t({ en: 'Failed to create monitor.', zh: '创建监控失败。' }));
    },
  });

  const handleSubmit = () => {
    if (!target.trim()) {
      Alert.alert(t({ en: 'Missing target', zh: '缺少目标' }), t({ en: 'Enter a target (symbol / address / proposal).', zh: '请输入目标（代币 / 地址 / 提案）。' }));
      return;
    }
    const condition: Record<string, unknown> = { target: target.trim() };
    if (threshold.trim()) condition.threshold = threshold.trim();
    createM.mutate({
      monitorType: type,
      condition,
      interval: Number(interval) || 300,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{t({ en: 'New monitor', zh: '新建监控' })}</Text>

          <Text style={styles.label}>{t({ en: 'Type', zh: '类型' })}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {MONITOR_TYPES.map((mt) => {
              const active = mt.key === type;
              return (
                <TouchableOpacity
                  key={mt.key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setType(mt.key)}
                  testID={`ao-monitor-type-${mt.key}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(mt)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={styles.label}>{t({ en: 'Target', zh: '目标' })}</Text>
          <TextInput
            style={styles.modalInput}
            value={target}
            onChangeText={setTarget}
            placeholder={t({ en: 'symbol / address / proposal id', zh: '代币 / 地址 / 提案 id' })}
            placeholderTextColor={c.textMuted}
            autoCapitalize="none"
            testID="ao-monitor-target-input"
          />

          <Text style={styles.label}>{t({ en: 'Threshold / condition', zh: '阈值 / 条件' })}</Text>
          <TextInput
            style={styles.modalInput}
            value={threshold}
            onChangeText={setThreshold}
            placeholder={t({ en: 'e.g. < 0.95 or > 2000 (optional)', zh: '如 < 0.95 或 > 2000（可选）' })}
            placeholderTextColor={c.textMuted}
            autoCapitalize="none"
            testID="ao-monitor-threshold-input"
          />

          <Text style={styles.label}>{t({ en: 'Interval (seconds)', zh: '检查间隔（秒）' })}</Text>
          <TextInput
            style={styles.modalInput}
            value={interval}
            onChangeText={setIntervalSec}
            keyboardType="number-pad"
            placeholderTextColor={c.textMuted}
            testID="ao-monitor-interval-input"
          />

          <View style={styles.modalActions}>
            <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={onClose}>
              <Text style={styles.cancelText}>{t({ en: 'Cancel', zh: '取消' })}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, styles.submitBtn, createM.isPending && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={createM.isPending}
              testID="ao-monitor-submit"
            >
              {createM.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>{t({ en: 'Create', zh: '创建' })}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 16, paddingBottom: 40, gap: 12 },
    createBtn: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
    createBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    empty: { fontSize: 13, color: c.textMuted, textAlign: 'center', padding: 24 },
    card: { backgroundColor: c.bgCard, borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, borderColor: c.border },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardType: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
    statusText: { fontSize: 11, fontWeight: '800' },
    condition: { fontSize: 13, color: c.textSecondary, fontFamily: 'monospace' },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
    meta: { fontSize: 11, color: c.textMuted },
    lastResult: { fontSize: 12, color: c.textSecondary },
    actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
    actionBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center', borderWidth: 1 },
    pauseBtn: { backgroundColor: c.warning + '15', borderColor: c.warning + '44' },
    resumeBtn: { backgroundColor: c.success + '15', borderColor: c.success + '44' },
    deleteBtn: { backgroundColor: c.error + '12', borderColor: c.error + '40' },
    actionText: { fontSize: 12, fontWeight: '700' },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: c.bgSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 8, maxHeight: '88%' },
    modalTitle: { fontSize: 18, fontWeight: '800', color: c.textPrimary, marginBottom: 4 },
    label: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 6 },
    modalInput: {
      backgroundColor: c.input, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: c.textPrimary,
    },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border },
    chipActive: { backgroundColor: c.accent + '22', borderColor: c.accent },
    chipText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    chipTextActive: { color: c.accent },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
    modalBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
    cancelBtn: { backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border },
    cancelText: { fontSize: 15, fontWeight: '600', color: c.textSecondary },
    submitBtn: { backgroundColor: c.primary },
    submitText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  });
}
