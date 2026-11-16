/**
 * TwinHuddleSettingsScreen — 分身 → 约个时间 → 设置 (twinHuddle.ts, twinHuddleView.ts). Only in builds with
 * `EXPO_PUBLIC_TWIN_HUDDLE=1`. Whether your twin plans for you, how many times a day friends may ask, and the diet and
 * budget your twin may pass on, merged with everyone else's and without names, to whoever starts a plan.
 */
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import {
  TWIN_HUDDLE_BUDGET_BANDS_V0,
  TWIN_HUDDLE_BUDGET_LABELS_V0,
  TWIN_HUDDLE_DIET_LABELS_V0,
  TWIN_HUDDLE_DIET_TAGS_V0,
  TWIN_HUDDLE_LIMITS_V0,
  type TwinHuddleDietTagV0,
  type TwinHuddleProfileV0,
} from '../../../shared/types/twin-huddle';
import { mobileTwinHuddleClient } from '../../services/twinHuddleSession';
import {
  TWIN_HUDDLE_DAILY_CAP_CHOICES,
  twinHuddleDailyCapWords,
  twinHuddleFailureWords,
  twinHuddleProfilePatch,
  type TwinHuddleWords,
} from '../../services/twinHuddleView';
import { TwinHuddleChip } from './TwinHuddleChip';

const PROFILE_KEY = ['twin-huddle', 'profile'];
const OPT_IN_WORDS: TwinHuddleWords = { en: 'Let my twin plan for me', zh: '让分身替我商量' };

export function TwinHuddleSettingsScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const saved = useQuery({ queryKey: PROFILE_KEY, queryFn: () => mobileTwinHuddleClient().profile() });
  const [draft, setDraft] = useState<TwinHuddleProfileV0 | null>(null);
  const [notice, setNotice] = useState<{ words: TwinHuddleWords; ok: boolean } | null>(null);
  const save = useMutation({
    mutationFn: (patch: Partial<TwinHuddleProfileV0>) => mobileTwinHuddleClient().updateProfile(patch),
    onSuccess: (profile) => {
      queryClient.setQueryData(PROFILE_KEY, profile);
      setDraft(null);
      setNotice({ words: { en: 'Saved.', zh: '已保存。' }, ok: true });
    },
    onError: (error) => setNotice({ words: twinHuddleFailureWords(error), ok: false }),
  });

  if (saved.isPending) {
    return (
      <View style={[styles.screen, styles.center]} testID="twin-huddle-settings-loading">
        <ActivityIndicator />
      </View>
    );
  }
  if (saved.isError) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-huddle-settings-error">
        <Text style={styles.problem}>{t(twinHuddleFailureWords(saved.error))}</Text>
        <TouchableOpacity style={styles.secondary} onPress={() => void saved.refetch()} accessibilityRole="button" testID="twin-huddle-settings-retry">
          <Text style={styles.secondaryText}>{t({ en: 'Try again', zh: '重试' })}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const current = draft ?? saved.data;
  const patch = twinHuddleProfilePatch(saved.data, current);
  const cap = current.dailyCap ?? TWIN_HUDDLE_LIMITS_V0.perFriendPerDayMax;
  const change = (next: Partial<TwinHuddleProfileV0>): void => {
    setNotice(null);
    setDraft({ ...current, ...next });
  };
  const toggleDiet = (tag: TwinHuddleDietTagV0): void =>
    change({ dietTags: current.dietTags.includes(tag) ? current.dietTags.filter((item) => item !== tag) : [...current.dietTags, tag] });
  const submit = (): void => {
    if (patch) save.mutate(patch);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-huddle-settings-screen">
      <Text style={styles.title} accessibilityRole="header">{t({ en: 'Planning settings', zh: '约时间设置' })}</Text>
      <View style={styles.switchRow}>
        <View style={styles.grow}>
          <Text style={styles.body}>{t(OPT_IN_WORDS)}</Text>
          <Text style={styles.muted}>
            {t({
              en: 'Needed before you start a plan. When friends ask, your twin answers from your calendar first and asks you about the rest.',
              zh: '发起商量前要先打开。朋友约你时，分身先按你的日历回答，答不了的再问你。',
            })}
          </Text>
        </View>
        <Switch value={current.optIn} onValueChange={(optIn) => change({ optIn })} accessibilityLabel={t(OPT_IN_WORDS)} testID="twin-huddle-opt-in" />
      </View>

      <Text style={styles.label}>{t({ en: 'Times a day friends may ask', zh: '每天最多被约几次' })}</Text>
      <View style={styles.chips}>
        {TWIN_HUDDLE_DAILY_CAP_CHOICES.map((choice) => (
          <TwinHuddleChip key={choice} label={t(twinHuddleDailyCapWords(choice))} on={cap === choice} onPress={() => change({ dailyCap: choice })} testID={`twin-huddle-cap-${choice}`} />
        ))}
      </View>

      <Text style={styles.label}>{t({ en: 'Diet', zh: '忌口' })}</Text>
      <Text style={styles.muted}>
        {t({ en: "Whoever starts a plan only sees it merged with everyone else's, never with your name.", zh: '只和其他人的合在一起告诉发起人，不写是谁的。' })}
      </Text>
      <View style={styles.chips}>
        {TWIN_HUDDLE_DIET_TAGS_V0.map((tag) => (
          <TwinHuddleChip key={tag} label={t(TWIN_HUDDLE_DIET_LABELS_V0[tag])} on={current.dietTags.includes(tag)} onPress={() => toggleDiet(tag)} testID={`twin-huddle-diet-${tag}`} />
        ))}
      </View>

      <Text style={styles.label}>{t({ en: 'Budget per person, at most', zh: '人均最多到' })}</Text>
      <View style={styles.chips}>
        <TwinHuddleChip label={t({ en: 'Rather not say', zh: '不说' })} on={current.budgetMax === null} onPress={() => change({ budgetMax: null })} testID="twin-huddle-budget-max-none" />
        {TWIN_HUDDLE_BUDGET_BANDS_V0.map((band) => (
          <TwinHuddleChip key={band} label={t(TWIN_HUDDLE_BUDGET_LABELS_V0[band])} on={current.budgetMax === band} onPress={() => change({ budgetMax: band })} testID={`twin-huddle-budget-max-${band}`} />
        ))}
      </View>

      {notice ? (
        <Text style={notice.ok ? styles.saved : styles.problem} testID="twin-huddle-settings-notice">
          {t(notice.words)}
        </Text>
      ) : null}
      <TouchableOpacity
        style={[styles.button, (!patch || save.isPending) && styles.dim]}
        disabled={!patch || save.isPending}
        onPress={submit}
        accessibilityRole="button"
        testID="twin-huddle-settings-save"
      >
        {save.isPending ? <ActivityIndicator /> : <Text style={styles.buttonText}>{t({ en: 'Save', zh: '保存' })}</Text>}
      </TouchableOpacity>
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
    body: { color: c.textPrimary, fontSize: 15, fontWeight: '600' },
    label: { color: c.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 8 },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border },
    grow: { flex: 1, gap: 4 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    button: { minHeight: 44, marginTop: 12, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    secondary: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
    saved: { color: c.accent, fontSize: 14, fontWeight: '600' },
    problem: { color: c.error, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    dim: { opacity: 0.45 },
  });
