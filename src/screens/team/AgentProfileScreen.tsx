import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Modal, TextInput,
  Platform, StatusBar, RefreshControl, KeyboardAvoidingView,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TeamStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { apiFetch } from '../../services/api';

// ──────────────────────────────────────────────
// Agent Role Definitions (from PRD)
// ──────────────────────────────────────────────
const AGENT_ROLES: Record<string, {
  icon: string;
  titleEn: string;
  titleZh: string;
  descEn: string;
  descZh: string;
  tier: string;
  tierColor: string;
  capabilities: string[];
}> = {
  ceo: {
    icon: '👑', titleEn: 'CEO / Architect', titleZh: 'CEO / 架构师',
    descEn: 'Strategy, architecture design, team coordination, bundled multi-task processing',
    descZh: '战略规划、架构设计、团队协调、捆绑多任务处理',
    tier: '💎 Opus', tierColor: '#a855f7',
    capabilities: ['Strategic planning', 'Architecture design', 'Task delegation', 'Financial review', 'Resource evaluation'],
  },
  dev: {
    icon: '💻', titleEn: 'Full-Stack Developer', titleZh: '全栈开发',
    descEn: 'All code: backend + frontend + mobile + desktop + testing',
    descZh: '全部代码：后端+前端+移动端+桌面端+测试',
    tier: '🔥 Sonnet', tierColor: '#f97316',
    capabilities: ['NestJS backend', 'Next.js frontend', 'React Native mobile', 'Tauri desktop', 'Testing'],
  },
  'qa-ops': {
    icon: '🔧', titleEn: 'QA / DevOps', titleZh: 'QA / 运维',
    descEn: 'Testing, CI/CD, deployment, monitoring, database operations',
    descZh: '测试、CI/CD、部署、监控、数据库运维',
    tier: '🆓 Free', tierColor: '#22c55e',
    capabilities: ['Test execution', 'CI/CD pipeline', 'Deployment', 'Server monitoring', 'DB operations'],
  },
  growth: {
    icon: '📈', titleEn: 'Growth Officer', titleZh: '增长官',
    descEn: 'User acquisition, A/B testing, conversion optimization, pricing',
    descZh: '用户增长策略、A/B测试、转化优化、定价策略',
    tier: '🔥 Sonnet', tierColor: '#f97316',
    capabilities: ['Growth strategy', 'A/B experiments', 'Channel analysis', 'Pricing', 'Campaign planning'],
  },
  ops: {
    icon: '📊', titleEn: 'Operations', titleZh: '运营官',
    descEn: 'OKR tracking, data analysis, cost tracking, process optimization',
    descZh: 'OKR追踪、数据分析、成本追踪、流程优化',
    tier: '🆓 Free', tierColor: '#22c55e',
    capabilities: ['OKR tracking', 'Data reporting', 'Cost analysis', 'User feedback', 'Sprint planning'],
  },
  media: {
    icon: '📱', titleEn: 'Social Media', titleZh: '自媒体运营',
    descEn: 'Twitter/X, tech blog, newsletter, SEO, bilingual content',
    descZh: 'Twitter/X、技术博客、Newsletter、SEO、中英双语内容',
    tier: '🆓 Free', tierColor: '#22c55e',
    capabilities: ['Twitter/X posts', 'Blog articles', 'Newsletter', 'SEO', 'Video scripts'],
  },
  ecosystem: {
    icon: '🌐', titleEn: 'Ecosystem', titleZh: '生态官',
    descEn: 'Developer relations, skill marketplace, MCP protocol',
    descZh: '开发者关系、技能市场、MCP协议推广',
    tier: '⚡ Budget', tierColor: '#06b6d4',
    capabilities: ['Developer relations', 'SDK docs', 'Partnership', 'Marketplace', 'Protocol advocacy'],
  },
  community: {
    icon: '👥', titleEn: 'Community', titleZh: '社区管理',
    descEn: 'Discord/Telegram community, GitHub issues, events',
    descZh: 'Discord/Telegram社区、GitHub问题管理、活动策划',
    tier: '🆓 Free', tierColor: '#22c55e',
    capabilities: ['Discord/Telegram', 'GitHub triage', 'Events', 'User stories', 'FAQ'],
  },
  brand: {
    icon: '🎨', titleEn: 'Brand & Content', titleZh: '品牌与内容',
    descEn: 'Brand voice, landing pages, pitch materials, design direction',
    descZh: '品牌文案、落地页、演示材料、设计方向',
    tier: '🆓 Free', tierColor: '#22c55e',
    capabilities: ['Brand copywriting', 'Landing pages', 'Pitch decks', 'Visual identity', 'ASO/SEO'],
  },
  hunter: {
    icon: '🔍', titleEn: 'Resource Hunter', titleZh: '资源猎手',
    descEn: 'Find free resources: cloud credits, accelerators, grants, hackathons',
    descZh: '全网搜刮免费资源：云服务、加速器、Grants、黑客松',
    tier: '🆓 Free', tierColor: '#22c55e',
    capabilities: ['Cloud credits', 'GPU compute', 'LLM API credits', 'Accelerators', 'Grants & hackathons'],
  },
  treasury: {
    icon: '💰', titleEn: 'Treasury', titleZh: '财务官',
    descEn: 'Wallet management, DeFi yield, bounty hunting, earnings optimization',
    descZh: '钱包管理、DeFi收益、赏金任务、收入优化',
    tier: '🆓 Free', tierColor: '#22c55e',
    capabilities: ['Wallet management', 'DeFi yield', 'Bounty tasks', 'Staking', 'Airdrop farming'],
  },
};

