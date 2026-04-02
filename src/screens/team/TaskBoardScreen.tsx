import React, { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  RefreshControl, ActivityIndicator, Alert, Modal,
  TextInput, ScrollView, Platform, StatusBar,
  KeyboardAvoidingView,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { apiFetch } from '../../services/api';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
interface MerchantTask {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  budget: number;
  currency: string;
  progress?: number;
  agentId?: string;
  agentName?: string;
  requirements?: {
    deadline?: string;
    deliverables?: string[];
  };
  createdAt: string;
  updatedAt: string;
}

interface TeamAgent {
  id: string;
  codename: string;
  name: string;
  agentUniqueId: string;
  status: string;
}

interface MyTeam {
  templateSlug: string;
  templateName: string;
  agents: TeamAgent[];
}

// ──────────────────────────────────────────────
// Agent icons
// ──────────────────────────────────────────────
const AGENT_ICONS: Record<string, string> = {
  ceo: '👑', dev: '💻', 'qa-ops': '🔧', growth: '📈',
  ops: '📊', media: '📱', ecosystem: '🌐', community: '👥',
  brand: '🎨', hunter: '🔍', treasury: '💰',
};

// ──────────────────────────────────────────────
// API
// ──────────────────────────────────────────────
async function fetchMyTasks(): Promise<MerchantTask[]> {
  const res = await apiFetch<MerchantTask[] | { data: MerchantTask[] }>('/merchant-tasks/my-tasks');
  return Array.isArray(res) ? res : (res as any).data || [];
}

async function fetchMyTeams(): Promise<MyTeam[]> {
  try {
    const res = await apiFetch<any>('/agent-teams/my-teams');
    return Array.isArray(res) ? res : (res?.data ?? []);
  } catch { return []; }
}

async function createTask(dto: {
  title: string;
  description: string;
  type: string;
  budget: number;
  agentId?: string;
}): Promise<MerchantTask> {
  const res = await apiFetch<MerchantTask | { data: MerchantTask }>('/merchant-tasks', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
  return (res as any).data || res;
}

async function completeTask(taskId: string): Promise<void> {
  await apiFetch(`/merchant-tasks/${taskId}/complete`, { method: 'PUT' });
}

// ──────────────────────────────────────────────
// Status metadata
// ──────────────────────────────────────────────
const STATUS_META: Record<string, { label: { en: string; zh: string }; color: string; icon: string }> = {
  pending:     { label: { en: 'Pending', zh: '待处理' },     color: '#6366f1', icon: '📋' },
  accepted:    { label: { en: 'Accepted', zh: '已接受' },    color: '#3b82f6', icon: '✋' },
  open:        { label: { en: 'Open', zh: '待开始' },        color: '#6366f1', icon: '📋' },
  in_progress: { label: { en: 'In Progress', zh: '进行中' }, color: '#f59e0b', icon: '⚙️' },
  delivered:   { label: { en: 'Delivered', zh: '已交付' },   color: '#8b5cf6', icon: '📦' },
  completed:   { label: { en: 'Completed', zh: '已完成' },   color: '#22c55e', icon: '✅' },
  cancelled:   { label: { en: 'Cancelled', zh: '已取消' },   color: '#ef4444', icon: '❌' },
};

const TASK_TYPES = [
  { key: 'custom_service', en: 'Custom', zh: '定制' },
  { key: 'research', en: 'Research', zh: '调研' },
  { key: 'content', en: 'Content', zh: '内容' },
  { key: 'development', en: 'Dev', zh: '开发' },
  { key: 'data_analysis', en: 'Analysis', zh: '分析' },
  { key: 'consultation', en: 'Consult', zh: '咨询' },
];

// ──────────────────────────────────────────────
// Assign Task Modal
// ──────────────────────────────────────────────
function AssignTaskModal({
  visible, agents, t, onClose, onCreated,
}: {
  visible: boolean;
  agents: TeamAgent[];
  t: (p: { en: string; zh: string }) => string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [taskType, setTaskType] = useState('custom_service');
  const [selectedAgent, setSelectedAgent] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert(t({ en: 'Required', zh: '必填' }), t({ en: 'Title is required', zh: '标题不能为空' }));
      return;
    }
    setSaving(true);
    try {
      await createTask({
        title: title.trim(),
        description: desc.trim(),
        type: taskType,
        budget: 0,
        agentId: selectedAgent,
      });
      setTitle(''); setDesc(''); setSelectedAgent(undefined);
      onCreated();
      onClose();
      Alert.alert('✅', t({ en: 'Task assigned!', zh: '任务已分配！' }));
    } catch (e: any) {
      Alert.alert(t({ en: 'Error', zh: '失败' }), e?.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView style={modalS.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={modalS.container}>
          <View style={modalS.header}>
            <Text style={modalS.title}>{t({ en: 'Assign Task', zh: '分配任务' })}</Text>
            <TouchableOpacity onPress={onClose}><Text style={modalS.close}>✕</Text></TouchableOpacity>
          </View>

          {/* Agent Picker */}
          <Text style={modalS.label}>{t({ en: 'Assign to', zh: '分配给' })}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={modalS.agentRow}>
              <TouchableOpacity
                style={[modalS.agentPill, !selectedAgent && modalS.agentPillActive]}
                onPress={() => setSelectedAgent(undefined)}
              >
                <Text style={[modalS.agentPillText, !selectedAgent && modalS.agentPillTextActive]}>
                  {t({ en: 'Unassigned', zh: '未指派' })}
                </Text>
              </TouchableOpacity>
              {agents.map(a => {
                const icon = AGENT_ICONS[a.codename] ?? '🤖';
                const active = selectedAgent === a.id;
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={[modalS.agentPill, active && modalS.agentPillActive]}
                    onPress={() => setSelectedAgent(a.id)}
                  >
                    <Text style={[modalS.agentPillText, active && modalS.agentPillTextActive]}>
                      {icon} @{a.codename}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <TextInput
            style={modalS.input}
            placeholder={t({ en: 'Task title', zh: '任务标题' })}
            placeholderTextColor={colors.textMuted}
            value={title} onChangeText={setTitle}
          />
          <TextInput
            style={[modalS.input, { minHeight: 70, textAlignVertical: 'top' }]}
            placeholder={t({ en: 'Description / instructions', zh: '描述 / 详细指令' })}
            placeholderTextColor={colors.textMuted}
            value={desc} onChangeText={setDesc} multiline
          />

          <View style={modalS.typeRow}>
            {TASK_TYPES.map(tt => (
              <TouchableOpacity
                key={tt.key}
                style={[modalS.typePill, taskType === tt.key && modalS.typePillActive]}
                onPress={() => setTaskType(tt.key)}
              >
                <Text style={[modalS.typeText, taskType === tt.key && modalS.typeTextActive]}>
                  {t({ en: tt.en, zh: tt.zh })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={modalS.createBtn} onPress={handleCreate} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : (
              <Text style={modalS.createBtnText}>{t({ en: 'Assign Task', zh: '分配任务' })}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ──────────────────────────────────────────────
// View tabs
// ──────────────────────────────────────────────
type BoardTab = 'by-agent' | 'all';

export function TaskBoardScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<BoardTab>('by-agent');
  const [showCreate, setShowCreate] = useState(false);

  const { data: myTasks = [], isLoading: tasksLoading, refetch: refetchTasks } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: fetchMyTasks,
    retry: false,
  });

  const { data: myTeams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ['my-teams'],
    queryFn: fetchMyTeams,
    retry: false,
  });

  const allAgents = useMemo(() => myTeams.flatMap(t => t.agents), [myTeams]);

  // Group tasks by agent
  const tasksByAgent = useMemo(() => {
    const map: Record<string, { agent: TeamAgent; tasks: MerchantTask[] }> = {};
    // Initialize all agents (even with no tasks)
    for (const a of allAgents) {
      map[a.id] = { agent: a, tasks: [] };
    }
    // Assign tasks to agents
    for (const task of myTasks) {
      if (task.agentId && map[task.agentId]) {
        map[task.agentId].tasks.push(task);
      }
    }
    return Object.values(map);
  }, [allAgents, myTasks]);

  const unassignedTasks = useMemo(() =>
    myTasks.filter(t => !t.agentId || !allAgents.some(a => a.id === t.agentId)),
    [myTasks, allAgents],
  );

  // Stats
  const totalActive = myTasks.filter(t => t.status === 'in_progress' || t.status === 'accepted').length;
  const totalOpen = myTasks.filter(t => t.status === 'open' || t.status === 'pending').length;
  const totalDone = myTasks.filter(t => t.status === 'completed' || t.status === 'delivered').length;

  const loading = tasksLoading || teamsLoading;

  const handleComplete = (task: MerchantTask) => {
    Alert.alert(
      t({ en: 'Complete Task', zh: '完成任务' }),
      t({ en: `Complete "${task.title}"?`, zh: `完成"${task.title}"？` }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Complete', zh: '完成' }),
          onPress: async () => {
            try {
              await completeTask(task.id);
              queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Failed');
            }
          },
        },
      ],
    );
  };

  const renderTaskCard = (task: MerchantTask) => {
    const meta = STATUS_META[task.status] ?? STATUS_META.open;
    return (
      <TouchableOpacity
        key={task.id}
        style={s.taskCard}
        onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
        activeOpacity={0.7}
      >
        <View style={s.taskRow}>
          <Text style={s.taskIcon}>{meta.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.taskTitle} numberOfLines={1}>{task.title}</Text>
            {task.description ? <Text style={s.taskDesc} numberOfLines={1}>{task.description}</Text> : null}
          </View>
          <View style={[s.taskBadge, { backgroundColor: meta.color + '18' }]}>
            <Text style={[s.taskBadgeText, { color: meta.color }]}>{t(meta.label)}</Text>
          </View>
        </View>
        {task.status === 'in_progress' && task.progress != null && (
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${Math.min(task.progress, 100)}%` }]} />
          </View>
        )}
        {task.status === 'in_progress' && (
          <TouchableOpacity style={s.completeBtn} onPress={() => handleComplete(task)}>
            <Text style={s.completeBtnText}>✅ {t({ en: 'Complete', zh: '完成' })}</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const renderAgentSection = (item: { agent: TeamAgent; tasks: MerchantTask[] }) => {
    const { agent, tasks } = item;
    const icon = AGENT_ICONS[agent.codename] ?? '🤖';
    const activeCount = tasks.filter(t => t.status === 'in_progress').length;
    const statusColor = agent.status === 'active' ? '#22c55e' : '#f59e0b';

    return (
      <View key={agent.id} style={s.agentSection}>
        <TouchableOpacity
          style={s.agentHeader}
          onPress={() => navigation.navigate('AgentProfile', {
            agentId: agent.id, codename: agent.codename,
            name: agent.name, status: agent.status, modelTier: '',
          })}
          activeOpacity={0.7}
        >
          <Text style={s.agentIcon}>{icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.agentName}>{agent.name}</Text>
            <Text style={s.agentCode}>@{agent.codename}</Text>
          </View>
          <View style={[s.agentDot, { backgroundColor: statusColor }]} />
          {activeCount > 0 ? (
            <View style={s.activeBadge}>
              <Text style={s.activeText}>{activeCount} {t({ en: 'active', zh: '进行中' })}</Text>
            </View>
          ) : (
            <Text style={s.idleText}>{t({ en: 'Idle', zh: '空闲' })}</Text>
          )}
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>
        {tasks.length > 0 ? (
          tasks.map(renderTaskCard)
        ) : (
          <Text style={s.noTasks}>{t({ en: 'No tasks assigned', zh: '暂无任务' })}</Text>
        )}
      </View>
    );
  };

  return (
    <View style={s.container}>
      {/* Summary */}
      <View style={s.summary}>
        <View style={s.summaryItem}>
          <Text style={[s.summaryNum, { color: '#f59e0b' }]}>{totalActive}</Text>
          <Text style={s.summaryLabel}>{t({ en: 'Active', zh: '进行中' })}</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryNum, { color: '#3b82f6' }]}>{totalOpen}</Text>
          <Text style={s.summaryLabel}>{t({ en: 'Open', zh: '待分配' })}</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryNum, { color: '#22c55e' }]}>{totalDone}</Text>
          <Text style={s.summaryLabel}>{t({ en: 'Done', zh: '已完成' })}</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryNum, { color: colors.accent }]}>{allAgents.length}</Text>
          <Text style={s.summaryLabel}>{t({ en: 'Agents', zh: 'Agent' })}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'by-agent' && s.tabActive]}
          onPress={() => setTab('by-agent')}
        >
          <Text style={[s.tabText, tab === 'by-agent' && s.tabTextActive]}>
            👥 {t({ en: 'By Agent', zh: '按Agent' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'all' && s.tabActive]}
          onPress={() => setTab('all')}
        >
          <Text style={[s.tabText, tab === 'all' && s.tabTextActive]}>
            📋 {t({ en: 'All Tasks', zh: '全部任务' })}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          style={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refetchTasks}
              tintColor={colors.accent}
            />
          }
        >
          {tab === 'by-agent' ? (
            <>
              {tasksByAgent.length === 0 && allAgents.length === 0 ? (
                <View style={s.empty}>
                  <Text style={{ fontSize: 40 }}>🏗️</Text>
                  <Text style={s.emptyTitle}>{t({ en: 'No team yet', zh: '还没有团队' })}</Text>
                  <Text style={s.emptySub}>
                    {t({ en: 'Create an agent team first from the Team tab', zh: '请先在团队页创建Agent团队' })}
                  </Text>
                </View>
              ) : (
                <>
                  {tasksByAgent.map(renderAgentSection)}
                  {unassignedTasks.length > 0 && (
                    <View style={s.agentSection}>
                      <View style={s.agentHeader}>
                        <Text style={s.agentIcon}>📦</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={s.agentName}>{t({ en: 'Unassigned', zh: '未指派' })}</Text>
                          <Text style={s.agentCode}>{unassignedTasks.length} {t({ en: 'tasks', zh: '个任务' })}</Text>
                        </View>
                      </View>
                      {unassignedTasks.map(renderTaskCard)}
                    </View>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {myTasks.length === 0 ? (
                <View style={s.empty}>
                  <Text style={{ fontSize: 40 }}>📋</Text>
                  <Text style={s.emptyTitle}>{t({ en: 'No tasks', zh: '暂无任务' })}</Text>
                  <Text style={s.emptySub}>
                    {t({ en: 'Assign tasks to your agents to get started', zh: '给Agent分配任务开始工作' })}
                  </Text>
                </View>
              ) : (
                myTasks.map(renderTaskCard)
              )}
            </>
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={() => setShowCreate(true)}>
        <Text style={s.fabText}>＋ {t({ en: 'Assign Task', zh: '分配任务' })}</Text>
      </TouchableOpacity>

      <AssignTaskModal
        visible={showCreate}
        agents={allAgents}
        t={t}
        onClose={() => setShowCreate(false)}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ['my-tasks'] })}
      />
    </View>
  );
}

// ──────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  scroll: { flex: 1 },
  // Summary
  summary: {
    flexDirection: 'row', margin: 16, marginBottom: 8,
    backgroundColor: colors.bgCard, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryNum: { fontSize: 20, fontWeight: '800' },
  summaryLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  summaryDivider: { width: 1, height: 30, backgroundColor: colors.border, alignSelf: 'center' },
  // Tabs
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  tabBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.accent + '1A', borderColor: colors.accent },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: colors.accent },
  // Agent section
  agentSection: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: colors.bgCard, borderRadius: 14,
    padding: 12, borderWidth: 1, borderColor: colors.border,
  },
  agentHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8,
    paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  agentIcon: { fontSize: 20 },
  agentName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  agentCode: { fontSize: 11, color: colors.accent, fontWeight: '600' },
  agentDot: { width: 8, height: 8, borderRadius: 4 },
  activeBadge: {
    backgroundColor: '#f59e0b22', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  activeText: { fontSize: 10, fontWeight: '700', color: '#f59e0b' },
  idleText: { fontSize: 11, color: colors.textMuted },
  chevron: { fontSize: 18, color: colors.textMuted, fontWeight: '300' },
  noTasks: { fontSize: 12, color: colors.textMuted, textAlign: 'center', paddingVertical: 8 },
  // Task card
  taskCard: {
    backgroundColor: colors.bgSecondary, borderRadius: 10,
    padding: 10, marginBottom: 6, borderWidth: 1, borderColor: colors.border,
    gap: 6,
  },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  taskIcon: { fontSize: 14 },
  taskTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  taskDesc: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  taskBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  taskBadgeText: { fontSize: 10, fontWeight: '700' },
  progressBar: { height: 3, backgroundColor: colors.bgPrimary, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: '#f59e0b', borderRadius: 2 },
  completeBtn: {
    alignItems: 'center', paddingVertical: 6, borderRadius: 8,
    backgroundColor: '#22c55e14', borderWidth: 1, borderColor: '#22c55e33',
  },
  completeBtnText: { fontSize: 11, fontWeight: '600', color: '#22c55e' },
  // Empty
  empty: { alignItems: 'center', padding: 40, gap: 8, marginTop: 20 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  // FAB
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    backgroundColor: colors.accent, borderRadius: 28,
    paddingHorizontal: 20, paddingVertical: 14,
    shadowColor: colors.accent, shadowOpacity: 0.4, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  fabText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});

const modalS = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' },
  container: {
    backgroundColor: colors.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, gap: 10,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  close: { fontSize: 18, color: colors.textMuted, padding: 4 },
  label: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  agentRow: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  agentPill: {
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border,
  },
  agentPillActive: { backgroundColor: colors.accent + '22', borderColor: colors.accent },
  agentPillText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  agentPillTextActive: { color: colors.accent },
  input: {
    backgroundColor: colors.bgSecondary, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 10, fontSize: 14, color: colors.textPrimary,
    borderWidth: 1, borderColor: colors.border,
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typePill: {
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border,
  },
  typePillActive: { backgroundColor: colors.accent + '22', borderColor: colors.accent },
  typeText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  typeTextActive: { color: colors.accent },
  createBtn: {
    backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 4,
  },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
