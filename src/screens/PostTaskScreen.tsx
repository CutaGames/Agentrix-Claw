// 发布悬赏任务页
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import {
  taskMarketplaceApi,
  TaskType,
  TASK_TYPE_CONFIG,
} from '../services/taskMarketplace.api';
import { useI18n } from '../stores/i18nStore';

const TYPE_LABEL_ZH: Record<string, string> = {
  development: '开发',
  design: '设计',
  content: '内容',
  consultation: '咨询',
  custom_service: '定制',
  other: '其他',
};

interface Props {
  navigation: any;
}

export function PostTaskScreen({ navigation }: Props) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'CNY'>('USD');
  const [taskType, setTaskType] = useState<TaskType>('development');
  const [tagsInput, setTagsInput] = useState('');
  const [deadline, setDeadline] = useState('');
  const [deliverables, setDeliverables] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const tr = (en: string, zh: string) => t({ en, zh });

  const handleSubmit = async () => {
    if (!title.trim()) { Alert.alert(tr('Please enter a task title', '请输入任务标题')); return; }
    if (title.trim().length < 5) { Alert.alert(tr('Title must be at least 5 characters', '标题至少需要 5 个字符')); return; }
    if (!description.trim()) { Alert.alert(tr('Please enter a description', '请输入任务描述')); return; }
    if (description.trim().length < 20) { Alert.alert(tr('Description must be at least 20 characters', '描述至少需要 20 个字符')); return; }
    const budgetNum = parseFloat(budget);
    if (!budgetNum || budgetNum <= 0) { Alert.alert(tr('Please enter a valid budget', '请输入有效的预算')); return; }

    setSubmitting(true);
    try {
      const tags = tagsInput.split(/[,，\s]+/).filter(t => t.trim()).map(t => t.trim());
      const deliverableList = deliverables.split('\n').filter(d => d.trim()).map(d => d.trim());

      const task = await taskMarketplaceApi.publishTask({
        type: taskType,
        title: title.trim(),
        description: description.trim(),
        budget: budgetNum,
        currency,
        tags,
        requirements: {
          deadline: deadline || undefined,
          deliverables: deliverableList.length > 0 ? deliverableList : undefined,
        },
        visibility: 'public',
      });

      Alert.alert(
        tr('Published!', '已发布！'),
        tr('Your bounty task is now live on the Bounty Board, waiting for bids.', '你的悬赏任务已上线悬赏板，正在等待竞标。'),
        [{ text: tr('View Task', '查看任务'), onPress: () => navigation.replace('TaskDetail', { taskId: task.id }) }],
      );
    } catch (e: any) {
      Alert.alert(tr('Publish Failed', '发布失败'), e.message || tr('Please try again later', '请稍后再试'));
    } finally {
      setSubmitting(false);
    }
  };

  const typeKeys = Object.keys(TASK_TYPE_CONFIG) as TaskType[];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Task Type */}
        <View style={styles.section}>
          <Text style={styles.label}>{tr('Task Type *', '任务类型 *')}</Text>
          <View style={styles.typeGrid}>
            {typeKeys.map(key => {
              const conf = TASK_TYPE_CONFIG[key];
              const selected = taskType === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.typeChip, selected && { backgroundColor: conf.color + '25', borderColor: conf.color }]}
                  onPress={() => setTaskType(key)}
                >
                  <Text style={styles.typeIcon}>{conf.icon}</Text>
                  <Text style={[styles.typeLabel, selected && { color: conf.color, fontWeight: '700' }]}>{t({ en: conf.label, zh: TYPE_LABEL_ZH[key] || conf.label })}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Title */}
        <View style={styles.section}>
          <Text style={styles.label}>{tr('Task Title *', '任务标题 *')}</Text>
          <TextInput
            style={styles.input}
            placeholder={tr('Briefly describe the task you need done', '简要描述你需要完成的任务')}
            placeholderTextColor={colors.muted}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />
          <Text style={styles.hint}>{title.length}/100</Text>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.label}>{tr('Description *', '任务描述 *')}</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder={tr('Detail the requirements, technical specs, expected outcome...', '详细说明需求、技术规格和预期结果…')}
            placeholderTextColor={colors.muted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={8}
            textAlignVertical="top"
            maxLength={5000}
          />
          <Text style={styles.hint}>{description.length}/5000</Text>
        </View>

        {/* Budget */}
        <View style={styles.section}>
          <Text style={styles.label}>{tr('Bounty Amount *', '悬赏金额 *')}</Text>
          <View style={styles.budgetRow}>
            <TouchableOpacity
              style={[styles.currencyBtn, currency === 'USD' && styles.currencyBtnActive]}
              onPress={() => setCurrency('USD')}
            >
              <Text style={[styles.currencyText, currency === 'USD' && styles.currencyTextActive]}>$ USD</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.currencyBtn, currency === 'CNY' && styles.currencyBtnActive]}
              onPress={() => setCurrency('CNY')}
            >
              <Text style={[styles.currencyText, currency === 'CNY' && styles.currencyTextActive]}>¥ CNY</Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder={tr('Amount', '金额')}
              placeholderTextColor={colors.muted}
              value={budget}
              onChangeText={setBudget}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        {/* Deadline */}
        <View style={styles.section}>
          <Text style={styles.label}>{tr('Deadline (optional)', '截止时间（可选）')}</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.muted}
            value={deadline}
            onChangeText={setDeadline}
            maxLength={10}
          />
        </View>

        {/* Tags */}
        <View style={styles.section}>
          <Text style={styles.label}>{tr('Tags (optional)', '标签（可选）')}</Text>
          <TextInput
            style={styles.input}
            placeholder={tr('Comma-separated, e.g. Python, React, AI', '用逗号分隔，例如 Python、React、AI')}
            placeholderTextColor={colors.muted}
            value={tagsInput}
            onChangeText={setTagsInput}
          />
        </View>

        {/* Deliverables */}
        <View style={styles.section}>
          <Text style={styles.label}>{tr('Deliverables (optional, one per line)', '交付物（可选，每行一项）')}</Text>
          <TextInput
            style={[styles.input, styles.textarea, { minHeight: 80 }]}
            placeholder={tr('e.g.:\nComplete source code\nDeployment docs\nUser guide', '例如：\n完整源代码\n部署文档\n使用说明')}
            placeholderTextColor={colors.muted}
            value={deliverables}
            onChangeText={setDeliverables}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Preview */}
        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>📋 {tr('Preview', '预览')}</Text>
          <Text style={styles.previewItem}>{tr('Type', '类型')}：{TASK_TYPE_CONFIG[taskType].icon} {t({ en: TASK_TYPE_CONFIG[taskType].label, zh: TYPE_LABEL_ZH[taskType] || TASK_TYPE_CONFIG[taskType].label })}</Text>
          <Text style={styles.previewItem}>{tr('Title', '标题')}：{title || '—'}</Text>
          <Text style={styles.previewItem}>{tr('Budget', '预算')}：{budget ? `${currency === 'CNY' ? '¥' : '$'}${budget}` : '—'}</Text>
          <Text style={styles.previewItem}>{tr('Deadline', '截止时间')}：{deadline || tr('None', '无')}</Text>
          <Text style={styles.previewItem}>{tr('Tags', '标签')}：{tagsInput || tr('None', '无')}</Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.5 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.submitBtnText}>{submitting ? tr('Publishing...', '发布中…') : `🚀 ${tr('Post Bounty Task', '发布悬赏任务')}`}</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  section: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 },
  hint: { fontSize: 11, color: colors.muted, textAlign: 'right', marginTop: 4 },
  input: {
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textarea: { minHeight: 140, textAlignVertical: 'top' },
  // Type grid
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  typeIcon: { fontSize: 16 },
  typeLabel: { fontSize: 13, color: colors.muted, fontWeight: '500' },
  // Budget
  budgetRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  currencyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  currencyBtnActive: { backgroundColor: colors.primary + '20', borderColor: colors.primary },
  currencyText: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  currencyTextActive: { color: colors.primary },
  // Preview
  previewCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 10 },
  previewItem: { fontSize: 13, color: colors.muted, marginBottom: 4, lineHeight: 20 },
  // Submit
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  submitBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
