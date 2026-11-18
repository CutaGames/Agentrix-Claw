/**
 * TwinAskStartScreen — 分身 → 问遍身边人 → 问朋友 (twinAsk.ts, twinAskView.ts). Only in builds with `EXPO_PUBLIC_TWIN_ASK=1`.
 * Pick a topic, write the question, pick friends from the relationship book and add names for people who are not on
 * Agentrix. Links for people reached by link come back once, right after asking, for you to forward yourself.
 */
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import {
  TWIN_ASK_LIMITS_V0,
  TWIN_ASK_TOPIC_LABELS_V0,
  TWIN_ASK_TOPICS_V0,
  twinAskQuestionIsOwnerOnlyV0,
  type TwinAskRequestV0,
  type TwinAskTopicV0,
} from '../../../shared/types/twin-ask';
import { TWIN_ASK_REFUSAL_COPY } from '../../services/twinAsk';
import { mobileTwinAskClient } from '../../services/twinAskSession';
import { TwinTelegramForward } from './TwinTelegramForward';
import {
  TWIN_ASK_OWNER_ONLY_WORDS,
  TWIN_ASK_ROUTE_WORDS,
  twinAskFailureWords,
  twinAskProblemWords,
  twinAskRequestFromForm,
  twinAskShareWords,
  twinAskStartedPeople,
  type TwinAskWords,
} from '../../services/twinAskView';
import { TwinAskChip as Chip } from './TwinAskChip';

const LIMITS = TWIN_ASK_LIMITS_V0;
const OPEN_HOURS = Math.round(LIMITS.openMs / (60 * 60 * 1000));

