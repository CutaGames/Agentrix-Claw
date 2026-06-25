// 任务详情页 — 查看任务详情 + 提交竞标
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import { useAuthStore } from '../stores/authStore';
import {
  taskMarketplaceApi,
  TaskItem,
  BidItem,
  TASK_TYPE_CONFIG,
  TASK_STATUS_CONFIG,
} from '../services/taskMarketplace.api';

interface Props {
  route: { params: { taskId: string } };
  navigation: any;
}

export function TaskDetailScreen({ route, navigation }: Props) {
  const { taskId } = route.params;
  const userId = useAuthStore(s => s.user?.id);
  const [task, setTask] = useState<TaskItem | null>(null);
  const [bids, setBids] = useState<BidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBidForm, setShowBidForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Bid form state
  const [bidBudget, setBidBudget] = useState('');
  const [bidDays, setBidDays] = useState('');
  const [bidProposal, setBidProposal] = useState('');

  useEffect(() => {
    loadData();
  }, [taskId]);

  const loadData = async () => {
    try {
      const taskData = await taskMarketplaceApi.getTaskDetail(taskId);
      setTask(taskData);
      navigation.setOptions({ title: taskData.title });

      // If I'm the task owner, load bids
      if (taskData.userId === userId) {
        try {
          const bidsData = await taskMarketplaceApi.getTaskBids(taskId);
          setBids(bidsData);
        } catch {}
      }
    } catch (e: any) {
      // Fallback: try loading from local seed data (for offline / seed task IDs)
      try {
        const { getSeedTaskById } = require('./TaskMarketScreen');
        const seedTask = getSeedTaskById?.(taskId);
        if (seedTask) {
          setTask(seedTask);
          navigation.setOptions({ title: seedTask.title });
          return;
        }
      } catch {}
      Alert.alert('Load Failed', typeof e?.message === 'string' ? e.message : 'Unable to load task details');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const isOwner = task?.userId === userId;

  const handleSubmitBid = async () => {
    const budget = parseFloat(bidBudget);
    const days = parseInt(bidDays);
    if (!budget || budget <= 0) { Alert.alert('Please enter a valid bid amount'); return; }
    if (!days || days <= 0) { Alert.alert('Please enter estimated days'); return; }
    if (bidProposal.trim().length < 10) { Alert.alert('Proposal must be at least 10 characters'); return; }

    setSubmitting(true);
    try {
      await taskMarketplaceApi.submitBid(taskId, {
        proposedBudget: budget,
        currency: task?.currency || 'USD',
        estimatedDays: days,
        proposal: bidProposal.trim(),
      });
      Alert.alert('Bid Submitted', 'Your proposal has been submitted, waiting for review.', [
        { text: 'OK', onPress: () => { setShowBidForm(false); loadData(); } },
      ]);
    } catch (e: any) {
      Alert.alert('Submit Failed', e.message || 'Please try again later');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptBid = (bid: BidItem) => {
    Alert.alert(
      'Accept Bid',
      `Accept proposal from "${bid.bidder?.nickname || 'Bidder'}"?\nBid: $${bid.proposedBudget}\nEst: ${bid.estimatedDays} days`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await taskMarketplaceApi.acceptBid(taskId, bid.id);
              Alert.alert('Accepted', 'Task has been assigned to this bidder');
              loadData();
            } catch (e: any) {
              Alert.alert('Failed', e.message);
            }
          },
        },
      ],
    );
  };

  const handleRejectBid = async (bid: BidItem) => {
    try {
      await taskMarketplaceApi.rejectBid(taskId, bid.id);
      loadData();
    } catch (e: any) {
      Alert.alert('Failed', e.message);
    }
  };

  const formatBudget = (budget: number, currency: string) => {
    if (currency === 'CNY' || currency === 'RMB') return `¥${budget.toLocaleString()}`;
    return `$${budget.toLocaleString()}`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!task) return null;

  const typeConf = TASK_TYPE_CONFIG[task.type] || TASK_TYPE_CONFIG.other;
  const statusConf = TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.pending;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <View style={[styles.typeBadge, { backgroundColor: typeConf.color + '20' }]}>
              <Text style={{ fontSize: 14 }}>{typeConf.icon}</Text>
              <Text style={[styles.typeBadgeText, { color: typeConf.color }]}>{typeConf.label}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusConf.color + '20' }]}>
              <Text style={[styles.statusBadgeText, { color: statusConf.color }]}>{statusConf.label}</Text>
            </View>
          </View>
          <Text style={styles.title}>{task.title}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>By: {task.user?.nickname || task.user?.agentrixId?.slice(0, 12) || 'Anonymous'}</Text>
            <Text style={styles.metaText}>Posted: {formatDate(task.createdAt)}</Text>
          </View>
        </View>

        {/* Budget */}
        <View style={styles.budgetCard}>
          <View style={styles.budgetMain}>
            <Text style={styles.budgetLabel}>Bounty</Text>
            <Text style={styles.budgetValue}>{formatBudget(task.budget, task.currency)}</Text>
          </View>
          {task.requirements?.deadline && (
            <View style={styles.budgetSide}>
              <Text style={styles.budgetLabel}>Deadline</Text>
              <Text style={styles.deadlineValue}>{formatDate(task.requirements.deadline)}</Text>
            </View>
          )}
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📝 Description</Text>
          <Text style={styles.descText}>{task.description}</Text>
        </View>

        {/* Tags */}
        {task.tags && task.tags.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏷️ Tags</Text>
            <View style={styles.tagsRow}>
              {task.tags.map((tag, i) => (
                <View key={i} style={styles.tagChip}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Requirements */}
        {task.requirements?.deliverables && task.requirements.deliverables.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📋 Deliverables</Text>
            {task.requirements.deliverables.map((d, i) => (
              <View key={i} style={styles.deliverableRow}>
                <Text style={styles.deliverableBullet}>•</Text>
                <Text style={styles.deliverableText}>{d}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Bids Section (Owner only) */}
        {isOwner && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📨 Bids Received ({bids.length})</Text>
            {bids.length === 0 ? (
              <Text style={styles.noBidsText}>No bids yet, please wait...</Text>
            ) : (
              bids.map(bid => (
                <View key={bid.id} style={styles.bidCard}>
                  <View style={styles.bidHeader}>
                    <Text style={styles.bidderName}>{bid.bidder?.nickname || 'Bidder'}</Text>
                    <View style={[styles.bidStatusBadge, { backgroundColor: bid.status === 'accepted' ? colors.success + '20' : bid.status === 'rejected' ? colors.error + '20' : colors.primary + '20' }]}>
                      <Text style={[styles.bidStatusText, { color: bid.status === 'accepted' ? colors.success : bid.status === 'rejected' ? colors.error : colors.primary }]}>
                        {bid.status === 'pending' ? 'Pending' : bid.status === 'accepted' ? 'Accepted' : bid.status === 'rejected' ? 'Rejected' : bid.status}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.bidMeta}>
                    <Text style={styles.bidBudget}>{formatBudget(bid.proposedBudget, bid.currency)}</Text>
                    <Text style={styles.bidDays}>{bid.estimatedDays}d est.</Text>
                  </View>
                  <Text style={styles.bidProposal} numberOfLines={4}>{bid.proposal}</Text>
                  {bid.status === 'pending' && (
                    <View style={styles.bidActions}>
                      <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAcceptBid(bid)}>
                        <Text style={styles.acceptBtnText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.rejectBtn} onPress={() => handleRejectBid(bid)}>
                        <Text style={styles.rejectBtnText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* Bid Form */}
        {showBidForm && !isOwner && task.status === 'pending' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>✍️ Submit Your Bid</Text>
            <View style={styles.formRow}>
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Bid ({task.currency})</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Enter bid amount"
                  placeholderTextColor={colors.muted}
                  value={bidBudget}
                  onChangeText={setBidBudget}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Est. Days</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Days"
                  placeholderTextColor={colors.muted}
                  value={bidDays}
                  onChangeText={setBidDays}
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <Text style={styles.formLabel}>Proposal</Text>
            <TextInput
              style={[styles.formInput, styles.formTextarea]}
              placeholder="Describe your approach, experience and strengths..."
              placeholderTextColor={colors.muted}
              value={bidProposal}
              onChangeText={setBidProposal}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              maxLength={2000}
            />
            <Text style={styles.charCount}>{bidProposal.length}/2000</Text>
            <TouchableOpacity
              style={[styles.submitBidBtn, submitting && { opacity: 0.5 }]}
              onPress={handleSubmitBid}
              disabled={submitting}
            >
              <Text style={styles.submitBidBtnText}>{submitting ? 'Submitting...' : 'Submit Bid'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom CTA */}
      {!isOwner && task.status === 'pending' && !showBidForm && (
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.bidButton} onPress={() => setShowBidForm(true)}>
            <Text style={styles.bidButtonText}>💰 Place a Bid</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  // Header
  header: { padding: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, gap: 4 },
  typeBadgeText: { fontSize: 13, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  statusBadgeText: { fontSize: 12, fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, lineHeight: 28, marginBottom: 8 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { fontSize: 12, color: colors.muted },
  // Budget
  budgetCard: { flexDirection: 'row', margin: 16, backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border },
  budgetMain: { flex: 1 },
  budgetSide: { alignItems: 'flex-end' },
  budgetLabel: { fontSize: 12, color: colors.muted, marginBottom: 4 },
  budgetValue: { fontSize: 28, fontWeight: '800', color: colors.success },
  deadlineValue: { fontSize: 16, fontWeight: '700', color: colors.text },
  // Section
  section: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 10 },
  descText: { fontSize: 14, color: colors.muted, lineHeight: 22 },
  // Tags
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: { backgroundColor: colors.primary + '15', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
  tagText: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  // Deliverables
  deliverableRow: { flexDirection: 'row', marginBottom: 6, gap: 8 },
  deliverableBullet: { color: colors.primary, fontSize: 16, lineHeight: 20 },
  deliverableText: { flex: 1, fontSize: 14, color: colors.muted, lineHeight: 20 },
  // Bids
  noBidsText: { color: colors.muted, fontSize: 14, fontStyle: 'italic' },
  bidCard: { backgroundColor: colors.bg, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  bidHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  bidderName: { fontSize: 14, fontWeight: '600', color: colors.text },
  bidStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  bidStatusText: { fontSize: 11, fontWeight: '600' },
  bidMeta: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  bidBudget: { fontSize: 16, fontWeight: '700', color: colors.success },
  bidDays: { fontSize: 14, color: colors.muted },
  bidProposal: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  bidActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  acceptBtn: { flex: 1, backgroundColor: colors.success, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  acceptBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  rejectBtn: { flex: 1, backgroundColor: colors.error + '20', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  rejectBtnText: { color: colors.error, fontSize: 14, fontWeight: '600' },
  // Form
  formRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  formField: { flex: 1 },
  formLabel: { fontSize: 13, color: colors.muted, marginBottom: 6, fontWeight: '500' },
  formInput: { backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border },
  formTextarea: { minHeight: 120, textAlignVertical: 'top', marginTop: 4 },
  charCount: { fontSize: 11, color: colors.muted, textAlign: 'right', marginTop: 4 },
  submitBidBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  submitBidBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // Bottom
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 30, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  bidButton: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  bidButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
