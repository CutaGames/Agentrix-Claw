/**
 * TwinHuddleFillInviteScreen — 分身 → 约个时间 → 有人带你去 (twinHuddleFill.ts). Only in builds with
 * `EXPO_PUBLIC_TWIN_HUDDLE_FILL=1`. A friend would like to bring this person along to a settled plan: they see who brings
 * them, what, when, roughly where and how many are coming, but not who started it until they are in. They say they would
 * come with a name for the organizer, or no; once they said yes they can still step back until the plan starts.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { TWIN_HUDDLE_FILL_LIMITS_V0, type TwinHuddleFillInviteV0 } from '../../../shared/types/twin-huddle-fill';
import { TwinHuddleError } from '../../services/twinHuddle';
import {
  TWIN_HUDDLE_FILL_INVITE_COPY,
  TWIN_HUDDLE_FILL_INVITE_GONE,
  TWIN_HUDDLE_FILL_REGION_COPY,
  twinHuddleFillFailureWords,
  twinHuddleFillHeadcountWords,
  twinHuddleFillInviteTitleWords,
  twinHuddleFillLabelProblem,
  twinHuddleFillOrganizerWords,
  type TwinHuddleFillAnswerDraft,
} from '../../services/twinHuddleFill';
import { mobileTwinHuddleFillClient } from '../../services/twinHuddleFillSession';
import { twinHuddleSlotWords } from '../../services/twinHuddleView';

type InviteRoute = RouteProp<{ TwinHuddleFillInvite: { personId: string } }, 'TwinHuddleFillInvite'>;
type Words = { en: string; zh: string };

export const TWIN_HUDDLE_FILL_INVITES_QUERY_KEY = ['twin-huddle', 'fill-invites'] as const;

export function TwinHuddleFillInviteScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const { personId } = useRoute<InviteRoute>().params;
  const queryClient = useQueryClient();
  const key = ['twin-huddle', 'fill-invite', personId];
  const invite = useQuery({ queryKey: key, queryFn: () => mobileTwinHuddleFillClient().invite(personId), retry: false });
  const [label, setLabel] = useState('');
  const [problem, setProblem] = useState<Words | null>(null);

  const change = useMutation({
    mutationFn: (run: () => Promise<TwinHuddleFillInviteV0>) => run(),
    onSuccess: (next) => {
      setProblem(null);
      queryClient.setQueryData(key, next);
      void queryClient.invalidateQueries({ queryKey: TWIN_HUDDLE_FILL_INVITES_QUERY_KEY });
    },
    onError: (error) => {
      setProblem(twinHuddleFillFailureWords(error));
      if (error instanceof TwinHuddleError && error.failure === 'changed') void invite.refetch();
    },
  });
  const busy = change.isPending;

  if (invite.isPending) {
    return (
      <View style={[styles.screen, styles.center]} testID="twin-huddle-fill-invite-loading">
        <ActivityIndicator />
      </View>
    );
  }
  if (invite.isError) {
    const gone = invite.error instanceof TwinHuddleError && invite.error.failure === 'not_found';
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-huddle-fill-invite-error">
        <Text style={styles.problem}>{t(gone ? TWIN_HUDDLE_FILL_INVITE_GONE : twinHuddleFillFailureWords(invite.error))}</Text>
        {gone ? null : (
          <TouchableOpacity style={styles.secondary} onPress={() => void invite.refetch()} accessibilityRole="button" testID="twin-huddle-fill-invite-retry">
            <Text style={styles.secondaryText}>{t({ en: 'Try again', zh: '重试' })}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  }

  const view = invite.data;
  const now = new Date();
  const organizer = twinHuddleFillOrganizerWords(view);
  const answer = (draft: TwinHuddleFillAnswerDraft): void => {
    if (draft.decision === 'come') {
      const local = twinHuddleFillLabelProblem(draft.label);
      if (local) {
        setProblem(local);
        return;
      }
    }
    change.mutate(() => mobileTwinHuddleFillClient().answer(personId, draft));
  };
  const askLeave = (): void => {
    Alert.alert(t({ en: 'Cannot make it after all?', zh: '来不了了？' }), t({ en: 'The organizer will no longer count you in. This cannot be undone.', zh: '发起人那边就不再算上你了，退出后不能恢复。' }), [
      { text: t({ en: 'Keep my place', zh: '先不退' }), style: 'cancel' },
      { text: t({ en: 'I cannot make it', zh: '我来不了' }), style: 'destructive', onPress: () => change.mutate(() => mobileTwinHuddleFillClient().leave(personId)) },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-huddle-fill-invite-screen">
      <Text style={styles.title} accessibilityRole="header">
        {t(twinHuddleFillInviteTitleWords(view))}
      </Text>
      <Text style={view.canAnswer ? styles.alert : styles.muted} testID="twin-huddle-fill-invite-state">
        {t(TWIN_HUDDLE_FILL_INVITE_COPY[view.state])}
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t(twinHuddleSlotWords(view.slot, now))}</Text>
        {view.region ? <Text style={styles.body}>{t({ en: `Where: ${TWIN_HUDDLE_FILL_REGION_COPY[view.region].en}`, zh: `地区：${TWIN_HUDDLE_FILL_REGION_COPY[view.region].zh}` })}</Text> : null}
        <Text style={styles.body}>{t(twinHuddleFillHeadcountWords(view.headcount))}</Text>
        {organizer ? (
          <Text style={styles.body} testID="twin-huddle-fill-invite-organizer">
            {t(organizer)}
          </Text>
        ) : null}
        {view.label ? <Text style={styles.muted}>{t({ en: `The name you gave: ${view.label}`, zh: `你写的称呼：${view.label}` })}</Text> : null}
      </View>

      {view.canAnswer ? (
        <View style={styles.section}>
          <Text style={styles.label}>{t({ en: 'What should the organizer call you?', zh: '给发起人看的称呼' })}</Text>
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={(text) => {
              setLabel(text);
              setProblem(null);
            }}
            maxLength={TWIN_HUDDLE_FILL_LIMITS_V0.labelMax * 2}
            placeholder={t({ en: 'For example: Sam, Bob\'s colleague', zh: '比如：小王，老张的同事' })}
            editable={!busy}
            testID="twin-huddle-fill-invite-label"
          />
          <Text style={styles.muted}>
            {t({
              en: 'Only this name goes to the organizer, and only once you say you would come. You find out who organized it once they say yes.',
              zh: '发起人只看得到这个称呼，而且要等你说愿意来以后；发起人点头以后，你也会看到发起人是谁。',
            })}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.grow, busy && styles.dim]}
              disabled={busy}
              onPress={() => answer({ decision: 'come', label })}
              accessibilityRole="button"
              testID="twin-huddle-fill-invite-come"
            >
              <Text style={styles.buttonText}>{t({ en: 'I would come', zh: '我愿意来' })}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondary, styles.grow, busy && styles.dim]}
              disabled={busy}
              onPress={() => answer({ decision: 'decline' })}
              accessibilityRole="button"
              testID="twin-huddle-fill-invite-decline"
            >
              <Text style={styles.secondaryText}>{t({ en: 'Not this time', zh: '这次不去' })}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {view.canWithdraw ? (
        <TouchableOpacity style={[styles.danger, busy && styles.dim]} disabled={busy} onPress={askLeave} accessibilityRole="button" testID="twin-huddle-fill-invite-leave">
          <Text style={styles.dangerText}>{t({ en: 'I cannot make it', zh: '我来不了了' })}</Text>
        </TouchableOpacity>
      ) : null}

      {problem ? (
        <Text style={styles.problem} testID="twin-huddle-fill-invite-problem">
          {t(problem)}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    center: { alignItems: 'center', justifyContent: 'center' },
    content: { padding: 16, gap: 10, paddingBottom: 32 },
    title: { color: c.textPrimary, fontSize: 20, fontWeight: '800' },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    alert: { color: c.accent, fontSize: 14, fontWeight: '700' },
    body: { color: c.textPrimary, fontSize: 15 },
    label: { color: c.textSecondary, fontSize: 13, fontWeight: '600' },
    section: { gap: 8, marginTop: 8 },
    card: { padding: 14, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border, gap: 6 },
    cardTitle: { color: c.textPrimary, fontSize: 16, fontWeight: '700' },
    input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, color: c.textPrimary, backgroundColor: c.bgCard },
    grow: { flex: 1 },
    actions: { flexDirection: 'row', gap: 8 },
    button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    secondary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
    danger: { minHeight: 44, marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: c.error, alignItems: 'center', justifyContent: 'center' },
    dangerText: { color: c.error, fontSize: 15, fontWeight: '700' },
    problem: { color: c.error, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    dim: { opacity: 0.45 },
  });
