/**
 * TwinAutomationsScreen — 分身 → 自动化 (E1 / E2, L4 3; agentAutomations.ts). Only in builds with
 * `EXPO_PUBLIC_AGENT_AUTOMATIONS=1`.
 *
 * Lists this agent's automations: when they run, where they send, status (a pause says why), next run and last run.
 * Pause / resume follow the contract (no resume while the emergency stop holds it); ending is two taps. "运行记录"
 * opens the newest runs of one automation. New automations are proposed by the Agent in a chat and confirmed there.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { automationActionsV0, type AutomationRunV0 } from '../../../shared/types/agent-automation';
import {
  AGENT_AUTOMATIONS_FAILURE_COPY,
  AgentAutomationsError,
  automationRunLine,
  automationRunSummary,
  automationSources,
  automationStatusLine,
  automationTitle,
  automationTriggerLine,
  type AutomationAction,
} from '../../services/agentAutomations';
import { mobileAgentAutomationsClient } from '../../services/agentAutomationsSession';

type Lang = 'zh' | 'en';
type Styles = ReturnType<typeof makeStyles>;

export const automationsQueryKey = (agentAccountId: string) => ['four-zone', 'automations', agentAccountId] as const;
export const automationRunsQueryKey = (automationRef: string) => ['four-zone', 'automation-runs', automationRef] as const;

const failureOf = (error: unknown) => (error instanceof AgentAutomationsError ? error.failure : 'unavailable');

function RunDetail({ run, lang, when, styles }: { run: AutomationRunV0; lang: Lang; when: (iso: string) => string; styles: Styles }) {
  const summary = automationRunSummary(run);
  const sources = automationSources(run, lang);
  return (
    <View style={styles.run} testID={`twin-automation-run-${run.runRef}`}>
      <Text style={styles.detail}>{automationRunLine(run, lang, when)}</Text>
      {summary ? <Text style={styles.summary}>{summary}</Text> : null}
      {sources.length > 0 ? (
        <View style={styles.sources}>
          <Text style={styles.muted}>{lang === 'zh' ? '来源：' : 'Sources: '}</Text>
          {sources.map((source, index) =>
            source.url ? (
              <TouchableOpacity key={`${source.label}-${index}`} onPress={() => void Linking.openURL(source.url as string)} accessibilityRole="link" accessibilityLabel={source.label}>
                <Text style={styles.link}>{source.label}</Text>
              </TouchableOpacity>
            ) : (
              <Text key={`${source.label}-${index}`} style={styles.muted}>
                {source.label}
              </Text>
            ),
          )}
        </View>
      ) : null}
    </View>
  );
}

function AutomationRuns({ automationRef, lang, when, styles }: { automationRef: string; lang: Lang; when: (iso: string) => string; styles: Styles }) {
  const { t } = useI18n();
  const runs = useQuery({
    queryKey: automationRunsQueryKey(automationRef),
    queryFn: () => mobileAgentAutomationsClient().runs(automationRef),
    retry: 0,
    staleTime: 15_000,
  });
  if (runs.isLoading) return <ActivityIndicator />;
  if (runs.isError) {
    return (
      <Text style={styles.problem} testID="twin-automation-runs-error">
        {t(AGENT_AUTOMATIONS_FAILURE_COPY[failureOf(runs.error)])}
      </Text>
    );
  }
  const items = runs.data?.items ?? [];
  return (
    <View style={styles.runs} testID={`twin-automation-runs-${automationRef}`}>
      {items.length === 0 ? <Text style={styles.muted}>{t({ en: 'It has not run yet.', zh: '还没有运行过。' })}</Text> : null}
      {items.map((run) => (
        <RunDetail key={run.runRef} run={run} lang={lang} when={when} styles={styles} />
      ))}
      {runs.data && runs.data.unreadable > 0 ? (
        <Text style={styles.muted}>{t({ en: `${runs.data.unreadable} more could not be read.`, zh: `另有 ${runs.data.unreadable} 条读不出来，没有列出。` })}</Text>
      ) : null}
    </View>
  );
}

export function TwinAutomationsScreen() {
  const { t, language } = useI18n();
  const lang: Lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const activeInstance = useAuthStore((state) => state.activeInstance);
  const agentAccountId: string = activeInstance?.agentAccountId ?? activeInstance?.metadata?.agentAccountId ?? '';
  const key = automationsQueryKey(agentAccountId);
  const [openRuns, setOpenRuns] = useState<string | null>(null);
  const automations = useQuery({
    queryKey: key,
    queryFn: () => mobileAgentAutomationsClient().list(agentAccountId),
    enabled: !!agentAccountId,
    retry: 0,
    staleTime: 15_000,
  });
  const act = useMutation({
    mutationFn: ({ automationRef, action }: { automationRef: string; action: AutomationAction }) => mobileAgentAutomationsClient().act(automationRef, action),
    onError: (error: unknown) => {
      Alert.alert(t({ en: 'Not recorded', zh: '没有生效' }), t(AGENT_AUTOMATIONS_FAILURE_COPY[failureOf(error)]));
    },
    // The list shows the server's read-back, not what we sent.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
  const confirmEnd = (automationRef: string, title: string) =>
    Alert.alert(t({ en: 'End this automation?', zh: '结束这个自动化？' }), `${title}\n${t({ en: 'An ended automation cannot be resumed.', zh: '结束以后不能恢复。' })}`, [
      { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
      { text: t({ en: 'End', zh: '结束' }), style: 'destructive', onPress: () => act.mutate({ automationRef, action: 'end' }) },
    ]);
  const when = (iso: string) => new Date(iso).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const failure = automations.isError ? failureOf(automations.error) : null;
  const list = automations.data?.items ?? [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={automations.isRefetching} onRefresh={() => void automations.refetch()} />}
      testID="twin-automations-screen"
    >
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: 'Automations', zh: '自动化' })}
      </Text>
      <Text style={styles.muted}>
        {t({
          en: 'In a chat the Agent can only propose a scheduled or triggered task; it starts once you confirm. Results are kept and sent where you chose.',
          zh: 'Agent 在对话里只能提议定时或触发的任务，你确认了才生效。结果会保存，并送到你选的地方。',
        })}
      </Text>
      {automations.isLoading && !!agentAccountId ? <ActivityIndicator /> : null}
      {failure ? (
        <Text style={styles.problem} testID="twin-automations-error">
          {t(AGENT_AUTOMATIONS_FAILURE_COPY[failure])}
        </Text>
      ) : null}
      {automations.data && list.length === 0 ? (
        <Text style={styles.muted} testID="twin-automations-empty">
          {t({
            en: 'No automations yet. Say "every day at 8am send my calendar to Telegram" in a chat; the Agent will ask you to confirm first.',
            zh: '还没有自动化。在对话里说"每天早上 8 点把日程发到 Telegram"，Agent 会先请你确认。',
          })}
        </Text>
      ) : null}
      {automations.data && automations.data.unreadable > 0 ? (
        <Text style={styles.muted} testID="twin-automations-unreadable">
          {t({ en: `${automations.data.unreadable} more could not be read.`, zh: `另有 ${automations.data.unreadable} 个读不出来，没有列出。` })}
        </Text>
      ) : null}
      {list.map((item) => {
        const title = automationTitle(item, lang);
        const actions = automationActionsV0(item);
        const open = openRuns === item.automationRef;
        return (
          <View key={item.automationRef} style={styles.card} testID={`twin-automation-${item.automationRef}`}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.detail}>{automationTriggerLine(item, lang)}</Text>
            <Text style={item.status === 'active' ? styles.ok : styles.detail}>{automationStatusLine(item, lang, when)}</Text>
            {item.lastRun ? (
              <View style={styles.lastRun}>
                <Text style={styles.muted}>{t({ en: 'Last run', zh: '上次运行' })}</Text>
                <RunDetail run={item.lastRun} lang={lang} when={when} styles={styles} />
              </View>
            ) : null}
            <View style={styles.actions}>
              {actions.pause ? (
                <TouchableOpacity
                  style={styles.button}
                  onPress={() => act.mutate({ automationRef: item.automationRef, action: 'pause' })}
                  disabled={act.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`${t({ en: 'Pause', zh: '暂停' })} ${title}`}
                  testID={`twin-automation-pause-${item.automationRef}`}
                >
                  <Text style={styles.buttonText}>{t({ en: 'Pause', zh: '暂停' })}</Text>
                </TouchableOpacity>
              ) : null}
              {actions.resume ? (
                <TouchableOpacity
                  style={styles.button}
                  onPress={() => act.mutate({ automationRef: item.automationRef, action: 'resume' })}
                  disabled={act.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`${t({ en: 'Resume', zh: '恢复' })} ${title}`}
                  testID={`twin-automation-resume-${item.automationRef}`}
                >
                  <Text style={styles.buttonText}>{t({ en: 'Resume', zh: '恢复' })}</Text>
                </TouchableOpacity>
              ) : null}
              {actions.end ? (
                <TouchableOpacity
                  style={styles.endButton}
                  onPress={() => confirmEnd(item.automationRef, title)}
                  disabled={act.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`${t({ en: 'End', zh: '结束' })} ${title}`}
                  testID={`twin-automation-end-${item.automationRef}`}
                >
                  <Text style={styles.endText}>{t({ en: 'End', zh: '结束' })}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.button}
                onPress={() => setOpenRuns(open ? null : item.automationRef)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={`${t({ en: 'Run history', zh: '运行记录' })} ${title}`}
                testID={`twin-automation-runs-toggle-${item.automationRef}`}
              >
                <Text style={styles.buttonText}>{open ? t({ en: 'Hide history', zh: '收起记录' }) : t({ en: 'Run history', zh: '运行记录' })}</Text>
              </TouchableOpacity>
            </View>
            {open ? <AutomationRuns automationRef={item.automationRef} lang={lang} when={when} styles={styles} /> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 20, gap: 10 },
    title: { color: c.textPrimary, fontSize: 24, fontWeight: '800' },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    ok: { color: c.accent, fontSize: 13, fontWeight: '700' },
    problem: { color: c.danger, fontSize: 13 },
    card: { backgroundColor: c.bgCard, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
    cardTitle: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    detail: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
    summary: { color: c.textPrimary, fontSize: 13, lineHeight: 19, marginTop: 2 },
    lastRun: { marginTop: 4, gap: 2 },
    run: { gap: 2 },
    runs: { marginTop: 6, gap: 10 },
    sources: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 },
    link: { color: c.accent, fontSize: 13, textDecorationLine: 'underline' },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.textPrimary, fontSize: 14, fontWeight: '700' },
    endButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.danger, alignItems: 'center', justifyContent: 'center' },
    endText: { color: c.danger, fontSize: 14, fontWeight: '800' },
  });
