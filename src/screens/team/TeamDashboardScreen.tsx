import React, { useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  RefreshControl, ActivityIndicator, Alert, ScrollView,
  Platform, StatusBar,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TeamStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { apiFetch } from '../../services/api';
import { fetchAgentPresenceAccounts, type MobileAgentAccount } from '../../services/agentPresenceAccount';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface ApprovalItem {
  id: string;
  type: string;
  title: string;
  body: string;
  riskLevel?: 'L0' | 'L1' | 'L2' | 'L3';
  requestedAt: string;
  agentName?: string;
  data?: Record<string, any>;
}

// ──────────────────────────────────────────────
// API helpers
// ──────────────────────────────────────────────

async function fetchPendingApprovals(): Promise<ApprovalItem[]> {
  try {
    const res = await apiFetch<{ data?: any[]; items?: any[] }>('/notifications?type=approval&unread=true&limit=50');
    const items = res?.data ?? res?.items ?? (Array.isArray(res) ? res : []);
    return items.map((n: any) => ({
      id: n.id,
      type: n.type ?? 'approval',
      title: n.title ?? n.subject ?? 'Approval Request',
      body: n.body ?? n.message ?? n.description ?? '',
      riskLevel: n.data?.riskLevel ?? n.riskLevel ?? 'L1',
      requestedAt: n.createdAt ?? n.requestedAt ?? new Date().toISOString(),
      agentName: n.data?.agentName ?? n.agentName,
      data: n.data,
    }));
  } catch {
    return [];
  }
}

async function approveNotification(id: string): Promise<void> {
  await apiFetch(`/notifications/${id}/approve`, { method: 'POST' });
}

async function rejectNotification(id: string): Promise<void> {
  await apiFetch(`/notifications/${id}/reject`, { method: 'POST' });
}

// ──────────────────────────────────────────────
// Risk level badge
// ──────────────────────────────────────────────

const RISK_COLOR: Record<string, string> = {
  L0: '#22c55e',
  L1: '#3b82f6',
  L2: '#f59e0b',
  L3: '#ef4444',
};

function RiskBadge({ level }: { level?: string }) {
  const risk = level ?? 'L1';
  const color = RISK_COLOR[risk] ?? '#6b7280';
  return (
    <View style={[riskStyles.badge, { backgroundColor: color + '22', borderColor: color + '66' }]}>
      <Text style={[riskStyles.text, { color }]}>{risk}</Text>
    </View>
  );
}

const riskStyles = StyleSheet.create({
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  text: { fontSize: 11, fontWeight: '700' },
});

// ──────────────────────────────────────────────
// Approval Item Component
// ──────────────────────────────────────────────

function ApprovalCard({
  item,
  onApprove,
  onReject,
  onPress,
  approving,
  rejecting,
  t,
}: {
  item: ApprovalItem;
  onApprove: () => void;
  onReject: () => void;
  onPress: () => void;
  approving: boolean;
  rejecting: boolean;
  t: (p: { en: string; zh: string }) => string;
}) {
  const time = new Date(item.requestedAt).toLocaleString();
  return (
    <TouchableOpacity style={cards.card} onPress={onPress} activeOpacity={0.8}>
      <View style={cards.cardHeader}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={cards.title} numberOfLines={1}>{item.title}</Text>
          {item.agentName ? (
            <Text style={cards.agentName}>🤖 {item.agentName}</Text>
          ) : null}
        </View>
        <RiskBadge level={item.riskLevel} />
      </View>
      {item.body ? (
        <Text style={cards.body} numberOfLines={2}>{item.body}</Text>
      ) : null}
      <Text style={cards.time}>{time}</Text>
      <View style={cards.actions}>
        <TouchableOpacity
          style={[cards.actionBtn, cards.rejectBtn]}
          onPress={onReject}
          disabled={approving || rejecting}
        >
          {rejecting ? (
            <ActivityIndicator color="#ef4444" size="small" />
          ) : (
            <Text style={[cards.actionText, { color: '#ef4444' }]}>✕ {t({ en: 'Reject', zh: '拒绝' })}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[cards.actionBtn, cards.approveBtn]}
          onPress={onApprove}
          disabled={approving || rejecting}
        >
          {approving ? (
            <ActivityIndicator color="#22c55e" size="small" />
          ) : (
            <Text style={[cards.actionText, { color: '#22c55e' }]}>✓ {t({ en: 'Approve', zh: '批准' })}</Text>
          )}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ──────────────────────────────────────────────
// Agent Progress Card
// ──────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  active: '#22c55e',
  draft: '#6366f1',
  suspended: '#f59e0b',
  terminated: '#ef4444',
  error: '#ef4444',
  disconnected: '#6b7280',
};

function AgentProgressCard({ agent, t, onPress }: { agent: MobileAgentAccount; t: (p: { en: string; zh: string }) => string; onPress?: () => void }) {
  const statusColor = STATUS_COLOR[agent.status] ?? '#6b7280';
  const score = agent.creditScore ?? 720;
  const scoreColor = score >= 800 ? '#22c55e' : score >= 500 ? '#3b82f6' : score >= 200 ? '#f59e0b' : '#ef4444';

  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper style={agentCard.card} {...(onPress ? { onPress, activeOpacity: 0.7 } : {})}>
      <View style={agentCard.header}>
        <View style={agentCard.icon}>
          <Text style={{ fontSize: 18 }}>🤖</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={agentCard.name}>{agent.name}</Text>
          <Text style={agentCard.id}>{agent.agentUniqueId}</Text>
        </View>
        <View style={[agentCard.statusBadge, { backgroundColor: statusColor + '22' }]}>
          <Text style={[agentCard.statusText, { color: statusColor }]}>
            {t({
              en: agent.status,
              zh: agent.status === 'active' ? '活跃' : agent.status === 'draft' ? '草稿' : agent.status === 'suspended' ? '已暂停' : agent.status === 'terminated' ? '已终止' : '异常',
            })}
          </Text>
        </View>
      </View>
      <View style={agentCard.stats}>
        <View style={agentCard.stat}>
          <Text style={agentCard.statLabel}>{t({ en: 'Credit', zh: '信用分' })}</Text>
          <Text style={[agentCard.statValue, { color: scoreColor }]}>{score}</Text>
        </View>
        {agent.spendingLimits && (
          <View style={agentCard.stat}>
            <Text style={agentCard.statLabel}>{t({ en: 'Daily Limit', zh: '日限额' })}</Text>
            <Text style={agentCard.statValue}>${agent.spendingLimits.dailyLimit}</Text>
          </View>
        )}
        {agent.balance != null && (
          <View style={agentCard.stat}>
            <Text style={agentCard.statLabel}>{t({ en: 'Balance', zh: '余额' })}</Text>
            <Text style={[agentCard.statValue, { color: colors.accent }]}>
              {agent.balance.toFixed(2)} {agent.balanceCurrency ?? 'USD'}
            </Text>
          </View>
        )}
      </View>
    </Wrapper>
  );
}

// ──────────────────────────────────────────────
// Team Dashboard Screen
// ──────────────────────────────────────────────

type Props = NativeStackScreenProps<TeamStackParamList, 'TeamDashboard'>;

export function TeamDashboardScreen({ navigation }: Props) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const setApprovalCount = useNotificationStore((s) => s.setApprovalCount);
  const [actionLoading, setActionLoading] = React.useState<{ id: string; action: 'approve' | 'reject' } | null>(null);

  const {
    data: approvals = [],
    isLoading: loadingApprovals,
    refetch: refetchApprovals,
  } = useQuery({
    queryKey: ['team-approvals'],
    queryFn: fetchPendingApprovals,
    retry: false,
  });

  const {
    data: agents = [],
    isLoading: loadingAgents,
    refetch: refetchAgents,
  } = useQuery({
    queryKey: ['agent-accounts'],
    queryFn: () => fetchAgentPresenceAccounts(),
    retry: false,
  });

  // Sync approval count badge
  useEffect(() => {
    setApprovalCount(approvals.length);
  }, [approvals.length, setApprovalCount]);

  const handleApprove = useCallback(async (item: ApprovalItem) => {
    setActionLoading({ id: item.id, action: 'approve' });
    try {
      await approveNotification(item.id);
      queryClient.invalidateQueries({ queryKey: ['team-approvals'] });
      Alert.alert(
        t({ en: 'Approved ✅', zh: '已批准 ✅' }),
        t({ en: `"${item.title}" has been approved.`, zh: `"${item.title}" 已批准。` }),
      );
    } catch {
      Alert.alert(t({ en: 'Error', zh: '错误' }), t({ en: 'Failed to approve.', zh: '批准失败。' }));
    } finally {
      setActionLoading(null);
    }
  }, [queryClient, t]);

  const handleReject = useCallback(async (item: ApprovalItem) => {
    Alert.alert(
      t({ en: 'Reject Request', zh: '拒绝请求' }),
      t({ en: `Reject "${item.title}"?`, zh: `拒绝"${item.title}"？` }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Reject', zh: '拒绝' }),
          style: 'destructive',
          onPress: async () => {
            setActionLoading({ id: item.id, action: 'reject' });
            try {
              await rejectNotification(item.id);
              queryClient.invalidateQueries({ queryKey: ['team-approvals'] });
            } catch {
              Alert.alert(t({ en: 'Error', zh: '错误' }), t({ en: 'Failed to reject.', zh: '拒绝失败。' }));
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  }, [queryClient, t]);

  const isRefreshing = loadingApprovals || loadingAgents;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t({ en: 'Team', zh: '团队' })}</Text>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.navigate('TeamSpace')}
        >
          <Text style={styles.headerBtnText}>👥 {t({ en: 'Spaces', zh: '空间' })}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => { refetchApprovals(); refetchAgents(); }}
            tintColor={colors.accent}
          />
        }
      >
        {/* Approval summary card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryCount}>{approvals.length}</Text>
              <Text style={styles.summaryLabel}>{t({ en: 'Pending Approvals', zh: '待审批' })}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryCount, { color: '#22c55e' }]}>
                {agents.filter((a) => a.status === 'active').length}
              </Text>
              <Text style={styles.summaryLabel}>{t({ en: 'Active Agents', zh: '活跃 Agent' })}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryCount, { color: '#f59e0b' }]}>
                {agents.filter((a) => a.status === 'suspended').length}
              </Text>
              <Text style={styles.summaryLabel}>{t({ en: 'Suspended', zh: '已暂停' })}</Text>
            </View>
          </View>
        </View>

        {/* Approvals section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>⏳ {t({ en: 'Pending Approvals', zh: '待审批请求' })}</Text>
          {approvals.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{approvals.length}</Text>
            </View>
          )}
        </View>

        {loadingApprovals ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />
        ) : approvals.length === 0 ? (
          <View style={styles.emptySection}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyText}>{t({ en: 'No pending approvals', zh: '暂无待审批项' })}</Text>
          </View>
        ) : (
          approvals.map((item) => (
            <ApprovalCard
              key={item.id}
              item={item}
              onApprove={() => handleApprove(item)}
              onReject={() => handleReject(item)}
              onPress={() => navigation.navigate('TeamApprovalDetail', { notificationId: item.id, title: item.title })}
              approving={actionLoading?.id === item.id && actionLoading.action === 'approve'}
              rejecting={actionLoading?.id === item.id && actionLoading.action === 'reject'}
              t={t}
            />
          ))
        )}

        {/* Agent progress section */}
        <View style={[styles.sectionHeader, { marginTop: 8 }]}>
          <Text style={styles.sectionTitle}>🤖 {t({ en: 'Agent Progress', zh: 'Agent 进展' })}</Text>
          <TouchableOpacity
            style={styles.manageBtnSmall}
            onPress={() => navigation.navigate('TeamAgentAccounts')}
          >
            <Text style={styles.manageBtnText}>{t({ en: 'Manage', zh: '管理' })} →</Text>
          </TouchableOpacity>
        </View>

        {loadingAgents ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />
        ) : agents.length === 0 ? (
          <View style={styles.emptySection}>
            <Text style={styles.emptyIcon}>🤖</Text>
            <Text style={styles.emptyText}>{t({ en: 'No agent accounts yet', zh: '暂无 Agent 账户' })}</Text>
            <TouchableOpacity
              style={styles.createAgentBtn}
              onPress={() => navigation.navigate('TeamAgentAccounts')}
            >
              <Text style={styles.createAgentBtnText}>＋ {t({ en: 'Create Agent', zh: '创建智能体' })}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          agents.map((agent) => (
            <AgentProgressCard
              key={agent.id}
              agent={agent}
              t={t}
              onPress={() => navigation.navigate('TeamAgentAccounts')}
            />
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ──────────────────────────────────────────────
// Team Approval Detail Screen
// ──────────────────────────────────────────────

type DetailProps = NativeStackScreenProps<TeamStackParamList, 'TeamApprovalDetail'>;

export function TeamApprovalDetailScreen({ route, navigation }: DetailProps) {
  const { t } = useI18n();
  const { notificationId, title } = route.params;
  const queryClient = useQueryClient();
  const [loading, setLoading] = React.useState<'approve' | 'reject' | null>(null);

  const handleApprove = async () => {
    setLoading('approve');
    try {
      await approveNotification(notificationId);
      queryClient.invalidateQueries({ queryKey: ['team-approvals'] });
      Alert.alert(t({ en: 'Approved ✅', zh: '已批准 ✅' }), t({ en: 'Request approved.', zh: '请求已批准。' }), [
        { text: t({ en: 'OK', zh: '确定' }), onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert(t({ en: 'Error', zh: '错误' }), t({ en: 'Failed to approve.', zh: '批准失败。' }));
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async () => {
    setLoading('reject');
    try {
      await rejectNotification(notificationId);
      queryClient.invalidateQueries({ queryKey: ['team-approvals'] });
      navigation.goBack();
    } catch {
      Alert.alert(t({ en: 'Error', zh: '错误' }), t({ en: 'Failed to reject.', zh: '拒绝失败。' }));
    } finally {
      setLoading(null);
    }
  };

  return (
    <View style={detail.container}>
      <ScrollView style={detail.scroll} contentContainerStyle={{ padding: 16 }}>
        <View style={detail.card}>
          <Text style={detail.label}>{t({ en: 'Request ID', zh: '请求 ID' })}</Text>
          <Text style={detail.value}>{notificationId}</Text>
          <Text style={[detail.label, { marginTop: 12 }]}>{t({ en: 'Title', zh: '标题' })}</Text>
          <Text style={detail.value}>{title}</Text>
        </View>
      </ScrollView>
      <View style={detail.footer}>
        <TouchableOpacity
          style={[detail.btn, detail.rejectBtn]}
          onPress={handleReject}
          disabled={loading !== null}
        >
          {loading === 'reject' ? (
            <ActivityIndicator color="#ef4444" />
          ) : (
            <Text style={[detail.btnText, { color: '#ef4444' }]}>✕ {t({ en: 'Reject', zh: '拒绝' })}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[detail.btn, detail.approveBtn]}
          onPress={handleApprove}
          disabled={loading !== null}
        >
          {loading === 'approve' ? (
            <ActivityIndicator color="#22c55e" />
          ) : (
            <Text style={[detail.btnText, { color: '#fff' }]}>✓ {t({ en: 'Approve', zh: '批准' })}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 40) + 12 : 56,
    backgroundColor: colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  headerBtn: {
    backgroundColor: colors.bgCard,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerBtnText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  scroll: { flex: 1 },
  summaryCard: {
    margin: 16,
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryCount: { fontSize: 24, fontWeight: '800', color: colors.accent },
  summaryLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600', textAlign: 'center' },
  summaryDivider: { width: 1, height: 36, backgroundColor: colors.border },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  badge: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  emptySection: {
    alignItems: 'center',
    padding: 20,
    gap: 6,
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIcon: { fontSize: 28 },
  emptyText: { fontSize: 13, color: colors.textMuted },
  manageBtnSmall: {
    marginLeft: 'auto',
    backgroundColor: colors.accent + '18',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.accent + '44',
  },
  manageBtnText: { fontSize: 12, fontWeight: '600', color: colors.accent },
  createAgentBtn: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  createAgentBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});

const cards = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  agentName: { fontSize: 12, color: colors.textMuted },
  body: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  time: { fontSize: 11, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  rejectBtn: {
    backgroundColor: '#ef444411',
    borderColor: '#ef444455',
  },
  approveBtn: {
    backgroundColor: '#22c55e11',
    borderColor: '#22c55e55',
  },
  actionText: { fontSize: 13, fontWeight: '700' },
});

const agentCard = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  id: { fontSize: 11, color: colors.textMuted },
  statusBadge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  stats: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    backgroundColor: colors.bgSecondary,
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    gap: 2,
  },
  statLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  statValue: { fontSize: 13, color: colors.textPrimary, fontWeight: '700' },
});

const detail = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  scroll: { flex: 1 },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  label: { fontSize: 11, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 14, color: colors.textPrimary },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  rejectBtn: { backgroundColor: '#ef444411', borderColor: '#ef444455' },
  approveBtn: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnText: { fontSize: 15, fontWeight: '700' },
});
