/**
 * AgentLogsScreen — Layer 0: Agent Activity Logs
 * Shows the user's notification / activity feed from the backend.
 * Uses GET /api/notifications.
 */
import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../services/api';
import { colors } from '../../theme/colors';

// ─── Types ────────────────────────────────────────────────────
interface LogEntry {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  data?: Record<string, any>;
  createdAt: string;
}

// ─── API helpers ──────────────────────────────────────────────
const fetchLogs = () => apiFetch<LogEntry[]>('/notifications?limit=100');
const markRead = (id: string) =>
  apiFetch<void>(`/notifications/${id}/read`, { method: 'PUT' });
const markAllRead = () =>
  apiFetch<void>('/notifications/mark-all-read', { method: 'PUT' });

// ─── Helpers ──────────────────────────────────────────────────
const TYPE_ICON: Record<string, string> = {
  task_assigned: '📋',
  task_completed: '✅',
  agent_error: '🔴',
  budget_alert: '💸',
  earning_received: '💰',
  payment_received: '💳',
  payment_sent: '🏦',
  milestone_approved: '🏆',
  settlement_ready: '📦',
  system: '⚙️',
};

const getIcon = (type: string) => TYPE_ICON[type] ?? '🔔';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Component ────────────────────────────────────────────────
export function AgentLogsScreen() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['agent-logs'],
    queryFn: fetchLogs,
    refetchInterval: 30_000, // poll every 30s
  });

  const markReadMut = useMutation({
    mutationFn: markRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-logs'] }),
  });

  const markAllMut = useMutation({
    mutationFn: markAllRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-logs'] }),
  });

  const logs = data ?? [];
  const displayed = filter === 'unread' ? logs.filter((l) => !l.read) : logs;
  const unreadCount = logs.filter((l) => !l.read).length;

  const renderItem = ({ item }: { item: LogEntry }) => (
    <TouchableOpacity
      style={[styles.row, !item.read && styles.rowUnread]}
      onPress={() => !item.read && markReadMut.mutate(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>{getIcon(item.type)}</Text>
        {!item.read && <View style={styles.unreadDot} />}
      </View>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
        </View>
        <Text style={styles.message} numberOfLines={2}>{item.message}</Text>
        {item.type && (
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{item.type.replace(/_/g, ' ')}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header controls */}
      <View style={styles.header}>
        <View style={styles.filterRow}>
          {(['all', 'unread'] as const).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                {f === 'all' ? 'All' : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity
            style={styles.markAllBtn}
            onPress={() => markAllMut.mutate()}
            disabled={markAllMut.isPending}
          >
            {markAllMut.isPending
              ? <ActivityIndicator size="small" color={colors.accent} />
              : <Text style={styles.markAllText}>Mark all read</Text>
            }
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading activity...</Text>
        </View>
      ) : displayed.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyTitle}>
            {filter === 'unread' ? 'All caught up!' : 'No activity yet'}
          </Text>
          <Text style={styles.emptySub}>
            {filter === 'unread'
              ? 'No unread notifications.'
              : 'Your agent activity and alerts will appear here.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.accent}
            />
          }
          contentContainerStyle={{ paddingBottom: 32 }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterBtnActive: { borderColor: colors.accent, backgroundColor: colors.accent + '15' },
  filterText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  filterTextActive: { color: colors.accent },
  markAllBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  markAllText: { fontSize: 13, color: colors.accent, fontWeight: '600' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: colors.textMuted, fontSize: 14 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  emptySub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.bgPrimary,
    gap: 12,
  },
  rowUnread: { backgroundColor: colors.accent + '08' },
  iconWrap: { position: 'relative', width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 24 },
  unreadDot: {
    position: 'absolute', top: 0, right: 0,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.accent,
  },
  content: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  time: { fontSize: 11, color: colors.textMuted },
  message: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  typeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  typeBadgeText: { fontSize: 10, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  separator: { height: 1, backgroundColor: colors.border, marginLeft: 68 },
});
