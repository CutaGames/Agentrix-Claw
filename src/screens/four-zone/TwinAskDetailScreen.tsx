/**
 * TwinAskDetailScreen — 分身 → 问遍身边人 → 一个问题 (twinAsk.ts, twinAskView.ts). Only in builds with
 * `EXPO_PUBLIC_TWIN_ASK=1`. The asker sees the summary card: who answered, how (their twin passing on what they wrote,
 * the person, or an unverified link answer) and the words; ends the question early or gets a fresh link for someone who
 * lost theirs. The person asked answers (and may keep the answer for their twin), says they'd rather not, or withdraws
 * what they or their twin said. Where the server offers it and this phone has a registered key, sending an answer first
 * asks the person to confirm on the phone (twinAskDeviceProof.ts); the asker then sees it was confirmed on their own phone.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import {
  TWIN_ASK_LIMITS_V0,
  TWIN_ASK_TOPIC_LABELS_V0,
  type TwinAskAskerViewV0,
  type TwinAskInvitedViewV0,
  type TwinAskReplyV0,
} from '../../../shared/types/twin-ask';
import { TwinAskError } from '../../services/twinAsk';
import { TWIN_ASK_DEVICE_PROOF_WORDS as PROOF, twinAskDeviceProof, twinAskDeviceProofOffered } from '../../services/twinAskDeviceProof';
import { twinAskDeviceProofDeps, twinAskDeviceProofReadiness } from '../../services/twinAskDeviceProofSession';
import { mobileTwinAskClient } from '../../services/twinAskSession';
import { TwinTelegramForward } from './TwinTelegramForward';
import {
  TWIN_ASK_CLOSED_WORDS,
  TWIN_ASK_ROUTE_WORDS,
  twinAskCanRelink,
  twinAskFailureWords,
  twinAskMyStateWords,
  twinAskPersonLabel,
  twinAskPersonWords,
  twinAskProblemWords,
  twinAskReceiptWords,
  twinAskReplyFromForm,
  twinAskShareWords,
  twinAskTally,
  twinAskTallyWords,
  twinAskTimeLeftWords,
  twinAskWhenWords,
  type TwinAskWords,
} from '../../services/twinAskView';

type DetailRoute = RouteProp<{ TwinAskDetail: { id: string } }, 'TwinAskDetail'>;
type AskView = TwinAskAskerViewV0 | TwinAskInvitedViewV0;

interface PartProps<V extends AskView> {
  view: V;
  now: Date;
  onView: (view: AskView) => void;
  onFail: (error: unknown) => void;
}

const L = TWIN_ASK_LIMITS_V0;
const KEEP_WORDS: TwinAskWords = { en: 'Let my twin use this next time', zh: '以后这类问题让分身直接用这句' };

export function TwinAskDetailScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const { id } = useRoute<DetailRoute>().params;
  const queryClient = useQueryClient();
  const ask = useQuery({ queryKey: ['twin-ask', 'detail', id], queryFn: () => mobileTwinAskClient().get(id) });
  const [problem, setProblem] = useState<TwinAskWords | null>(null);

  const onView = (view: AskView): void => {
    setProblem(null);
    queryClient.setQueryData(['twin-ask', 'detail', id], view);
    void queryClient.invalidateQueries({ queryKey: ['twin-ask', 'list'] });
  };
  const onFail = (error: unknown): void => {
    setProblem(twinAskFailureWords(error));
    if (error instanceof TwinAskError && error.failure === 'changed') void ask.refetch();
  };

  if (ask.isPending) {
    return (
      <View style={[styles.screen, styles.center]} testID="twin-ask-detail-loading">
        <ActivityIndicator />
      </View>
    );
  }
  if (ask.isError) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-ask-detail-error">
        <Text style={styles.problem}>{t(twinAskFailureWords(ask.error))}</Text>
        <TouchableOpacity style={styles.secondary} onPress={() => void ask.refetch()} accessibilityRole="button" testID="twin-ask-detail-retry">
          <Text style={styles.secondaryText}>{t({ en: 'Try again', zh: '重试' })}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const view = ask.data;
  const now = new Date();
  const topic = t(TWIN_ASK_TOPIC_LABELS_V0[view.topic]);
  const open = view.status === 'open';
  const left = open ? twinAskTimeLeftWords(view.endsAt, now) : null;
  const ended = view.role === 'asker' && view.closedReason ? TWIN_ASK_CLOSED_WORDS[view.closedReason] : { en: 'Ended', zh: '已结束' };
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-ask-detail-screen" keyboardShouldPersistTaps="handled">
      <Text style={styles.title} accessibilityRole="header">
        {view.role === 'asker' ? t({ en: `${topic} · you asked`, zh: `${topic} · 我问的` }) : t({ en: `${view.askerName} asked you · ${topic}`, zh: `${view.askerName}问你 · ${topic}` })}
      </Text>
      <View style={styles.card}>
        <Text style={styles.question}>{view.question}</Text>
        <Text style={styles.muted} testID="twin-ask-detail-when">
          {t(open ? (left ?? { en: 'Ending now', zh: '马上结束' }) : ended)}
        </Text>
      </View>
      {view.role === 'asker' ? (
        <AskerPart view={view} now={now} onView={onView} onFail={onFail} />
      ) : (
        <InvitedPart view={view} now={now} onView={onView} onFail={onFail} />
      )}
      {problem ? (
        <Text style={styles.problem} testID="twin-ask-detail-problem">
          {t(problem)}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function AskerPart({ view, now, onView, onFail }: PartProps<TwinAskAskerViewV0>) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const [fresh, setFresh] = useState<{ ref: string; url: string } | null>(null);
  const close = useMutation({ mutationFn: () => mobileTwinAskClient().close(view.id), onSuccess: onView, onError: onFail });
  const relink = useMutation({
    mutationFn: (ref: string) => mobileTwinAskClient().relink(view.id, ref),
    onSuccess: (link) => setFresh(link),
    onError: onFail,
  });
  const busy = close.isPending || relink.isPending;
  const receipt = twinAskReceiptWords(view);

  const forward = (url: string): void => {
    Share.share({ message: t(twinAskShareWords(url)) }).catch((): void => undefined);
  };
  const askClose = (): void => {
    Alert.alert(
      t({ en: 'End this question now?', zh: '现在结束这个问题？' }),
      t({ en: 'No more answers come in after that, and the links stop working.', zh: '结束后不再收回答，发出去的链接也会失效。' }),
      [
        { text: t({ en: 'Keep it open', zh: '先不结束' }), style: 'cancel' },
        { text: t({ en: 'End it', zh: '结束' }), style: 'destructive', onPress: () => close.mutate() },
      ],
    );
  };

  return (
    <>
      <View style={styles.section} testID="twin-ask-summary">
        <Text style={styles.label}>{t({ en: 'Answers', zh: '回答汇总' })}</Text>
        <Text style={styles.alert} testID="twin-ask-tally">
          {t(twinAskTallyWords(twinAskTally(view.people)))}
        </Text>
        {view.people.map((person) => (
          <View key={person.ref} style={styles.card} testID={`twin-ask-person-${person.ref}`}>
            <View style={styles.personHead}>
              <Text style={[styles.cardTitle, styles.grow]} numberOfLines={1}>
                {person.label}
              </Text>
              <Text style={person.answeredBy === 'guest' ? styles.badgeWarn : styles.badge}>{t(twinAskPersonWords(person))}</Text>
            </View>
            <Text style={styles.muted}>
              {t(TWIN_ASK_ROUTE_WORDS[person.via])}
              {person.answeredAt ? ` · ${t(twinAskWhenWords(new Date(person.answeredAt), now))}` : ''}
            </Text>
            {person.parts.map((part, index) => (
              <Text key={index} style={styles.quote}>
                {part}
              </Text>
            ))}
            {person.answeredBy === 'twin' ? (
              <Text style={styles.muted}>{t({ en: 'Their twin passed on what they wrote, word for word.', zh: '对方分身原样转述了本人写好的话。' })}</Text>
            ) : null}
            {person.answeredBy === 'guest' ? (
              <Text style={styles.warning}>{t({ en: 'Answered by link without signing in, so it may not be them.', zh: '通过链接免登录回答，无法确认是本人。' })}</Text>
            ) : null}
            {twinAskCanRelink(view, person, now) ? (
              <TouchableOpacity
                style={[styles.smallButton, busy && styles.dim]}
                disabled={busy}
                onPress={() => relink.mutate(person.ref)}
                accessibilityRole="button"
                testID={`twin-ask-relink-${person.ref}`}
              >
                <Text style={styles.smallButtonText}>{t({ en: 'New link', zh: '换个链接' })}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
        {fresh ? (
          <View style={styles.card} testID="twin-ask-fresh-link">
            <Text style={styles.body}>
              {t({
                en: `New link for ${twinAskPersonLabel(fresh.ref, view.people)}. The old one no longer works.`,
                zh: `已给${twinAskPersonLabel(fresh.ref, view.people)}换了新链接，旧链接作废。`,
              })}
            </Text>
            <TouchableOpacity style={styles.smallButton} onPress={() => forward(fresh.url)} accessibilityRole="button" testID="twin-ask-fresh-forward">
              <Text style={styles.smallButtonText}>{t({ en: 'Forward', zh: '转发' })}</Text>
            </TouchableOpacity>
            <TwinTelegramForward kind="ask" url={fresh.url} layout="stack" testID="twin-ask-fresh-telegram" />
          </View>
        ) : null}
        {receipt ? (
          <Text style={styles.muted} testID="twin-ask-receipt">
            {t(receipt)}
          </Text>
        ) : null}
      </View>
      {view.status === 'open' ? (
        <TouchableOpacity style={[styles.danger, busy && styles.dim]} disabled={busy} onPress={askClose} accessibilityRole="button" testID="twin-ask-close">
          <Text style={styles.dangerText}>{t({ en: 'End this question', zh: '结束这个问题' })}</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );
}

function InvitedPart({ view, onView, onFail }: PartProps<TwinAskInvitedViewV0>) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const [text, setText] = useState('');
  const [keep, setKeep] = useState(false);
  const [problem, setProblem] = useState<TwinAskWords | null>(null);
  /** The confirmation on the phone did not go through: nothing was sent, the words are still in the box. */
  const [unconfirmed, setUnconfirmed] = useState<TwinAskWords | null>(null);
  const offered = twinAskDeviceProofOffered(view);
  const readiness = useQuery({ queryKey: ['twin-ask', 'device-proof-readiness'], queryFn: twinAskDeviceProofReadiness, enabled: offered, staleTime: 0 });
  const answer = useMutation({
    mutationFn: async (input: { reply: TwinAskReplyV0; confirm: boolean }): Promise<TwinAskInvitedViewV0 | 'cancelled' | 'failed'> => {
      if (!input.confirm) return mobileTwinAskClient().answer(view.id, input.reply);
      const proof = await twinAskDeviceProof(view, input.reply.text, await twinAskDeviceProofDeps(t(PROOF.prompt)));
      if (proof.kind === 'cancelled' || proof.kind === 'failed') return proof.kind;
      return mobileTwinAskClient().answer(view.id, proof.kind === 'signed' ? { ...input.reply, deviceProof: proof.proof } : input.reply);
    },
    onSuccess: (next) => {
      if (next === 'cancelled' || next === 'failed') {
        setUnconfirmed(PROOF[next]);
        return;
      }
      setText('');
      setKeep(false);
      setUnconfirmed(null);
      onView(next);
    },
    onError: (error) => {
      if (error instanceof TwinAskError && error.failure === 'device_proof_rejected') {
        setUnconfirmed(twinAskFailureWords(error));
        return;
      }
      setUnconfirmed(null);
      onFail(error);
    },
  });
  const decline = useMutation({ mutationFn: () => mobileTwinAskClient().decline(view.id), onSuccess: onView, onError: onFail });
  const withdraw = useMutation({ mutationFn: () => mobileTwinAskClient().withdraw(view.id), onSuccess: onView, onError: onFail });
  const busy = answer.isPending || decline.isPending || withdraw.isPending;

  /** `confirm: false` is the person choosing to send without the phone's confirmation. */
  const send = (confirm: boolean): void => {
    const reply = twinAskReplyFromForm(text, keep, view.canSaveAsFact);
    setUnconfirmed(null);
    if (reply.ok === false) {
      setProblem(twinAskProblemWords(reply.reasonCode, reply.field));
      return;
    }
    setProblem(null);
    answer.mutate({ reply: reply.value, confirm });
  };
  const askWithdraw = (): void => {
    Alert.alert(
      t(view.answeredBy === 'twin' ? { en: "Withdraw your twin's answer?", zh: '撤回分身替你给的回答？' } : { en: 'Withdraw your answer?', zh: '撤回你的回答？' }),
      t({ en: `${view.askerName} will no longer see it.`, zh: `${view.askerName}就看不到这条回答了。` }),
      [
        { text: t({ en: 'Keep it', zh: '先不撤回' }), style: 'cancel' },
        { text: t({ en: 'Withdraw', zh: '撤回' }), style: 'destructive', onPress: () => withdraw.mutate() },
      ],
    );
  };

  return (
    <>
      <Text style={view.myState === 'needs_me' ? styles.alert : styles.muted} testID="twin-ask-my-state">
        {t(twinAskMyStateWords(view))}
      </Text>
      {view.myParts.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.label}>{t(view.answeredBy === 'twin' ? { en: 'What your twin passed on', zh: '分身转述的话' } : { en: 'Your answer', zh: '你的回答' })}</Text>
          {view.myParts.map((part, index) => (
            <Text key={index} style={styles.quote}>
              {part}
            </Text>
          ))}
        </View>
      ) : null}
      {view.canAnswer ? (
        <View style={styles.section}>
          <Text style={styles.label}>{t({ en: 'Answer', zh: '回答' })}</Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            maxLength={L.replyMax}
            multiline
            placeholder={t({ en: 'Say it in your own words', zh: '用你自己的话说' })}
            accessibilityLabel={t({ en: 'Answer', zh: '回答' })}
            testID="twin-ask-answer-input"
          />
          <Text style={styles.muted}>
            {t({
              en: `Up to ${L.replyMax} characters. No contact details, links, addresses or children's names.`,
              zh: `最多 ${L.replyMax} 个字。不要写联系方式、链接、地址或孩子的名字。`,
            })}
          </Text>
          {view.canSaveAsFact ? (
            <View style={styles.switchRow}>
              <View style={styles.grow}>
                <Text style={styles.body}>{t(KEEP_WORDS)}</Text>
                <Text style={styles.muted}>
                  {t({ en: 'Saved with the things your twin may tell friends; you can change it in settings.', zh: '存进「分身可以告诉朋友的话」，可以在设置里改。' })}
                </Text>
              </View>
              <Switch value={keep} onValueChange={setKeep} accessibilityLabel={t(KEEP_WORDS)} testID="twin-ask-keep" />
            </View>
          ) : null}
          {problem ? (
            <Text style={styles.problem} testID="twin-ask-answer-problem">
              {t(problem)}
            </Text>
          ) : null}
          <TouchableOpacity style={[styles.button, busy && styles.dim]} disabled={busy} onPress={() => send(true)} accessibilityRole="button" testID="twin-ask-answer">
            {answer.isPending ? <ActivityIndicator /> : <Text style={styles.buttonText}>{t({ en: 'Send', zh: '发送' })}</Text>}
          </TouchableOpacity>
          {offered && readiness.data === 'ready' ? (
            <Text style={styles.muted} testID="twin-ask-device-proof-hint">
              {t(PROOF.hint)}
            </Text>
          ) : null}
          {offered && readiness.data === 'no_key' ? (
            <Text style={styles.muted} testID="twin-ask-device-proof-no-key">
              {t(PROOF.noKey)}
            </Text>
          ) : null}
          {unconfirmed ? (
            <View style={styles.section}>
              <Text style={styles.problem} testID="twin-ask-device-proof-problem">
                {t(unconfirmed)}
              </Text>
              <TouchableOpacity style={[styles.secondary, busy && styles.dim]} disabled={busy} onPress={() => send(true)} accessibilityRole="button" testID="twin-ask-device-proof-again">
                <Text style={styles.secondaryText}>{t(PROOF.again)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondary, busy && styles.dim]} disabled={busy} onPress={() => send(false)} accessibilityRole="button" testID="twin-ask-device-proof-plain">
                <Text style={styles.secondaryText}>{t(PROOF.plain)}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}
      {view.canDecline ? (
        <TouchableOpacity style={[styles.secondary, busy && styles.dim]} disabled={busy} onPress={() => decline.mutate()} accessibilityRole="button" testID="twin-ask-decline">
          <Text style={styles.secondaryText}>{t({ en: "I'd rather not answer", zh: '不想回答' })}</Text>
        </TouchableOpacity>
      ) : null}
      {view.canWithdraw ? (
        <TouchableOpacity style={[styles.danger, busy && styles.dim]} disabled={busy} onPress={askWithdraw} accessibilityRole="button" testID="twin-ask-withdraw">
          <Text style={styles.dangerText}>{t(view.answeredBy === 'twin' ? { en: "Withdraw my twin's answer", zh: '撤回分身的回答' } : { en: 'Withdraw my answer', zh: '撤回我的回答' })}</Text>
        </TouchableOpacity>
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
    question: { color: c.textPrimary, fontSize: 17, lineHeight: 24, fontWeight: '600' },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    alert: { color: c.accent, fontSize: 14, fontWeight: '700' },
    body: { color: c.textPrimary, fontSize: 15 },
    label: { color: c.textSecondary, fontSize: 13, fontWeight: '600' },
    section: { gap: 8, marginTop: 8 },
    card: { padding: 14, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border, gap: 6 },
    cardTitle: { color: c.textPrimary, fontSize: 16, fontWeight: '700' },
    personHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    badge: { color: c.textSecondary, fontSize: 12, fontWeight: '700' },
    badgeWarn: { color: c.warning, fontSize: 12, fontWeight: '700' },
    quote: { color: c.textPrimary, fontSize: 15, lineHeight: 22, paddingLeft: 10, borderLeftWidth: 3, borderLeftColor: c.border },
    input: {
      minHeight: 96,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgCard,
      color: c.textPrimary,
      fontSize: 15,
      textAlignVertical: 'top',
    },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    grow: { flex: 1 },
    button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    secondary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
    smallButton: { alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    smallButtonText: { color: c.accent, fontSize: 13, fontWeight: '700' },
    danger: { minHeight: 44, marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: c.error, alignItems: 'center', justifyContent: 'center' },
    dangerText: { color: c.error, fontSize: 15, fontWeight: '700' },
    problem: { color: c.error, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    warning: { color: c.warning, fontSize: 13, lineHeight: 19, fontWeight: '600' },
    dim: { opacity: 0.45 },
  });
