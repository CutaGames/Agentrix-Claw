/** PlotCreatorScreen — Plot 创作器:沿 prompt-drive / co-edit / hand-build 连续谱本地创作
 *  (Tier_A/B),Tier_C 派发到 Desktop/Agent;消费 worldCreationApi 的 generate / continue /
 *  revert / history / publish / submitTask。(v6 R3.1/R3.2/R3.4/R3.6/R3.7) */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  generateEcsWorld,
  continueEditing,
  revertEcsWorld,
  getEcsHistory,
  publishPlot,
  submitCreationTask,
} from '../../services/worldCreationApi';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import type { EcsWorld, SubstrateTier } from '../../../shared/types/world-creation';
import type { CreationMode } from '../../../shared/types/world-creation-api';
import type { EcsDiff } from '../../../shared/types/world-creation';
import { themedStyles } from '../../theme/useTheme';

type Params = { plotId: string; substrateTier: SubstrateTier; title?: string };

const MODES: CreationMode[] = ['promptDrive', 'coEdit', 'handBuild'];

export default function PlotCreatorScreen() {
  const { t } = useI18n();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { plotId, substrateTier, title } = (route.params ?? {}) as Params;

  const isTierC = substrateTier === 'C';

  const [mode, setMode] = useState<CreationMode>('promptDrive');
  const [ecsWorld, setEcsWorld] = useState<EcsWorld | null>(null);
  const [prompt, setPrompt] = useState('');
  const [instruction, setInstruction] = useState('');
  const [quotaWarning, setQuotaWarning] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [reverting, setReverting] = useState(false);

  const [history, setHistory] = useState<EcsDiff[] | null>(null);

  // ── promptDrive：生成(Tier_C from mobile → 强制派发) ──────────────
  const onGenerate = useCallback(async () => {
    const text = prompt.trim();
    if (!text) {
      Alert.alert(
        t({ en: 'Prompt required', zh: '需要提示词' }),
        t({ en: 'Describe the world you want to create.', zh: '描述一下你想创建的世界。' }),
      );
      return;
    }
    setGenerating(true);
    setQuotaWarning(null);
    try {
      // Tier_C 守卫:移动端不可本地生成 Turing-complete 世界 → 派发到 Desktop/Agent (R3.7/R8.7)
      if (isTierC) {
        const res = await submitCreationTask({
          plotId,
          target: 'desktop',
          substrateTier: 'C',
          surface: 'mobile',
          input: { prompt: text },
        });
        const taskId = res.task?.taskId;
        Alert.alert(
          t({ en: 'Dispatched to Desktop/Agent', zh: '已派发到 桌面/Agent' }),
          t({
            en: 'Tier_C worlds cannot be generated on mobile. The task was dispatched to '
              + `${res.effectiveTarget}.`,
            zh: `Tier_C 世界无法在移动端本地生成,任务已派发到 ${res.effectiveTarget}。`,
          }),
          taskId
            ? [
                { text: t({ en: 'OK', zh: '好' }), style: 'cancel' },
                {
                  text: t({ en: 'View task', zh: '查看任务' }),
                  onPress: () => navigation.navigate('CreationTaskStatus', { taskId }),
                },
              ]
            : undefined,
        );
        return;
      }

      const res = await generateEcsWorld(plotId, { prompt: text, substrateTier });
      if (res.error) {
        Alert.alert(
          res.error.error === 'TIER_VIOLATION'
            ? t({ en: 'Tier violation', zh: '越界(层级违规)' })
            : t({ en: 'Generation failed', zh: '生成失败' }),
          res.error.detail,
        );
        return;
      }
      setEcsWorld(res.ecsWorld);
      if (res.quotaWarning) setQuotaWarning(res.quotaWarning.message);
    } catch (e: any) {
      Alert.alert(
        t({ en: 'Generation failed', zh: '生成失败' }),
        e?.message ?? String(e),
      );
    } finally {
      setGenerating(false);
    }
  }, [prompt, isTierC, plotId, substrateTier, t, navigation]);

  // ── coEdit:自然语言指令 → 本地应用或派发 ─────────────────────────
  const onCoEdit = useCallback(async () => {
    const text = instruction.trim();
    if (!text) {
      Alert.alert(
        t({ en: 'Instruction required', zh: '需要指令' }),
        t({ en: 'Describe the change in natural language.', zh: '用自然语言描述你的修改。' }),
      );
      return;
    }
    setEditing(true);
    try {
      const res = await continueEditing(plotId, {
        mode: 'coEdit',
        surface: 'mobile',
        instruction: text,
        dispatchTarget: 'desktop',
      });
      if (res.error) {
        Alert.alert(
          res.error.error === 'TIER_VIOLATION'
            ? t({ en: 'Tier violation', zh: '越界(层级违规)' })
            : t({ en: 'Edit failed', zh: '编辑失败' }),
          res.error.detail,
        );
        return;
      }
      if (res.outcome === 'applied') {
        if (res.ecsWorld) setEcsWorld(res.ecsWorld);
        setInstruction('');
        Alert.alert(
          t({ en: 'Applied', zh: '已应用' }),
          t({ en: 'Your edit was applied to the world.', zh: '你的修改已应用到该世界。' }),
        );
      } else {
        // outcome === 'dispatched' — Tier_C 派发到 桌面/Agent
        const taskId = (res as unknown as { taskId?: string }).taskId;
        Alert.alert(
          t({ en: 'Dispatched to Desktop/Agent', zh: '已派发到 桌面/Agent' }),
          res.dispatch?.reason
            ?? t({ en: 'Tier_C edit dispatched off mobile.', zh: 'Tier_C 编辑已派发到移动端之外。' }),
          taskId
            ? [
                { text: t({ en: 'OK', zh: '好' }), style: 'cancel' },
                {
                  text: t({ en: 'View task', zh: '查看任务' }),
                  onPress: () => navigation.navigate('CreationTaskStatus', { taskId }),
                },
              ]
            : undefined,
        );
      }
    } catch (e: any) {
      Alert.alert(t({ en: 'Edit failed', zh: '编辑失败' }), e?.message ?? String(e));
    } finally {
      setEditing(false);
    }
  }, [instruction, plotId, t, navigation]);

  // ── 历史 / 回滚 ───────────────────────────────────────────────
  const onLoadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await getEcsHistory(plotId);
      setHistory(res.diffs ?? []);
    } catch (e: any) {
      Alert.alert(t({ en: 'Failed to load history', zh: '加载历史失败' }), e?.message ?? String(e));
    } finally {
      setLoadingHistory(false);
    }
  }, [plotId, t]);

  const onRevert = useCallback(
    async (targetVersionId: string) => {
      setReverting(true);
      try {
        const res = await revertEcsWorld(plotId, { targetVersionId });
        setEcsWorld(res.ecsWorld);
        Alert.alert(
          t({ en: 'Reverted', zh: '已回滚' }),
          t({ en: `Restored to ${targetVersionId}.`, zh: `已恢复到版本 ${targetVersionId}。` }),
        );
      } catch (e: any) {
        Alert.alert(t({ en: 'Revert failed', zh: '回滚失败' }), e?.message ?? String(e));
      } finally {
        setReverting(false);
      }
    },
    [plotId, t],
  );

  // ── 发布 ─────────────────────────────────────────────────────
  const onPublish = useCallback(async () => {
    setPublishing(true);
    try {
      const res = await publishPlot(plotId);
      if (res.published) {
        Alert.alert(
          t({ en: 'Published', zh: '发布成功' }),
          res.shareCode
            ? t({ en: `Share code: ${res.shareCode}`, zh: `分享码:${res.shareCode}` })
            : t({ en: 'Your Plot is now discoverable.', zh: '你的 Plot 现已可被发现。' }),
        );
      } else {
        Alert.alert(
          t({ en: 'Publish rejected', zh: '发布被拒' }),
          res.error?.detail ?? t({ en: 'Moderation rejected publication.', zh: '审核未通过。' }),
        );
      }
    } catch (e: any) {
      Alert.alert(t({ en: 'Publish failed', zh: '发布失败' }), e?.message ?? String(e));
    } finally {
      setPublishing(false);
    }
  }, [plotId, t]);

  return (
    <View style={styles.root}>
      <ScrollView
        testID="plot-creator-scroll"
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 头部 */}
        <Text style={styles.title}>{title || t({ en: 'Plot Creator', zh: 'Plot 创作器' })}</Text>
        <Text style={styles.subtitle}>
          {t({ en: 'Plot', zh: 'Plot' })}: {plotId} · Tier {substrateTier}
        </Text>

        {/* 模式切换 */}
        <View style={styles.modeRow}>
          {MODES.map((m) => {
            const active = mode === m;
            const label =
              m === 'promptDrive'
                ? t({ en: 'Prompt', zh: '提示词生成' })
                : m === 'coEdit'
                  ? t({ en: 'Co-edit', zh: '协同编辑' })
                  : t({ en: 'Hand-build', zh: '手动搭建' });
            return (
              <TouchableOpacity
                key={m}
                testID={`creator-mode-${m}`}
                style={[styles.modeBtn, active && styles.modeBtnActive]}
                onPress={() => setMode(m)}
              >
                <Text style={[styles.modeBtnText, active && styles.modeBtnTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 配额软提醒 */}
        {quotaWarning ? (
          <View style={styles.quotaBanner}>
            <Text style={styles.quotaText}>{quotaWarning}</Text>
          </View>
        ) : null}

        {/* ── promptDrive ── */}
        {mode === 'promptDrive' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t({ en: 'Generate from prompt', zh: '从提示词生成' })}</Text>
            {isTierC ? (
              <Text style={styles.hint}>
                {t({
                  en: 'Tier_C runs off-device — generation will be dispatched to Desktop/Agent.',
                  zh: 'Tier_C 不在移动端运行,生成将派发到 桌面/Agent。',
                })}
              </Text>
            ) : null}
            <TextInput
              style={styles.input}
              placeholder={t({ en: 'Describe your world…', zh: '描述你的世界…' })}
              placeholderTextColor={colors.textMuted}
              multiline
              value={prompt}
              onChangeText={setPrompt}
            />
            <TouchableOpacity
              testID="creator-generate-btn"
              style={[styles.primaryBtn, generating && styles.btnDisabled]}
              disabled={generating}
              onPress={onGenerate}
            >
              {generating ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {isTierC
                    ? t({ en: 'Dispatch generation', zh: '派发生成' })
                    : t({ en: 'Generate', zh: '生成' })}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── coEdit ── */}
        {mode === 'coEdit' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t({ en: 'Co-edit (natural language)', zh: '协同编辑(自然语言)' })}</Text>
            <TextInput
              style={styles.input}
              placeholder={t({ en: 'e.g. add a wooden shelf near the door', zh: '例如:在门口附近加一个木质货架' })}
              placeholderTextColor={colors.textMuted}
              multiline
              value={instruction}
              onChangeText={setInstruction}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, editing && styles.btnDisabled]}
              disabled={editing}
              onPress={onCoEdit}
            >
              {editing ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text style={styles.primaryBtnText}>{t({ en: 'Apply edit', zh: '应用编辑' })}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── handBuild ── */}
        {mode === 'handBuild' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t({ en: 'Hand-build (read-only)', zh: '手动搭建(只读)' })}</Text>
            <Text style={styles.hint}>
              {t({ en: 'Full visual editing is on Desktop.', zh: '完整可视化编辑在桌面端。' })}
            </Text>
            {ecsWorld && ecsWorld.entities.length > 0 ? (
              ecsWorld.entities.map((entity) => (
                <View key={entity.id} style={styles.entityRow}>
                  <Text style={styles.entityId}>{entity.id}</Text>
                  <Text style={styles.entityComponents}>
                    {Object.keys(entity.components).join(', ') || '—'}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.muted}>
                {t({ en: 'No entities yet. Generate a world first.', zh: '暂无实体。请先生成一个世界。' })}
              </Text>
            )}
          </View>
        )}

        {/* ── ECS_World 摘要卡 ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t({ en: 'World summary', zh: 'ECS_World 摘要' })}</Text>
          {ecsWorld ? (
            <View>
              <SummaryRow label={t({ en: 'Title', zh: '标题' })} value={ecsWorld.meta?.title ?? '—'} />
              <SummaryRow label={t({ en: 'Tier', zh: '层级' })} value={ecsWorld.substrateTier} />
              <SummaryRow
                label={t({ en: 'Entities', zh: '实体数' })}
                value={String(ecsWorld.entities.length)}
              />
              <SummaryRow
                label={t({ en: 'Rules', zh: '规则数' })}
                value={String(ecsWorld.rules?.length ?? 0)}
              />
              <SummaryRow
                label={t({ en: 'Logic modules', zh: '逻辑模块数' })}
                value={String(ecsWorld.logicModules?.length ?? 0)}
              />
            </View>
          ) : (
            <Text style={styles.muted}>
              {t({ en: 'No world loaded yet.', zh: '尚未加载世界。' })}
            </Text>
          )}
        </View>

        {/* ── 历史 / 回滚 ── */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>{t({ en: 'History', zh: '历史' })}</Text>
            <TouchableOpacity
              style={[styles.secondaryBtn, loadingHistory && styles.btnDisabled]}
              disabled={loadingHistory}
              onPress={onLoadHistory}
            >
              {loadingHistory ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text style={styles.secondaryBtnText}>{t({ en: 'Load', zh: '加载' })}</Text>
              )}
            </TouchableOpacity>
          </View>
          {history && history.length > 0 ? (
            history.map((diff) => (
              <TouchableOpacity
                key={diff.versionId}
                style={styles.historyRow}
                disabled={reverting}
                onPress={() => onRevert(diff.versionId)}
              >
                <Text style={styles.historyVersion}>{diff.versionId}</Text>
                <Text style={styles.historyMeta}>
                  {diff.parent ? `← ${diff.parent}` : t({ en: 'root', zh: '根' })} · {diff.authorType}
                </Text>
                <Text style={styles.revertLabel}>{t({ en: 'Revert', zh: '回滚' })}</Text>
              </TouchableOpacity>
            ))
          ) : history ? (
            <Text style={styles.muted}>{t({ en: 'No history yet.', zh: '暂无历史。' })}</Text>
          ) : null}
        </View>
      </ScrollView>

      {/* ── 发布(底部固定)── */}
      <View style={styles.footer}>
        <TouchableOpacity
          testID="creator-publish-btn"
          style={[styles.publishBtn, publishing && styles.btnDisabled]}
          disabled={publishing}
          onPress={onPublish}
        >
          {publishing ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.publishBtnText}>{t({ en: 'Publish', zh: '发布' })}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
  },
  modeBtnActive: {
    borderColor: colors.accent,
    backgroundColor: colors.cardAlt,
  },
  modeBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  modeBtnTextActive: {
    color: colors.accent,
  },
  quotaBanner: {
    backgroundColor: colors.cardAlt,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  quotaText: {
    color: colors.warning,
    fontSize: 13,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 10,
  },
  input: {
    backgroundColor: colors.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: 14,
    padding: 12,
    minHeight: 96,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: colors.cardAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  secondaryBtnText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  entityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  entityId: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  entityComponents: {
    color: colors.textSecondary,
    fontSize: 12,
    flex: 2,
    textAlign: 'right',
  },
  muted: {
    color: colors.textMuted,
    fontSize: 13,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyVersion: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  historyMeta: {
    color: colors.textMuted,
    fontSize: 12,
    flex: 2,
  },
  revertLabel: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  publishBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  publishBtnText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
}));
