import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  RefreshControl, ActivityIndicator, Alert, Modal,
  TextInput, ScrollView, Platform, StatusBar,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  status: string; // open, in_progress, completed, cancelled
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

interface TaskSearchResult {
  items: MerchantTask[];
  total: number;
  page: number;
}

// ──────────────────────────────────────────────
// API
// ──────────────────────────────────────────────
async function fetchMyTasks(): Promise<MerchantTask[]> {
  const res = await apiFetch<MerchantTask[] | { data: MerchantTask[] }>('/merchant-tasks/my-tasks');
  return Array.isArray(res) ? res : (res as any).data || [];
}

async function searchMarketplaceTasks(query?: string, page = 1): Promise<TaskSearchResult> {
  const params = new URLSearchParams({ page: String(page), limit: '20', sortBy: 'createdAt', sortOrder: 'DESC' });
  if (query) params.set('query', query);
  const res = await apiFetch<TaskSearchResult>(`/merchant-tasks/marketplace/search?${params}`);
  return res;
}

async function createTask(dto: {
  title: string;
  description: string;
  type: string;
  budget: number;
}): Promise<MerchantTask> {
  const res = await apiFetch<MerchantTask | { data: MerchantTask }>('/merchant-tasks', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
  return (res as any).data || res;
}

async function updateTaskProgress(taskId: string, progress: number): Promise<void> {
  await apiFetch(`/merchant-tasks/${taskId}/progress`, {
    method: 'PUT',
    body: JSON.stringify({ progress }),
  });
}

async function completeTask(taskId: string): Promise<void> {
  await apiFetch(`/merchant-tasks/${taskId}/complete`, { method: 'PUT' });
}

// ──────────────────────────────────────────────
// Status metadata
// ──────────────────────────────────────────────
const STATUS_META: Record<string, { label: { en: string; zh: string }; color: string; icon: string }> = {
  open: { label: { en: 'Open', zh: '待接取' }, color: '#6366f1', icon: '📋' },
  in_progress: { label: { en: 'In Progress', zh: '进行中' }, color: '#f59e0b', icon: '⚙️' },
  completed: { label: { en: 'Completed', zh: '已完成' }, color: '#22c55e', icon: '✅' },
  cancelled: { label: { en: 'Cancelled', zh: '已取消' }, color: '#ef4444', icon: '❌' },
  pending: { label: { en: 'Pending', zh: '待处理' }, color: '#f59e0b', icon: '⏳' },
};

const TASK_TYPES = [
  { key: 'development', en: 'Development', zh: '开发' },
  { key: 'research', en: 'Research', zh: '研究' },
  { key: 'content', en: 'Content', zh: '内容' },
  { key: 'data_analysis', en: 'Data Analysis', zh: '数据分析' },
  { key: 'automation', en: 'Automation', zh: '自动化' },
  { key: 'other', en: 'Other', zh: '其他' },
];

// ──────────────────────────────────────────────
// Create Task Modal
// ──────────────────────────────────────────────
function CreateTaskModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState('development');
  const [budget, setBudget] = useState('100');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert(t({ en: 'Required', zh: '必填' }), t({ en: 'Title is required.', zh: '请填写任务标题。' }));
      return;
    }
    setLoading(true);
    try {
      await createTask({
        title: title.trim(),
        description: description.trim(),
        type: taskType,
        budget: parseFloat(budget) || 100,
      });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      Alert.alert('✅', t({ en: 'Task created!', zh: '任务已创建！' }));
      onClose();
      setTitle('');
      setDescription('');
      setBudget('100');
    } catch (err: any) {
      Alert.alert(t({ en: 'Error', zh: '错误' }), err?.message || t({ en: 'Failed to create task.', zh: '创建任务失败。' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={mStyles.root}>
        <View style={mStyles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={mStyles.cancel}>{t({ en: 'Cancel', zh: '取消' })}</Text>
          </TouchableOpacity>
          <Text style={mStyles.title}>{t({ en: 'New Task', zh: '新任务' })}</Text>
          <TouchableOpacity onPress={handleCreate} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.accent} size="small" /> : (
              <Text style={mStyles.createBtn}>{t({ en: 'Create', zh: '创建' })}</Text>
            )}
          </TouchableOpacity>
        </View>
        <ScrollView style={mStyles.body} keyboardShouldPersistTaps="handled">
          <Text style={mStyles.label}>{t({ en: 'Task Title *', zh: '任务标题 *' })}</Text>
          <TextInput style={mStyles.input} value={title} onChangeText={setTitle} placeholder={t({ en: 'e.g. Build landing page', zh: '例如：构建着陆页' })} placeholderTextColor={colors.textMuted} autoFocus />

          <Text style={mStyles.label}>{t({ en: 'Description', zh: '描述' })}</Text>
          <TextInput style={[mStyles.input, { minHeight: 80, textAlignVertical: 'top' }]} value={description} onChangeText={setDescription} multiline placeholder={t({ en: 'What needs to be done?', zh: '需要完成什么？' })} placeholderTextColor={colors.textMuted} />

          <Text style={mStyles.label}>{t({ en: 'Task Type', zh: '任务类型' })}</Text>
          <View style={mStyles.typeRow}>
            {TASK_TYPES.map((tt) => (
              <TouchableOpacity key={tt.key} style={[mStyles.typeChip, taskType === tt.key && mStyles.typeChipActive]} onPress={() => setTaskType(tt.key)}>
                <Text style={[mStyles.typeText, taskType === tt.key && mStyles.typeTextActive]}>{t({ en: tt.en, zh: tt.zh })}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={mStyles.label}>{t({ en: 'Budget (USD)', zh: '预算 (USD)' })}</Text>
          <TextInput style={mStyles.input} value={budget} onChangeText={setBudget} keyboardType="decimal-pad" placeholderTextColor={colors.textMuted} />
        </ScrollView>
      </View>
    </Modal>
  );
}
const mStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 40) + 12 : 16,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bgSecondary,
  },
  cancel: { fontSize: 15, color: colors.textMuted },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  createBtn: { fontSize: 15, color: colors.accent, fontWeight: '700' },
  body: { flex: 1, padding: 16 },
  label: { fontSize: 11, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 6 },
  input: { backgroundColor: colors.bgCard, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, fontSize: 14, color: colors.textPrimary },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  typeChipActive: { backgroundColor: colors.accent + '22', borderColor: colors.accent },
  typeText: { fontSize: 13, color: colors.textMuted },
  typeTextActive: { color: colors.accent, fontWeight: '600' },
});

