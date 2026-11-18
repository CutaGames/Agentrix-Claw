/**
 * TwinFindDetailScreen — 分身 → 帮我找人 → 一次提问 (twinFind.ts, twinFindView.ts). Only in builds with
 * `EXPO_PUBLIC_TWIN_FIND=1`. Two of the three sides open this page.
 *
 * The asker sees one row per friend. A row shows a person only after that person agreed, with the name and the line they
 * wrote themselves; the asker then asks the friend to introduce them, or says not this time, and may end the question.
 * The friend asked picks one person (from their own list, a reminder from their twin, or a name they write), sees how
 * that person is being asked, forwards the link when there is one, takes the introduction back, or says they cannot help.
 * The person introduced has their own page (TwinFindIntroScreen).
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { TWIN_ASK_TOPIC_LABELS_V0 } from '../../../shared/types/twin-ask';
import { TWIN_FIND_LIMITS_V0, type TwinFindAskerViewV0, type TwinFindBridgeViewV0, type TwinFindPersonV0, type TwinFindPickV0 } from '../../../shared/types/twin-find';
import { TwinFindError } from '../../services/twinFind';
import { mobileTwinFindClient } from '../../services/twinFindSession';
import { twinAskWhenWords } from '../../services/twinAskView';
import {
  TWIN_FIND_CLOSED_WORDS,
  TWIN_FIND_LINK_ONCE_WORDS,
  TWIN_FIND_UNVERIFIED_WORDS,
  twinFindBridgeStateWords,
  twinFindFailureWords,
  twinFindOfferNameWords,
  twinFindPersonWords,
  twinFindPickFromForm,
  twinFindPickedWords,
  twinFindPicksLeftWords,
  twinFindProblemWords,
  twinFindShareWords,
  twinFindTally,
  twinFindTallyWords,
  twinFindTimeLeftWords,
  type TwinFindWords,
} from '../../services/twinFindView';
import { TwinAskChip as Chip } from './TwinAskChip';

type DetailRoute = RouteProp<{ TwinFindDetail: { id: string } }, 'TwinFindDetail'>;
type FindView = TwinFindAskerViewV0 | TwinFindBridgeViewV0;

interface PartProps<V extends FindView> {
  view: V;
  now: Date;
  onView: (view: FindView) => void;
  onFail: (error: unknown) => void;
  onProblem: (problem: TwinFindWords | null) => void;
}

const L = TWIN_FIND_LIMITS_V0;

export function TwinFindDetailScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const { id } = useRoute<DetailRoute>().params;
  const queryClient = useQueryClient();
  const find = useQuery({ queryKey: ['twin-find', 'detail', id], queryFn: () => mobileTwinFindClient().get(id) });
  const [problem, setProblem] = useState<TwinFindWords | null>(null);

  const onView = (view: FindView): void => {
    setProblem(null);
    queryClient.setQueryData(['twin-find', 'detail', id], view);
    void queryClient.invalidateQueries({ queryKey: ['twin-find', 'list'] });
  };
  const onFail = (error: unknown): void => {
    setProblem(twinFindFailureWords(error));
    if (error instanceof TwinFindError && (error.failure === 'changed' || error.failure === 'closed' || error.failure === 'pick_limit')) void find.refetch();
  };

  if (find.isPending) {
    return (
      <View style={[styles.screen, styles.center]} testID="twin-find-detail-loading">
        <ActivityIndicator />
      </View>
    );
  }
  if (find.isError) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-find-detail-error">
        <Text style={styles.problem}>{t(twinFindFailureWords(find.error))}</Text>
        <TouchableOpacity style={styles.secondary} onPress={() => void find.refetch()} accessibilityRole="button" testID="twin-find-detail-retry">
          <Text style={styles.secondaryText}>{t({ en: 'Try again', zh: '重试' })}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const view = find.data;
  const now = new Date();
  const topic = t(TWIN_ASK_TOPIC_LABELS_V0[view.topic]);
  const open = view.status === 'open';
  const left = open ? twinFindTimeLeftWords(view.endsAt, now) : null;
  const ended = view.role === 'asker' && view.closedReason ? TWIN_FIND_CLOSED_WORDS[view.closedReason] : { en: 'Ended', zh: '已结束' };
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-find-detail-screen" keyboardShouldPersistTaps="handled">
      <Text style={styles.title} accessibilityRole="header">
        {view.role === 'asker'
          ? t({ en: `${topic} · you are looking for someone`, zh: `${topic} · 我在找人` })
          : t({ en: `${view.askerName} is looking for someone · ${topic}`, zh: `${view.askerName}在找人 · ${topic}` })}
      </Text>
      <View style={styles.card}>
        <Text style={styles.question}>{view.question}</Text>
        <Text style={styles.muted} testID="twin-find-detail-when">
          {t(open ? (left ?? { en: 'Ending now', zh: '马上结束' }) : ended)}
        </Text>
      </View>
      {view.role === 'asker' ? (
        <AskerPart view={view} now={now} onView={onView} onFail={onFail} onProblem={setProblem} />
      ) : (
        <BridgePart view={view} now={now} onView={onView} onFail={onFail} onProblem={setProblem} />
      )}
      {problem ? (
        <Text style={styles.problem} testID="twin-find-detail-problem">
          {t(problem)}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function AskerPart({ view, now, onView, onFail }: PartProps<TwinFindAskerViewV0>) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const open = view.status === 'open';
  const close = useMutation({ mutationFn: () => mobileTwinFindClient().close(view.id), onSuccess: (next) => onView(next), onError: onFail });
  const decide = useMutation({
    mutationFn: (input: { ref: string; agree: boolean }) => (input.agree ? mobileTwinFindClient().accept(view.id, input.ref) : mobileTwinFindClient().pass(view.id, input.ref)),
    onSuccess: (next) => onView(next),
    onError: onFail,
  });
  const busy = close.isPending || decide.isPending;

  const confirmAccept = (person: TwinFindPersonV0): void => {
    Alert.alert(
      t({ en: `Ask ${person.label} to introduce you?`, zh: `请${person.label}牵线？` }),
      t({
        en: `${person.label} will bring the two of you together. No contact details are exchanged here.`,
        zh: `${person.label}会把你们拉到一起。平台不交换联系方式。`,
      }),
      [
        { text: t({ en: 'Not yet', zh: '再想想' }), style: 'cancel' },
        { text: t({ en: 'Yes, please', zh: '请 TA 牵线' }), onPress: () => decide.mutate({ ref: person.ref, agree: true }) },
      ],
    );
  };
  const confirmPass = (person: TwinFindPersonV0): void => {
    Alert.alert(
      t({ en: 'Not this time?', zh: '这次先不用？' }),
      t({ en: `${person.label} and the person they asked are told it did not go ahead, nothing more.`, zh: `${person.label}和对方只会知道这次没有继续，不会知道别的。` }),
      [
        { text: t({ en: 'Go back', zh: '返回' }), style: 'cancel' },
        { text: t({ en: 'Not this time', zh: '先不用' }), style: 'destructive', onPress: () => decide.mutate({ ref: person.ref, agree: false }) },
      ],
    );
  };
  const confirmClose = (): void => {
    Alert.alert(
      t({ en: 'End this question now?', zh: '现在结束这次提问？' }),
      t({ en: 'Introductions that are not settled yet stop, and the links stop working. People you were already introduced to stay.', zh: '还没定下来的介绍会停下，发出去的链接也会失效。已经牵上的不受影响。' }),
      [
        { text: t({ en: 'Keep it open', zh: '先不结束' }), style: 'cancel' },
        { text: t({ en: 'End it', zh: '结束' }), style: 'destructive', onPress: () => close.mutate() },
      ],
    );
  };

  return (
    <>
      <Text style={styles.muted} testID="twin-find-tally">
        {t(twinFindTallyWords(twinFindTally(view.people)))}
      </Text>
      {view.people.map((person) => {
        const offer = person.offer;
        return (
          <View key={person.ref} style={styles.card} testID={`twin-find-person-${person.ref}`}>
            <Text style={styles.personLabel} numberOfLines={1}>
              {person.label}
            </Text>
            <Text style={person.state === 'offered' ? styles.alert : styles.muted} testID={`twin-find-person-state-${person.ref}`}>
              {t(twinFindPersonWords(person))}
            </Text>
            {offer ? (
              <View style={styles.offer} testID={`twin-find-offer-${person.ref}`}>
                <Text style={styles.offerName}>{t(twinFindOfferNameWords(offer))}</Text>
                {offer.line ? <Text style={styles.body}>{offer.line}</Text> : null}
                {offer.note ? <Text style={styles.muted}>{t({ en: `${person.label}: ${offer.note}`, zh: `${person.label}说：${offer.note}` })}</Text> : null}
                {offer.verified ? null : <Text style={styles.muted}>{t(TWIN_FIND_UNVERIFIED_WORDS)}</Text>}
              </View>
            ) : null}
            {person.connectedAt ? <Text style={styles.muted}>{t(twinAskWhenWords(new Date(person.connectedAt), now))}</Text> : null}
            {open && person.state === 'offered' ? (
              <View style={styles.actions}>
                <TouchableOpacity style={[styles.button, styles.grow, busy && styles.dim]} onPress={() => confirmAccept(person)} disabled={busy} accessibilityRole="button" testID={`twin-find-accept-${person.ref}`}>
                  <Text style={styles.buttonText}>{t({ en: 'Ask them to introduce us', zh: '请 TA 牵线' })}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.secondary, busy && styles.dim]} onPress={() => confirmPass(person)} disabled={busy} accessibilityRole="button" testID={`twin-find-pass-${person.ref}`}>
                  <Text style={styles.secondaryText}>{t({ en: 'Not this time', zh: '先不用' })}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      })}
      {open ? (
        <TouchableOpacity style={[styles.secondary, busy && styles.dim]} onPress={confirmClose} disabled={busy} accessibilityRole="button" testID="twin-find-close">
          <Text style={styles.secondaryText}>{t({ en: 'End this question', zh: '结束这次提问' })}</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );
}

function BridgePart({ view, onView, onFail, onProblem }: PartProps<TwinFindBridgeViewV0>) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const [friendRef, setFriendRef] = useState<string | null>(null);
  const [guestLabel, setGuestLabel] = useState('');
  const [note, setNote] = useState('');
  // A link is shown once, right after it was made. It is kept only while this page is open.
  const [url, setUrl] = useState<string | null>(null);
  const friends = useQuery({ queryKey: ['twin-find', 'friends'], queryFn: () => mobileTwinFindClient().friends(), enabled: view.canPick });
  const pick = useMutation({
    mutationFn: (value: TwinFindPickV0) => mobileTwinFindClient().pick(view.id, value),
    onSuccess: (outcome) => {
      setUrl(outcome.url);
      setFriendRef(null);
      setGuestLabel('');
      setNote('');
      onView(outcome.view);
    },
    onError: onFail,
  });
  const relink = useMutation({
    mutationFn: () => mobileTwinFindClient().relink(view.id),
    onSuccess: (outcome) => {
      onProblem(null);
      setUrl(outcome.url);
    },
    onError: onFail,
  });
  const decline = useMutation({ mutationFn: () => mobileTwinFindClient().decline(view.id), onSuccess: (next) => onView(next), onError: onFail });
  const withdraw = useMutation({
    mutationFn: () => mobileTwinFindClient().withdraw(view.id),
    onSuccess: (next) => {
      setUrl(null);
      onView(next);
    },
    onError: onFail,
  });
  const busy = pick.isPending || relink.isPending || decline.isPending || withdraw.isPending;
  const picked = view.picked;
  const link = url !== null && view.canRelink ? url : null;
  const suggested = view.suggestions;
  const others = (friends.data ?? []).filter((friend) => !suggested.some((item) => item.ref === friend.friendRef));

  const choose = (ref: string): void => {
    setFriendRef(friendRef === ref ? null : ref);
    setGuestLabel('');
  };
  const typeGuest = (text: string): void => {
    setGuestLabel(text);
    if (text.length > 0) setFriendRef(null);
  };
  const submit = (): void => {
    const decoded = twinFindPickFromForm({ friendRef, guestLabel, note });
    if (decoded.ok === false) {
      onProblem(twinFindProblemWords(decoded.reasonCode, decoded.field));
      return;
    }
    onProblem(null);
    pick.mutate(decoded.value);
  };
  const forward = (target: string): void => {
    Share.share({ message: t(twinFindShareWords(target)) }).catch((): void => undefined);
  };
  const confirmWithdraw = (): void => {
    Alert.alert(
      t({ en: 'Take this introduction back?', zh: '撤回这次介绍？' }),
      t({ en: `${view.askerName} will no longer see them, and a link you sent stops working.`, zh: `${view.askerName}就看不到对方了，发出去的链接也会失效。` }),
      [
        { text: t({ en: 'Keep it', zh: '先不撤' }), style: 'cancel' },
        { text: t({ en: 'Take it back', zh: '撤回' }), style: 'destructive', onPress: () => withdraw.mutate() },
      ],
    );
  };

  return (
    <>
      <Text style={view.canPick || view.myState === 'connected' ? styles.alert : styles.muted} testID="twin-find-my-state">
        {t(twinFindBridgeStateWords(view.myState, view.status))}
      </Text>
      {picked ? (
        <View style={styles.card} testID="twin-find-picked">
          <Text style={styles.personLabel}>{t(twinFindPickedWords(picked))}</Text>
          {picked.note ? <Text style={styles.muted}>{t({ en: `You wrote: ${picked.note}`, zh: `你写的介绍：${picked.note}` })}</Text> : null}
          {link ? (
            <>
              <Text style={styles.warning}>{t(TWIN_FIND_LINK_ONCE_WORDS)}</Text>
              <TouchableOpacity style={styles.button} onPress={() => forward(link)} accessibilityRole="button" testID="twin-find-share">
                <Text style={styles.buttonText}>{t({ en: 'Forward the link', zh: '转发链接' })}</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {view.canRelink && !link ? (
            <TouchableOpacity style={[styles.secondary, busy && styles.dim]} onPress={() => relink.mutate()} disabled={busy} accessibilityRole="button" testID="twin-find-relink">
              <Text style={styles.secondaryText}>{t({ en: 'Make a new link', zh: '换一条新链接' })}</Text>
            </TouchableOpacity>
          ) : null}
          {view.canWithdraw ? (
            <TouchableOpacity style={[styles.secondary, busy && styles.dim]} onPress={confirmWithdraw} disabled={busy} accessibilityRole="button" testID="twin-find-withdraw">
              <Text style={styles.secondaryText}>{t({ en: 'Take the introduction back', zh: '撤回介绍' })}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {view.canPick ? (
        <View style={styles.card} testID="twin-find-pick-form">
          <Text style={styles.label}>{t({ en: 'Who could it be?', zh: '你想到谁？' })}</Text>
          <Text style={styles.muted}>
            {t({
              en: `They are asked first and decide for themselves. ${view.askerName} sees nothing about them unless they agree.`,
              zh: `会先去问对方，由对方自己决定。对方没同意，${view.askerName}什么都看不到。`,
            })}
          </Text>
          {suggested.length > 0 ? (
            <>
              <Text style={styles.muted}>{t({ en: 'Your twin thinks of these from your relationship book:', zh: '分身从你的关系簿里想到这几位：' })}</Text>
              <View style={styles.chips}>
                {suggested.map((item) => (
                  <Chip key={item.ref} label={item.label} on={friendRef === item.ref} onPress={() => choose(item.ref)} testID={`twin-find-suggestion-${item.ref}`} />
                ))}
              </View>
            </>
          ) : null}
          {friends.isPending ? <ActivityIndicator /> : null}
          {others.length > 0 ? (
            <>
              <Text style={styles.muted}>{t({ en: 'From your friends:', zh: '从朋友名单里选：' })}</Text>
              <View style={styles.chips}>
                {others.map((friend) => (
                  <Chip key={friend.friendRef} label={friend.label} on={friendRef === friend.friendRef} onPress={() => choose(friend.friendRef)} testID={`twin-find-candidate-${friend.friendRef}`} />
                ))}
              </View>
            </>
          ) : null}
          <Text style={styles.muted}>
            {t({
              en: 'Or write a name. You get a link to forward; they answer without signing up, and the name they give is marked unverified.',
              zh: '或者写一个称呼：会生成一条链接由你转发，对方不用注册就能表态，对方填的称呼会标「未验证」。',
            })}
          </Text>
          <TextInput
            style={styles.input}
            value={guestLabel}
            onChangeText={typeGuest}
            maxLength={L.labelMax}
            placeholder={t({ en: 'e.g. Master Li', zh: '比如：李师傅' })}
            returnKeyType="done"
            testID="twin-find-guest-input"
          />
          <Text style={styles.label}>{t({ en: 'A line of introduction (optional)', zh: '一句介绍（可以不写）' })}</Text>
          <TextInput
            style={[styles.input, styles.note]}
            value={note}
            onChangeText={setNote}
            maxLength={L.noteMax}
            multiline
            placeholder={t({ en: 'e.g. He renovated our flat', zh: '比如：我家就是他装的' })}
            testID="twin-find-note"
          />
          <Text style={styles.muted}>
            {t({
              en: `The person you pick sees it; ${view.askerName} sees it once they agreed. No contact details, links or addresses.`,
              zh: `你选的人看得到；对方同意以后${view.askerName}也看得到。不要写联系方式、链接或地址。`,
            })}
          </Text>
          <Text style={styles.muted} testID="twin-find-picks-left">
            {t(twinFindPicksLeftWords(view.picksLeft))}
          </Text>
          <TouchableOpacity style={[styles.button, busy && styles.dim]} onPress={submit} disabled={busy} accessibilityRole="button" testID="twin-find-pick">
            {pick.isPending ? <ActivityIndicator /> : <Text style={styles.buttonText}>{t({ en: 'Ask them', zh: '去问问 TA' })}</Text>}
          </TouchableOpacity>
        </View>
      ) : null}
      {view.canDecline ? (
        <TouchableOpacity style={[styles.secondary, busy && styles.dim]} onPress={() => decline.mutate()} disabled={busy} accessibilityRole="button" testID="twin-find-decline">
          <Text style={styles.secondaryText}>{t({ en: "I can't help with this one", zh: '这次帮不上' })}</Text>
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
    title: { color: c.textPrimary, fontSize: 18, fontWeight: '800' },
    card: { padding: 14, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border, gap: 6 },
    question: { color: c.textPrimary, fontSize: 16, lineHeight: 23 },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    body: { color: c.textPrimary, fontSize: 14, lineHeight: 20 },
    label: { color: c.textSecondary, fontSize: 13, fontWeight: '600' },
    alert: { color: c.accent, fontSize: 14, lineHeight: 20, fontWeight: '700' },
    warning: { color: c.warning, fontSize: 13, lineHeight: 19, fontWeight: '600' },
    problem: { color: c.error, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    personLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    offer: { paddingTop: 8, marginTop: 2, borderTopWidth: 1, borderTopColor: c.border, gap: 4 },
    offerName: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
    grow: { flex: 1 },
    dim: { opacity: 0.45 },
    input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, color: c.textPrimary, backgroundColor: c.bgPrimary },
    note: { minHeight: 66, paddingTop: 10, textAlignVertical: 'top' },
    button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    secondary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
  });
