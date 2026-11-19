/**
 * TwinHuddleFillCard — 「还缺人？」 / 「带个人」 on a settled plan (TwinHuddleDetailScreen, twinHuddleFill.ts). Rendered only in
 * builds with `EXPO_PUBLIC_TWIN_HUDDLE_FILL=1`. The organizer asks the friends who confirmed, says yes or not this time to
 * whoever would come, and can stop asking; a friend who confirmed brings one person from their own list or forwards a
 * one-time link, and can take them back. When the server has the feature off, or this person has no part in it, it
 * answers 404 and this block shows nothing.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import type { TwinHuddlePersonV0 } from '../../../shared/types/twin-huddle';
import { TWIN_HUDDLE_FILL_LIMITS_V0, type TwinHuddleFillMineV0, type TwinHuddleFillViewV0 } from '../../../shared/types/twin-huddle-fill';
import { TwinHuddleError } from '../../services/twinHuddle';
import {
  TWIN_HUDDLE_FILL_MINE_COPY,
  TWIN_HUDDLE_FILL_UNVERIFIED,
  twinHuddleFillFailureWords,
  twinHuddleFillHintWords,
  twinHuddleFillShareWords,
  twinHuddleFillSummaryWords,
  twinHuddleFillTriesWords,
  twinHuddleFillUntilWords,
  type TwinHuddleFillBringResult,
} from '../../services/twinHuddleFill';
import { mobileTwinHuddleFillClient } from '../../services/twinHuddleFillSession';
import { mobileTwinHuddleClient } from '../../services/twinHuddleSession';

type Words = { en: string; zh: string };

interface Props {
  huddleId: string;
  /** Only the organizer has these: their own names for the people they invited, which say who brought whom. */
  people?: readonly TwinHuddlePersonV0[];
}

const WANTED = Array.from({ length: TWIN_HUDDLE_FILL_LIMITS_V0.wantedMax - TWIN_HUDDLE_FILL_LIMITS_V0.wantedMin + 1 }, (_, index) => TWIN_HUDDLE_FILL_LIMITS_V0.wantedMin + index);

