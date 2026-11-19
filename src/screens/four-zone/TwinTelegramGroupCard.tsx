/**
 * TwinTelegramGroupCard — on the initiator's plan page: post the plan to a Telegram group, or take it down
 * (twinTelegram.ts). Rendered only in builds with both `EXPO_PUBLIC_TWIN_TELEGRAM=1` and
 * `EXPO_PUBLIC_TWIN_TELEGRAM_GROUP=1`; shows nothing when the server does not offer groups, and nothing for a plan
 * that is over or has no one answering by link.
 */
import React, { useEffect, useState } from 'react';
import { Alert, AppState, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import {
  TWIN_TELEGRAM_GROUP_ENABLED,
  TWIN_TELEGRAM_GROUP_OPEN_FAILED_WORDS,
  twinTelegramGroupFailureWords,
  twinTelegramGroupPanel,
  type TwinTelegramGroupFailure,
} from '../../services/twinTelegram';
import { mobileTwinTelegramClient } from '../../services/twinTelegramSession';

interface Props {
  huddleId: string;
  /** The plan can still be cancelled. */
  open: boolean;
  /** How many of the people asked answer by link. */
  linkSeats: number;
}

export function TwinTelegramGroupCard({ huddleId, open, linkSeats }: Props) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  // Keyed by `open` too: a plan that just ended is asked about again, since its roster is gone by then.
  const queryKey = ['twin-telegram', 'group', huddleId, open];
  const [problem, setProblem] = useState<{ en: string; zh: string } | null>(null);
  const group = useQuery({
    queryKey,
    queryFn: () => mobileTwinTelegramClient().groupState(huddleId),
    enabled: TWIN_TELEGRAM_GROUP_ENABLED,
    retry: false,
  });
  const fail = (failure: TwinTelegramGroupFailure): void => {
    setProblem(twinTelegramGroupFailureWords(failure));
    // The plan is not what this page shows any more: read it again.
    if (failure === 'changed') void queryClient.invalidateQueries({ queryKey: ['twin-huddle', 'detail', huddleId] });
  };
  const post = useMutation({
    mutationFn: () => mobileTwinTelegramClient().groupIssue(huddleId),
    onSuccess: (outcome) => {
      if ('failure' in outcome) return fail(outcome.failure);
      setProblem(null);
      queryClient.setQueryData(queryKey, 'waiting');
      Linking.openURL(outcome.url).catch((): void => setProblem(TWIN_TELEGRAM_GROUP_OPEN_FAILED_WORDS));
    },
  });
  const revoke = useMutation({
    mutationFn: () => mobileTwinTelegramClient().groupRevoke(huddleId),
    onSuccess: (outcome) => {
      if ('failure' in outcome) return fail(outcome.failure);
      setProblem(null);
      queryClient.setQueryData(queryKey, 'none');
    },
  });

  // Back from Telegram: ask whether the roster went up.
  const refetch = group.refetch;
  useEffect(() => {
    if (!TWIN_TELEGRAM_GROUP_ENABLED) return undefined;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refetch();
    });
    return () => subscription.remove();
  }, [refetch]);

  const panel = TWIN_TELEGRAM_GROUP_ENABLED ? twinTelegramGroupPanel(group.data, { open, linkSeats }) : null;
  if (panel === null) return null;
  const busy = post.isPending || revoke.isPending;

  const askPost = (): void => {
    if (panel.confirmPost === null) return post.mutate();
    Alert.alert(t({ en: 'Move to another group?', zh: '换一个群？' }), t(panel.confirmPost), [
      { text: t({ en: 'Keep it there', zh: '先不换' }), style: 'cancel' },
      { text: t({ en: 'Move', zh: '换群' }), onPress: () => post.mutate() },
    ]);
  };
  const askRevoke = (): void => {
    Alert.alert(
      t({ en: 'Take it down from the group?', zh: '从群里撤下？' }),
      t({
        en: 'The roster buttons stop working and the bot stops posting about this plan in that group. Answers already given stay.',
        zh: '名单上的按钮会失效，机器人不再在那个群里说这次商量的事。已经给出的回答不受影响。',
      }),
      [
        { text: t({ en: 'Leave it', zh: '先不撤' }), style: 'cancel' },
        { text: t({ en: 'Take it down', zh: '撤下' }), style: 'destructive', onPress: () => revoke.mutate() },
      ],
    );
  };

  return (
    <View style={styles.card} testID="twin-huddle-telegram-group">
      <Text style={styles.label}>{t({ en: 'Telegram group', zh: 'Telegram 群' })}</Text>
      <Text style={styles.muted}>{t(panel.words)}</Text>
      {panel.post ? (
        <TouchableOpacity style={[styles.button, busy && styles.dim]} disabled={busy} onPress={askPost} accessibilityRole="button" testID="twin-huddle-telegram-group-post">
          <Text style={styles.buttonText}>{t(panel.post)}</Text>
        </TouchableOpacity>
      ) : null}
      {panel.canRevoke ? (
        <TouchableOpacity style={[styles.secondary, busy && styles.dim]} disabled={busy} onPress={askRevoke} accessibilityRole="button" testID="twin-huddle-telegram-group-revoke">
          <Text style={styles.secondaryText}>{t({ en: 'Take down from the group', zh: '从群里撤下' })}</Text>
        </TouchableOpacity>
      ) : null}
      {problem ? (
        <Text style={styles.problem} testID="twin-huddle-telegram-group-problem">
          {t(problem)}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: { padding: 14, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border, gap: 8, marginTop: 8 },
    label: { color: c.textSecondary, fontSize: 13, fontWeight: '600' },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.accent, fontSize: 15, fontWeight: '700' },
    secondary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
    problem: { color: c.error, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    dim: { opacity: 0.45 },
  });