function getAgentRole(codename: string) {
  return AGENT_ROLES[codename] ?? {
    icon: '🤖', titleEn: codename, titleZh: codename,
    descEn: 'Custom agent', descZh: '自定义 Agent',
    tier: '🆓 Free', tierColor: '#6b7280',
    capabilities: [],
  };
}

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
interface AgentTask {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  budget: number;
  currency: string;
  progress?: number;
  createdAt: string;
  updatedAt: string;
}

// ──────────────────────────────────────────────
// API helpers
// ──────────────────────────────────────────────
async function fetchAgentTasks(agentId: string): Promise<AgentTask[]> {
  try {
    const res = await apiFetch<any>('/merchant-tasks/my-tasks');
    const tasks = Array.isArray(res) ? res : (res?.data ?? []);
    // Filter tasks assigned to this agent
    return tasks.filter((t: any) => t.agentId === agentId);
  } catch {
    return [];
  }
}

async function createTaskForAgent(dto: {
  title: string;
  description: string;
  type: string;
  budget: number;
  agentId: string;
}): Promise<any> {
  return apiFetch('/merchant-tasks', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

async function chatWithAgent(agentName: string, message: string): Promise<string> {
  try {
    const res = await apiFetch<any>('/openclaw/proxy/chat', {
      method: 'POST',
      body: JSON.stringify({ message, agentName, context: 'team-profile' }),
    });
    return res?.response ?? res?.message ?? res?.content ?? JSON.stringify(res);
  } catch (e: any) {
    return `Error: ${e?.message ?? 'Failed to communicate'}`;
  }
}

// ──────────────────────────────────────────────
// Task Status
// ──────────────────────────────────────────────
const TASK_STATUS: Record<string, { label: string; labelZh: string; color: string; icon: string }> = {
  pending:     { label: 'Pending',     labelZh: '待处理', color: '#6366f1', icon: '📋' },
  accepted:    { label: 'Accepted',    labelZh: '已接受', color: '#3b82f6', icon: '✋' },
  open:        { label: 'Open',        labelZh: '待开始', color: '#6366f1', icon: '📋' },
  in_progress: { label: 'In Progress', labelZh: '进行中', color: '#f59e0b', icon: '⚙️' },
  delivered:   { label: 'Delivered',   labelZh: '已交付', color: '#8b5cf6', icon: '📦' },
  completed:   { label: 'Completed',   labelZh: '已完成', color: '#22c55e', icon: '✅' },
  cancelled:   { label: 'Cancelled',   labelZh: '已取消', color: '#ef4444', icon: '❌' },
};

// ──────────────────────────────────────────────
// Assign Task Modal
// ──────────────────────────────────────────────
function AssignTaskModal({
  visible, agentId, agentName, t, onClose, onCreated,
}: {
  visible: boolean;
  agentId: string;
  agentName: string;
  t: (p: { en: string; zh: string }) => string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [taskType, setTaskType] = useState('custom_service');
  const [saving, setSaving] = useState(false);

  const TASK_TYPES = [
    { key: 'custom_service', en: 'Custom', zh: '定制' },
    { key: 'research', en: 'Research', zh: '调研' },
    { key: 'content', en: 'Content', zh: '内容' },
    { key: 'development', en: 'Dev', zh: '开发' },
    { key: 'data_analysis', en: 'Analysis', zh: '分析' },
    { key: 'consultation', en: 'Consult', zh: '咨询' },
  ];

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert(t({ en: 'Required', zh: '必填' }), t({ en: 'Task title is required', zh: '任务标题不能为空' }));
      return;
    }
    setSaving(true);
    try {
      await createTaskForAgent({
        title: title.trim(),
        description: desc.trim(),
        type: taskType,
        budget: 0,
        agentId,
      });
      setTitle(''); setDesc(''); setTaskType('custom_service');
      onCreated();
      onClose();
      Alert.alert(
        t({ en: 'Task Assigned', zh: '任务已分配' }),
        t({ en: `Task assigned to ${agentName}`, zh: `任务已分配给 ${agentName}` }),
      );
    } catch (e: any) {
      Alert.alert(t({ en: 'Error', zh: '失败' }), e?.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView style={modal.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={modal.container}>
          <View style={modal.header}>
            <Text style={modal.title}>
              {t({ en: `Assign Task to ${agentName}`, zh: `给 ${agentName} 分配任务` })}
            </Text>
            <TouchableOpacity onPress={onClose}><Text style={modal.close}>✕</Text></TouchableOpacity>
          </View>

          <TextInput
            style={modal.input}
            placeholder={t({ en: 'Task title', zh: '任务标题' })}
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
          />

          <TextInput
            style={[modal.input, modal.multiline]}
            placeholder={t({ en: 'Description (detailed instructions)', zh: '描述（详细指令）' })}
            placeholderTextColor={colors.textMuted}
            value={desc}
            onChangeText={setDesc}
            multiline
            numberOfLines={4}
          />

          <View style={modal.typeRow}>
            {TASK_TYPES.map(tt => (
              <TouchableOpacity
                key={tt.key}
                style={[modal.typePill, taskType === tt.key && modal.typePillActive]}
                onPress={() => setTaskType(tt.key)}
              >
                <Text style={[modal.typeText, taskType === tt.key && modal.typeTextActive]}>
                  {t({ en: tt.en, zh: tt.zh })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={modal.createBtn} onPress={handleCreate} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : (
              <Text style={modal.createBtnText}>
                {t({ en: 'Assign Task', zh: '分配任务' })}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ──────────────────────────────────────────────
// Quick Chat Section
// ──────────────────────────────────────────────
function QuickChat({
  codename, t,
}: {
  codename: string;
  t: (p: { en: string; zh: string }) => string;
}) {
  const [msg, setMsg] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!msg.trim()) return;
    setSending(true);
    setReply('');
    try {
      const resp = await chatWithAgent(codename, msg.trim());
      setReply(resp);
      setMsg('');
    } catch {
      setReply('Failed to communicate with agent.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={chat.container}>
      <Text style={chat.label}>💬 {t({ en: 'Quick Chat', zh: '快速对话' })}</Text>
      {reply ? (
        <View style={chat.replyBox}>
          <Text style={chat.replyLabel}>🤖 @{codename}</Text>
          <Text style={chat.replyText}>{reply}</Text>
        </View>
      ) : null}
      <View style={chat.inputRow}>
        <TextInput
          style={chat.input}
          placeholder={t({ en: `Message @${codename}...`, zh: `给 @${codename} 发消息...` })}
          placeholderTextColor={colors.textMuted}
          value={msg}
          onChangeText={setMsg}
          editable={!sending}
        />
        <TouchableOpacity style={chat.sendBtn} onPress={handleSend} disabled={sending || !msg.trim()}>
          {sending ? <ActivityIndicator color="#fff" size="small" /> : (
            <Text style={chat.sendText}>→</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ──────────────────────────────────────────────
// Main Screen
// ──────────────────────────────────────────────
type Props = NativeStackScreenProps<TeamStackParamList, 'AgentProfile'>;

export function AgentProfileScreen({ route, navigation }: Props) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { agentId, codename, name, status, modelTier } = route.params;
  const role = getAgentRole(codename);
  const [showAssign, setShowAssign] = useState(false);

  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey: ['agent-tasks', agentId],
    queryFn: () => fetchAgentTasks(agentId),
    retry: false,
  });

  const activeTasks = tasks.filter(t => t.status === 'in_progress');
  const openTasks = tasks.filter(t => t.status === 'open');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  const statusColor = status === 'active' ? '#22c55e' : status === 'suspended' ? '#f59e0b' : '#ef4444';

  return (
    <View style={s.container}>
      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.accent} />}
      >
        {/* Hero Card */}
        <View style={s.heroCard}>
          <View style={s.heroTop}>
            <View style={s.heroIcon}>
              <Text style={{ fontSize: 32 }}>{role.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.heroName}>{name}</Text>
              <Text style={s.heroRole}>{t({ en: role.titleEn, zh: role.titleZh })}</Text>
              <Text style={s.heroCodename}>@{codename}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <View style={[s.statusBadge, { backgroundColor: statusColor + '22' }]}>
                <View style={[s.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[s.statusText, { color: statusColor }]}>
                  {t({ en: status, zh: status === 'active' ? '活跃' : status === 'suspended' ? '暂停' : '异常' })}
                </Text>
              </View>
              <View style={[s.tierBadge, { borderColor: role.tierColor + '55', backgroundColor: role.tierColor + '15' }]}>
                <Text style={[s.tierText, { color: role.tierColor }]}>{role.tier}</Text>
              </View>
            </View>
          </View>
          <Text style={s.heroDesc}>{t({ en: role.descEn, zh: role.descZh })}</Text>
        </View>

        {/* Capabilities */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>🛠 {t({ en: 'Capabilities', zh: '能力范围' })}</Text>
          <View style={s.capabilityRow}>
            {role.capabilities.map((cap, i) => (
              <View key={i} style={s.capPill}>
                <Text style={s.capText}>{cap}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Task Summary */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>📋 {t({ en: 'Tasks', zh: '任务' })}</Text>
            <TouchableOpacity style={s.assignBtn} onPress={() => setShowAssign(true)}>
              <Text style={s.assignBtnText}>＋ {t({ en: 'Assign Task', zh: '分配任务' })}</Text>
            </TouchableOpacity>
          </View>

          {/* Summary numbers */}
          <View style={s.taskSummary}>
            <View style={[s.taskStat, { borderColor: '#f59e0b33' }]}>
              <Text style={[s.taskStatNum, { color: '#f59e0b' }]}>{activeTasks.length}</Text>
              <Text style={s.taskStatLabel}>{t({ en: 'Active', zh: '进行中' })}</Text>
            </View>
            <View style={[s.taskStat, { borderColor: '#3b82f633' }]}>
              <Text style={[s.taskStatNum, { color: '#3b82f6' }]}>{openTasks.length}</Text>
              <Text style={s.taskStatLabel}>{t({ en: 'Open', zh: '待开始' })}</Text>
            </View>
            <View style={[s.taskStat, { borderColor: '#22c55e33' }]}>
              <Text style={[s.taskStatNum, { color: '#22c55e' }]}>{completedTasks.length}</Text>
              <Text style={s.taskStatLabel}>{t({ en: 'Done', zh: '已完成' })}</Text>
            </View>
          </View>

          {isLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
          ) : tasks.length === 0 ? (
            <View style={s.emptyTasks}>
              <Text style={s.emptyIcon}>📭</Text>
              <Text style={s.emptyText}>
                {t({ en: 'No tasks assigned yet', zh: '暂无任务' })}
              </Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => setShowAssign(true)}>
                <Text style={s.emptyBtnText}>{t({ en: 'Assign First Task', zh: '分配第一个任务' })}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            [...activeTasks, ...openTasks, ...completedTasks].map(task => {
              const st = TASK_STATUS[task.status] ?? TASK_STATUS.open;
              return (
                <TouchableOpacity
                  key={task.id}
                  style={s.taskCard}
                  onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
                  activeOpacity={0.7}
                >
                  <View style={s.taskCardTop}>
                    <Text style={s.taskIcon}>{st.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.taskTitle} numberOfLines={1}>{task.title}</Text>
                      <Text style={s.taskDesc} numberOfLines={2}>{task.description}</Text>
                    </View>
                    <View style={[s.taskStatusBadge, { backgroundColor: st.color + '18' }]}>
                      <Text style={[s.taskStatusText, { color: st.color }]}>
                        {t({ en: st.label, zh: st.labelZh })}
                      </Text>
                    </View>
                  </View>
                  {task.status === 'in_progress' && task.progress != null && (
                    <View style={s.progressBar}>
                      <View style={[s.progressFill, { width: `${Math.min(task.progress, 100)}%` }]} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Quick Chat */}
        <QuickChat codename={codename} t={t} />

        <View style={{ height: 30 }} />
      </ScrollView>

      <AssignTaskModal
        visible={showAssign}
        agentId={agentId}
        agentName={name}
        t={t}
        onClose={() => setShowAssign(false)}
        onCreated={() => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ['agent-tasks'] });
        }}
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
  heroCard: {
    margin: 16,
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  heroTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  heroIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.bgSecondary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  heroName: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  heroRole: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  heroCodename: { fontSize: 12, color: colors.accent, fontWeight: '600', marginTop: 2 },
  heroDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  tierBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  tierText: { fontSize: 11, fontWeight: '700' },
  section: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: colors.bgCard, borderRadius: 16,
    padding: 14, borderWidth: 1, borderColor: colors.border,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: 10 },
  capabilityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  capPill: {
    backgroundColor: colors.bgSecondary, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.border,
  },
  capText: { fontSize: 12, color: colors.textPrimary, fontWeight: '500' },
  assignBtn: {
    backgroundColor: colors.accent, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6, marginBottom: 10,
  },
  assignBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  taskSummary: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  taskStat: {
    flex: 1, backgroundColor: colors.bgSecondary, borderRadius: 10,
    padding: 10, alignItems: 'center', borderWidth: 1,
  },
  taskStatNum: { fontSize: 20, fontWeight: '800' },
  taskStatLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600', marginTop: 2 },
  emptyTasks: { alignItems: 'center', padding: 16, gap: 6 },
  emptyIcon: { fontSize: 28 },
  emptyText: { fontSize: 13, color: colors.textMuted },
  emptyBtn: {
    backgroundColor: colors.accent, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 8, marginTop: 8,
  },
  emptyBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  taskCard: {
    backgroundColor: colors.bgSecondary, borderRadius: 12,
    padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border,
    gap: 8,
  },
  taskCardTop: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  taskIcon: { fontSize: 16, marginTop: 2 },
  taskTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  taskDesc: { fontSize: 11, color: colors.textMuted, marginTop: 2, lineHeight: 15 },
  taskStatusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  taskStatusText: { fontSize: 10, fontWeight: '700' },
  progressBar: {
    height: 4, backgroundColor: colors.bgPrimary, borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: 4, backgroundColor: '#f59e0b', borderRadius: 2 },
});

const modal = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' },
  container: {
    backgroundColor: colors.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, gap: 12,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  close: { fontSize: 18, color: colors.textMuted, padding: 4 },
  input: {
    backgroundColor: colors.bgSecondary, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 14, color: colors.textPrimary,
    borderWidth: 1, borderColor: colors.border,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
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
    alignItems: 'center',
  },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

const chat = StyleSheet.create({
  container: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: colors.bgCard, borderRadius: 16,
    padding: 14, borderWidth: 1, borderColor: colors.border,
  },
  label: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: 10 },
  replyBox: {
    backgroundColor: colors.accent + '0D', borderRadius: 12,
    padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.accent + '22',
  },
  replyLabel: { fontSize: 11, fontWeight: '700', color: colors.accent, marginBottom: 4 },
  replyText: { fontSize: 13, color: colors.textPrimary, lineHeight: 18 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1, backgroundColor: colors.bgSecondary, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
    color: colors.textPrimary, borderWidth: 1, borderColor: colors.border,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  sendText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
