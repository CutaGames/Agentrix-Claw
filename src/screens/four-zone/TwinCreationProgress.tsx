/**
 * TwinCreationProgress — 分身 → 创建进度 (product doc 1.9; T5, REQ-mobile-047). Read-only:
 * the nine steps from the shared step model, the one to do next, and "到网页上继续" for it.
 * Nothing here writes; every step is done on the web.
 */
import React from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchTwinCreation, twinCreationWebUrl } from '../../services/twinCreation';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import type { TwinCreationLockReason, TwinCreationStepId, TwinCreationStepStatus } from '../../../shared/types/digital-twin-creation';

type Lang = 'zh' | 'en';
type Copy = { zh: string; en: string };

/** Same titles as the Web flow (TwinCreationFlow `TWIN_CREATION_STEP_COPY`). */
const STEP_TITLE: Record<TwinCreationStepId, Copy> = {
  entry: { zh: '开始创建', en: 'Start' },
  bring: { zh: '带入资料', en: 'Bring material' },
  rights: { zh: '权利声明', en: 'Rights' },
  interview: { zh: '访谈', en: 'Interview' },
  confirm: { zh: '逐条确认', en: 'Confirm items' },
  ask: { zh: '试问一句', en: 'Ask once' },
  services: { zh: '服务与转本人', en: 'Services & handoff' },
  check: { zh: '公开前检查', en: 'Before going public' },
  publish: { zh: '发布与分享', en: 'Publish & share' },
};

/** Same wording as the Web flow (`LOCK_COPY`). */
const LOCK_TEXT: Record<TwinCreationLockReason, Copy> = {
  needs_profile: { zh: '先完成第 1 步"开始创建"。', en: 'Finish step 1, Start, first.' },
  needs_source: { zh: '先带入至少一份资料。', en: 'Bring in at least one item first.' },
  needs_interview: { zh: '先答完 5 道核心题。', en: 'Answer the five core questions first.' },
  needs_private_ready: { zh: '私密分身就绪后才能做这一步。', en: 'This opens once the private twin is ready.' },
  needs_publish_ready: { zh: '公开前检查全部通过后才能发布。', en: 'Publishing opens once every check passes.' },
};

const STATUS_TEXT: Record<TwinCreationStepStatus, Copy> = {
  done: { zh: '已完成', en: 'Done' },
  available: { zh: '可以做', en: 'Ready' },
  locked: { zh: '等前一步', en: 'Waiting' },
  blocked: { zh: '未开放', en: 'Not open' },
};

export function TwinCreationProgress({ agentAccountId }: { agentAccountId: string }) {
  const { t, language } = useI18n();
  const lang: Lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const query = useQuery({
    queryKey: ['four-zone', 'twin-creation', agentAccountId],
    queryFn: () => fetchTwinCreation(agentAccountId),
    retry: 0,
    staleTime: 30_000,
  });
  const state = query.data;
  if (query.isLoading) return <ActivityIndicator />;
  if (!state || state.kind !== 'ready') {
    return (
      <Text style={styles.muted} testID="twin-creation-read-error">
        {t({ en: 'Could not read the creation progress.', zh: '暂时读不到创建进度。' })}
      </Text>
    );
  }
  const view = state.data;
  // Everything open is done: nothing to show here (the twin card takes over).
  if (!view.current) return null;
  const current = view.steps.find((step) => step.id === view.current)!;
  const url = twinCreationWebUrl(agentAccountId, view.current);
  const doneCount = view.steps.filter((step) => step.status === 'done').length;
  return (
    <View style={styles.block} testID="twin-creation-progress">
      <Text style={styles.section} accessibilityRole="header">
        {t({ en: 'Creating your twin', zh: '创建进度' })}
      </Text>
      <Text style={styles.next} testID={`twin-creation-current-${current.id}`}>
        {lang === 'zh'
          ? `下一步：第 ${current.index} / 9 步 · ${STEP_TITLE[current.id].zh}`
          : `Next: step ${current.index} of 9 · ${STEP_TITLE[current.id].en}`}
      </Text>
      <Text style={styles.muted}>{lang === 'zh' ? `已完成 ${doneCount} 步` : `${doneCount} done`}</Text>
      <View style={styles.list}>
        {view.steps.map((step) => (
          <View
            key={step.id}
            style={styles.row}
            accessible
            accessibilityLabel={`${step.index}. ${STEP_TITLE[step.id][lang]}: ${STATUS_TEXT[step.status][lang]}`}
            testID={`twin-creation-step-${step.id}-${step.status}`}
          >
            <Text style={styles.stepTitle}>{`${step.index}. ${STEP_TITLE[step.id][lang]}`}</Text>
            <Text style={step.status === 'done' ? styles.toneDone : step.status === 'available' ? styles.toneReady : styles.toneMuted}>
              {STATUS_TEXT[step.status][lang]}
            </Text>
            {step.status === 'locked' && step.lockReason ? <Text style={styles.hint}>{LOCK_TEXT[step.lockReason][lang]}</Text> : null}
          </View>
        ))}
      </View>
      {view.partial ? (
        <Text style={styles.muted} testID="twin-creation-partial">
          {t({ en: 'Part of the progress could not be read; some steps may show as waiting.', zh: '有一部分进度暂时读不到，个别步骤可能显示为"等前一步"。' })}
        </Text>
      ) : null}
      {url ? (
        <TouchableOpacity
          style={styles.primary}
          onPress={() => void Linking.openURL(url).catch(() => undefined)}
          accessibilityRole="button"
          testID="twin-creation-open-web"
        >
          <Text style={styles.primaryText}>{t({ en: 'Continue on the web', zh: '到网页上继续' })}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    block: { backgroundColor: c.bgCard, borderRadius: 16, padding: 15, borderWidth: 1, borderColor: c.border, gap: 8 },
    section: { color: c.textSecondary, fontSize: 13, fontWeight: '700' },
    next: { color: c.textPrimary, fontSize: 16, fontWeight: '800' },
    muted: { color: c.textMuted, fontSize: 12, lineHeight: 17 },
    list: { gap: 6, marginTop: 4 },
    row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
    stepTitle: { color: c.textPrimary, fontSize: 14, fontWeight: '600', flexShrink: 1 },
    hint: { color: c.textMuted, fontSize: 12, width: '100%' },
    toneDone: { color: c.success, fontSize: 12, fontWeight: '800' },
    toneReady: { color: c.accent, fontSize: 12, fontWeight: '800' },
    toneMuted: { color: c.textMuted, fontSize: 12, fontWeight: '700' },
    primary: { minHeight: 48, borderRadius: 14, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    primaryText: { color: c.onAccent, fontSize: 15, fontWeight: '800' },
  });
