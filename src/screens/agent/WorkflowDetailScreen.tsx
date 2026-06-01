/**
 * WorkflowDetailScreen — Create / Edit a workflow.
 * Backend: POST /api/workflows  |  PATCH /api/workflows/:id
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../services/api';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import type { AgentStackParamList } from '../../navigation/types';
import type { Workflow } from './WorkflowListScreen';

type Nav = NativeStackNavigationProp<AgentStackParamList, 'WorkflowDetail'>;
type Route = RouteProp<AgentStackParamList, 'WorkflowDetail'>;

// ─── API helpers ───────────────────────────────────────────────
const fetchWorkflow = (id: string) => apiFetch<Workflow>(`/workflows/${id}`);
const createWorkflow = (data: Partial<Workflow>) =>
  apiFetch<Workflow>('/workflows', { method: 'POST', body: JSON.stringify(data) });
const updateWorkflow = (id: string, data: Partial<Workflow>) =>
  apiFetch<Workflow>(`/workflows/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// ─── Cron presets ──────────────────────────────────────────────
const CRON_PRESETS = [
  { label: 'Every minute', cron: '* * * * *' },
  { label: 'Every 15 min', cron: '*/15 * * * *' },
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Daily at 9am', cron: '0 9 * * *' },
  { label: 'Mon–Fri 9am', cron: '0 9 * * 1-5' },
  { label: 'Weekly Sun', cron: '0 10 * * 0' },
];

type TriggerType = 'cron' | 'webhook' | 'manual';