export function TwinHuddleFillCard({ huddleId, people = [] }: Props) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const key = ['twin-huddle', 'fill', huddleId];
  const fill = useQuery({ queryKey: key, queryFn: () => mobileTwinHuddleFillClient().get(huddleId), retry: false });
  const bringing = fill.data?.role === 'bridge' && fill.data.fill !== null;
  // A friend's own list: to pick from, and to put names on the people they already brought.
  const friends = useQuery({ queryKey: ['twin-huddle', 'friends'], queryFn: () => mobileTwinHuddleClient().friends(), enabled: bringing, retry: false, staleTime: 5 * 60 * 1000 });
  const [wanted, setWanted] = useState<number>(TWIN_HUDDLE_FILL_LIMITS_V0.wantedMin);
  const [picking, setPicking] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [problem, setProblem] = useState<Words | null>(null);

  const onFail = (error: unknown): void => {
    setProblem(twinHuddleFillFailureWords(error));
    if (error instanceof TwinHuddleError && error.failure === 'changed') void fill.refetch();
  };
  const change = useMutation({
    mutationFn: (run: () => Promise<TwinHuddleFillViewV0>) => run(),
    onSuccess: (view) => {
      setProblem(null);
      queryClient.setQueryData(key, view);
    },
    onError: onFail,
  });
  const bring = useMutation({
    mutationFn: (friendRef: string | null) => mobileTwinHuddleFillClient().bring(huddleId, friendRef),
    onSuccess: (outcome: TwinHuddleFillBringResult) => {
      setProblem(null);
      setPicking(false);
      setFresh(outcome.route === 'link' ? outcome.url : null);
      queryClient.setQueryData(key, outcome.view);
    },
    onError: onFail,
  });
  const busy = change.isPending || bring.isPending;

  if (fill.isPending) return null;
  if (fill.isError) {
    // Not open on the server, or nothing for this person here: say nothing rather than show an error for a feature they never saw.
    if (fill.error instanceof TwinHuddleError && fill.error.failure === 'not_found') return null;
    return (
      <View style={styles.card} testID="twin-huddle-fill-error">
        <Text style={styles.muted}>{t(twinHuddleFillFailureWords(fill.error))}</Text>
        <TouchableOpacity style={styles.smallButton} onPress={() => void fill.refetch()} accessibilityRole="button" testID="twin-huddle-fill-retry">
          <Text style={styles.smallButtonText}>{t({ en: 'Try again', zh: '重试' })}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const view = fill.data;
  if (view.fill === null && !view.canStart) return null;
  const now = new Date();
  const until = view.fill ? twinHuddleFillUntilWords(view.fill, now) : null;
  const bridgeName = (ref: string): string => people.find((person) => person.ref === ref)?.label ?? t({ en: 'a friend', zh: '一位朋友' });
  const friendName = (item: TwinHuddleFillMineV0): string => {
    if (item.route === 'link') return t({ en: 'Through a link', zh: '走链接' });
    return friends.data?.find((friend) => friend.friendRef === item.friendRef)?.label ?? t({ en: 'Someone from your list', zh: '名单里的一位' });
  };
  const askEnd = (): void => {
    Alert.alert(t({ en: 'Stop asking for more people?', zh: '不再缺人了？' }), t({ en: 'Anyone still waiting hears "not this time". This cannot be opened again.', zh: '还在等的人会看到「这次不了」，结束后不能重新开。' }), [
      { text: t({ en: 'Keep asking', zh: '先不结束' }), style: 'cancel' },
      { text: t({ en: 'Stop asking', zh: '不再缺人' }), style: 'destructive', onPress: () => change.mutate(() => mobileTwinHuddleFillClient().end(huddleId)) },
    ]);
  };
  const forward = (url: string): void => {
    Share.share({ message: t(twinHuddleFillShareWords(url)) }).catch((): void => undefined);
  };

  return (
    <View style={styles.card} testID="twin-huddle-fill-card">
      <Text style={styles.heading}>{t(view.role === 'initiator' ? { en: 'Short of people?', zh: '还缺人？' } : { en: 'Bring someone', zh: '带个人' })}</Text>
      <Text style={styles.muted}>{t(twinHuddleFillHintWords(view))}</Text>
      {view.fill ? (
        <Text style={view.fill.state === 'open' ? styles.alert : styles.muted} testID="twin-huddle-fill-summary">
          {t(twinHuddleFillSummaryWords(view.fill))}
          {until ? ` · ${t(until)}` : ''}
        </Text>
      ) : null}

      {view.role === 'initiator' && view.canStart ? (
        <View style={styles.form}>
          <Text style={styles.label}>{t({ en: 'How many more?', zh: '还缺几个？' })}</Text>
          <View style={styles.inline}>
            {WANTED.map((count) => (
              <TouchableOpacity
                key={count}
                style={count === wanted ? styles.on : styles.smallButton}
                onPress={() => setWanted(count)}
                accessibilityRole="radio"
                accessibilityState={{ selected: count === wanted }}
                testID={`twin-huddle-fill-wanted-${count}`}
              >
                <Text style={count === wanted ? styles.onText : styles.smallButtonText}>{String(count)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.button, busy && styles.dim]}
            disabled={busy}
            onPress={() => change.mutate(() => mobileTwinHuddleFillClient().start(huddleId, wanted))}
            accessibilityRole="button"
            testID="twin-huddle-fill-start"
          >
            <Text style={styles.buttonText}>{t({ en: 'Ask the friends who confirmed', zh: '问问确认要来的朋友' })}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {view.role === 'initiator' && view.fill ? (
        <>
          {view.people.length === 0 && view.fill.state === 'open' ? (
            <Text style={styles.muted} testID="twin-huddle-fill-nobody">
              {t({ en: 'Nobody has said they would come yet.', zh: '还没有人说愿意来。' })}
            </Text>
          ) : null}
          {view.people.map((person) => (
            <View key={person.id} style={styles.row} testID={`twin-huddle-fill-person-${person.id}`}>
              <View style={styles.inline}>
                <Text style={[styles.label, styles.grow]}>{person.label}</Text>
                {person.verified ? null : (
                  <Text style={styles.badge} testID={`twin-huddle-fill-unverified-${person.id}`}>
                    {t(TWIN_HUDDLE_FILL_UNVERIFIED)}
                  </Text>
                )}
              </View>
              <Text style={styles.muted}>
                {t({ en: `Brought by ${bridgeName(person.bridgeRef)}`, zh: `${bridgeName(person.bridgeRef)}带来的` })} ·{' '}
                {t(person.state === 'accepted' ? { en: 'In', zh: '加进来了' } : { en: 'Would come · your call', zh: '愿意来 · 等你点头' })}
              </Text>
              {person.canDecide ? (
                <View style={styles.inline}>
                  <TouchableOpacity
                    style={[styles.on, busy && styles.dim]}
                    disabled={busy}
                    onPress={() => change.mutate(() => mobileTwinHuddleFillClient().decide(huddleId, person.id, 'accept'))}
                    accessibilityRole="button"
                    testID={`twin-huddle-fill-accept-${person.id}`}
                  >
                    <Text style={styles.onText}>{t({ en: 'Yes, come along', zh: '好，来吧' })}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallButton, busy && styles.dim]}
                    disabled={busy}
                    onPress={() => change.mutate(() => mobileTwinHuddleFillClient().decide(huddleId, person.id, 'pass'))}
                    accessibilityRole="button"
                    testID={`twin-huddle-fill-pass-${person.id}`}
                  >
                    <Text style={styles.smallButtonText}>{t({ en: 'Not this time', zh: '先不用' })}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ))}
          {view.canEnd ? (
            <TouchableOpacity style={[styles.remove, busy && styles.dim]} disabled={busy} onPress={askEnd} accessibilityRole="button" testID="twin-huddle-fill-end">
              <Text style={styles.removeText}>{t({ en: 'Stop asking for more people', zh: '不再缺人了' })}</Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}

      {view.role === 'bridge' ? (
        <>
          {view.mine.map((item) => (
            <View key={item.id} style={styles.row} testID={`twin-huddle-fill-mine-${item.id}`}>
              <Text style={styles.label}>{friendName(item)}</Text>
              <Text style={styles.muted}>{t(TWIN_HUDDLE_FILL_MINE_COPY[item.state])}</Text>
              {item.canWithdraw ? (
                <TouchableOpacity
                  style={[styles.remove, busy && styles.dim]}
                  disabled={busy}
                  onPress={() => change.mutate(() => mobileTwinHuddleFillClient().withdraw(huddleId, item.id))}
                  accessibilityRole="button"
                  testID={`twin-huddle-fill-withdraw-${item.id}`}
                >
                  <Text style={styles.removeText}>{t({ en: 'Take back', zh: '撤回' })}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
          {fresh ? (
            <View style={styles.form} testID="twin-huddle-fill-fresh-link">
              <Text style={styles.warning}>{t({ en: 'This link is shown only now. Forward it right away.', zh: '链接只显示这一次，请马上转发。' })}</Text>
              <TouchableOpacity style={styles.button} onPress={() => forward(fresh)} accessibilityRole="button" testID="twin-huddle-fill-share">
                <Text style={styles.buttonText}>{t({ en: 'Forward the link', zh: '转发链接' })}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {view.canBring ? (
            <View style={styles.form}>
              <Text style={styles.muted}>{t(twinHuddleFillTriesWords(view.triesLeft))}</Text>
              {picking ? (
                <View style={styles.list} testID="twin-huddle-fill-friends">
                  {friends.isPending ? <ActivityIndicator /> : null}
                  {friends.isError ? <Text style={styles.muted}>{t(twinHuddleFillFailureWords(friends.error))}</Text> : null}
                  {friends.data?.length === 0 ? <Text style={styles.muted}>{t({ en: 'Nobody on your list yet.', zh: '你的名单里还没有人。' })}</Text> : null}
                  {friends.data?.map((friend) => (
                    <TouchableOpacity
                      key={friend.friendRef}
                      style={[styles.pick, busy && styles.dim]}
                      disabled={busy}
                      onPress={() => bring.mutate(friend.friendRef)}
                      accessibilityRole="button"
                      testID={`twin-huddle-fill-friend-${friend.friendRef}`}
                    >
                      <Text style={styles.body}>{friend.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <TouchableOpacity style={[styles.button, busy && styles.dim]} disabled={busy} onPress={() => setPicking(true)} accessibilityRole="button" testID="twin-huddle-fill-pick">
                  <Text style={styles.buttonText}>{t({ en: 'Pick from my list', zh: '从我的名单里选' })}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.smallButton, busy && styles.dim]} disabled={busy} onPress={() => bring.mutate(null)} accessibilityRole="button" testID="twin-huddle-fill-link">
                <Text style={styles.smallButtonText}>{t({ en: 'Get a link to forward myself', zh: '拿一条链接自己转' })}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      ) : null}

      {problem ? (
        <Text style={styles.problem} testID="twin-huddle-fill-problem">
          {t(problem)}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: { padding: 14, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border, gap: 8 },
    heading: { color: c.textPrimary, fontSize: 16, fontWeight: '700' },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    alert: { color: c.accent, fontSize: 14, fontWeight: '700' },
    body: { color: c.textPrimary, fontSize: 15 },
    label: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    badge: { color: c.warning, fontSize: 12, fontWeight: '700', borderWidth: 1, borderColor: c.warning, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
    form: { gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.border },
    row: { gap: 4, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border },
    list: { gap: 6 },
    pick: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border, justifyContent: 'center' },
    grow: { flex: 1 },
    inline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    smallButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    smallButtonText: { color: c.accent, fontSize: 13, fontWeight: '700' },
    on: { minHeight: 36, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    onText: { color: c.onAccent, fontSize: 13, fontWeight: '700' },
    remove: { minHeight: 36, alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center' },
    removeText: { color: c.error, fontSize: 13, fontWeight: '600' },
    warning: { color: c.warning, fontSize: 13, lineHeight: 19, fontWeight: '600' },
    problem: { color: c.error, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    dim: { opacity: 0.45 },
  });
