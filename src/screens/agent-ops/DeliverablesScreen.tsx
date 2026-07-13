/**
 * DeliverablesScreen — list a task's deliverables; view detail; Share (calls
 * /agent-ops/deliverables/:id/share); human spot-check qualified / unqualified
 * (calls /agent-ops/deliverables/:id/spot-check).
 *
 * Route param `taskId` is optional — when absent the screen shows a task
 * picker (from /agent-ops/tasks) so the user can drill into a task.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Share, RefreshControl, Linking,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import {
  listTasks, getTaskDeliverables, spotCheckDeliverable, shareDeliverable,
  type Deliverable, type AgentOpsTask, type DeliverableSection,
} from '../../services/agentOpsApi';
import type { MeStackParamList } from '../../navigation/types';

type DeliverablesRoute = RouteProp<MeStackParamList, 'AgentOpsDeliverables'>;

export function DeliverablesScreen() {
  const route = useRoute<DeliverablesRoute>();
  const initialTaskId = route.params?.taskId;
  const c = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();

  const [taskId, setTaskId] = useState<string | undefined>(initialTaskId);

  if (!taskId) {
    return <TaskPicker styles={styles} c={c} t={t} onPick={setTaskId} />;
  }
  return <TaskDeliverables taskId={taskId} styles={styles} c={c} t={t} onBack={() => setTaskId(undefined)} canBack={!initialTaskId} />;
}

function TaskPicker({
  styles, c, t, onPick,
}: {
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
  t: (d: { en: string; zh: string }) => string;
  onPick: (id: string) => void;
}) {
  const tasksQ = useQuery({ queryKey: ['agent-ops-tasks'], queryFn: () => listTasks(), retry: 1 });
  const tasks = tasksQ.data ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="ao-deliverables-screen"
      refreshControl={<RefreshControl refreshing={tasksQ.isFetching} onRefresh={() => tasksQ.refetch()} tintColor={c.accent} />}
    >
      <Text style={styles.pickerHint}>{t({ en: 'Pick a task to view its deliverables', zh: '选择一个任务查看交付物' })}</Text>
      {tasksQ.isLoading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 24 }} />
      ) : tasks.length === 0 ? (
        <Text style={styles.empty}>{t({ en: 'No tasks yet.', zh: '暂无任务。' })}</Text>
      ) : (
        tasks.map((task: AgentOpsTask) => (
          <TouchableOpacity key={task.id} style={styles.taskRow} onPress={() => onPick(task.id)} testID={`ao-task-${task.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.taskTitle}>{task.title || task.type}</Text>
              <Text style={styles.taskMeta}>{task.status} · {new Date(task.createdAt).toLocaleDateString()}</Text>
            </View>
            <Text style={styles.cardArrow}>›</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

function TaskDeliverables({
  taskId, styles, c, t, onBack, canBack,
}: {
  taskId: string;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
  t: (d: { en: string; zh: string }) => string;
  onBack: () => void;
  canBack: boolean;
}) {
  const qc = useQueryClient();
  const delivQ = useQuery({
    queryKey: ['agent-ops-deliverables', taskId],
    queryFn: () => getTaskDeliverables(taskId),
    retry: 1,
  });
  const [expanded, setExpanded] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['agent-ops-deliverables', taskId] });

  const spotCheckM = useMutation({
    mutationFn: (vars: { id: string; qualified: boolean }) => spotCheckDeliverable(vars.id, { qualified: vars.qualified }),
    onSuccess: invalidate,
    onError: (e: any) => Alert.alert(t({ en: 'Error', zh: '错误' }), e?.message || t({ en: 'Spot-check failed.', zh: '抽检失败。' })),
  });

  const handleShare = useCallback(async (d: Deliverable) => {
    try {
      const res = await shareDeliverable(d.id);
      await Share.share({
        message: t({ en: 'Agent deliverable: ', zh: 'Agent 交付物：' }) + (d.content?.title || d.type) + '\n' + res.shareUrl,
        url: res.shareUrl,
      });
    } catch (e: any) {
      Alert.alert(t({ en: 'Error', zh: '错误' }), e?.message || t({ en: 'Share failed.', zh: '分享失败。' }));
    }
  }, [t]);

  const deliverables = delivQ.data ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="ao-deliverables-screen"
      refreshControl={<RefreshControl refreshing={delivQ.isFetching} onRefresh={() => delivQ.refetch()} tintColor={c.accent} />}
    >
      {canBack ? (
        <TouchableOpacity onPress={onBack} testID="ao-deliverables-back">
          <Text style={styles.backLink}>‹ {t({ en: 'All tasks', zh: '全部任务' })}</Text>
        </TouchableOpacity>
      ) : null}

      {delivQ.isLoading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 24 }} />
      ) : delivQ.isError ? (
        <Text style={styles.empty}>{t({ en: 'Failed to load deliverables.', zh: '加载交付物失败。' })}</Text>
      ) : deliverables.length === 0 ? (
        <Text style={styles.empty}>{t({ en: 'No deliverables for this task yet.', zh: '该任务暂无交付物。' })}</Text>
      ) : (
        deliverables.map((d) => {
          const open = expanded === d.id;
          return (
            <View key={d.id} style={styles.card} testID={`ao-deliverable-${d.id}`}>
              <TouchableOpacity style={styles.cardHead} onPress={() => setExpanded(open ? null : d.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{d.content?.title || d.type}</Text>
                  <Text style={styles.cardMeta}>{new Date(d.collectedAt).toLocaleString()}</Text>
                </View>
                <QualifiedBadge qualified={d.qualified} styles={styles} c={c} t={t} />
              </TouchableOpacity>

              {d.degraded ? (
                <Text style={styles.degraded}>
                  ⚠️ {t({ en: 'Degraded collection — missing data marked 「未获取」.', zh: '降级采集——缺失项标记「未获取」。' })}
                </Text>
              ) : null}

              {d.content?.summary ? <Text style={styles.summary}>{d.content.summary}</Text> : null}

              {open ? (
                <View style={styles.detail}>
                  {(d.content?.sections ?? []).map((s, i) => (
                    <DetailSection key={i} section={s} styles={styles} t={t} />
                  ))}
                  {d.sourceLinks?.length ? (
                    <View style={styles.sources}>
                      <Text style={styles.sourcesTitle}>{t({ en: 'Sources', zh: '来源' })}</Text>
                      {d.sourceLinks.map((s, i) => (
                        <TouchableOpacity key={i} onPress={() => Linking.openURL(s.url)}>
                          <Text style={styles.sourceLink} numberOfLines={1}>🔗 {s.label || s.url}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.actions}>
                <TouchableOpacity style={[styles.actionBtn, styles.shareBtn]} onPress={() => handleShare(d)} testID={`ao-deliverable-share-${d.id}`}>
                  <Text style={[styles.actionText, { color: c.accent }]}>↗ {t({ en: 'Share', zh: '分享' })}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.okBtn]}
                  onPress={() => spotCheckM.mutate({ id: d.id, qualified: true })}
                  disabled={spotCheckM.isPending}
                  testID={`ao-deliverable-qualify-${d.id}`}
                >
                  <Text style={[styles.actionText, { color: c.success }]}>✓ {t({ en: 'Qualified', zh: '合格' })}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.badBtn]}
                  onPress={() => spotCheckM.mutate({ id: d.id, qualified: false })}
                  disabled={spotCheckM.isPending}
                  testID={`ao-deliverable-disqualify-${d.id}`}
                >
                  <Text style={[styles.actionText, { color: c.error }]}>✕ {t({ en: 'Unqualified', zh: '不合格' })}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function QualifiedBadge({
  qualified, styles, c, t,
}: {
  qualified: boolean | null;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
  t: (d: { en: string; zh: string }) => string;
}) {
  if (qualified === null || qualified === undefined) {
    return (
      <View style={[styles.badge, { backgroundColor: c.textMuted + '22', borderColor: c.textMuted + '55' }]}>
        <Text style={[styles.badgeText, { color: c.textMuted }]}>{t({ en: 'Unchecked', zh: '未抽检' })}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: (qualified ? c.success : c.error) + '22', borderColor: (qualified ? c.success : c.error) + '66' }]}>
      <Text style={[styles.badgeText, { color: qualified ? c.success : c.error }]}>
        {qualified ? t({ en: '✓ Qualified', zh: '✓ 合格' }) : t({ en: '✕ Unqualified', zh: '✕ 不合格' })}
      </Text>
    </View>
  );
}

function DetailSection({
  section, styles, t,
}: {
  section: DeliverableSection;
  styles: ReturnType<typeof makeStyles>;
  t: (d: { en: string; zh: string }) => string;
}) {
  const NOT_FETCHED = '「未获取」';
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeadRow}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        {section.notFetched ? <Text style={styles.notFetched}>{NOT_FETCHED}</Text> : null}
      </View>
      {section.notFetched ? (
        <Text style={styles.sectionMuted}>{t({ en: 'Source unavailable — not fetched.', zh: '数据源不可达，未获取。' })}</Text>
      ) : (
        <>
          {section.body ? <Text style={styles.sectionBody}>{section.body}</Text> : null}
          {section.rows?.map((row, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={[styles.rowValue, row.value == null && styles.rowValueMissing]}>
                {row.value == null ? NOT_FETCHED : row.value}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 16, paddingBottom: 40, gap: 12 },
    pickerHint: { fontSize: 13, color: c.textMuted },
    empty: { fontSize: 13, color: c.textMuted, textAlign: 'center', padding: 24 },
    backLink: { fontSize: 14, color: c.accent, fontWeight: '600', marginBottom: 4 },
    taskRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.bgCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border, gap: 10 },
    taskTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    taskMeta: { fontSize: 11, color: c.textMuted, marginTop: 2 },
    cardArrow: { fontSize: 20, color: c.textMuted },
    card: { backgroundColor: c.bgCard, borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, borderColor: c.border },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    cardMeta: { fontSize: 11, color: c.textMuted, marginTop: 2 },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
    badgeText: { fontSize: 11, fontWeight: '800' },
    degraded: { fontSize: 12, color: c.warning, lineHeight: 17 },
    summary: { fontSize: 13, color: c.textSecondary, lineHeight: 19 },
    detail: { gap: 10, marginTop: 4 },
    section: { backgroundColor: c.bgPrimary, borderRadius: 12, padding: 12, gap: 6, borderWidth: 1, borderColor: c.border },
    sectionHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    notFetched: { fontSize: 11, fontWeight: '700', color: c.warning },
    sectionMuted: { fontSize: 12, color: c.textMuted, fontStyle: 'italic' },
    sectionBody: { fontSize: 13, color: c.textSecondary, lineHeight: 19 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, paddingVertical: 3 },
    rowLabel: { fontSize: 13, color: c.textMuted, flex: 1 },
    rowValue: { fontSize: 13, color: c.textPrimary, fontWeight: '600', flex: 1, textAlign: 'right' },
    rowValueMissing: { color: c.warning, fontWeight: '700' },
    sources: { gap: 6, marginTop: 4 },
    sourcesTitle: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase' },
    sourceLink: { fontSize: 12, color: c.accent, paddingVertical: 2 },
    actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
    actionBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center', borderWidth: 1 },
    shareBtn: { backgroundColor: c.accent + '12', borderColor: c.accent + '44' },
    okBtn: { backgroundColor: c.success + '12', borderColor: c.success + '44' },
    badBtn: { backgroundColor: c.error + '10', borderColor: c.error + '40' },
    actionText: { fontSize: 12, fontWeight: '700' },
  });
}
