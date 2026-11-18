/**
 * TwinFindStartScreen — 分身 → 帮我找人 → 问问谁认识 (twinFind.ts, twinFindView.ts). Only in builds with
 * `EXPO_PUBLIC_TWIN_FIND=1`. Pick a topic, write who you are looking for and pick the friends to ask. Each friend may ask
 * one person they know; you see that person only after they agreed.
 */
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { TWIN_ASK_TOPIC_LABELS_V0 } from '../../../shared/types/twin-ask';
import { TWIN_FIND_LIMITS_V0, TWIN_FIND_TOPICS_V0, type TwinFindRequestV0, type TwinFindTopicV0 } from '../../../shared/types/twin-find';
import { TWIN_FIND_REFUSAL_COPY } from '../../services/twinFind';
import { mobileTwinFindClient } from '../../services/twinFindSession';
import {
  TWIN_FIND_HOW_WORDS,
  TWIN_FIND_ROUTE_WORDS,
  twinFindFailureWords,
  twinFindProblemWords,
  twinFindRequestFromForm,
  twinFindStartedPeople,
  type TwinFindWords,
} from '../../services/twinFindView';
import { TwinAskChip as Chip } from './TwinAskChip';

const LIMITS = TWIN_FIND_LIMITS_V0;

type StartNavigation = {
  goBack(): void;
  replace(name: 'TwinFindDetail', params: { id: string }): void;
};

export function TwinFindStartScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<StartNavigation>();
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState<TwinFindTopicV0 | null>(null);
  const [question, setQuestion] = useState('');
  const [friendRefs, setFriendRefs] = useState<string[]>([]);
  const [problem, setProblem] = useState<TwinFindWords | null>(null);
  const friends = useQuery({ queryKey: ['twin-find', 'friends'], queryFn: () => mobileTwinFindClient().friends() });
  const start = useMutation({
    mutationFn: (request: TwinFindRequestV0) => mobileTwinFindClient().start(request),
    onSuccess: (outcome) => {
      if (outcome.started) void queryClient.invalidateQueries({ queryKey: ['twin-find', 'list'] });
    },
    onError: (error) => setProblem(twinFindFailureWords(error)),
  });
  const full = friendRefs.length >= LIMITS.friendsMax;
  const outcome = start.data;

  const pickFriend = (ref: string): void => {
    if (friendRefs.includes(ref)) setFriendRefs(friendRefs.filter((item) => item !== ref));
    else if (!full) setFriendRefs([...friendRefs, ref]);
  };
  const submit = (): void => {
    const request = twinFindRequestFromForm({ topic, question, friendRefs });
    if (request.ok === false) {
      setProblem(twinFindProblemWords(request.reasonCode, request.field));
      return;
    }
    setProblem(null);
    start.mutate(request.value);
  };

  if (outcome && outcome.started === true) {
    const findId = outcome.findId;
    const asked = twinFindStartedPeople(outcome.routes, friends.data ?? []);
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-find-started">
        <Text style={styles.title} accessibilityRole="header">{t({ en: 'Your friends have been asked', zh: '已经去问朋友了' })}</Text>
        <Text style={styles.muted}>
          {t({
            en: 'When a friend finds someone who agrees, it shows up here for you to decide. Nothing is shared before that.',
            zh: '朋友找到愿意的人以后，会出现在这次提问里等你点头。在那之前不会透露任何人。',
          })}
        </Text>
        {asked.map((person) => (
          <View key={person.ref} style={styles.personRow} testID={`twin-find-asked-${person.ref}`}>
            <Text style={styles.personLabel} numberOfLines={1}>
              {person.label}
            </Text>
            <Text style={person.route === 'app' ? styles.muted : styles.warning}>{t(TWIN_FIND_ROUTE_WORDS[person.route])}</Text>
          </View>
        ))}
        <TouchableOpacity style={styles.button} onPress={() => navigation.replace('TwinFindDetail', { id: findId })} accessibilityRole="button" testID="twin-find-open-started">
          <Text style={styles.buttonText}>{t({ en: 'See how it goes', zh: '看进展' })}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={() => navigation.goBack()} accessibilityRole="button" testID="twin-find-done">
          <Text style={styles.secondaryText}>{t({ en: 'Done', zh: '好了' })}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-find-start-screen" keyboardShouldPersistTaps="handled">
      <Text style={styles.title} accessibilityRole="header">{t({ en: 'Ask who knows someone', zh: '问问谁认识' })}</Text>
      <Text style={styles.muted}>{t(TWIN_FIND_HOW_WORDS)}</Text>

      <Text style={styles.label}>{t({ en: 'Topic', zh: '话题' })}</Text>
      <View style={styles.chips}>
        {TWIN_FIND_TOPICS_V0.map((value) => (
          <Chip key={value} label={t(TWIN_ASK_TOPIC_LABELS_V0[value])} on={topic === value} onPress={() => setTopic(value)} testID={`twin-find-topic-${value}`} />
        ))}
      </View>

      <Text style={styles.label}>{t({ en: 'Who are you looking for?', zh: '想找什么样的人？' })}</Text>
      <TextInput
        style={[styles.input, styles.question]}
        value={question}
        onChangeText={setQuestion}
        maxLength={LIMITS.questionMax}
        multiline
        placeholder={t({ en: 'e.g. Who knows a reliable renovation contractor?', zh: '比如：谁认识靠谱的装修师傅？' })}
        testID="twin-find-question"
      />
      <Text style={styles.muted}>
        {t({
          en: `Up to ${LIMITS.questionMax} characters. No contact details, links or addresses.`,
          zh: `最多 ${LIMITS.questionMax} 个字。不要写联系方式、链接或地址。`,
        })}
      </Text>

      <Text style={styles.label}>{t({ en: `Ask whom (${friendRefs.length}/${LIMITS.friendsMax})`, zh: `问哪几位朋友（${friendRefs.length}/${LIMITS.friendsMax}）` })}</Text>
      {friends.isPending ? <ActivityIndicator /> : null}
      {friends.isError ? <Text style={styles.muted}>{t(twinFindFailureWords(friends.error))}</Text> : null}
      {friends.data && friends.data.length === 0 ? (
        <Text style={styles.muted} testID="twin-find-no-friends">
          {t({ en: 'No one in your relationship book to ask yet.', zh: '关系簿里还没有能问的朋友。' })}
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
            testID={`twin-find-friend-${friend.friendRef}`}
          />
        ))}
      </View>

      {problem ? (
        <Text style={styles.problem} testID="twin-find-problem">
          {t(problem)}
        </Text>
      ) : null}
      {outcome && outcome.started === false ? (
        <Text style={styles.problem} testID="twin-find-refusal">
          {t(TWIN_FIND_REFUSAL_COPY[outcome.code])}
        </Text>
      ) : null}
      <TouchableOpacity style={[styles.button, start.isPending && styles.dim]} onPress={submit} disabled={start.isPending} accessibilityRole="button" testID="twin-find-send">
        {start.isPending ? <ActivityIndicator /> : <Text style={styles.buttonText}>{t({ en: 'Ask them', zh: '去问' })}</Text>}
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
    dim: { opacity: 0.45 },
    input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, color: c.textPrimary, backgroundColor: c.bgCard },
    question: { minHeight: 88, paddingTop: 10, textAlignVertical: 'top' },
    problem: { color: c.error, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    warning: { color: c.warning, fontSize: 13, lineHeight: 19, fontWeight: '600' },
    button: { minHeight: 44, marginTop: 12, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    secondary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
    personRow: { padding: 12, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border, gap: 2 },
    personLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '600' },
  });