export function TwinAskStartScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<{ goBack: () => void }>();
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState<TwinAskTopicV0>('food');
  const [question, setQuestion] = useState('');
  const [friendRefs, setFriendRefs] = useState<string[]>([]);
  const [guestLabels, setGuestLabels] = useState<string[]>([]);
  const [guestDraft, setGuestDraft] = useState('');
  const [problem, setProblem] = useState<TwinAskWords | null>(null);
  const friends = useQuery({ queryKey: ['twin-ask', 'friends'], queryFn: () => mobileTwinAskClient().friends() });
  const start = useMutation({
    mutationFn: (request: TwinAskRequestV0) => mobileTwinAskClient().start(request),
    onSuccess: (outcome) => {
      if (outcome.started) void queryClient.invalidateQueries({ queryKey: ['twin-ask', 'list'] });
    },
    onError: (error) => setProblem(twinAskFailureWords(error)),
  });
  const people = friendRefs.length + guestLabels.length;
  const full = people >= LIMITS.peopleMax;
  const ownerOnly = twinAskQuestionIsOwnerOnlyV0(topic, question);
  const outcome = start.data;

  const pickFriend = (ref: string): void => {
    if (friendRefs.includes(ref)) setFriendRefs(friendRefs.filter((item) => item !== ref));
    else if (!full) setFriendRefs([...friendRefs, ref]);
  };
  const addGuest = (): void => {
    const label = guestDraft.trim();
    if (label.length === 0 || full) return;
    if (!guestLabels.includes(label)) setGuestLabels([...guestLabels, label]);
    setGuestDraft('');
  };
  const submit = (): void => {
    const request = twinAskRequestFromForm({ topic, question, friendRefs, guestLabels });
    if (request.ok === false) {
      setProblem(twinAskProblemWords(request.reasonCode, request.field));
      return;
    }
    setProblem(null);
    start.mutate(request.value);
  };
  const forward = (url: string): void => {
    Share.share({ message: t(twinAskShareWords(url)) }).catch((): void => undefined);
  };

  if (outcome && outcome.started === true) {
    const asked = twinAskStartedPeople(outcome, friends.data ?? [], start.variables?.guestLabels ?? []);
    const hasLinks = asked.some((person) => person.url !== null);
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-ask-started">
        <Text style={styles.title} accessibilityRole="header">{t({ en: 'Your question is out', zh: '问题发出去了' })}</Text>
        <Text style={styles.muted}>
          {t({
            en: `Answers come in over the next ${OPEN_HOURS} hours and are collected on one card for you.`,
            zh: `${OPEN_HOURS} 小时内陆续有回答，会汇总在一张卡片里给你看。`,
          })}
        </Text>
        {hasLinks ? (
          <Text style={styles.warning}>
            {t({
              en: 'Links are shown only now. Forward them before you leave this page; for a new one later, open the question.',
              zh: '链接只显示这一次，离开这一页前请先转发；以后要再发，可以在问题详情里换一条新链接。',
            })}
          </Text>
        ) : null}
        {asked.map((person) => {
          const url = person.url;
          return (
            <View key={person.ref} style={styles.personRow} testID={`twin-ask-asked-${person.ref}`}>
              <View style={styles.grow}>
                <Text style={styles.personLabel} numberOfLines={1}>
                  {person.label}
                </Text>
                <Text style={styles.muted}>{t(TWIN_ASK_ROUTE_WORDS[person.route])}</Text>
              </View>
              {url ? (
                <>
                  <TouchableOpacity style={styles.smallButton} onPress={() => forward(url)} accessibilityRole="button" testID={`twin-ask-share-${person.ref}`}>
                    <Text style={styles.smallButtonText}>{t({ en: 'Forward', zh: '转发' })}</Text>
                  </TouchableOpacity>
                  <TwinTelegramForward kind="ask" url={url} layout="row" testID={`twin-ask-telegram-${person.ref}`} />
                </>
              ) : null}
            </View>
          );
        })}
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()} accessibilityRole="button" testID="twin-ask-done">
          <Text style={styles.buttonText}>{t({ en: 'Done', zh: '好了' })}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-ask-start-screen" keyboardShouldPersistTaps="handled">
      <Text style={styles.title} accessibilityRole="header">{t({ en: 'Ask your friends', zh: '问朋友' })}</Text>
      <Text style={styles.muted}>
        {t({
          en: "Your twin asks each friend. Their twin answers only with what they wrote down to share, or passes it to them.",
          zh: '分身替你去问。朋友的分身只转述他写好、愿意告诉朋友的话，答不了就转给他本人。',
        })}
      </Text>

      <Text style={styles.label}>{t({ en: 'Topic', zh: '话题' })}</Text>
      <View style={styles.chips}>
        {TWIN_ASK_TOPICS_V0.map((value) => (
          <Chip key={value} label={t(TWIN_ASK_TOPIC_LABELS_V0[value])} on={topic === value} onPress={() => setTopic(value)} testID={`twin-ask-topic-${value}`} />
        ))}
      </View>

      <Text style={styles.label}>{t({ en: 'Question', zh: '问题' })}</Text>
      <TextInput
        style={[styles.input, styles.question]}
        value={question}
        onChangeText={setQuestion}
        maxLength={LIMITS.questionMax}
        multiline
        placeholder={t({ en: 'e.g. Any good noodle place nearby?', zh: '比如：附近哪家面馆好吃？' })}
        testID="twin-ask-question"
      />
      <Text style={styles.muted}>
        {t({
          en: `Up to ${LIMITS.questionMax} characters. No contact details, links, addresses or children's names.`,
          zh: `最多 ${LIMITS.questionMax} 个字。不要写联系方式、链接、地址或孩子的名字。`,
        })}
      </Text>
      {ownerOnly ? (
        <Text style={styles.notice} testID="twin-ask-owner-only">
          {t(TWIN_ASK_OWNER_ONLY_WORDS)}
        </Text>
      ) : null}

      <Text style={styles.label}>{t({ en: `Who (${people}/${LIMITS.peopleMax})`, zh: `问谁（${people}/${LIMITS.peopleMax}）` })}</Text>
      {friends.isPending ? <ActivityIndicator /> : null}
      {friends.isError ? <Text style={styles.muted}>{t(twinAskFailureWords(friends.error))}</Text> : null}
      {friends.data && friends.data.length === 0 ? (
        <Text style={styles.muted} testID="twin-ask-no-friends">
          {t({ en: 'No one in your relationship book to ask yet. Add people by name below.', zh: '关系簿里还没有能问的人，可以在下面填称呼。' })}
        </Text>
      ) : null}
      <View style={styles.chips}>
        {(friends.data ?? []).map((friend) => (
          <Chip
            key={friend.friendRef}
            label={friend.label}
            on={friendRefs.includes(friend.friendRef)}
            onPress={() => pickFriend(friend.friendRef)}
            disabled={full}
            testID={`twin-ask-friend-${friend.friendRef}`}
          />
        ))}
      </View>

      <Text style={styles.label}>{t({ en: 'Not on Agentrix? Add them by name', zh: '没注册的朋友：填个称呼' })}</Text>
      <Text style={styles.muted}>
        {t({
          en: 'Each gets a link, which you forward yourself. They answer without signing up, and their answer is marked unverified.',
          zh: '每人会有一条链接，你自己转发。他点开就能回答，不用注册，回答会标「未验证」。',
        })}
      </Text>
      <View style={styles.inline}>
        <TextInput
          style={[styles.input, styles.grow]}
          value={guestDraft}
          onChangeText={setGuestDraft}
          onSubmitEditing={addGuest}
          maxLength={LIMITS.guestLabelMax}
          placeholder={t({ en: 'e.g. Lao Wang', zh: '比如：老王' })}
          returnKeyType="done"
          editable={!full}
          testID="twin-ask-guest-input"
        />
        <TouchableOpacity style={[styles.smallButton, full && styles.dim]} onPress={addGuest} disabled={full} accessibilityRole="button" testID="twin-ask-guest-add">
          <Text style={styles.smallButtonText}>{t({ en: 'Add', zh: '添加' })}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.chips}>
        {guestLabels.map((label, index) => (
          <TouchableOpacity
            key={label}
            style={[styles.chip, styles.chipOn]}
            onPress={() => setGuestLabels(guestLabels.filter((item) => item !== label))}
            accessibilityRole="button"
            accessibilityLabel={t({ en: `Remove ${label}`, zh: `去掉${label}` })}
            testID={`twin-ask-guest-${index}`}
          >
            <Text style={styles.chipTextOn}>{label} ×</Text>
          </TouchableOpacity>
        ))}
      </View>

      {problem ? (
        <Text style={styles.problem} testID="twin-ask-problem">
          {t(problem)}
        </Text>
      ) : null}
      {outcome && outcome.started === false ? (
        <Text style={styles.problem} testID="twin-ask-refusal">
          {t(TWIN_ASK_REFUSAL_COPY[outcome.code])}
        </Text>
      ) : null}
      <TouchableOpacity style={[styles.button, start.isPending && styles.dim]} onPress={submit} disabled={start.isPending} accessibilityRole="button" testID="twin-ask-send">
        {start.isPending ? <ActivityIndicator /> : <Text style={styles.buttonText}>{t({ en: 'Ask', zh: '去问' })}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 16, gap: 10, paddingBottom: 32 },
    title: { color: c.textPrimary, fontSize: 20, fontWeight: '800' },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    label: { color: c.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 6 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.bgCard, justifyContent: 'center' },
    chipOn: { backgroundColor: c.accent, borderColor: c.accent },
    chipTextOn: { color: c.onAccent, fontSize: 14, fontWeight: '700' },
    dim: { opacity: 0.45 },
    inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    grow: { flex: 1 },
    input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, color: c.textPrimary, backgroundColor: c.bgCard },
    question: { minHeight: 88, paddingTop: 10, textAlignVertical: 'top' },
    notice: { color: c.warning, fontSize: 13, lineHeight: 19, fontWeight: '600' },
    problem: { color: c.error, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    warning: { color: c.warning, fontSize: 13, lineHeight: 19, fontWeight: '600' },
    button: { minHeight: 44, marginTop: 12, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    smallButton: { minHeight: 40, paddingHorizontal: 16, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    smallButtonText: { color: c.onAccent, fontSize: 14, fontWeight: '700' },
    personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border },
    personLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '600' },
  });