// ──────────────────────────────────────────────
// View tabs: My Tasks / Marketplace
// ──────────────────────────────────────────────
type BoardTab = 'my' | 'marketplace';

export function TaskBoardScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<BoardTab>('my');
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');

  // My tasks
  const { data: myTasks = [], isLoading: myLoading, refetch: refetchMy } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: fetchMyTasks,
    retry: false,
  });

  // Marketplace tasks
  const { data: marketResult, isLoading: mktLoading, refetch: refetchMkt } = useQuery({
    queryKey: ['marketplace-tasks', search],
    queryFn: () => searchMarketplaceTasks(search || undefined),
    retry: false,
    enabled: tab === 'marketplace',
  });
  const marketTasks = marketResult?.items || [];

  const tasks = tab === 'my' ? myTasks : marketTasks;
  const loading = tab === 'my' ? myLoading : mktLoading;
  const refetchCurrent = tab === 'my' ? refetchMy : refetchMkt;

  // Group my tasks by status for kanban-like display
  const grouped = {
    open: myTasks.filter((t) => t.status === 'open' || t.status === 'pending'),
    in_progress: myTasks.filter((t) => t.status === 'in_progress'),
    completed: myTasks.filter((t) => t.status === 'completed'),
  };

  const handleComplete = (task: MerchantTask) => {
    Alert.alert(
      t({ en: 'Complete Task', zh: '完成任务' }),
      t({ en: `Mark "${task.title}" as completed?`, zh: `将"${task.title}"标记为已完成？` }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Complete', zh: '完成' }),
          onPress: async () => {
            try {
              await completeTask(task.id);
              queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
              Alert.alert('✅', t({ en: 'Task completed!', zh: '任务已完成！' }));
            } catch (err: any) {
              Alert.alert(t({ en: 'Error', zh: '错误' }), err?.message || t({ en: 'Failed.', zh: '操作失败。' }));
            }
          },
        },
      ],
    );
  };

  const renderTask = ({ item: task }: { item: MerchantTask }) => {
    const meta = STATUS_META[task.status] || STATUS_META.open;
    return (
      <TouchableOpacity
        style={s.taskCard}
        onPress={() => navigation.navigate('TaskDetail' as any, { taskId: task.id })}
        activeOpacity={0.7}
      >
        <View style={s.taskHeader}>
          <Text style={s.taskIcon}>{meta.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.taskTitle} numberOfLines={2}>{task.title}</Text>
            <Text style={s.taskType}>{task.type?.replace(/_/g, ' ')}</Text>
          </View>
          <View style={[s.taskStatusBadge, { backgroundColor: meta.color + '22' }]}>
            <Text style={[s.taskStatusText, { color: meta.color }]}>{t(meta.label)}</Text>
          </View>
        </View>

        {task.description ? (
          <Text style={s.taskDesc} numberOfLines={2}>{task.description}</Text>
        ) : null}

        <View style={s.taskFooter}>
          <Text style={s.taskBudget}>💰 ${task.budget} {task.currency || 'USD'}</Text>
          {task.progress != null && task.progress > 0 && (
            <View style={s.progressRow}>
              <View style={s.progressBar}>
                <View style={[s.progressFill, { width: `${Math.min(task.progress, 100)}%` }]} />
              </View>
              <Text style={s.progressText}>{task.progress}%</Text>
            </View>
          )}
          {task.agentName ? (
            <Text style={s.taskAgent}>🤖 {task.agentName}</Text>
          ) : null}
        </View>

        {/* Quick actions */}
        {tab === 'my' && task.status === 'in_progress' && (
          <TouchableOpacity style={s.completeBtn} onPress={() => handleComplete(task)}>
            <Text style={s.completeBtnText}>✅ {t({ en: 'Mark Complete', zh: '标记完成' })}</Text>
          </TouchableOpacity>
        )}

        <Text style={s.taskDate}>{new Date(task.createdAt).toLocaleDateString()}</Text>
      </TouchableOpacity>
    );
  };

  // Kanban section header for "my" tab
  const renderKanbanSection = (title: string, icon: string, items: MerchantTask[], color: string) => {
    if (items.length === 0) return null;
    return (
      <View style={s.kanbanSection}>
        <View style={[s.kanbanHeader, { borderLeftColor: color }]}>
          <Text style={s.kanbanIcon}>{icon}</Text>
          <Text style={s.kanbanTitle}>{title}</Text>
          <View style={[s.kanbanCount, { backgroundColor: color + '22' }]}>
            <Text style={[s.kanbanCountText, { color }]}>{items.length}</Text>
          </View>
        </View>
        {items.map((task) => (
          <View key={task.id}>{renderTask({ item: task })}</View>
        ))}
      </View>
    );
  };

  return (
    <View style={s.container}>
      {/* Tab switcher */}
      <View style={s.tabRow}>
        <TouchableOpacity style={[s.tabBtn, tab === 'my' && s.tabBtnActive]} onPress={() => setTab('my')}>
          <Text style={[s.tabText, tab === 'my' && s.tabTextActive]}>📋 {t({ en: 'My Tasks', zh: '我的任务' })}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tabBtn, tab === 'marketplace' && s.tabBtnActive]} onPress={() => setTab('marketplace')}>
          <Text style={[s.tabText, tab === 'marketplace' && s.tabTextActive]}>🏪 {t({ en: 'Marketplace', zh: '任务市场' })}</Text>
        </TouchableOpacity>
      </View>

      {/* Search (marketplace only) */}
      {tab === 'marketplace' && (
        <View style={s.searchRow}>
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t({ en: 'Search tasks...', zh: '搜索任务...' })}
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
          />
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : tab === 'my' ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={myLoading} onRefresh={refetchMy} tintColor={colors.accent} />}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
        >
          {myTasks.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>📋</Text>
              <Text style={s.emptyTitle}>{t({ en: 'No tasks yet', zh: '暂无任务' })}</Text>
              <Text style={s.emptySub}>{t({ en: 'Create a task or browse the marketplace.', zh: '创建任务或浏览任务市场。' })}</Text>
            </View>
          ) : (
            <>
              {renderKanbanSection(t({ en: 'In Progress', zh: '进行中' }), '⚙️', grouped.in_progress, '#f59e0b')}
              {renderKanbanSection(t({ en: 'Open', zh: '待接取' }), '📋', grouped.open, '#6366f1')}
              {renderKanbanSection(t({ en: 'Completed', zh: '已完成' }), '✅', grouped.completed, '#22c55e')}
            </>
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={marketTasks}
          keyExtractor={(t) => t.id}
          renderItem={renderTask}
          refreshControl={<RefreshControl refreshing={mktLoading} onRefresh={refetchMkt} tintColor={colors.accent} />}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🏪</Text>
              <Text style={s.emptyTitle}>{t({ en: 'No marketplace tasks', zh: '暂无市场任务' })}</Text>
            </View>
          }
        />
      )}

      {/* FAB: Create task */}
      <TouchableOpacity style={s.fab} onPress={() => setShowCreate(true)}>
        <Text style={s.fabText}>＋ {t({ en: 'New Task', zh: '新任务' })}</Text>
      </TouchableOpacity>

      <CreateTaskModal visible={showCreate} onClose={() => setShowCreate(false)} />
    </View>
  );
}

