/**
 * TwinHuddleSeriesStartScreen — 分身 → 约个时间 → 每周固定 → 发起 (twinHuddleSeries.ts, twinHuddleSeriesView.ts). Only in builds
 * with `EXPO_PUBLIC_TWIN_HUDDLE_SERIES=1`. Pick what it is, the first time (it repeats every seven days), the budget and
 * friends from the relationship book. Friends are invited once; each week's plan only asks the ones who joined.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
} from '../../../shared/types/twin-huddle';
import { TWIN_HUDDLE_SERIES_LIMITS_V0, type TwinHuddleSeriesRequestV0 } from '../../../shared/types/twin-huddle-series';
import { TWIN_HUDDLE_SERIES_REFUSAL_COPY } from '../../services/twinHuddleSeries';
import { mobileTwinHuddleSeriesClient } from '../../services/twinHuddleSeriesSession';
import { mobileTwinHuddleClient } from '../../services/twinHuddleSession';
import {
  twinHuddleSeriesFailureWords,
  twinHuddleSeriesProblemWords,
  twinHuddleSeriesRequestFromForm,
  twinHuddleSeriesSlotOptions,
  twinHuddleSeriesStartedWords,
  twinHuddleSeriesWeeklyWords,
} from '../../services/twinHuddleSeriesView';
import { TWIN_HUDDLE_DAY_PARTS, twinHuddleDayWords, twinHuddleFailureWords, type TwinHuddleDayPart, type TwinHuddleSlotOption, type TwinHuddleWords } from '../../services/twinHuddleView';
import { TwinHuddleChip as Chip } from './TwinHuddleChip';

const LIMITS = TWIN_HUDDLE_SERIES_LIMITS_V0;

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

export function TwinHuddleSeriesStartScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<{ goBack: () => void; navigate: (name: 'TwinHuddleSettings') => void }>();
  const queryClient = useQueryClient();
  const [openedAt] = useState(() => new Date());
  const days = useMemo(() => groupByDay(twinHuddleSeriesSlotOptions(openedAt)), [openedAt]);
  const [kind, setKind] = useState<TwinHuddleKindV0>('meal');
  const [budget, setBudget] = useState<TwinHuddleBudgetBandV0>('any');
  const [first, setFirst] = useState<TwinHuddleSlotOption | null>(null);
  const [friendRefs, setFriendRefs] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [auto, setAuto] = useState(false);
  const [problem, setProblem] = useState<TwinHuddleWords | null>(null);

  const friends = useQuery({ queryKey: ['twin-huddle', 'friends'], queryFn: () => mobileTwinHuddleClient().friends() });
  const start = useMutation({
    mutationFn: (request: TwinHuddleSeriesRequestV0) => mobileTwinHuddleSeriesClient().start(request),
    onSuccess: (outcome) => {
      if (outcome.started) void queryClient.invalidateQueries({ queryKey: ['twin-huddle-series', 'list'] });
    },
    onError: (error) => setProblem(twinHuddleSeriesFailureWords(error)),
  });

  const full = friendRefs.length >= LIMITS.friendsMax;
  const outcome = start.data;

  const pickFriend = (ref: string): void => {
    if (friendRefs.includes(ref)) setFriendRefs(friendRefs.filter((item) => item !== ref));
    else if (!full) setFriendRefs([...friendRefs, ref]);
  };

  const submit = (): void => {
    const request = twinHuddleSeriesRequestFromForm({ kind, budget, first: first ? first.slot : null, friendRefs, note, auto }, new Date());
    if (request.ok === false) {
      setProblem(twinHuddleSeriesProblemWords(request.reasonCode, request.field));
      return;
    }
    setProblem(null);
    start.mutate(request.value);
  };

  if (outcome && outcome.started === true) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-huddle-series-started">
        <Text style={styles.title} accessibilityRole="header">{t({ en: 'Weekly plan set up', zh: '每周固定设好了' })}</Text>
        <Text style={styles.muted}>{t(twinHuddleSeriesStartedWords(outcome.routes))}</Text>
        <Text style={styles.muted}>
          {t({
            en: "Each week's plan opens three days ahead and shows up under your plans. You can end this any time.",
            zh: '每周的商量提前三天开，开了就在「约个时间」的列表里。随时可以结束。',
          })}
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()} accessibilityRole="button" testID="twin-huddle-series-done">
          <Text style={styles.buttonText}>{t({ en: 'Done', zh: '好了' })}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-huddle-series-start-screen" keyboardShouldPersistTaps="handled">
      <Text style={styles.title} accessibilityRole="header">{t({ en: 'Set up a weekly plan', zh: '发起每周固定' })}</Text>
      <Text style={styles.muted}>
        {t({
          en: `Same time every week with the same friends, for ${LIMITS.occurrencesPerTerm} weeks. Your twin sets up each week's plan; friends are asked only after they join.`,
          zh: `每周同一个时间、同一拨朋友，一期 ${LIMITS.occurrencesPerTerm} 周。分身每周替你开商量；朋友点了加入才会被约。`,
        })}
      </Text>

      <Text style={styles.label}>{t({ en: 'What', zh: '做什么' })}</Text>
      <View style={styles.chips}>
        {TWIN_HUDDLE_KINDS_V0.map((value) => (
          <Chip key={value} label={t(TWIN_HUDDLE_KIND_LABELS_V0[value])} on={kind === value} onPress={() => setKind(value)} testID={`twin-huddle-series-kind-${value}`} />
        ))}
      </View>

      <Text style={styles.label}>{t({ en: 'First time', zh: '第一次' })}</Text>
      {days.map((day) => (
        <View key={day[0].dayOffset} style={styles.day}>
          <Text style={styles.dayLabel}>{t(twinHuddleDayWords(new Date(day[0].slot.startAt), openedAt))}</Text>
          <View style={styles.chips}>
            {day.map((option) => (
              <Chip
                key={option.slot.startAt}
                label={t(partWords(option.part))}
                on={first !== null && first.slot.startAt === option.slot.startAt}
                onPress={() => setFirst(option)}
                testID={`twin-huddle-series-slot-${option.dayOffset}-${option.part}`}
              />
            ))}
          </View>
        </View>
      ))}
      {first ? (
        <Text style={styles.picked} testID="twin-huddle-series-weekly">
          {t(twinHuddleSeriesWeeklyWords(first.slot))}
        </Text>
      ) : null}

      <Text style={styles.label}>{t({ en: 'Budget per person', zh: '人均' })}</Text>
      <View style={styles.chips}>
        {TWIN_HUDDLE_BUDGET_BANDS_V0.map((value) => (
          <Chip key={value} label={t(TWIN_HUDDLE_BUDGET_LABELS_V0[value])} on={budget === value} onPress={() => setBudget(value)} testID={`twin-huddle-series-budget-${value}`} />
        ))}
      </View>

      <Text style={styles.label}>{t({ en: `Who (${friendRefs.length}/${LIMITS.friendsMax})`, zh: `约谁（${friendRefs.length}/${LIMITS.friendsMax}）` })}</Text>
      {friends.isPending ? <ActivityIndicator /> : null}
      {friends.isError ? <Text style={styles.muted}>{t(twinHuddleFailureWords(friends.error))}</Text> : null}
      {friends.data && friends.data.length === 0 ? (
        <Text style={styles.muted} testID="twin-huddle-series-no-friends">
          {t({ en: 'No one in your relationship book to invite yet.', zh: '关系簿里还没有能约的人。' })}
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
            testID={`twin-huddle-series-friend-${friend.friendRef}`}
          />
        ))}
      </View>

      <Text style={styles.label}>{t({ en: 'Note (optional)', zh: '备注（可不填）' })}</Text>
      <TextInput
        style={[styles.input, styles.note]}
        value={note}
        onChangeText={setNote}
        maxLength={TWIN_HUDDLE_LIMITS_V0.noteMax}
        multiline
        placeholder={t({ en: 'e.g. somewhere near the MRT', zh: '比如：离地铁近一点' })}
        testID="twin-huddle-series-note"
      />
      <Text style={styles.muted}>{t({ en: 'No prices, contact details, addresses or links.', zh: '不要写钱数、联系方式、地址或链接。' })}</Text>

      <View style={styles.switchRow}>
        <View style={styles.grow}>
          <Text style={styles.switchLabel}>{t({ en: "When everyone can make it, don't ask me", zh: '大家都行就不用我再选时间' })}</Text>
          <Text style={styles.muted}>
            {t({ en: 'Your twin sets the time for you that week. You can change this later.', zh: '那一周分身直接替你定时间。以后可以改。' })}
          </Text>
        </View>
        <Switch value={auto} onValueChange={setAuto} testID="twin-huddle-series-auto" />
      </View>

      {problem ? <Text style={styles.problem} testID="twin-huddle-series-problem">{t(problem)}</Text> : null}
      {outcome && outcome.started === false ? (
        <Text style={styles.problem} testID="twin-huddle-series-refusal">{t(TWIN_HUDDLE_SERIES_REFUSAL_COPY[outcome.code])}</Text>
      ) : null}
      {outcome && outcome.started === false && outcome.code === 'initiator_not_opted_in' ? (
        <TouchableOpacity style={styles.secondary} onPress={() => navigation.navigate('TwinHuddleSettings')} accessibilityRole="button" testID="twin-huddle-series-open-settings">
          <Text style={styles.secondaryText}>{t({ en: 'Open settings', zh: '去设置' })}</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={[styles.button, start.isPending && styles.dim]} onPress={submit} disabled={start.isPending} accessibilityRole="button" testID="twin-huddle-series-start">
        {start.isPending ? <ActivityIndicator /> : <Text style={styles.buttonText}>{t({ en: 'Invite them', zh: '邀请他们' })}</Text>}
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
    day: { gap: 6 },
    dayLabel: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
    picked: { color: c.accent, fontSize: 14, fontWeight: '700' },
    grow: { flex: 1 },
    input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, color: c.textPrimary, backgroundColor: c.bgCard },
    note: { minHeight: 88, paddingTop: 10, textAlignVertical: 'top' },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
    switchLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '600' },
    problem: { color: c.error, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    button: { minHeight: 44, marginTop: 12, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    secondary: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
  });
