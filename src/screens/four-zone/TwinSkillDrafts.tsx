/**
 * TwinSkillDrafts — the confirm card for skills that grew from experience (L8 C2). Rendered inside
 * TwinAutomationsScreen only in builds with `EXPO_PUBLIC_SKILL_DISTILL=1`. A draft is only text and does nothing until
 * the owner confirms it; looking for new ones uses the platform's model quota and is capped per day.
 */
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { SKILL_DRAFTS_FAILURE_COPY, SkillDraftsError } from '../../services/skillDrafts';
import { mobileSkillDraftsClient } from '../../services/skillDraftsSession';

export const skillDraftsQueryKey = ['four-zone', 'skill-drafts'] as const;
const failureOf = (error: unknown) => (error instanceof SkillDraftsError ? error.failure : 'unavailable');

export function TwinSkillDrafts() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState('');
  const drafts = useQuery({ queryKey: skillDraftsQueryKey, queryFn: () => mobileSkillDraftsClient().list(), retry: 0, staleTime: 15_000 });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: skillDraftsQueryKey });
  const scan = useMutation({
    mutationFn: () => mobileSkillDraftsClient().scan(),
    onSuccess: (result) =>
      setNotice(
        result.created.length > 0
          ? t({ en: `Found ${result.created.length} new skill draft(s).`, zh: `找到 ${result.created.length} 个新技能草稿。` })
          : result.capReached
            ? t({ en: 'Today’s distilling limit is used up. Try again tomorrow.', zh: '今天的提炼次数用完了，明天再试。' })
            : t({ en: 'No task has succeeded often enough yet.', zh: '暂时没有足够多次成功的任务。' }),
      ),
    onError: (error: unknown) => setNotice(t(SKILL_DRAFTS_FAILURE_COPY[failureOf(error)])),
    onSettled: refresh,
  });
  const decide = useMutation({
    mutationFn: ({ draftRef, decision }: { draftRef: string; decision: 'confirm' | 'decline' }) => mobileSkillDraftsClient().decide(draftRef, decision),
    onError: (error: unknown) => setNotice(t(SKILL_DRAFTS_FAILURE_COPY[failureOf(error)])),
    onSettled: refresh,
  });

  // Not open on the server (404) or unreadable: show nothing rather than a broken card.
  if (drafts.isError) return null;
  if (drafts.isLoading) return <ActivityIndicator />;
  const items = drafts.data ?? [];
  const busy = scan.isPending || decide.isPending;

  return (
    <View style={styles.wrap} testID="twin-skill-drafts">
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: 'Skills grown from experience', zh: '从经验长出的技能' })}
      </Text>
      <Text style={styles.muted}>
        {t({
          en: 'When one automation has succeeded several times it can become a skill draft. A draft is a few lines of text and is on only after you confirm it.',
          zh: '同一个自动化成功跑了好几次以后，可以提炼成技能草稿。草稿只是几行文字，你确认以后才启用。',
        })}
      </Text>
      <TouchableOpacity style={styles.button} onPress={() => scan.mutate()} disabled={busy} accessibilityRole="button" testID="twin-skill-drafts-scan">
        <Text style={styles.buttonText}>{t({ en: 'Look for skills in my experience', zh: '从经验里找技能' })}</Text>
      </TouchableOpacity>
      {items.length === 0 ? <Text style={styles.muted}>{t({ en: 'No skill drafts yet.', zh: '还没有技能草稿。' })}</Text> : null}
      {items.map((item) => (
        <View key={item.draftRef} style={styles.card} testID={`twin-skill-draft-${item.draftRef}`}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.detail}>{item.summary}</Text>
          {item.steps.map((step, index) => (
            <Text key={`${item.draftRef}-${index}`} style={styles.detail}>{`${index + 1}. ${step}`}</Text>
          ))}
          <Text style={item.status === 'confirmed' ? styles.ok : styles.muted}>
            {item.status === 'pending'
              ? t({ en: 'Waiting for you', zh: '等你确认' })
              : item.status === 'confirmed'
                ? t({ en: 'On', zh: '已启用' })
                : t({ en: 'Declined', zh: '已拒绝' })}
            {` · ${t({ en: `Succeeded ${item.successRuns} times`, zh: `成功过 ${item.successRuns} 次` })}`}
          </Text>
          <View style={styles.actions}>
            {item.status !== 'confirmed' ? (
              <TouchableOpacity style={styles.button} onPress={() => decide.mutate({ draftRef: item.draftRef, decision: 'confirm' })} disabled={busy} accessibilityRole="button" testID={`twin-skill-draft-confirm-${item.draftRef}`}>
                <Text style={styles.buttonText}>{t({ en: 'Confirm and turn on', zh: '确认并启用' })}</Text>
              </TouchableOpacity>
            ) : null}
            {item.status !== 'declined' ? (
              <TouchableOpacity style={styles.button} onPress={() => decide.mutate({ draftRef: item.draftRef, decision: 'decline' })} disabled={busy} accessibilityRole="button" testID={`twin-skill-draft-decline-${item.draftRef}`}>
                <Text style={styles.buttonText}>{item.status === 'confirmed' ? t({ en: 'Turn off', zh: '关掉' }) : t({ en: 'Decline', zh: '不要' })}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ))}
      {notice ? <Text style={styles.muted} testID="twin-skill-drafts-notice">{notice}</Text> : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: { gap: 10, marginTop: 16 },
    title: { color: c.textPrimary, fontSize: 18, fontWeight: '800' },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    ok: { color: c.accent, fontSize: 13, fontWeight: '700' },
    card: { backgroundColor: c.bgCard, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
    cardTitle: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    detail: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.textPrimary, fontSize: 14, fontWeight: '700' },
  });
