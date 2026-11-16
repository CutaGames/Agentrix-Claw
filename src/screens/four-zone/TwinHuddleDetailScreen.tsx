/**
 * TwinHuddleDetailScreen — 分身 → 约个时间 → 一次商量 (twinHuddle.ts, twinHuddleView.ts). Only in builds with
 * `EXPO_PUBLIC_TWIN_HUDDLE=1`. The initiator sees who was asked and how, picks one of the times that work, cancels, or
 * gets a fresh link for someone who lost theirs. An invited person picks which times work, then says whether they are
 * coming.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import {
  TWIN_HUDDLE_BUDGET_LABELS_V0,
  TWIN_HUDDLE_KIND_LABELS_V0,
  twinHuddleNextStatusV0,
  type TwinHuddleConfirmationV0,
  type TwinHuddleDetailsV0,
  type TwinHuddleInitiatorViewV0,
  type TwinHuddleInvitedViewV0,
  type TwinHuddleReplyV0,
} from '../../../shared/types/twin-huddle';
import { TwinHuddleError } from '../../services/twinHuddle';
import { mobileTwinHuddleClient } from '../../services/twinHuddleSession';
import {
  TWIN_HUDDLE_ANSWER_WORDS,
  TWIN_HUDDLE_ROUTE_WORDS,
  twinHuddleDeadlineWords,
  twinHuddleDietWords,
  twinHuddleFailureWords,
  twinHuddlePeopleLabels,
  twinHuddlePicksFromAnswer,
  twinHuddleProposalWords,
  twinHuddleReplyFromPicks,
  twinHuddleShareWords,
  twinHuddleSlotWords,
  twinHuddleStatusWords,
  type TwinHuddlePicks,
  type TwinHuddleWords,
} from '../../services/twinHuddleView';
import { TwinHuddleChip } from './TwinHuddleChip';

type DetailRoute = RouteProp<{ TwinHuddleDetail: { id: string } }, 'TwinHuddleDetail'>;
type HuddleView = TwinHuddleInitiatorViewV0 | TwinHuddleInvitedViewV0;

interface PartProps<V extends HuddleView> {
  view: V;
  now: Date;
  onView: (view: HuddleView) => void;
  onFail: (error: unknown) => void;
}

const budgetWords = (details: { budget: TwinHuddleDetailsV0['budget'] }): TwinHuddleWords => ({
  en: `Budget per person: ${TWIN_HUDDLE_BUDGET_LABELS_V0[details.budget].en}`,
  zh: `人均：${TWIN_HUDDLE_BUDGET_LABELS_V0[details.budget].zh}`,
});

export function TwinHuddleDetailScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const { id } = useRoute<DetailRoute>().params;
  const queryClient = useQueryClient();
  const plan = useQuery({ queryKey: ['twin-huddle', 'detail', id], queryFn: () => mobileTwinHuddleClient().get(id) });
  const [problem, setProblem] = useState<TwinHuddleWords | null>(null);

  const onView = (view: HuddleView): void => {
    setProblem(null);
    queryClient.setQueryData(['twin-huddle', 'detail', id], view);
    void queryClient.invalidateQueries({ queryKey: ['twin-huddle', 'list'] });
  };
  const onFail = (error: unknown): void => {
    setProblem(twinHuddleFailureWords(error));
    if (error instanceof TwinHuddleError && error.failure === 'changed') void plan.refetch();
  };

  if (plan.isPending) {
    return (
      <View style={[styles.screen, styles.center]} testID="twin-huddle-detail-loading">
        <ActivityIndicator />
      </View>
    );
  }
  if (plan.isError) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-huddle-detail-error">
        <Text style={styles.problem}>{t(twinHuddleFailureWords(plan.error))}</Text>
        <TouchableOpacity style={styles.secondary} onPress={() => void plan.refetch()} accessibilityRole="button" testID="twin-huddle-detail-retry">
          <Text style={styles.secondaryText}>{t({ en: 'Try again', zh: '重试' })}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const view = plan.data;
  const now = new Date();
  const kind = t(TWIN_HUDDLE_KIND_LABELS_V0[view.details.kind]);
  const needsMe = view.role === 'initiator' ? view.status === 'choosing' : view.canAnswer || view.canConfirm;
  const deadline = twinHuddleDeadlineWords(view.stageEndsAt, now);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-huddle-detail-screen">
      <Text style={styles.title} accessibilityRole="header">
        {view.role === 'initiator'
          ? t({ en: `${kind} · you started it`, zh: `${kind} · 我发起的` })
          : t({ en: `${view.initiatorName} invited you: ${kind}`, zh: `${view.initiatorName}约你${kind}` })}
      </Text>
      <Text style={needsMe ? styles.alert : styles.muted}>
        {t(twinHuddleStatusWords({ role: view.role, status: view.status, needsMe }))}
        {deadline ? ` · ${t(deadline)}` : ''}
      </Text>
      <DetailsCard details={view.details} now={now} />
      {view.role === 'initiator' ? (
        <InitiatorPart view={view} now={now} onView={onView} onFail={onFail} />
      ) : (
        <InvitedPart view={view} now={now} onView={onView} onFail={onFail} />
      )}
      {problem ? (
        <Text style={styles.problem} testID="twin-huddle-detail-problem">
          {t(problem)}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function DetailsCard({ details, now }: { details: TwinHuddleDetailsV0; now: Date }) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{t({ en: 'Times asked about', zh: '候选时间' })}</Text>
      {details.candidates.map((slot) => (
        <Text key={slot.startAt} style={styles.body}>
          {t(twinHuddleSlotWords(slot, now))}
        </Text>
      ))}
      <Text style={styles.muted}>{t(budgetWords(details))}</Text>
      {details.note ? <Text style={styles.muted}>{t({ en: `Note: ${details.note}`, zh: `备注：${details.note}` })}</Text> : null}
    </View>
  );
}

function InitiatorPart({ view, now, onView, onFail }: PartProps<TwinHuddleInitiatorViewV0>) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const [fresh, setFresh] = useState<{ ref: string; url: string } | null>(null);
  const choose = useMutation({ mutationFn: (candidate: number) => mobileTwinHuddleClient().choose(view.id, candidate), onSuccess: onView, onError: onFail });
  const cancel = useMutation({ mutationFn: () => mobileTwinHuddleClient().cancel(view.id), onSuccess: onView, onError: onFail });
  const relink = useMutation({
    mutationFn: (ref: string) => mobileTwinHuddleClient().relink(view.id, ref),
    onSuccess: (link) => setFresh(link),
    onError: onFail,
  });
  const open = twinHuddleNextStatusV0(view.status, 'cancel') !== null;
  const busy = choose.isPending || cancel.isPending || relink.isPending;
  const confirmed = twinHuddlePeopleLabels(view.confirmed, view.people);
  const freshLabel = fresh ? twinHuddlePeopleLabels([fresh.ref], view.people)[0] ?? fresh.ref : '';

  const askCancel = (): void => {
    Alert.alert(t({ en: 'Cancel this plan?', zh: '取消这次商量？' }), t({ en: 'Everyone asked will be told it is off.', zh: '被约的人都会收到取消的消息。' }), [
      { text: t({ en: 'Keep it', zh: '先不取消' }), style: 'cancel' },
      { text: t({ en: 'Cancel the plan', zh: '取消商量' }), style: 'destructive', onPress: () => cancel.mutate() },
    ]);
  };
  const forward = (url: string): void => {
    Share.share({ message: t(twinHuddleShareWords(url)) }).catch((): void => undefined);
  };

  return (
    <>
      {view.status === 'choosing' ? (
        <View style={styles.section}>
          <Text style={styles.label}>{t({ en: 'Pick one time', zh: '选一个时间' })}</Text>
          {view.proposals.length === 0 ? <Text style={styles.muted}>{t({ en: 'No time works for anyone yet.', zh: '还没有能凑齐的时间。' })}</Text> : null}
          {view.proposals.map((proposal) => (
            <View key={proposal.candidate} style={styles.card}>
              <Text style={styles.cardTitle}>{t(twinHuddleSlotWords(proposal.slot, now))}</Text>
              <Text style={styles.muted}>{t(twinHuddleProposalWords(proposal, view.people))}</Text>
              <Text style={styles.muted}>{t(budgetWords(proposal))}</Text>
              {proposal.dietTags.length > 0 ? <Text style={styles.muted}>{t(twinHuddleDietWords(proposal.dietTags))}</Text> : null}
              <TouchableOpacity
                style={[styles.button, busy && styles.dim]}
                disabled={busy}
                onPress={() => choose.mutate(proposal.candidate)}
                accessibilityRole="button"
                testID={`twin-huddle-choose-${proposal.candidate}`}
              >
                <Text style={styles.buttonText}>{t({ en: 'Go with this time', zh: '就定这个' })}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}
      {view.chosen ? (
        <View style={styles.section}>
          <Text style={styles.label}>{t(view.status === 'settled' ? { en: 'Settled', zh: '定了' } : { en: 'The time you chose', zh: '你选的时间' })}</Text>
          <Text style={styles.cardTitle}>{t(twinHuddleSlotWords(view.chosen.slot, now))}</Text>
          <Text style={styles.muted}>
            {confirmed.length > 0
              ? t({ en: `Coming: ${confirmed.join(', ')}`, zh: `确认要来：${confirmed.join('、')}` })
              : t({ en: 'No one has confirmed yet.', zh: '还没有人确认。' })}
          </Text>
        </View>
      ) : null}
      <View style={styles.section}>
        <Text style={styles.label}>{t({ en: 'Who was asked', zh: '约了谁' })}</Text>
        {view.people.map((person) => (
          <View key={person.ref} style={styles.personRow}>
            <View style={styles.grow}>
              <Text style={styles.body}>{person.label}</Text>
              <Text style={styles.muted}>{t(TWIN_HUDDLE_ROUTE_WORDS[person.route])}</Text>
            </View>
            {open && person.route === 'link' ? (
              <TouchableOpacity
                style={[styles.smallButton, busy && styles.dim]}
                disabled={busy}
                onPress={() => relink.mutate(person.ref)}
                accessibilityRole="button"
                testID={`twin-huddle-relink-${person.ref}`}
              >
                <Text style={styles.smallButtonText}>{t({ en: 'New link', zh: '换链接' })}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
        {fresh ? (
          <View style={styles.card} testID="twin-huddle-fresh-link">
            <Text style={styles.warning}>
              {t({
                en: `${freshLabel}'s old link no longer works. The new one is shown only now.`,
                zh: `${freshLabel}的旧链接已经失效。新链接只显示这一次，请马上转发。`,
              })}
            </Text>
            <TouchableOpacity style={styles.button} onPress={() => forward(fresh.url)} accessibilityRole="button" testID="twin-huddle-share-fresh">
              <Text style={styles.buttonText}>{t({ en: `Forward to ${freshLabel}`, zh: `转发给${freshLabel}` })}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
      {open ? (
        <TouchableOpacity style={[styles.danger, busy && styles.dim]} disabled={busy} onPress={askCancel} accessibilityRole="button" testID="twin-huddle-cancel">
          <Text style={styles.dangerText}>{t({ en: 'Cancel this plan', zh: '取消这次商量' })}</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );
}

function InvitedPart({ view, now, onView, onFail }: PartProps<TwinHuddleInvitedViewV0>) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const [picks, setPicks] = useState<TwinHuddlePicks>(() => twinHuddlePicksFromAnswer(view.myAnswer));
  const answer = useMutation({
    mutationFn: (slots: TwinHuddleReplyV0['slots']) => mobileTwinHuddleClient().answer(view.id, slots),
    onSuccess: onView,
    onError: onFail,
  });
  const confirm = useMutation({
    mutationFn: (confirmation: TwinHuddleConfirmationV0) => mobileTwinHuddleClient().confirm(view.id, confirmation),
    onSuccess: onView,
    onError: onFail,
  });
  const busy = answer.isPending || confirm.isPending;
  const reply = twinHuddleReplyFromPicks(view.details.candidates.length, picks);
  const pick = (candidate: number, value: 'yes' | 'no'): void => setPicks({ ...picks, [candidate]: value });
  const send = (): void => {
    if (reply) answer.mutate(reply);
  };

  return (
    <>
      {view.canAnswer ? (
        <View style={styles.section}>
          <Text style={styles.label}>{t({ en: 'Which times work for you?', zh: '哪些时间你行？' })}</Text>
          {view.answeredBy === 'twin' ? (
            <Text style={styles.muted}>
              {t({ en: 'Your twin filled in what your calendar shows; the rest is up to you.', zh: '分身已按你的日历填了能答的，剩下的请你来选。' })}
            </Text>
          ) : null}
          {view.details.candidates.map((slot, candidate) => (
            <View key={slot.startAt} style={styles.pickRow}>
              <Text style={[styles.body, styles.grow]}>{t(twinHuddleSlotWords(slot, now))}</Text>
              {(['yes', 'no'] as const).map((value) => (
                <TwinHuddleChip
                  key={value}
                  label={t(TWIN_HUDDLE_ANSWER_WORDS[value])}
                  on={picks[candidate] === value}
                  onPress={() => pick(candidate, value)}
                  testID={`twin-huddle-pick-${candidate}-${value}`}
                />
              ))}
            </View>
          ))}
          <TouchableOpacity style={[styles.button, (!reply || busy) && styles.dim]} disabled={!reply || busy} onPress={send} accessibilityRole="button" testID="twin-huddle-answer">
            <Text style={styles.buttonText}>{t({ en: 'Send my answer', zh: '提交' })}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!view.canAnswer && view.myAnswer ? (
        <View style={styles.section}>
          <Text style={styles.label}>
            {t(view.answeredBy === 'twin' ? { en: 'Your twin answered from your calendar', zh: '分身按你的日历替你答了' } : { en: 'Your answer', zh: '你的回答' })}
          </Text>
          {view.myAnswer.map((slot) => {
            const candidate = view.details.candidates[slot.candidate];
            return candidate ? (
              <Text key={slot.candidate} style={styles.muted}>
                {t(twinHuddleSlotWords(candidate, now))} · {t(TWIN_HUDDLE_ANSWER_WORDS[slot.value])}
              </Text>
            ) : null;
          })}
        </View>
      ) : null}
      {view.chosen ? (
        <View style={styles.section}>
          <Text style={styles.label}>{t(view.status === 'settled' ? { en: 'Settled', zh: '定了' } : { en: 'The time chosen', zh: '选定的时间' })}</Text>
          <Text style={styles.cardTitle}>{t(twinHuddleSlotWords(view.chosen.slot, now))}</Text>
          <Text style={styles.muted}>{t({ en: `${view.confirmedCount} confirmed so far`, zh: `已有 ${view.confirmedCount} 人确认` })}</Text>
          {view.canConfirm ? (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.grow, busy && styles.dim]}
                disabled={busy}
                onPress={() => confirm.mutate('confirmed')}
                accessibilityRole="button"
                testID="twin-huddle-confirm-yes"
              >
                <Text style={styles.buttonText}>{t({ en: "I'm coming", zh: '我来' })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondary, styles.grow, busy && styles.dim]}
                disabled={busy}
                onPress={() => confirm.mutate('declined')}
                accessibilityRole="button"
                testID="twin-huddle-confirm-no"
              >
                <Text style={styles.secondaryText}>{t({ en: "Can't make it", zh: '来不了' })}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {view.myConfirmation ? (
            <Text style={styles.muted}>
              {t(view.myConfirmation === 'confirmed' ? { en: "You said you're coming.", zh: '你说了会来。' } : { en: "You said you can't make it.", zh: '你说了来不了。' })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </>
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
    personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border },
    pickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border },
    grow: { flex: 1 },
    actions: { flexDirection: 'row', gap: 8 },
    button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    secondary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
    smallButton: { minHeight: 36, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    smallButtonText: { color: c.accent, fontSize: 13, fontWeight: '700' },
    danger: { minHeight: 44, marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: c.error, alignItems: 'center', justifyContent: 'center' },
    dangerText: { color: c.error, fontSize: 15, fontWeight: '700' },
    problem: { color: c.error, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    warning: { color: c.warning, fontSize: 13, lineHeight: 19, fontWeight: '600' },
    dim: { opacity: 0.45 },
  });
