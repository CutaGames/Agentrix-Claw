import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  RefreshControl, ActivityIndicator, Alert, TextInput,
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
  progress?: number;
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
  status: string; // pending, accepted, rejected
  createdAt: string;
}

interface Milestone {
  id: string;
  title: string;
  amount: number;
  status: string; // pending, started, submitted, approved, rejected, released
  dueDate?: string;
}

// ──────────────────────────────────────────────
// API
// ──────────────────────────────────────────────
async function fetchTaskDetail(taskId: string): Promise<MerchantTask> {
  const res = await apiFetch<MerchantTask | { data: MerchantTask }>(`/merchant-tasks/${taskId}`);
  return (res as any).data || res;
}

async function updateProgress(taskId: string, progress: number): Promise<void> {
  await apiFetch(`/merchant-tasks/${taskId}/progress`, {
    method: 'PUT',
    body: JSON.stringify({ progress }),
  });
}

async function completeTask(taskId: string): Promise<void> {
  await apiFetch(`/merchant-tasks/${taskId}/complete`, { method: 'PUT' });
}

async function submitBid(taskId: string, amount: number, proposal: string): Promise<void> {
  await apiFetch(`/merchant-tasks/marketplace/tasks/${taskId}/bid`, {
    method: 'POST',
    body: JSON.stringify({ amount, proposal }),
  });
}

async function acceptBid(taskId: string, bidId: string): Promise<void> {
  await apiFetch(`/merchant-tasks/${taskId}/bids/${bidId}/accept`, { method: 'POST' });
}

async function rejectBid(taskId: string, bidId: string): Promise<void> {
  await apiFetch(`/merchant-tasks/${taskId}/bids/${bidId}/reject`, { method: 'POST' });
}

// ──────────────────────────────────────────────
// Status badge info
// ──────────────────────────────────────────────
const STATUS_META: Record<string, { label: { en: string; zh: string }; color: string; icon: string }> = {
  open: { label: { en: 'Open', zh: '待接取' }, color: '#6366f1', icon: '📋' },
  in_progress: { label: { en: 'In Progress', zh: '进行中' }, color: '#f59e0b', icon: '⚙️' },
  completed: { label: { en: 'Completed', zh: '已完成' }, color: '#22c55e', icon: '✅' },
  cancelled: { label: { en: 'Cancelled', zh: '已取消' }, color: '#ef4444', icon: '❌' },
  pending: { label: { en: 'Pending', zh: '待处理' }, color: '#f59e0b', icon: '⏳' },
};

const MILESTONE_STATUS: Record<string, { en: string; zh: string; color: string }> = {
  pending: { en: 'Pending', zh: '待开始', color: '#6b7280' },
  started: { en: 'Started', zh: '进行中', color: '#f59e0b' },
  submitted: { en: 'Submitted', zh: '已提交', color: '#6366f1' },
  approved: { en: 'Approved', zh: '已批准', color: '#22c55e' },
  rejected: { en: 'Rejected', zh: '已拒绝', color: '#ef4444' },
  released: { en: 'Released', zh: '已释放', color: '#22c55e' },
};

