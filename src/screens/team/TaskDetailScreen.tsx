import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  RefreshControl, ActivityIndicator, Alert, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRoute, useNavigation } from '@react-navigation/native';
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
  progress?: number | { percentage?: number; currentStep?: string; updates?: any[] };
  agentId?: string;
  agentName?: string;
  merchantId?: string;
  requirements?: {
    deadline?: string;
    deliverables?: string[];
    specifications?: Record<string, any>;
  };
  bids?: TaskBid[];
  milestones?: Milestone[];
  createdAt: string;
  updatedAt: string;
}

interface TaskBid {
  id: string;
  agentId: string;
  agentName?: string;
  amount: number;
  proposal: string;
  status: string;
  createdAt: string;
}

interface Milestone {
  id: string;
  title: string;
  amount: number;
  status: string;
  dueDate?: string;
}

// ──────────────────────────────────────────────
// API
// ──────────────────────────────────────────────
async function fetchTaskDetail(taskId: string): Promise<MerchantTask> {
  const res = await apiFetch<MerchantTask | { data: MerchantTask }>(`/merchant-tasks/${taskId}`);
  return (res as any).data || res;
}

async function acceptTask(taskId: string): Promise<void> {
  await apiFetch(`/merchant-tasks/${taskId}/accept`, { method: 'PUT' });
}

async function updateProgress(taskId: string, dto: { percentage?: number; message?: string }): Promise<void> {
  await apiFetch(`/merchant-tasks/${taskId}/progress`, {
    method: 'PUT',
    body: JSON.stringify(dto),
  });
}

async function completeTask(taskId: string): Promise<void> {
  await apiFetch(`/merchant-tasks/${taskId}/complete`, { method: 'PUT' });
}

async function cancelTask(taskId: string, reason?: string): Promise<void> {
  await apiFetch(`/merchant-tasks/${taskId}/cancel`, {
    method: 'PUT',
    body: JSON.stringify({ reason }),
  });
}

async function chatWithAgent(agentCodename: string, message: string): Promise<string> {
  const res = await apiFetch<{ response?: string; message?: string }>('/openclaw/proxy/chat', {
    method: 'POST',
    body: JSON.stringify({ message, agentName: agentCodename, context: 'task-execution' }),
  });
  return (res as any).response || (res as any).message || JSON.stringify(res);
}

// ──────────────────────────────────────────────
// Status mapping (aligned with backend TaskStatus enum)
// ──────────────────────────────────────────────
const STATUS_META: Record<string, { label: { en: string; zh: string }; color: string; icon: string }> = {
  pending:     { label: { en: 'Pending', zh: '待处理' },     color: '#6366f1', icon: '📋' },
  accepted:    { label: { en: 'Accepted', zh: '已接受' },    color: '#3b82f6', icon: '✋' },
  in_progress: { label: { en: 'In Progress', zh: '进行中' }, color: '#f59e0b', icon: '⚙️' },
  delivered:   { label: { en: 'Delivered', zh: '已交付' },   color: '#8b5cf6', icon: '📦' },
  completed:   { label: { en: 'Completed', zh: '已完成' },   color: '#22c55e', icon: '✅' },
  cancelled:   { label: { en: 'Cancelled', zh: '已取消' },   color: '#ef4444', icon: '❌' },
  disputed:    { label: { en: 'Disputed', zh: '争议中' },    color: '#ef4444', icon: '⚠️' },
  // Legacy / frontend aliases
  open:        { label: { en: 'Open', zh: '待开始' },        color: '#6366f1', icon: '📋' },
};

// Map agent codenames to icons
const AGENT_ICONS: Record<string, string> = {
  ceo: '👑', dev: '💻', 'qa-ops': '🔧', growth: '📈',
  ops: '📊', media: '📱', ecosystem: '🌐', community: '👥',
  brand: '🎨', hunter: '🔍', treasury: '💰',
};

function getProgressPercent(progress: MerchantTask['progress']): number {
  if (progress == null) return 0;
  if (typeof progress === 'number') return progress;
  return progress?.percentage ?? 0;
}

function getProgressStep(progress: MerchantTask['progress']): string | undefined {
  if (progress == null || typeof progress === 'number') return undefined;
  return progress?.currentStep;
}