// ─── Component ─────────────────────────────────────────────────
export function WorkflowDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const workflowId = route.params?.workflowId;
  const isEdit = !!workflowId;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<TriggerType>('cron');
  const [cronExpr, setCronExpr] = useState('0 9 * * *');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [prompt, setPrompt] = useState('');

  // Load existing workflow for edit
  const { isLoading: loadingEdit } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => fetchWorkflow(workflowId!),
    enabled: isEdit,
    select: (wf) => {
      setName(wf.name);
      setDescription(wf.description ?? '');
      setTriggerType(wf.triggerType);
      setCronExpr(wf.cronExpression ?? '0 9 * * *');
      setWebhookUrl(wf.webhookUrl ?? '');
      setPrompt(wf.prompt ?? '');
      return wf;
    },
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const data: Partial<Workflow> = {
        name: name.trim(),
        description: description.trim(),
        triggerType,
        cronExpression: triggerType === 'cron' ? cronExpr : undefined,
        webhookUrl: triggerType === 'webhook' ? webhookUrl.trim() : undefined,
        prompt: prompt.trim(),
        enabled: true,
      };
      return isEdit ? updateWorkflow(workflowId!, data) : createWorkflow(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      navigation.goBack();
    },
    onError: (e: any) => Alert.alert(t({ en: 'Error', zh: '错误' }), e.message || t({ en: 'Save failed', zh: '保存失败' })),
  });

  const isValid = name.trim().length > 0 && prompt.trim().length > 0 &&
    (triggerType !== 'cron' || cronExpr.trim().length > 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>{t({ en: 'Basic Info', zh: '基础信息' })}</Text>

      <Text style={styles.label}>{t({ en: 'Workflow Name *', zh: '工作流名称 *' })}</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t({ en: 'e.g. Morning News Digest', zh: '例如：晨间新闻摘要' })}
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />

      <Text style={styles.label}>{t({ en: 'Description', zh: '描述' })}</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder={t({ en: 'What does this workflow do?', zh: '这个工作流会做什么？' })}
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />

      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>{t({ en: 'Trigger', zh: '触发方式' })}</Text>
      <View style={styles.triggerRow}>
        {(['cron', 'webhook', 'manual'] as TriggerType[]).map((trigger) => (
          <TouchableOpacity
            key={trigger}
            style={[styles.triggerBtn, triggerType === trigger && styles.triggerBtnActive]}
            onPress={() => setTriggerType(trigger)}
          >
            <Text style={styles.triggerIcon}>
              {trigger === 'cron' ? '⏰' : trigger === 'webhook' ? '🔗' : '▶️'}
            </Text>
            <Text style={[styles.triggerLabel, triggerType === trigger && styles.triggerLabelActive]}>
              {trigger === 'cron'
                ? t({ en: 'Schedule', zh: '定时' })
                : trigger === 'webhook'
                  ? t({ en: 'Webhook', zh: 'Webhook' })
                  : t({ en: 'Manual', zh: '手动' })}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {triggerType === 'cron' && (
        <>
          <Text style={styles.label}>{t({ en: 'Cron Expression *', zh: 'Cron 表达式 *' })}</Text>
          <TextInput
            value={cronExpr}
            onChangeText={setCronExpr}
            placeholder="0 9 * * *"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoCapitalize="none"
          />
          <Text style={styles.helper}>{t({ en: 'Presets:', zh: '预设：' })}</Text>
          <View style={styles.presetRow}>
            {CRON_PRESETS.map((p) => (
              <TouchableOpacity
                key={p.cron}
                style={[styles.presetBtn, cronExpr === p.cron && styles.presetBtnActive]}
                onPress={() => setCronExpr(p.cron)}
              >
                <Text style={[styles.presetText, cronExpr === p.cron && styles.presetTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {triggerType === 'webhook' && (
        <>
          <Text style={styles.label}>{t({ en: 'Webhook URL (will be generated)', zh: 'Webhook 地址（保存后生成）' })}</Text>
          <View style={styles.webhookBox}>
            <Text style={styles.webhookText}>
              {webhookUrl || t({ en: 'A unique webhook URL will be generated after saving.', zh: '保存后会自动生成唯一的 Webhook 地址。' })}
            </Text>
          </View>
        </>
      )}

      {triggerType === 'manual' && (
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>
            {t({ en: '▶️ Manual workflows are triggered via the "Run" button in the workflow list or via the API.', zh: '▶️ 手动工作流可通过工作流列表中的“运行”按钮，或通过 API 触发。' })}
          </Text>
        </View>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>{t({ en: 'Agent Instructions *', zh: '智能体指令 *' })}</Text>
      <Text style={styles.helper}>
        {t({ en: 'What should your agent do when this workflow runs? Be specific and detailed.', zh: '当这个工作流运行时，智能体需要执行什么？请尽量写得具体。' })}
      </Text>
      <TextInput
        value={prompt}
        onChangeText={setPrompt}
        multiline
        numberOfLines={6}
        placeholder={t({ en: 'e.g. Search for the top 5 AI news stories from the past 24 hours, summarize them in 2 sentences each, and send me the digest via notification.', zh: '例如：搜索过去 24 小时内最重要的 5 条 AI 新闻，用 2 句话总结每条，并通过通知发送给我。' })}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, { height: 140, textAlignVertical: 'top' }]}
      />

      <TouchableOpacity
        style={[styles.saveBtn, !isValid && { opacity: 0.5 }]}
        onPress={() => saveMut.mutate()}
        disabled={!isValid || saveMut.isPending}
      >
        {saveMut.isPending || loadingEdit
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={styles.saveBtnText}>{isEdit ? t({ en: 'Update Workflow', zh: '更新工作流' }) : t({ en: 'Create Workflow', zh: '创建工作流' })}</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 48, gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  label: { fontSize: 12, color: colors.textMuted, fontWeight: '600', marginBottom: 4 },
  helper: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  input: {
    backgroundColor: colors.bgCard, color: colors.textPrimary,
    padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, fontSize: 14,
  },
  triggerRow: { flexDirection: 'row', gap: 10 },
  triggerBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bgCard, borderRadius: 12, padding: 14,
    borderWidth: 1.5, borderColor: colors.border, gap: 6,
  },
  triggerBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  triggerIcon: { fontSize: 22 },
  triggerLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  triggerLabelActive: { color: colors.primary },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: colors.bgCard, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
  },
  presetBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  presetText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  presetTextActive: { color: colors.primary },
  webhookBox: {
    backgroundColor: colors.bgCard, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  webhookText: { color: colors.textMuted, fontSize: 13 },
  infoBanner: {
    backgroundColor: colors.accent + '11', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: colors.accent + '30',
  },
  infoBannerText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  saveBtn: {
    backgroundColor: colors.primary, borderRadius: 14, padding: 16,
    alignItems: 'center', marginTop: 16,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