export function TaskDetailScreen() {
  const { t } = useI18n();
  const route = useRoute<any>();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { taskId } = route.params;
  const [progressVal, setProgressVal] = useState('');
  const [bidAmount, setBidAmount] = useState('');
  const [bidProposal, setBidProposal] = useState('');
  const [showBidForm, setShowBidForm] = useState(false);

  const { data: task, isLoading, refetch } = useQuery({
    queryKey: ['task-detail', taskId],
    queryFn: () => fetchTaskDetail(taskId),
    retry: false,
  });

  const handleUpdateProgress = async () => {
    const p = parseInt(progressVal, 10);
    if (isNaN(p) || p < 0 || p > 100) {
      Alert.alert(t({ en: 'Invalid', zh: '无效' }), t({ en: 'Enter 0-100', zh: '请输入 0-100' }));
      return;
    }
    try {
      await updateProgress(taskId, p);
      queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      Alert.alert('✅', t({ en: 'Progress updated!', zh: '进度已更新！' }));
    } catch (err: any) {
      Alert.alert(t({ en: 'Error', zh: '错误' }), err?.message || '');
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
            try {
              await completeTask(taskId);
              queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] });
              queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
              Alert.alert('✅', t({ en: 'Task completed!', zh: '任务已完成！' }));
            } catch (err: any) {
              Alert.alert(t({ en: 'Error', zh: '错误' }), err?.message || '');
            }
          },
        },
      ],
    );
  };

  const handleSubmitBid = async () => {
    const amt = parseFloat(bidAmount);
    if (isNaN(amt) || amt <= 0 || !bidProposal.trim()) {
      Alert.alert(t({ en: 'Required', zh: '必填' }), t({ en: 'Enter amount and proposal.', zh: '请填写金额和方案。' }));
      return;
    }
    try {
      await submitBid(taskId, amt, bidProposal.trim());
      queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] });
      Alert.alert('✅', t({ en: 'Bid submitted!', zh: '投标已提交！' }));
      setShowBidForm(false);
      setBidAmount('');
      setBidProposal('');
    } catch (err: any) {
      Alert.alert(t({ en: 'Error', zh: '错误' }), err?.message || '');
    }
  };

  const handleAcceptBid = (bidId: string) => {
    Alert.alert(t({ en: 'Accept Bid', zh: '接受投标' }), t({ en: 'Accept this bid?', zh: '接受此投标？' }), [
      { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
      {
        text: t({ en: 'Accept', zh: '接受' }),
        onPress: async () => {
          try {
            await acceptBid(taskId, bidId);
            queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] });
            Alert.alert('✅', t({ en: 'Bid accepted!', zh: '投标已接受！' }));
          } catch (err: any) {
            Alert.alert(t({ en: 'Error', zh: '错误' }), err?.message || '');
          }
        },
      },
    ]);
  };

  if (isLoading || !task) {
    return (
      <View style={s.container}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
      </View>
    );
  }

  const meta = STATUS_META[task.status] || STATUS_META.open;

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
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

      {/* Budget & Progress */}
      <View style={s.infoRow}>
        <View style={s.infoChip}>
          <Text style={s.infoLabel}>{t({ en: 'Budget', zh: '预算' })}</Text>
          <Text style={s.infoValue}>💰 ${task.budget} {task.currency || 'USD'}</Text>
        </View>
        <View style={s.infoChip}>
          <Text style={s.infoLabel}>{t({ en: 'Progress', zh: '进度' })}</Text>
          <Text style={s.infoValue}>{task.progress ?? 0}%</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={s.progressBarOuter}>
        <View style={[s.progressBarFill, { width: `${Math.min(task.progress || 0, 100)}%` }]} />
      </View>

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

      {/* Agent Assignment */}
      {task.agentName && (
        <View style={s.agentCard}>
          <Text style={s.agentIcon}>🤖</Text>
          <View>
            <Text style={s.agentLabel}>{t({ en: 'Assigned Agent', zh: '负责智能体' })}</Text>
            <Text style={s.agentName}>{task.agentName}</Text>
          </View>
        </View>
      )}

      {/* Milestones */}
      {task.milestones && task.milestones.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t({ en: 'Milestones', zh: '里程碑' })}</Text>
          {task.milestones.map((ms) => {
            const msMeta = MILESTONE_STATUS[ms.status] || MILESTONE_STATUS.pending;
            return (
              <View key={ms.id} style={s.milestoneCard}>
                <View style={s.milestoneHeader}>
                  <Text style={s.milestoneTitle}>{ms.title}</Text>
                  <Text style={[s.milestoneStatus, { color: msMeta.color }]}>{t(msMeta)}</Text>
                </View>
                <Text style={s.milestoneAmount}>${ms.amount}</Text>
                {ms.dueDate && <Text style={s.milestoneDate}>📅 {new Date(ms.dueDate).toLocaleDateString()}</Text>}
              </View>
            );
          })}
        </View>
      )}

      {/* Bids */}
      {task.bids && task.bids.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t({ en: 'Bids', zh: '投标' })} ({task.bids.length})</Text>
          {task.bids.map((bid) => (
            <View key={bid.id} style={s.bidCard}>
              <View style={s.bidHeader}>
                <Text style={s.bidAgent}>🤖 {bid.agentName || bid.agentId}</Text>
                <Text style={s.bidAmount}>${bid.amount}</Text>
              </View>
              <Text style={s.bidProposal}>{bid.proposal}</Text>
              <View style={s.bidFooter}>
                <Text style={s.bidDate}>{new Date(bid.createdAt).toLocaleDateString()}</Text>
                {bid.status === 'pending' && (
                  <View style={s.bidActions}>
                    <TouchableOpacity style={s.bidAccept} onPress={() => handleAcceptBid(bid.id)}>
                      <Text style={s.bidAcceptText}>✅ {t({ en: 'Accept', zh: '接受' })}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.bidReject} onPress={() => {
                      rejectBid(taskId, bid.id).then(() => {
                        queryClient.invalidateQueries({ queryKey: ['task-detail', taskId] });
                      });
                    }}>
                      <Text style={s.bidRejectText}>❌</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {bid.status !== 'pending' && (
                  <Text style={[s.bidStatusText, { color: bid.status === 'accepted' ? '#22c55e' : '#ef4444' }]}>
                    {bid.status === 'accepted' ? t({ en: 'Accepted', zh: '已接受' }) : t({ en: 'Rejected', zh: '已拒绝' })}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Actions */}
      {task.status === 'in_progress' && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t({ en: 'Update Progress', zh: '更新进度' })}</Text>
          <View style={s.progressInputRow}>
            <TextInput
              style={s.progressInput}
              value={progressVal}
              onChangeText={setProgressVal}
              keyboardType="number-pad"
              placeholder="0-100"
              placeholderTextColor={colors.textMuted}
            />
            <TouchableOpacity style={s.progressSubmit} onPress={handleUpdateProgress}>
              <Text style={s.progressSubmitText}>{t({ en: 'Update', zh: '更新' })}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={s.completeBtn} onPress={handleComplete}>
            <Text style={s.completeBtnText}>✅ {t({ en: 'Mark Complete', zh: '标记完成' })}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Submit Bid (for marketplace tasks) */}
      {task.status === 'open' && (
        <View style={s.section}>
          {!showBidForm ? (
            <TouchableOpacity style={s.bidBtn} onPress={() => setShowBidForm(true)}>
              <Text style={s.bidBtnText}>🤝 {t({ en: 'Submit a Bid', zh: '提交投标' })}</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.bidForm}>
              <Text style={s.bidFormLabel}>{t({ en: 'Your Bid Amount (USD)', zh: '投标金额 (USD)' })}</Text>
              <TextInput style={s.bidFormInput} value={bidAmount} onChangeText={setBidAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textMuted} />
              <Text style={s.bidFormLabel}>{t({ en: 'Proposal', zh: '方案' })}</Text>
              <TextInput style={[s.bidFormInput, { minHeight: 60, textAlignVertical: 'top' }]} value={bidProposal} onChangeText={setBidProposal} multiline placeholder={t({ en: 'Describe your approach...', zh: '描述你的方案...' })} placeholderTextColor={colors.textMuted} />
              <TouchableOpacity style={s.bidSubmitBtn} onPress={handleSubmitBid}>
                <Text style={s.bidSubmitText}>{t({ en: 'Submit Bid', zh: '提交投标' })}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Metadata */}
      <View style={s.metaCard}>
        <Text style={s.metaRow}>📅 {t({ en: 'Created', zh: '创建时间' })}: {new Date(task.createdAt).toLocaleString()}</Text>
        <Text style={s.metaRow}>🔄 {t({ en: 'Updated', zh: '更新时间' })}: {new Date(task.updatedAt).toLocaleString()}</Text>
        <Text style={s.metaRow}>🆔 {task.id}</Text>
      </View>
    </ScrollView>
  );
}

// ──────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  // Hero
  heroCard: { backgroundColor: colors.bgCard, borderRadius: 16, padding: 16, gap: 6, borderWidth: 1, borderColor: colors.border },
  heroHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroIcon: { fontSize: 28 },
  heroBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  heroBadgeText: { fontSize: 12, fontWeight: '700' },
  heroTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginTop: 4 },
  heroType: { fontSize: 12, color: colors.textMuted, textTransform: 'capitalize' },
  heroDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginTop: 4 },
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
  // Section
  section: { gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginTop: 4 },
  // Requirements
  reqText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  // Agent
  agentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.bgCard, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  agentIcon: { fontSize: 22 },
  agentLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  agentName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  // Milestones
  milestoneCard: {
    backgroundColor: colors.bgCard, borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: colors.border, gap: 4,
  },
  milestoneHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  milestoneTitle: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  milestoneStatus: { fontSize: 11, fontWeight: '700' },
  milestoneAmount: { fontSize: 12, color: colors.accent, fontWeight: '700' },
  milestoneDate: { fontSize: 10, color: colors.textMuted },
  // Bids
  bidCard: {
    backgroundColor: colors.bgCard, borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: colors.border, gap: 6,
  },
  bidHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bidAgent: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  bidAmount: { fontSize: 14, fontWeight: '800', color: colors.accent },
  bidProposal: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  bidFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bidDate: { fontSize: 10, color: colors.textMuted },
  bidActions: { flexDirection: 'row', gap: 8 },
  bidAccept: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: '#22c55e22' },
  bidAcceptText: { fontSize: 12, fontWeight: '600', color: '#22c55e' },
  bidReject: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: '#ef444422' },
  bidRejectText: { fontSize: 12 },
  bidStatusText: { fontSize: 11, fontWeight: '700' },
  // Progress input
  progressInputRow: { flexDirection: 'row', gap: 8 },
  progressInput: {
    flex: 1, backgroundColor: colors.bgCard, borderRadius: 10, borderWidth: 1,
    borderColor: colors.border, padding: 10, fontSize: 14, color: colors.textPrimary, textAlign: 'center',
  },
  progressSubmit: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.accent },
  progressSubmitText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  completeBtn: {
    alignItems: 'center', paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#22c55e22', borderWidth: 1, borderColor: '#22c55e44',
  },
  completeBtnText: { fontSize: 14, fontWeight: '700', color: '#22c55e' },
  // Bid form
  bidBtn: {
    alignItems: 'center', paddingVertical: 12, borderRadius: 12,
    backgroundColor: colors.accent + '22', borderWidth: 1, borderColor: colors.accent,
  },
  bidBtnText: { fontSize: 14, fontWeight: '700', color: colors.accent },
  bidForm: { gap: 8 },
  bidFormLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  bidFormInput: { backgroundColor: colors.bgCard, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 10, fontSize: 14, color: colors.textPrimary },
  bidSubmitBtn: { alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: colors.accent },
  bidSubmitText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  // Meta
  metaCard: {
    backgroundColor: colors.bgCard, borderRadius: 12, padding: 12, gap: 4,
    borderWidth: 1, borderColor: colors.border, marginTop: 4,
  },
  metaRow: { fontSize: 11, color: colors.textMuted },
});
