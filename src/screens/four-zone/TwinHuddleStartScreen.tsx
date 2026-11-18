/**
 * TwinHuddleStartScreen — 分身 → 约个时间 → 发起 (twinHuddle.ts, twinHuddleView.ts). Only in builds with
 * `EXPO_PUBLIC_TWIN_HUDDLE=1`. Pick what it is, up to six times, the budget, friends from the relationship book and names
 * for people who are not on Agentrix; your twin asks the others' twins. Links for people reached by link come back once,
 * right after starting, for you to forward yourself.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import {
  TWIN_HUDDLE_BUDGET_BANDS_V0,
  TWIN_HUDDLE_BUDGET_LABELS_V0,
  TWIN_HUDDLE_KIND_LABELS_V0,
  TWIN_HUDDLE_KINDS_V0,
  TWIN_HUDDLE_LIMITS_V0,
  type TwinHuddleBudgetBandV0,
  type TwinHuddleKindV0,
  type TwinHuddleRequestV0,
} from '../../../shared/types/twin-huddle';
import { TWIN_HUDDLE_REFUSAL_COPY } from '../../services/twinHuddle';
import { mobileTwinHuddleClient } from '../../services/twinHuddleSession';
import { TwinTelegramForward } from './TwinTelegramForward';
import {
  TWIN_HUDDLE_DAY_PARTS,
  twinHuddleDayWords,
  twinHuddleFailureWords,
  twinHuddleLinkLabels,
  twinHuddleProblemWords,
  twinHuddleRequestFromForm,
  twinHuddleShareWords,
  twinHuddleSlotOptions,
  type TwinHuddleDayPart,
  type TwinHuddleSlotOption,
  type TwinHuddleWords,
} from '../../services/twinHuddleView';
import { TwinHuddleChip as Chip } from './TwinHuddleChip';

const LIMITS = TWIN_HUDDLE_LIMITS_V0;

const clock = (time: readonly number[]): string => time.map((part) => String(part).padStart(2, '0')).join(':');

const PARTS_LEGEND: TwinHuddleWords = {
  en: TWIN_HUDDLE_DAY_PARTS.map((part) => `${part.words.en} ${clock(part.start)}–${clock(part.end)}`).join(' · '),
  zh: TWIN_HUDDLE_DAY_PARTS.map((part) => `${part.words.zh} ${clock(part.start)}–${clock(part.end)}`).join(' · '),
};

const partWords = (key: TwinHuddleDayPart): TwinHuddleWords => {
  const part = TWIN_HUDDLE_DAY_PARTS.find((item) => item.key === key);
  return part ? part.words : { en: key, zh: key };
};

function groupByDay(options: readonly TwinHuddleSlotOption[]): TwinHuddleSlotOption[][] {
  const days: TwinHuddleSlotOption[][] = [];
  for (const option of options) {
    const last = days[days.length - 1];
    if (last && last[0].dayOffset === option.dayOffset) last.push(option);
    else days.push([option]);
  }
  return days;
}

export function TwinHuddleStartScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<{ goBack: () => void; navigate: (name: 'TwinHuddleSettings') => void }>();
  const queryClient = useQueryClient();
  const [openedAt] = useState(() => new Date());
  const days = useMemo(() => groupByDay(twinHuddleSlotOptions(openedAt)), [openedAt]);
  const [kind, setKind] = useState<TwinHuddleKindV0>('meal');
  const [budget, setBudget] = useState<TwinHuddleBudgetBandV0>('any');
  const [picked, setPicked] = useState<TwinHuddleSlotOption[]>([]);
  const [friendRefs, setFriendRefs] = useState<string[]>([]);
  const [guestLabels, setGuestLabels] = useState<string[]>([]);
  const [guestDraft, setGuestDraft] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<TwinHuddleWords | null>(null);
  const friends = useQuery({ queryKey: ['twin-huddle', 'friends'], queryFn: () => mobileTwinHuddleClient().friends() });
  const start = useMutation({
    mutationFn: (request: TwinHuddleRequestV0) => mobileTwinHuddleClient().start(request),
    onSuccess: (outcome) => {
      if (outcome.started) void queryClient.invalidateQueries({ queryKey: ['twin-huddle', 'list'] });
    },
    onError: (error) => setProblem(twinHuddleFailureWords(error)),
  });
  const people = friendRefs.length + guestLabels.length;
  const full = people >= LIMITS.friendsMax;
  const outcome = start.data;

  const pickSlot = (option: TwinHuddleSlotOption): void => {
    const rest = picked.filter((item) => item.slot.startAt !== option.slot.startAt);
    if (rest.length < picked.length) setPicked(rest);
    else if (picked.length < LIMITS.candidatesMax) setPicked([...picked, option]);
  };
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
    const request = twinHuddleRequestFromForm(
      { kind, budget, slots: picked.map((option) => option.slot), friendRefs, guestLabels, note },
      new Date(),
    );
    if (request.ok === false) {
      setProblem(twinHuddleProblemWords(request.reasonCode, request.field));
      return;
    }
    setProblem(null);
    start.mutate(request.value);
  };
  const forward = (url: string): void => {
    Share.share({ message: t(twinHuddleShareWords(url)) }).catch((): void => undefined);
  };

  if (outcome && outcome.started === true) {
    const links = twinHuddleLinkLabels(outcome.links, friends.data ?? [], guestLabels);
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-huddle-started">
        <Text style={styles.title} accessibilityRole="header">{t({ en: 'Your twin is on it', zh: '分身去商量了' })}</Text>
        <Text style={styles.muted}>
          {t({ en: "Once everyone's times are in, you'll be asked to choose.", zh: '大家的时间收齐后，会请你来选。' })}
        </Text>
        {links.length > 0 ? (
          <View style={styles.links}>
            <Text style={styles.label}>{t({ en: 'Forward each link to the person it is for', zh: '把链接分别发给对应的人' })}</Text>
            <Text style={styles.warning}>
              {t({ en: 'These links are shown only now. Forward them before you leave this page.', zh: '这些链接只显示这一次，离开这一页前请先转发。' })}
            </Text>
            {links.map((link) => (
              <View key={link.ref} style={styles.linkRow}>
                <Text style={styles.linkLabel} numberOfLines={1}>{link.label}</Text>
                <TouchableOpacity style={styles.smallButton} onPress={() => forward(link.url)} accessibilityRole="button" testID={`twin-huddle-share-${link.ref}`}>
                  <Text style={styles.smallButtonText}>{t({ en: 'Forward', zh: '转发' })}</Text>
                </TouchableOpacity>
                <TwinTelegramForward kind="huddle" url={link.url} layout="row" testID={`twin-huddle-telegram-${link.ref}`} />
              </View>
            ))}
          </View>
        ) : null}
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()} accessibilityRole="button" testID="twin-huddle-done">
          <Text style={styles.buttonText}>{t({ en: 'Done', zh: '好了' })}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-huddle-start-screen" keyboardShouldPersistTaps="handled">
      <Text style={styles.title} accessibilityRole="header">{t({ en: 'Start a plan', zh: '发起商量' })}</Text>
      <Text style={styles.muted}>
        {t({ en: "Your twin asks your friends' twins which times work, then you choose.", zh: '分身先问朋友的分身哪些时间行，再请你选。' })}
      </Text>

      <Text style={styles.label}>{t({ en: 'What', zh: '做什么' })}</Text>
      <View style={styles.chips}>
        {TWIN_HUDDLE_KINDS_V0.map((value) => (
          <Chip key={value} label={t(TWIN_HUDDLE_KIND_LABELS_V0[value])} on={kind === value} onPress={() => setKind(value)} testID={`twin-huddle-kind-${value}`} />
        ))}
      </View>

      <Text style={styles.label}>{t({ en: `When (${picked.length}/${LIMITS.candidatesMax})`, zh: `候选时间（${picked.length}/${LIMITS.candidatesMax}）` })}</Text>
      <Text style={styles.muted}>{t(PARTS_LEGEND)}</Text>
      {days.map((day) => (
        <View key={day[0].dayOffset} style={styles.day}>
          <Text style={styles.dayLabel}>{t(twinHuddleDayWords(new Date(day[0].slot.startAt), openedAt))}</Text>
          <View style={styles.chips}>
            {day.map((option) => (
              <Chip
                key={option.slot.startAt}
                label={t(partWords(option.part))}
                on={picked.some((item) => item.slot.startAt === option.slot.startAt)}
                onPress={() => pickSlot(option)}
                disabled={picked.length >= LIMITS.candidatesMax}
                testID={`twin-huddle-slot-${option.dayOffset}-${option.part}`}
              />
            ))}
          </View>
        </View>
      ))}

      <Text style={styles.label}>{t({ en: 'Budget per person', zh: '人均' })}</Text>
      <View style={styles.chips}>
        {TWIN_HUDDLE_BUDGET_BANDS_V0.map((value) => (
          <Chip key={value} label={t(TWIN_HUDDLE_BUDGET_LABELS_V0[value])} on={budget === value} onPress={() => setBudget(value)} testID={`twin-huddle-budget-${value}`} />
        ))}
      </View>

      <Text style={styles.label}>{t({ en: `Who (${people}/${LIMITS.friendsMax})`, zh: `约谁（${people}/${LIMITS.friendsMax}）` })}</Text>
      {friends.isPending ? <ActivityIndicator /> : null}
      {friends.isError ? <Text style={styles.muted}>{t(twinHuddleFailureWords(friends.error))}</Text> : null}
      {friends.data && friends.data.length === 0 ? (
        <Text style={styles.muted} testID="twin-huddle-no-friends">
          {t({ en: 'No one in your relationship book to ask yet. Add people by name below.', zh: '关系簿里还没有能约的人，可以在下面填称呼。' })}
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
            testID={`twin-huddle-friend-${friend.friendRef}`}
          />
        ))}
      </View>

      <Text style={styles.label}>{t({ en: 'Not on Agentrix? Add them by name', zh: '没注册的朋友：填个称呼' })}</Text>
      <Text style={styles.muted}>
        {t({ en: 'Each gets a link to pick times, which you forward yourself.', zh: '每人会有一条链接，你自己转发给他，他点开就能选时间。' })}
      </Text>
      <View style={styles.inline}>
        <TextInput
          style={[styles.input, styles.grow]}
          value={guestDraft}
          onChangeText={setGuestDraft}
          onSubmitEditing={addGuest}
          maxLength={LIMITS.guestLabelMax}
          placeholder={t({ en: 'e.g. May', zh: '比如：阿梅' })}
          returnKeyType="done"
          editable={!full}
          testID="twin-huddle-guest-input"
        />
        <TouchableOpacity style={[styles.smallButton, full && styles.dim]} onPress={addGuest} disabled={full} accessibilityRole="button" testID="twin-huddle-guest-add">
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
            testID={`twin-huddle-guest-${index}`}
          >
            <Text style={styles.chipTextOn}>{label} ×</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>{t({ en: 'Note (optional)', zh: '备注（可不填）' })}</Text>
      <TextInput
        style={[styles.input, styles.note]}
        value={note}
        onChangeText={setNote}
        maxLength={LIMITS.noteMax}
        multiline
        placeholder={t({ en: 'e.g. somewhere near the MRT', zh: '比如：离地铁近一点' })}
        testID="twin-huddle-note"
      />
      <Text style={styles.muted}>{t({ en: 'No prices, contact details, addresses or links.', zh: '不要写钱数、联系方式、地址或链接。' })}</Text>

      {problem ? <Text style={styles.problem} testID="twin-huddle-problem">{t(problem)}</Text> : null}
      {outcome && outcome.started === false ? (
        <Text style={styles.problem} testID="twin-huddle-refusal">{t(TWIN_HUDDLE_REFUSAL_COPY[outcome.code])}</Text>
      ) : null}
      {outcome && outcome.started === false && outcome.code === 'initiator_not_opted_in' ? (
        <TouchableOpacity style={styles.secondary} onPress={() => navigation.navigate('TwinHuddleSettings')} accessibilityRole="button" testID="twin-huddle-open-settings">
          <Text style={styles.secondaryText}>{t({ en: 'Open settings', zh: '去设置' })}</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={[styles.button, start.isPending && styles.dim]} onPress={submit} disabled={start.isPending} accessibilityRole="button" testID="twin-huddle-start">
        {start.isPending ? <ActivityIndicator /> : <Text style={styles.buttonText}>{t({ en: 'Ask their twins', zh: '让分身去商量' })}</Text>}
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
    day: { gap: 6 },
    dayLabel: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
    inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    grow: { flex: 1 },
    input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, color: c.textPrimary, backgroundColor: c.bgCard },
    note: { minHeight: 88, paddingTop: 10, textAlignVertical: 'top' },
    problem: { color: c.error, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    warning: { color: c.warning, fontSize: 13, lineHeight: 19, fontWeight: '600' },
    button: { minHeight: 44, marginTop: 12, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    secondary: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
    smallButton: { minHeight: 40, paddingHorizontal: 16, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    smallButtonText: { color: c.onAccent, fontSize: 14, fontWeight: '700' },
    links: { gap: 8 },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border },
    linkLabel: { flex: 1, color: c.textPrimary, fontSize: 15, fontWeight: '600' },
  });
