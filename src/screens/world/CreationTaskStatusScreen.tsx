/** CreationTaskStatusScreen — 创作任务状态 (v6 R8.4/R8.5/R8.6) */
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { getCreationTask, retryCreationTask } from '../../services/worldCreationApi';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import type { CreationTaskDto } from '../../../shared/types/world-creation-api';
import { themedStyles } from '../../theme/useTheme';

const POLL_MS = 3000;

// Maestro E2E: synthetic taskId hits an empty backend → getCreationTask fails.
// A blocking Alert would cover `creation-task-scroll`, so suppress it under the
// compile-time flag (dead code in production); the scroll shell stays assertable.
const isMaestroE2E = process.env.EXPO_PUBLIC_MAESTRO_E2E === '1';

/** Whether a task status is still in-flight and therefore worth polling. */
function isPolling(status?: CreationTaskDto['status']): boolean {
  return status === 'queued' || status === 'running';
}

export default function CreationTaskStatusScreen() {
  const route = useRoute<any>();
  const { taskId } = route.params ?? {};
  const navigation = useNavigation<any>();
  const { t } = useI18n();

  const [task, setTask] = useState<CreationTaskDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  // Polling timer + a guard so an in-flight fetch resolving after blur/unmount
  // never calls setState on an unfocused screen (mirrors WorldMapScreen).
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const load = async () => {
        if (!taskId) {
          if (!cancelled) {
            setLoading(false);
          }
          return;
        }
        try {
          const res = await getCreationTask(taskId);
          if (cancelled) return;
          setTask(res.task);
          // Stop polling the moment the task reaches a terminal state.
          if (!isPolling(res.task.status)) {
            clearPoll();
          }
        } catch (e: any) {
          if (cancelled) return;
          clearPoll();
          if (!isMaestroE2E) {
            Alert.alert(
              t({ en: 'Load failed', zh: '加载失败' }),
              e?.message || t({ en: 'Could not load the creation task.', zh: '无法加载创作任务。' }),
            );
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      };

      void load();
      // Poll while queued/running; the load() above clears it on terminal state.
      pollRef.current = setInterval(() => {
        void load();
      }, POLL_MS);

      return () => {
        cancelled = true;
        clearPoll();
      };
    }, [taskId, t, clearPoll]),
  );

  const onRetry = useCallback(async () => {
    if (!taskId) return;
    setRetrying(true);
    try {
      const res = await retryCreationTask(taskId);
      setTask(res.task);
      // Resume polling if the retry put the task back in-flight.
      if (isPolling(res.task.status) && !pollRef.current) {
        pollRef.current = setInterval(() => {
          getCreationTask(taskId)
            .then((r) => {
              setTask(r.task);
              if (!isPolling(r.task.status)) {
                clearPoll();
              }
            })
            .catch(() => {});
        }, POLL_MS);
      }
    } catch (e: any) {
      Alert.alert(
        t({ en: 'Retry failed', zh: '重试失败' }),
        e?.message || t({ en: 'Could not retry the task.', zh: '无法重试该任务。' }),
      );
    } finally {
      setRetrying(false);
    }
  }, [taskId, t, clearPoll]);

  const onOpenResult = useCallback(() => {
    if (!task) return;
    navigation.navigate('PlotCreator', {
      plotId: task.plotId,
      substrateTier: task.substrateTier,
    });
  }, [navigation, task]);

  const statusMeta = (status: CreationTaskDto['status']) => {
    switch (status) {
      case 'running':
        return { color: colors.accent, label: t({ en: 'Running', zh: '执行中' }) };
      case 'completed':
        return { color: colors.success, label: t({ en: 'Completed', zh: '已完成' }) };
      case 'failed':
        return { color: colors.error, label: t({ en: 'Failed', zh: '失败' }) };
      case 'queued':
      default:
        return { color: colors.textMuted, label: t({ en: 'Queued', zh: '排队中' }) };
    }
  };

  const fmt = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="creation-task-scroll"
    >
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>‹ {t({ en: 'Back', zh: '返回' })}</Text>
      </TouchableOpacity>

      <Text style={styles.title}>
        {t({ en: 'Creation Task', zh: '创作任务' })}
      </Text>

      {loading && !task ? (
        <View style={styles.centerBlock}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : !task ? (
        <View style={styles.centerBlock}>
          <Text style={styles.emptyText}>
            {t({ en: 'Task not found.', zh: '未找到任务。' })}
          </Text>
        </View>
      ) : (
        <>
          {/* Task card */}
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <Text style={styles.cardLabel}>{t({ en: 'Status', zh: '状态' })}</Text>
              <View
                style={[styles.badge, { backgroundColor: statusMeta(task.status).color }]}
                testID="creation-task-status"
              >
                <Text style={styles.badgeText}>{statusMeta(task.status).label}</Text>
              </View>
            </View>

            <Row label={t({ en: 'Task ID', zh: '任务 ID' })} value={task.taskId} mono />
            <Row label={t({ en: 'Target', zh: '目标' })} value={String(task.target)} />
            <Row label={t({ en: 'Substrate Tier', zh: '载体层级' })} value={String(task.substrateTier)} />
            <Row label={t({ en: 'Created', zh: '创建时间' })} value={fmt(task.createdAt)} />
            <Row label={t({ en: 'Updated', zh: '更新时间' })} value={fmt(task.updatedAt)} />
          </View>

          {/* In-flight hint */}
          {isPolling(task.status) ? (
            <View style={styles.pollRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.pollText}>
                {t({ en: 'Tracking progress…', zh: '正在追踪进度…' })}
              </Text>
            </View>
          ) : null}

          {/* Completed */}
          {task.status === 'completed' ? (
            <View style={[styles.card, styles.successCard]}>
              <Text style={styles.successTitle}>
                ✓ {t({ en: 'Creation complete', zh: '创作完成' })}
              </Text>
              {task.resultRef ? (
                <Row
                  label={t({ en: 'Result', zh: '结果工件' })}
                  value={task.resultRef}
                  mono
                />
              ) : null}
              <TouchableOpacity style={styles.primaryBtn} onPress={onOpenResult}>
                <Text style={styles.primaryBtnText}>
                  {t({ en: 'Open result', zh: '打开结果' })}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Failed */}
          {task.status === 'failed' ? (
            <View style={[styles.card, styles.errorCard]}>
              <Text style={styles.errorTitle}>
                {t({ en: 'Task failed', zh: '任务失败' })}
              </Text>
              <Text style={styles.errorReason}>
                {task.failReason || t({ en: 'Unknown error.', zh: '未知错误。' })}
              </Text>
              <TouchableOpacity
                style={[styles.primaryBtn, retrying && styles.btnDisabled]}
                onPress={onRetry}
                disabled={retrying}
                testID="creation-task-retry-btn"
              >
                {retrying ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {t({ en: 'Retry', zh: '重试' })}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.rowValueMono]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 80 },
  backBtn: { paddingVertical: 8, marginBottom: 4 },
  backText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 16 },

  centerBlock: { paddingVertical: 48, alignItems: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 14 },

  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 14,
  },
  cardLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: 12,
  },
  rowLabel: { fontSize: 13, color: colors.textMuted },
  rowValue: { fontSize: 13, color: colors.textPrimary, flexShrink: 1, textAlign: 'right' },
  rowValueMono: { fontFamily: 'monospace', fontSize: 12 },

  pollRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  pollText: { color: colors.textSecondary, fontSize: 13 },

  successCard: {
    backgroundColor: 'rgba(16,185,129,0.10)',
    borderColor: 'rgba(16,185,129,0.35)',
  },
  successTitle: { color: colors.success, fontSize: 15, fontWeight: '700', marginBottom: 10 },

  errorCard: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderColor: 'rgba(239,68,68,0.35)',
  },
  errorTitle: { color: colors.error, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  errorReason: { color: colors.textPrimary, fontSize: 13, lineHeight: 19, marginBottom: 12 },

  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: colors.textInverse, fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
}));