export function TaskDetailScreen() {
  const { t } = useI18n();
  const route = useRoute<any>();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  // ── Safe params extraction ──
  const taskId = route.params?.taskId;
  const [progressVal, setProgressVal] = useState('');
  const [agentMsg, setAgentMsg] = useState('');
  const [agentReply, setAgentReply] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data: task, isLoading, refetch } = useQuery({
    queryKey: ['task-detail', taskId],
    queryFn: () => fetchTaskDetail(taskId!),
    enabled: !!taskId,
    retry: false,
  });

  // ── No taskId = navigation error ──
  if (!taskId) {
    return (
      <View style={s.container}>
        <View style={s.errorBox}>
          <Text style={s.errorIcon}>⚠️</Text>
          <Text style={s.errorText}>{t({ en: 'Task not found', zh: '任务未找到' })}</Text>
          <TouchableOpacity style={s.errorBtn} onPress={() => navigation.goBack()}>
            <Text style={s.errorBtnText}>{t({ en: 'Go Back', zh: '返回' })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Actions ──
  const handleStartTask = async () => {
    setActionLoading('start');
    try {
      // Try to accept the task via API first
      await acceptTask(taskId);
      queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      Alert.alert('✅', t({ en: 'Task started!', zh: '任务已启动！' }));
    } catch {
      // If accept fails (merchantId mismatch), update progress to trigger status change
      try {
        await updateProgress(taskId, { message: 'Task started by team member', percentage: 5 });
        queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] });
        queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
        Alert.alert('✅', t({ en: 'Task started!', zh: '任务已启动！' }));
      } catch (e2: any) {
        Alert.alert(t({ en: 'Error', zh: '错误' }), e2?.message || t({ en: 'Failed to start task', zh: '启动任务失败' }));
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendToAgent = async () => {
    if (!task?.agentId && !task?.agentName) {
      Alert.alert(t({ en: 'No Agent', zh: '未分配Agent' }), t({ en: 'Assign an agent to this task first.', zh: '请先为此任务分配一个Agent。' }));
      return;
    }
    const codename = task?.agentName?.toLowerCase() || 'ceo';
    const message = agentMsg.trim() || `Please start working on task: "${task?.title}". Description: ${task?.description || 'N/A'}`;
    setActionLoading('chat');
    setAgentReply('');
    try {
      const reply = await chatWithAgent(codename, message);
      setAgentReply(reply);
      setAgentMsg('');
      // Also try to update task status
      try {
        await updateProgress(taskId, { message: `Agent @${codename} engaged`, percentage: 5 });
        queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] });
        queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      } catch { /* non-critical */ }
    } catch (err: any) {
      Alert.alert(t({ en: 'Error', zh: '错误' }), err?.message || t({ en: 'Failed to contact agent', zh: '联系Agent失败' }));
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateProgress = async () => {
    const p = parseInt(progressVal, 10);
    if (isNaN(p) || p < 0 || p > 100) {
      Alert.alert(t({ en: 'Invalid', zh: '无效' }), t({ en: 'Enter 0-100', zh: '请输入 0-100' }));
      return;
    }
    setActionLoading('progress');
    try {
      await updateProgress(taskId, { percentage: p });
      queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      setProgressVal('');
      Alert.alert('✅', t({ en: 'Progress updated!', zh: '进度已更新！' }));
    } catch (err: any) {
      Alert.alert(t({ en: 'Error', zh: '错误' }), err?.message || '');
    } finally {
      setActionLoading(null);
    }
  };

  const handleComplete = () => {
    Alert.alert(
      t({ en: 'Complete Task', zh: '完成任务' }),
      t({ en: 'Mark this task as completed?', zh: '将此任务标记为已完成？' }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Complete', zh: '完成' }),
          onPress: async () => {
            setActionLoading('complete');
            try {
              await completeTask(taskId);
              queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] });
              queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
              Alert.alert('✅', t({ en: 'Task completed!', zh: '任务已完成！' }));
            } catch (err: any) {
              Alert.alert(t({ en: 'Error', zh: '错误' }), err?.message || '');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  };

  const handleCancel = () => {
    Alert.alert(
      t({ en: 'Cancel Task', zh: '取消任务' }),
      t({ en: 'Are you sure you want to cancel this task?', zh: '确定要取消此任务吗？' }),
      [
        { text: t({ en: 'No', zh: '否' }), style: 'cancel' },
        {
          text: t({ en: 'Yes, Cancel', zh: '确认取消' }),
          style: 'destructive',
          onPress: async () => {
            setActionLoading('cancel');
            try {
              await cancelTask(taskId);
              queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] });
              queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
              Alert.alert('✅', t({ en: 'Task cancelled.', zh: '任务已取消。' }));
            } catch (err: any) {
              Alert.alert(t({ en: 'Error', zh: '错误' }), err?.message || '');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  };

  if (isLoading || !task) {
    return (
      <View style={s.container}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
      </View>
    );
  }

  const meta = STATUS_META[task.status] || STATUS_META.pending;
  const pct = getProgressPercent(task.progress);
  const step = getProgressStep(task.progress);
  const agentIcon = task.agentName ? (AGENT_ICONS[task.agentName.toLowerCase()] ?? '🤖') : '🤖';
  const canStart = task.status === 'pending' || task.status === 'open';
  const canProgress = task.status === 'accepted' || task.status === 'in_progress';
  const canComplete = task.status === 'in_progress' || task.status === 'delivered';
  const canCancel = task.status !== 'completed' && task.status !== 'cancelled';

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.accent} />}
      >
        {/* Hero */}
        <View style={s.heroCard}>
          <View style={s.heroHeader}>
            <Text style={s.heroIcon}>{meta.icon}</Text>
            <View style={[s.heroBadge, { backgroundColor: meta.color + '22' }]}>
              <Text style={[s.heroBadgeText, { color: meta.color }]}>{t(meta.label)}</Text>
            </View>
          </View>
          <Text style={s.heroTitle}>{task.title}</Text>
          <Text style={s.heroType}>{task.type?.replace(/_/g, ' ')}</Text>
          {task.description ? <Text style={s.heroDesc}>{task.description}</Text> : null}
        </View>

        {/* Agent Assignment */}
        {(task.agentName || task.agentId) && (
          <View style={s.agentCard}>
            <Text style={{ fontSize: 22 }}>{agentIcon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.agentLabel}>{t({ en: 'Assigned Agent', zh: '负责Agent' })}</Text>
              <Text style={s.agentName}>@{task.agentName || task.agentId}</Text>
            </View>
            {(canStart || canProgress) && (
              <View style={[s.agentDot, { backgroundColor: task.status === 'in_progress' ? '#f59e0b' : '#6366f1' }]} />
            )}
          </View>
        )}

        {/* Progress */}
        <View style={s.progressCard}>
          <View style={s.progressHeader}>
            <Text style={s.progressLabel}>{t({ en: 'Progress', zh: '进度' })}</Text>
            <Text style={s.progressPct}>{pct}%</Text>
          </View>
          <View style={s.progressBarOuter}>
            <View style={[s.progressBarFill, { width: `${Math.min(pct, 100)}%` }]} />
          </View>
          {step && <Text style={s.progressStep}>📍 {step}</Text>}
        </View>

        {/* Budget & Info */}
        <View style={s.infoRow}>
          <View style={s.infoChip}>
            <Text style={s.infoLabel}>{t({ en: 'Budget', zh: '预算' })}</Text>
            <Text style={s.infoValue}>💰 ${task.budget} {task.currency || 'USD'}</Text>
          </View>
          <View style={s.infoChip}>
            <Text style={s.infoLabel}>{t({ en: 'Type', zh: '类型' })}</Text>
            <Text style={s.infoValue}>{task.type?.replace(/_/g, ' ') || '-'}</Text>
          </View>
        </View>

        {/* ═══════ START TASK ═══════ */}
        {canStart && (
          <View style={s.actionSection}>
            <Text style={s.actionTitle}>🚀 {t({ en: 'Start This Task', zh: '启动任务' })}</Text>
            <Text style={s.actionDesc}>
              {t({
                en: 'Start the task and instruct the assigned agent to begin working.',
                zh: '启动任务，指示负责的Agent开始工作。',
              })}
            </Text>
            <TouchableOpacity
              style={s.startBtn}
              onPress={handleStartTask}
              disabled={actionLoading === 'start'}
            >
              {actionLoading === 'start' ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.startBtnText}>▶ {t({ en: 'Start Task', zh: '启动任务' })}</Text>
              )}
            </TouchableOpacity>

            {/* Direct agent message */}
            {(task.agentName || task.agentId) && (
              <>
                <Text style={s.chatLabel}>💬 {t({ en: 'Or send instructions to agent:', zh: '或直接给Agent下达指令：' })}</Text>
                <View style={s.chatRow}>
                  <TextInput
                    style={s.chatInput}
                    placeholder={t({ en: `Message @${task.agentName || 'agent'}...`, zh: `给 @${task.agentName || 'agent'} 发消息...` })}
                    placeholderTextColor={colors.textMuted}
                    value={agentMsg}
                    onChangeText={setAgentMsg}
                    multiline
                  />
                  <TouchableOpacity
                    style={s.chatSendBtn}
                    onPress={handleSendToAgent}
                    disabled={actionLoading === 'chat'}
                  >
                    {actionLoading === 'chat' ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={s.chatSendText}>→</Text>
                    )}
                  </TouchableOpacity>
                </View>
                {agentReply ? (
                  <View style={s.replyBox}>
                    <Text style={s.replyLabel}>🤖 @{task.agentName || 'agent'}</Text>
                    <Text style={s.replyText}>{agentReply}</Text>
                  </View>
                ) : null}
              </>
            )}
          </View>
        )}

        {/* ═══════ IN PROGRESS ACTIONS ═══════ */}
        {canProgress && (
          <View style={s.actionSection}>
            <Text style={s.actionTitle}>⚙️ {t({ en: 'Task In Progress', zh: '任务进行中' })}</Text>

            {/* Chat with agent */}
            {(task.agentName || task.agentId) && (
              <>
                <Text style={s.chatLabel}>💬 {t({ en: 'Send follow-up to agent:', zh: '给Agent发送跟进消息：' })}</Text>
                <View style={s.chatRow}>
                  <TextInput
                    style={s.chatInput}
                    placeholder={t({ en: `Message @${task.agentName || 'agent'}...`, zh: `给 @${task.agentName || 'agent'} 发消息...` })}
                    placeholderTextColor={colors.textMuted}
                    value={agentMsg}
                    onChangeText={setAgentMsg}
                    multiline
                  />
                  <TouchableOpacity
                    style={s.chatSendBtn}
                    onPress={handleSendToAgent}
                    disabled={actionLoading === 'chat'}
                  >
                    {actionLoading === 'chat' ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={s.chatSendText}>→</Text>
                    )}
                  </TouchableOpacity>
                </View>
                {agentReply ? (
                  <View style={s.replyBox}>
                    <Text style={s.replyLabel}>🤖 @{task.agentName || 'agent'}</Text>
                    <Text style={s.replyText}>{agentReply}</Text>
                  </View>
                ) : null}
              </>
            )}

            {/* Update progress */}
            <Text style={s.chatLabel}>📊 {t({ en: 'Update Progress', zh: '更新进度' })}</Text>
            <View style={s.progressInputRow}>
              <TextInput
                style={s.progressInput}
                value={progressVal}
                onChangeText={setProgressVal}
                keyboardType="number-pad"
                placeholder="0-100"
                placeholderTextColor={colors.textMuted}
              />
              <TouchableOpacity
                style={s.progressSubmit}
                onPress={handleUpdateProgress}
                disabled={actionLoading === 'progress'}
              >
                {actionLoading === 'progress' ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.progressSubmitText}>{t({ en: 'Update', zh: '更新' })}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ═══════ COMPLETE BUTTON ═══════ */}
        {canComplete && (
          <TouchableOpacity style={s.completeBtn} onPress={handleComplete} disabled={actionLoading === 'complete'}>
            {actionLoading === 'complete' ? (
              <ActivityIndicator color="#22c55e" />
            ) : (
              <Text style={s.completeBtnText}>✅ {t({ en: 'Mark Complete', zh: '标记完成' })}</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Requirements */}
        {task.requirements && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>{t({ en: 'Requirements', zh: '需求' })}</Text>
            {task.requirements.deadline && (
              <Text style={s.reqText}>📅 {t({ en: 'Deadline', zh: '截止日期' })}: {new Date(task.requirements.deadline).toLocaleDateString()}</Text>
            )}
            {task.requirements.deliverables?.map((d, i) => (
              <Text key={i} style={s.reqText}>• {d}</Text>
            ))}
          </View>
        )}

        {/* Cancel */}
        {canCancel && (
          <TouchableOpacity style={s.cancelBtn} onPress={handleCancel} disabled={actionLoading === 'cancel'}>
            <Text style={s.cancelBtnText}>❌ {t({ en: 'Cancel Task', zh: '取消任务' })}</Text>
          </TouchableOpacity>
        )}

        {/* Metadata */}
        <View style={s.metaCard}>
          <Text style={s.metaRow}>📅 {t({ en: 'Created', zh: '创建时间' })}: {new Date(task.createdAt).toLocaleString()}</Text>
          <Text style={s.metaRow}>🔄 {t({ en: 'Updated', zh: '更新时间' })}: {new Date(task.updatedAt).toLocaleString()}</Text>
          <Text style={s.metaRow}>🆔 {task.id}</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ──────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  // Error
  errorBox: { alignItems: 'center', padding: 40, gap: 12, marginTop: 60 },
  errorIcon: { fontSize: 48 },
  errorText: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  errorBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  errorBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  // Hero
  heroCard: { backgroundColor: colors.bgCard, borderRadius: 16, padding: 16, gap: 6, borderWidth: 1, borderColor: colors.border },
  heroHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroIcon: { fontSize: 28 },
  heroBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  heroBadgeText: { fontSize: 12, fontWeight: '700' },
  heroTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginTop: 4 },
  heroType: { fontSize: 12, color: colors.textMuted, textTransform: 'capitalize' },
  heroDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginTop: 4 },
  // Agent card
  agentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.bgCard, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  agentLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  agentName: { fontSize: 14, fontWeight: '700', color: colors.accent },
  agentDot: { width: 8, height: 8, borderRadius: 4 },
  // Progress card
  progressCard: {
    backgroundColor: colors.bgCard, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: colors.border, gap: 6,
  },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  progressPct: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  progressStep: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  // Info row
  infoRow: { flexDirection: 'row', gap: 8 },
  infoChip: {
    flex: 1, alignItems: 'center', padding: 10, borderRadius: 12,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, gap: 2,
  },
  infoLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  infoValue: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  // Progress bar
  progressBarOuter: { height: 6, borderRadius: 3, backgroundColor: colors.bgSecondary },
  progressBarFill: { height: 6, borderRadius: 3, backgroundColor: '#22c55e' },
  // Action section
  actionSection: {
    backgroundColor: colors.bgCard, borderRadius: 16, padding: 16, gap: 10,
    borderWidth: 1, borderColor: colors.accent + '44',
  },
  actionTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  actionDesc: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  startBtn: {
    alignItems: 'center', paddingVertical: 14, borderRadius: 12,
    backgroundColor: colors.accent,
  },
  startBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  // Chat with agent
  chatLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginTop: 4 },
  chatRow: { flexDirection: 'row', gap: 8 },
  chatInput: {
    flex: 1, backgroundColor: colors.bgSecondary, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
    color: colors.textPrimary, borderWidth: 1, borderColor: colors.border,
    maxHeight: 80,
  },
  chatSendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  chatSendText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  replyBox: {
    backgroundColor: colors.accent + '0D', borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: colors.accent + '22', gap: 4,
  },
  replyLabel: { fontSize: 11, fontWeight: '700', color: colors.accent },
  replyText: { fontSize: 13, color: colors.textPrimary, lineHeight: 18 },
  // Progress input
  progressInputRow: { flexDirection: 'row', gap: 8 },
  progressInput: {
    flex: 1, backgroundColor: colors.bgSecondary, borderRadius: 10, borderWidth: 1,
    borderColor: colors.border, padding: 10, fontSize: 14, color: colors.textPrimary, textAlign: 'center',
  },
  progressSubmit: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.accent },
  progressSubmitText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  // Complete
  completeBtn: {
    alignItems: 'center', paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#22c55e22', borderWidth: 1, borderColor: '#22c55e44',
  },
  completeBtnText: { fontSize: 14, fontWeight: '700', color: '#22c55e' },
  // Cancel
  cancelBtn: {
    alignItems: 'center', paddingVertical: 10, borderRadius: 12,
    backgroundColor: '#ef444411', borderWidth: 1, borderColor: '#ef444433',
  },
  cancelBtnText: { fontSize: 13, fontWeight: '600', color: '#ef4444' },
  // Section
  section: { gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginTop: 4 },
  reqText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  // Meta
  metaCard: {
    backgroundColor: colors.bgCard, borderRadius: 12, padding: 12, gap: 4,
    borderWidth: 1, borderColor: colors.border, marginTop: 4,
  },
  metaRow: { fontSize: 11, color: colors.textMuted },
});
