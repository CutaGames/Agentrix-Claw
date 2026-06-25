/**
 * WorkflowListScreen — Layer 1: Workflow/Cron Management
 * Lists all workflows and lets users create + toggle them.
 * Backend: GET/POST/DELETE/PATCH /api/workflows
 */
import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl, Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../services/api';
import { colors } from '../../theme/colors';
import type { AgentStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AgentStackParamList, 'WorkflowList'>;

// ─── Types ─────────────────────────────────────────────────────
export interface Workflow {
  id: string;
  name: string;
  description: string;
  triggerType: 'cron' | 'webhook' | 'manual';
  cronExpression?: string;
  webhookUrl?: string;
  prompt: string;
  enabled: boolean;
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'error' | 'running';
  runCount: number;
  createdAt: string;
}

// ─── API helpers ───────────────────────────────────────────────
const fetchWorkflows = () => apiFetch<Workflow[]>('/workflows');
const toggleWorkflow = (id: string, enabled: boolean) =>
  apiFetch<Workflow>(`/workflows/${id}/toggle`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
const deleteWorkflow = (id: string) =>
  apiFetch<void>(`/workflows/${id}`, { method: 'DELETE' });
const runWorkflow = (id: string) =>
  apiFetch<{ runId: string }>(`/workflows/${id}/run`, { method: 'POST' });

// ─── Helpers ───────────────────────────────────────────────────
const TRIGGER_ICON: Record<string, string> = {
  cron: '⏰',
  webhook: '🔗',
  manual: '▶️',
};

const STATUS_COLOR: Record<string, string> = {
  success: '#22c55e',
  error: '#ef4444',
  running: '#f59e0b',
};

function formatCron(expr: string): string {
  if (!expr) return '';
  const parts = expr.split(' ');
  if (parts.length < 5) return expr;
  const [min, hour, dom, month, dow] = parts;
  if (dom === '*' && month === '*') {
    if (dow === '*') return `Daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `Every ${days[parseInt(dow)]} at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  }
  return expr;
}

function timeAgo(iso?: string) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Component ─────────────────────────────────────────────────
export function WorkflowListScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['workflows'],
    queryFn: fetchWorkflows,
    retry: 1,
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      toggleWorkflow(id, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflows'] }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteWorkflow,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflows'] }),
  });

  const runMut = useMutation({
    mutationFn: runWorkflow,
    onSuccess: (res) => Alert.alert('▶️ Started', `Run ID: ${res.runId}`),
    onError: (e: any) => Alert.alert('Error', e.message || 'Run failed'),
  });

  const confirmDelete = (w: Workflow) => {
    Alert.alert('Delete Workflow', `Delete "${w.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMut.mutate(w.id) },
    ]);
  };

  const workflows = data ?? [];

  const renderItem = ({ item }: { item: Workflow }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.triggerIcon}>{TRIGGER_ICON[item.triggerType] ?? '⚙️'}</Text>
        <View style={styles.cardMeta}>
          <Text style={styles.cardName}>{item.name}</Text>
          {item.triggerType === 'cron' && item.cronExpression && (
            <Text style={styles.cardSub}>{formatCron(item.cronExpression)}</Text>
          )}
          {item.triggerType === 'webhook' && (
            <Text style={styles.cardSub} numberOfLines={1}>Webhook trigger</Text>
          )}
        </View>
        <Switch
          value={item.enabled}
          onValueChange={(v) => toggleMut.mutate({ id: item.id, enabled: v })}
          trackColor={{ true: colors.primary, false: colors.bgSecondary }}
          thumbColor={item.enabled ? '#fff' : colors.textMuted}
        />
      </View>

      {item.description ? (
        <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
      ) : null}

      <View style={styles.cardFooter}>
        <View style={styles.cardStats}>
          {item.lastRunStatus && (
            <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[item.lastRunStatus] + '22' }]}>
              <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[item.lastRunStatus] }]} />
              <Text style={[styles.statusText, { color: STATUS_COLOR[item.lastRunStatus] }]}>
                {item.lastRunStatus}
              </Text>
            </View>
          )}
          <Text style={styles.runCount}>{item.runCount} runs · last {timeAgo(item.lastRunAt)}</Text>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('WorkflowDetail', { workflowId: item.id })}
          >
            <Text style={styles.actionBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.runBtn]}
            onPress={() => runMut.mutate(item.id)}
            disabled={runMut.isPending}
          >
            <Text style={[styles.actionBtnText, { color: colors.accent }]}>▶ Run</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() => confirmDelete(item)}
          >
            <Text style={styles.deleteBtnText}>×</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Workflows</Text>
          <Text style={styles.headerSub}>
            {workflows.filter((w) => w.enabled).length} active · {workflows.length} total
          </Text>
        </View>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => navigation.navigate('WorkflowDetail', {})}
        >
          <Text style={styles.createBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading workflows...</Text>
        </View>
      ) : workflows.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>⏰</Text>
          <Text style={styles.emptyTitle}>No workflows yet</Text>
          <Text style={styles.emptySub}>
            Automate your agent with scheduled tasks, cron jobs, and webhook triggers.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('WorkflowDetail', {})}
          >
            <Text style={styles.primaryBtnText}>Create First Workflow</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={workflows}
          keyExtractor={(w) => w.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  headerSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  createBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: colors.textMuted, fontSize: 14 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  emptySub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  card: {
    backgroundColor: colors.bgCard, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: colors.border, gap: 8,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  triggerIcon: { fontSize: 24, width: 32 },
  cardMeta: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  cardSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  cardDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardStats: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, gap: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  runCount: { fontSize: 11, color: colors.textMuted },
  cardActions: { flexDirection: 'row', gap: 6 },
  actionBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: colors.bgSecondary, borderRadius: 8,
  },
  actionBtnText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  runBtn: { borderWidth: 1, borderColor: colors.accent + '44' },
  deleteBtn: {},
  deleteBtnText: { fontSize: 18, color: '#ef4444', fontWeight: '700' },
});