// ──────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  // Tabs
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  tabBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
  },
  tabBtnActive: { backgroundColor: colors.accent + '22', borderColor: colors.accent },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: colors.accent },
  // Search
  searchRow: { paddingHorizontal: 16, paddingTop: 10 },
  searchInput: {
    backgroundColor: colors.bgCard, borderRadius: 10, borderWidth: 1,
    borderColor: colors.border, padding: 10, fontSize: 14, color: colors.textPrimary,
  },
  // List
  listContent: { padding: 16, gap: 10, paddingBottom: 100 },
  // Kanban sections
  kanbanSection: { gap: 8, marginBottom: 12 },
  kanbanHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, borderLeftWidth: 3, paddingLeft: 8 },
  kanbanIcon: { fontSize: 16 },
  kanbanTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  kanbanCount: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  kanbanCountText: { fontSize: 12, fontWeight: '700' },
  // Task card
  taskCard: {
    backgroundColor: colors.bgCard, borderRadius: 14, padding: 14,
    gap: 8, borderWidth: 1, borderColor: colors.border,
  },
  taskHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  taskIcon: { fontSize: 18 },
  taskTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  taskType: { fontSize: 11, color: colors.textMuted, marginTop: 1, textTransform: 'capitalize' },
  taskStatusBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  taskStatusText: { fontSize: 11, fontWeight: '600' },
  taskDesc: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  taskFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  taskBudget: { fontSize: 12, fontWeight: '700', color: colors.accent },
  taskAgent: { fontSize: 11, color: colors.textMuted },
  taskDate: { fontSize: 10, color: colors.textMuted },
  // Progress
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.bgSecondary },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: '#22c55e' },
  progressText: { fontSize: 10, color: colors.textMuted, fontWeight: '700' },
  // Complete button
  completeBtn: {
    alignItems: 'center', paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#22c55e18', borderWidth: 1, borderColor: '#22c55e33',
  },
  completeBtnText: { fontSize: 12, fontWeight: '600', color: '#22c55e' },
  // Empty
  empty: { alignItems: 'center', padding: 40, gap: 8, marginTop: 30 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
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
