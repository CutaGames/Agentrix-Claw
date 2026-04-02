import React, { useEffect, useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  RefreshControl, ActivityIndicator, Alert, ScrollView,
  Platform, StatusBar, Linking,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TeamStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { apiFetch } from '../../services/api';
import { fetchUnifiedAgents, type UnifiedAgent } from '../../services/unifiedAgent';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

// Team API types
interface TeamAgent {
  id: string;
  codename: string;
  name: string;
  agentUniqueId: string;
  status: string;
  creditScore: number;
  modelTier?: string;
}

interface MyTeam {
  templateSlug: string;
  templateName: string;
  agents: TeamAgent[];
}

interface TeamTemplate {
  slug: string;
  name: string;
  description: string;
  teamSize: number;
  usageCount: number;
  visibility: string;
  tags: string[];
  roles: Array<{
    codename: string;
    name: string;
    description: string;
    modelTier: string;
    approvalLevel: string;
  }>;
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
// Team API helpers
// ──────────────────────────────────────────────

async function fetchMyTeams(): Promise<MyTeam[]> {
  try {
    const res = await apiFetch<any>('/agent-teams/my-teams');
    return Array.isArray(res) ? res : (res?.data ?? []);
  } catch {
    return [];
  }
}

async function fetchTeamTemplates(): Promise<TeamTemplate[]> {
  try {
    const res = await apiFetch<any>('/agent-teams/templates');
    return Array.isArray(res) ? res : (res?.data ?? []);
  } catch {
    return [];
  }
}

async function provisionTeam(templateSlug: string, prefix: string): Promise<any> {
  return apiFetch('/agent-teams/provision', {
    method: 'POST',
    body: JSON.stringify({ templateSlug, teamNamePrefix: prefix }),
  });
}

async function disbandTeam(templateSlug: string): Promise<any> {
  return apiFetch(`/agent-teams/my-teams/${templateSlug}`, { method: 'DELETE' });
}

const ONBOARDING_KEY = 'team_onboarding_dismissed';

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

function AgentProgressCard({ agent, t, onPress }: { agent: UnifiedAgent; t: (p: { en: string; zh: string }) => string; onPress?: () => void }) {
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
// Onboarding Guide (first-time user)
// ──────────────────────────────────────────────

const GUIDE_STEPS = [
  { icon: '🤖', en: 'Create an agent team from a template — or build your own', zh: '从模板创建 Agent 团队，或自己定制' },
  { icon: '💬', en: 'Talk to any agent via @codename in chat', zh: '在聊天中用 @codename 和任意 Agent 对话' },
  { icon: '✅', en: 'Review and approve agent requests here', zh: '在这里审核 Agent 的操作请求' },
  { icon: '⛓️', en: 'Optionally register agents on-chain for verifiable identity', zh: '可选：将 Agent 身份上链以获得可验证性' },
];

function OnboardingGuide({ t, onDismiss }: { t: (p: { en: string; zh: string }) => string; onDismiss: () => void }) {
  return (
    <View style={guide.container}>
      <View style={guide.header}>
        <Text style={guide.title}>👋 {t({ en: 'Welcome to Agent Team', zh: '欢迎来到 Agent 团队' })}</Text>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={guide.dismiss}>✕</Text>
        </TouchableOpacity>
      </View>
      <Text style={guide.subtitle}>
        {t({ en: 'Your AI team works 24/7. Here\'s how to get started:', zh: '你的 AI 团队全天候工作。快速入门：' })}
      </Text>
      {GUIDE_STEPS.map((step, i) => (
        <View key={i} style={guide.step}>
          <Text style={guide.stepIcon}>{step.icon}</Text>
          <Text style={guide.stepText}>{t({ en: step.en, zh: step.zh })}</Text>
        </View>
      ))}
    </View>
  );
}

const guide = StyleSheet.create({
  container: {
    margin: 16, marginBottom: 8, backgroundColor: colors.accent + '11',
    borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.accent + '33',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  dismiss: { fontSize: 16, color: colors.textMuted, padding: 4 },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 10, lineHeight: 18 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  stepIcon: { fontSize: 16, width: 24, textAlign: 'center' },
  stepText: { fontSize: 13, color: colors.textPrimary, flex: 1, lineHeight: 18 },
});

// ──────────────────────────────────────────────
// Team Agent Role Card (within a team group)
// ──────────────────────────────────────────────

const MODEL_TIER_BADGE: Record<string, { label: string; color: string }> = {
  opus: { label: '💎 Opus', color: '#a855f7' },
  sonnet: { label: '🔥 Sonnet', color: '#f97316' },
  'haiku-3.5': { label: '⚡ Haiku', color: '#06b6d4' },
  'gpt-4o-mini': { label: '🆓 Mini', color: '#22c55e' },
};

function TeamAgentRow({ agent, t, onPress }: { agent: TeamAgent; t: (p: { en: string; zh: string }) => string; onPress?: () => void }) {
  const tier = MODEL_TIER_BADGE[agent.modelTier ?? ''] ?? { label: agent.modelTier ?? '—', color: '#6b7280' };
  const scoreColor = agent.creditScore >= 800 ? '#22c55e' : agent.creditScore >= 500 ? '#3b82f6' : '#f59e0b';
  const statusColor = agent.status === 'active' ? '#22c55e' : agent.status === 'suspended' ? '#f59e0b' : '#ef4444';
  const ICONS: Record<string, string> = {
    ceo: '👑', dev: '💻', 'qa-ops': '🔧', growth: '📈',
    ops: '📊', media: '📱', ecosystem: '🌐', community: '👥',
    brand: '🎨', hunter: '🔍', treasury: '💰',
  };
  const icon = ICONS[agent.codename] ?? '🤖';

  return (
    <TouchableOpacity style={teamRow.container} onPress={onPress} activeOpacity={0.7} disabled={!onPress}>
      <Text style={{ fontSize: 16, marginRight: 6 }}>{icon}</Text>
      <View style={teamRow.left}>
        <Text style={teamRow.codename}>@{agent.codename}</Text>
        <Text style={teamRow.name} numberOfLines={1}>{agent.name}</Text>
      </View>
      <View style={teamRow.right}>
        <View style={[teamRow.tierBadge, { backgroundColor: tier.color + '18', borderColor: tier.color + '44' }]}>
          <Text style={[teamRow.tierText, { color: tier.color }]}>{tier.label}</Text>
        </View>
        <Text style={[teamRow.score, { color: scoreColor }]}>{agent.creditScore}</Text>
        <View style={[teamRow.statusDot, { backgroundColor: statusColor }]} />
        <Text style={{ fontSize: 14, color: colors.textMuted }}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

const teamRow = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  left: { flex: 1, gap: 1 },
  codename: { fontSize: 13, fontWeight: '700', color: colors.accent },
  name: { fontSize: 11, color: colors.textMuted },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tierBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  tierText: { fontSize: 10, fontWeight: '600' },
  score: { fontSize: 12, fontWeight: '700', width: 32, textAlign: 'right' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
});

// ──────────────────────────────────────────────
// My Team Group Card (shows all agents in a team)
// ──────────────────────────────────────────────

function MyTeamGroupCard({ 
  team, t, onDisband, onAgentPress,
}: { 
  team: MyTeam; 
  t: (p: { en: string; zh: string }) => string;
  onDisband: () => void;
  onAgentPress: (agent: TeamAgent) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const activeCount = team.agents.filter(a => a.status === 'active').length;

  return (
    <View style={teamGroup.card}>
      <TouchableOpacity style={teamGroup.header} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
        <View style={{ flex: 1 }}>
          <Text style={teamGroup.title}>{team.templateName}</Text>
          <Text style={teamGroup.meta}>
            {activeCount}/{team.agents.length} {t({ en: 'active', zh: '活跃' })} · {team.templateSlug}
          </Text>
        </View>
        <Text style={teamGroup.arrow}>{expanded ? '▼' : '▶'}</Text>
      </TouchableOpacity>

      {expanded && (
        <>
          {team.agents.map(agent => (
            <TeamAgentRow key={agent.id} agent={agent} t={t} onPress={() => onAgentPress(agent)} />
          ))}
          <View style={teamGroup.actions}>
            <TouchableOpacity style={teamGroup.actionBtn} onPress={onDisband}>
              <Text style={teamGroup.actionText}>🗑 {t({ en: 'Disband', zh: '解散团队' })}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const teamGroup = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard, borderRadius: 16, padding: 14,
    marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  meta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  arrow: { fontSize: 12, color: colors.textMuted },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, gap: 10 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#ef444411', borderWidth: 1, borderColor: '#ef444433' },
  actionText: { fontSize: 12, fontWeight: '600', color: '#ef4444' },
});

// ──────────────────────────────────────────────
// Template Picker Card (for creating new team)
// ──────────────────────────────────────────────

function TemplatePickerCard({
  template, t, onSelect, disabled,
}: {
  template: TeamTemplate;
  t: (p: { en: string; zh: string }) => string;
  onSelect: () => void;
  disabled: boolean;
}) {
  return (
    <View style={tplCard.card}>
      <View style={tplCard.header}>
        <View style={{ flex: 1 }}>
          <Text style={tplCard.name}>{template.name}</Text>
          <Text style={tplCard.desc} numberOfLines={2}>{template.description}</Text>
        </View>
        <View style={tplCard.sizeBadge}>
          <Text style={tplCard.sizeText}>{template.teamSize}👤</Text>
        </View>
      </View>
      <View style={tplCard.rolePreview}>
        {template.roles.slice(0, 5).map(r => (
          <View key={r.codename} style={tplCard.rolePill}>
            <Text style={tplCard.roleText}>@{r.codename}</Text>
          </View>
        ))}
        {template.roles.length > 5 && (
          <Text style={tplCard.moreRoles}>+{template.roles.length - 5}</Text>
        )}
      </View>
      <TouchableOpacity style={[tplCard.createBtn, disabled && { opacity: 0.5 }]} onPress={onSelect} disabled={disabled}>
        <Text style={tplCard.createText}>
          ＋ {t({ en: 'Create This Team', zh: '创建此团队' })}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const tplCard = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard, borderRadius: 16, padding: 14,
    marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.accent + '33',
    gap: 10,
  },
  header: { flexDirection: 'row', gap: 10 },
  name: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  desc: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  sizeBadge: { backgroundColor: colors.accent + '18', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  sizeText: { fontSize: 13, fontWeight: '700', color: colors.accent },
  rolePreview: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rolePill: { backgroundColor: colors.bgSecondary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border },
  roleText: { fontSize: 11, fontWeight: '600', color: colors.accent },
  moreRoles: { fontSize: 11, color: colors.textMuted, alignSelf: 'center' },
  createBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  createText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});

// ──────────────────────────────────────────────
// Team Dashboard Screen
// ──────────────────────────────────────────────

type Props = NativeStackScreenProps<TeamStackParamList, 'TeamDashboard'>;

export function TeamDashboardScreen({ navigation }: Props) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const setApprovalCount = useNotificationStore((s) => s.setApprovalCount);
  const [actionLoading, setActionLoading] = React.useState<{ id: string; action: 'approve' | 'reject' } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [provisioning, setProvisioning] = useState(false);

  // Check if onboarding was dismissed
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then(v => { if (v === 'true') setShowOnboarding(false); });
  }, []);

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
    AsyncStorage.setItem(ONBOARDING_KEY, 'true');
  }, []);

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
    queryFn: () => fetchUnifiedAgents(),
    retry: false,
  });

  // Fetch team data from the new team API
  const {
    data: myTeams = [],
    isLoading: loadingTeams,
    refetch: refetchTeams,
  } = useQuery({
    queryKey: ['my-teams'],
    queryFn: fetchMyTeams,
    retry: false,
  });

  const {
    data: templates = [],
    isLoading: loadingTemplates,
  } = useQuery({
    queryKey: ['team-templates'],
    queryFn: fetchTeamTemplates,
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

  const handleProvision = useCallback(async (slug: string, name: string) => {
    Alert.alert(
      t({ en: 'Create Team', zh: '创建团队' }),
      t({ en: `Create a "${name}" team? This is free.`, zh: `创建「${name}」团队？创建免费。` }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Create', zh: '创建' }),
          onPress: async () => {
            setProvisioning(true);
            try {
              await provisionTeam(slug, '');
              queryClient.invalidateQueries({ queryKey: ['my-teams'] });
              queryClient.invalidateQueries({ queryKey: ['agent-accounts'] });
              Alert.alert(
                t({ en: 'Team Created! 🎉', zh: '团队创建成功！🎉' }),
                t({
                  en: 'Your agent team is ready. Each agent can be invoked via @codename in chat.',
                  zh: '你的 Agent 团队已就绪。在聊天中用 @代号 即可调用任意 Agent。',
                }),
              );
            } catch (e: any) {
              const msg = e?.message ?? '';
              if (msg.includes('已经')) {
                Alert.alert(t({ en: 'Already Created', zh: '已创建' }), t({ en: 'You already have this team.', zh: '你已有该团队。' }));
              } else {
                Alert.alert(t({ en: 'Error', zh: '错误' }), msg || t({ en: 'Failed to create team.', zh: '团队创建失败。' }));
              }
            } finally {
              setProvisioning(false);
            }
          },
        },
      ],
    );
  }, [queryClient, t]);

  const handleDisband = useCallback((slug: string, name: string) => {
    Alert.alert(
      t({ en: 'Disband Team', zh: '解散团队' }),
      t({ en: `Disband "${name}"? All agents will be revoked.`, zh: `解散「${name}」？所有 Agent 将被撤销。` }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Disband', zh: '解散' }),
          style: 'destructive',
          onPress: async () => {
            try {
              await disbandTeam(slug);
              queryClient.invalidateQueries({ queryKey: ['my-teams'] });
              queryClient.invalidateQueries({ queryKey: ['agent-accounts'] });
            } catch {
              Alert.alert(t({ en: 'Error', zh: '错误' }), t({ en: 'Failed to disband.', zh: '解散失败。' }));
            }
          },
        },
      ],
    );
  }, [queryClient, t]);

  const isRefreshing = loadingApprovals || loadingAgents || loadingTeams;
  const hasTeams = myTeams.length > 0;
  const totalTeamAgents = myTeams.reduce((sum, team) => sum + team.agents.length, 0);

  // Templates the user hasn't created yet
  const availableTemplates = templates.filter(
    tpl => !myTeams.some(team => team.templateSlug === tpl.slug)
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t({ en: 'Team', zh: '团队' })}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.navigate('TaskBoard')}
          >
            <Text style={styles.headerBtnText}>📋 {t({ en: 'Tasks', zh: '任务' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.navigate('TeamAgentAccounts')}
          >
            <Text style={styles.headerBtnText}>🤖 {t({ en: 'Accounts', zh: '账户' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.navigate('TeamSpace')}
          >
            <Text style={styles.headerBtnText}>👥 {t({ en: 'Spaces', zh: '空间' })}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => { refetchApprovals(); refetchAgents(); refetchTeams(); }}
            tintColor={colors.accent}
          />
        }
      >
        {/* Onboarding guide for first-time users */}
        {showOnboarding && <OnboardingGuide t={t} onDismiss={dismissOnboarding} />}

        {/* Summary card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryCount}>{myTeams.length}</Text>
              <Text style={styles.summaryLabel}>{t({ en: 'Teams', zh: '团队' })}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryCount, { color: '#22c55e' }]}>{totalTeamAgents}</Text>
              <Text style={styles.summaryLabel}>{t({ en: 'Agents', zh: 'Agent' })}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryCount, { color: '#f59e0b' }]}>{approvals.length}</Text>
              <Text style={styles.summaryLabel}>{t({ en: 'Pending', zh: '待审批' })}</Text>
            </View>
          </View>
        </View>

        {/* ═══ CEO Directive — give a command to CEO ═══ */}
        {hasTeams && (
          <TouchableOpacity
            style={styles.ceoBanner}
            onPress={() => {
              const ceoAgent = myTeams.flatMap(t => t.agents).find(a => a.codename === 'ceo');
              if (ceoAgent) {
                navigation.navigate('AgentProfile', {
                  agentId: ceoAgent.id,
                  codename: ceoAgent.codename,
                  name: ceoAgent.name,
                  status: ceoAgent.status,
                  modelTier: ceoAgent.modelTier ?? '',
                });
              } else {
                navigation.navigate('TaskBoard');
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 28 }}>👑</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.ceoBannerTitle}>
                {t({ en: 'Give CEO a Directive', zh: '给CEO下达指令' })}
              </Text>
              <Text style={styles.ceoBannerSub}>
                {t({
                  en: 'Chat with CEO to plan strategy, assign team tasks, review progress',
                  zh: '与CEO对话制定战略、分配团队任务、审查进度',
                })}
              </Text>
            </View>
            <Text style={{ fontSize: 18, color: colors.accent }}>→</Text>
          </TouchableOpacity>
        )}

        {/* ═══ My Teams section ═══ */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🏢 {t({ en: 'My Agent Teams', zh: '我的 Agent 团队' })}</Text>
        </View>

        {loadingTeams ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />
        ) : hasTeams ? (
          myTeams.map(team => (
            <MyTeamGroupCard
              key={team.templateSlug}
              team={team}
              t={t}
              onDisband={() => handleDisband(team.templateSlug, team.templateName)}
              onAgentPress={(agent) => navigation.navigate('AgentProfile', {
                agentId: agent.id,
                codename: agent.codename,
                name: agent.name,
                status: agent.status,
                modelTier: agent.modelTier ?? '',
              })}
            />
          ))
        ) : (
          <View style={styles.emptySection}>
            <Text style={styles.emptyIcon}>🏗️</Text>
            <Text style={styles.emptyText}>
              {t({ en: 'No teams yet — create one below!', zh: '还没有团队 — 从下方模板创建！' })}
            </Text>
          </View>
        )}

        {/* ═══ Available Templates (if user has un-created templates) ═══ */}
        {availableTemplates.length > 0 && (
          <>
            <View style={[styles.sectionHeader, { marginTop: 8 }]}>
              <Text style={styles.sectionTitle}>📋 {t({ en: 'Team Templates', zh: '团队模板' })}</Text>
            </View>
            {availableTemplates.map(tpl => (
              <TemplatePickerCard
                key={tpl.slug}
                template={tpl}
                t={t}
                onSelect={() => handleProvision(tpl.slug, tpl.name)}
                disabled={provisioning}
              />
            ))}
          </>
        )}

        {/* ═══ Quick Access: Task Board ═══ */}
        <TouchableOpacity
          style={styles.taskBoardBanner}
          onPress={() => navigation.navigate('TaskBoard')}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.taskBoardTitle}>📋 {t({ en: 'Team Task Board', zh: '团队任务看板' })}</Text>
            <Text style={styles.taskBoardSub}>
              {t({ en: 'View all agent tasks, assign new tasks, track deliverables', zh: '查看所有Agent任务、分配新任务、跟踪交付物' })}
            </Text>
          </View>
          <Text style={styles.taskBoardArrow}>→</Text>
        </TouchableOpacity>

        {/* ═══ Approvals section ═══ */}
        <View style={[styles.sectionHeader, { marginTop: 8 }]}>
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

        {/* ═══ Individual Agent Accounts (legacy / standalone) ═══ */}
        <View style={[styles.sectionHeader, { marginTop: 8 }]}>
          <Text style={styles.sectionTitle}>🤖 {t({ en: 'Agent Accounts', zh: 'Agent 账户' })}</Text>
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
          agents.slice(0, 5).map((agent) => (
            <AgentProgressCard
              key={agent.id}
              agent={agent}
              t={t}
              onPress={() => navigation.navigate('TeamAgentAccounts')}
            />
          ))
        )}
        {agents.length > 5 && (
          <TouchableOpacity
            style={[styles.manageBtnSmall, { alignSelf: 'center', marginBottom: 8 }]}
            onPress={() => navigation.navigate('TeamAgentAccounts')}
          >
            <Text style={styles.manageBtnText}>
              {t({ en: `View all ${agents.length} agents`, zh: `查看全部 ${agents.length} 个 Agent` })} →
            </Text>
          </TouchableOpacity>
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
  // Task Board banner
  taskBoardBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.accent + '11',
    borderWidth: 1,
    borderColor: colors.accent + '33',
    gap: 10,
  },
  taskBoardTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  taskBoardSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  taskBoardArrow: { fontSize: 20, color: colors.accent, fontWeight: '700' },
  // CEO directive banner
  ceoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#a855f711',
    borderWidth: 1,
    borderColor: '#a855f733',
    gap: 12,
  },
  ceoBannerTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  ceoBannerSub: { fontSize: 11, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
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
