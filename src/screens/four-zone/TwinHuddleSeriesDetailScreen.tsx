/**
 * TwinHuddleSeriesDetailScreen — 分身 → 约个时间 → 每周固定 → 一件 (twinHuddleSeries.ts, twinHuddleSeriesView.ts). Only in builds
 * with `EXPO_PUBLIC_TWIN_HUDDLE_SERIES=1`. The organizer sees who joined, the last weeks, the next time, and can end or
 * renew it. An invited friend joins or not; once joined, can skip next week, leave, and set "same as usual, don't ask me".
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { TWIN_HUDDLE_BUDGET_LABELS_V0, TWIN_HUDDLE_KIND_LABELS_V0 } from '../../../shared/types/twin-huddle';
import {
  TWIN_HUDDLE_SERIES_LIMITS_V0,
  type TwinHuddleSeriesInitiatorViewV0,
  type TwinHuddleSeriesMemberViewV0,
  type TwinHuddleSeriesMineV0,
} from '../../../shared/types/twin-huddle-series';
import { TwinHuddleError } from '../../services/twinHuddle';
import type { TwinHuddleSeriesView } from '../../services/twinHuddleSeries';
import { mobileTwinHuddleSeriesClient } from '../../services/twinHuddleSeriesSession';
import {
  twinHuddleSeriesFailureWords,
  twinHuddleSeriesInviteWords,
  twinHuddleSeriesNextWords,
  twinHuddleSeriesRunWords,
  twinHuddleSeriesWeeklyWords,
} from '../../services/twinHuddleSeriesView';
import type { TwinHuddleWords } from '../../services/twinHuddleView';

type DetailRoute = RouteProp<{ TwinHuddleSeriesDetail: { id: string } }, 'TwinHuddleSeriesDetail'>;
type SeriesNavigation = { goBack: () => void; navigate: (name: 'TwinHuddleDetail', params: { id: string }) => void };
type Styles = ReturnType<typeof makeStyles>;

const TERM = TWIN_HUDDLE_SERIES_LIMITS_V0.occurrencesPerTerm;

interface PartProps<V extends TwinHuddleSeriesView> {
  view: V;
  now: Date;
  styles: Styles;
  busy: boolean;
  /** Runs one change; a view replaces what is shown, nothing (declined or left) closes the page. */
  run: (change: () => Promise<TwinHuddleSeriesView | void>) => void;
}

export function TwinHuddleSeriesDetailScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const { id } = useRoute<DetailRoute>().params;
  const navigation = useNavigation<SeriesNavigation>();
  const queryClient = useQueryClient();
  const series = useQuery({ queryKey: ['twin-huddle-series', 'detail', id], queryFn: () => mobileTwinHuddleSeriesClient().get(id) });
  const [problem, setProblem] = useState<TwinHuddleWords | null>(null);

  const change = useMutation({
    mutationFn: (action: () => Promise<TwinHuddleSeriesView | void>) => action(),
    onSuccess: (view) => {
      setProblem(null);
      void queryClient.invalidateQueries({ queryKey: ['twin-huddle-series', 'list'] });
      if (view) queryClient.setQueryData(['twin-huddle-series', 'detail', id], view);
      else navigation.goBack();
    },
    onError: (error) => {
      setProblem(twinHuddleSeriesFailureWords(error));
      if (error instanceof TwinHuddleError && error.failure === 'changed') void series.refetch();
    },
  });

  if (series.isPending) {
    return (
      <View style={[styles.screen, styles.center]} testID="twin-huddle-series-detail-loading">
        <ActivityIndicator />
      </View>
    );
  }
  if (series.isError) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-huddle-series-detail-error">
        <Text style={styles.problem}>{t(twinHuddleSeriesFailureWords(series.error))}</Text>
        <TouchableOpacity style={styles.secondary} onPress={() => void series.refetch()} accessibilityRole="button" testID="twin-huddle-series-detail-retry">
          <Text style={styles.secondaryText}>{t({ en: 'Try again', zh: '重试' })}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const view = series.data;
  const now = new Date();
  const kind = t(TWIN_HUDDLE_KIND_LABELS_V0[view.details.kind]);
  const part = { now, styles, busy: change.isPending, run: change.mutate };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-huddle-series-detail-screen">
      <Text style={styles.title} accessibilityRole="header">
        {view.role === 'initiator'
          ? t({ en: `${kind} every week · you started it`, zh: `每周${kind} · 我发起的` })
          : t({ en: `${view.initiatorName} would like a weekly ${kind} with you`, zh: `${view.initiatorName}想每周固定约你${kind}` })}
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t(twinHuddleSeriesWeeklyWords(view.first))}</Text>
        <Text style={styles.muted}>
          {t({ en: `Budget per person: ${TWIN_HUDDLE_BUDGET_LABELS_V0[view.details.budget].en}`, zh: `人均：${TWIN_HUDDLE_BUDGET_LABELS_V0[view.details.budget].zh}` })}
        </Text>
        {view.details.note ? <Text style={styles.muted}>{view.details.note}</Text> : null}
        <Text style={styles.muted} testID="twin-huddle-series-next">
          {view.status === 'ended' ? t({ en: 'This weekly plan has ended.', zh: '这个每周固定已经结束了。' }) : t(twinHuddleSeriesNextWords(view.next, now))}
        </Text>
      </View>
      {view.role === 'initiator' ? <InitiatorPart view={view} {...part} /> : <MemberPart view={view} {...part} />}
      {problem ? (
        <Text style={styles.problem} testID="twin-huddle-series-detail-problem">
          {t(problem)}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function MineSwitch(props: { label: TwinHuddleWords; hint: TwinHuddleWords; value: boolean; disabled: boolean; onChange: (value: boolean) => void; styles: Styles; testID: string }) {
  const { t } = useI18n();
  return (
    <View style={props.styles.switchRow}>
      <View style={props.styles.grow}>
        <Text style={props.styles.switchLabel}>{t(props.label)}</Text>
        <Text style={props.styles.muted}>{t(props.hint)}</Text>
      </View>
      <Switch value={props.value} onValueChange={props.onChange} disabled={props.disabled} testID={props.testID} />
    </View>
  );
}

function InitiatorPart({ view, now, styles, busy, run }: PartProps<TwinHuddleSeriesInitiatorViewV0>) {
  const { t } = useI18n();
  const navigation = useNavigation<SeriesNavigation>();
  const client = mobileTwinHuddleSeriesClient();
  const active = view.status === 'active';

  const confirmEnd = (): void => {
    Alert.alert(
      t({ en: 'End this weekly plan?', zh: '结束这个每周固定？' }),
      t({ en: 'No more weekly plans will be opened. A plan already open for this week stays as it is.', zh: '以后不再每周开商量。这周已经开出来的商量不受影响。' }),
      [
        { text: t({ en: 'Keep it', zh: '先不结束' }), style: 'cancel' },
        { text: t({ en: 'End', zh: '结束' }), style: 'destructive', onPress: () => run(() => client.end(view.id)) },
      ],
    );
  };

  return (
    <>
      {active ? (
        <Text style={styles.muted} testID="twin-huddle-series-left">
          {t({ en: `${view.occurrencesLeft} more in this term.`, zh: `这一期还剩 ${view.occurrencesLeft} 次。` })}
        </Text>
      ) : null}

      <Text style={styles.label}>{t({ en: 'Who', zh: '约了谁' })}</Text>
      {view.people.map((person) => (
        <View key={person.ref} style={styles.row} testID={`twin-huddle-series-person-${person.ref}`}>
          <Text style={styles.rowLabel} numberOfLines={1}>{person.label}</Text>
          <Text style={person.joined ? styles.rowGood : styles.rowHint}>{t(person.joined ? { en: 'Joined', zh: '已加入' } : { en: 'Not joined', zh: '还没加入' })}</Text>
        </View>
      ))}

      {active ? (
        <MineSwitch
          label={{ en: "When everyone can make it, don't ask me", zh: '大家都行就不用我再选时间' }}
          hint={{ en: 'Your twin sets the time for you that week.', zh: '那一周分身直接替你定时间。' }}
          value={view.auto}
          disabled={busy}
          onChange={(auto) => run(() => client.setMine(view.id, { auto }))}
          styles={styles}
          testID="twin-huddle-series-auto"
        />
      ) : null}

      {view.runs.length > 0 ? <Text style={styles.label}>{t({ en: 'Recent weeks', zh: '最近几周' })}</Text> : null}
      {view.runs.map((item) => {
        const huddleId = item.huddleId;
        const words = t(twinHuddleSeriesRunWords(item, now));
        return huddleId === null ? (
          <View key={item.occurrence} style={styles.row} testID={`twin-huddle-series-run-${item.occurrence}`}>
            <Text style={styles.rowHint}>{words}</Text>
          </View>
        ) : (
          <TouchableOpacity
            key={item.occurrence}
            style={styles.row}
            onPress={() => navigation.navigate('TwinHuddleDetail', { id: huddleId })}
            accessibilityRole="button"
            testID={`twin-huddle-series-run-${item.occurrence}`}
          >
            <Text style={styles.rowLabel}>{words}</Text>
            <Text style={styles.rowHint}>{t({ en: 'Open', zh: '去看' })}</Text>
          </TouchableOpacity>
        );
      })}

      {view.canRenew ? (
        <TouchableOpacity style={[styles.button, busy && styles.dim]} onPress={() => run(() => client.renew(view.id))} disabled={busy} accessibilityRole="button" testID="twin-huddle-series-renew">
          <Text style={styles.buttonText}>{t({ en: `Renew for ${TERM} more weeks`, zh: `再续 ${TERM} 周` })}</Text>
        </TouchableOpacity>
      ) : null}
      {view.canEnd ? (
        <TouchableOpacity style={[styles.secondary, busy && styles.dim]} onPress={confirmEnd} disabled={busy} accessibilityRole="button" testID="twin-huddle-series-end">
          <Text style={styles.secondaryText}>{t({ en: 'End this weekly plan', zh: '结束这个每周固定' })}</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );
}

const AS_USUAL = {
  label: { en: "Same as usual: don't ask me", zh: '照旧就不用问我' },
  hint: { en: 'When everyone can make it, your twin confirms for you.', zh: '大家都行的那一周，分身直接替你确认。' },
};

function MemberPart({ view, now, styles, busy, run }: PartProps<TwinHuddleSeriesMemberViewV0>) {
  const { t } = useI18n();
  const client = mobileTwinHuddleSeriesClient();
  const [joinAuto, setJoinAuto] = useState(false);
  const lapses = twinHuddleSeriesInviteWords(view.inviteEndsAt, now);
  const setMine = (mine: TwinHuddleSeriesMineV0): void => run(() => client.setMine(view.id, mine));

  const confirmLeave = (): void => {
    Alert.alert(
      t({ en: 'Leave this weekly plan?', zh: '退出这个每周固定？' }),
      t({ en: 'You will not be asked again. You cannot rejoin this one.', zh: '以后不再约你。退出后不能再加回这一件。' }),
      [
        { text: t({ en: 'Stay', zh: '先不退' }), style: 'cancel' },
        { text: t({ en: 'Leave', zh: '退出' }), style: 'destructive', onPress: () => run(() => client.leave(view.id)) },
      ],
    );
  };

  return (
    <>
      <Text style={styles.muted}>{t({ en: `${view.peopleCount} invited, you included.`, zh: `一共邀请了 ${view.peopleCount} 位（含你）。` })}</Text>

      {view.canJoin ? (
        <>
          {lapses ? <Text style={styles.alert}>{t(lapses)}</Text> : null}
          <MineSwitch {...AS_USUAL} value={joinAuto} disabled={busy} onChange={setJoinAuto} styles={styles} testID="twin-huddle-series-join-auto" />
          <TouchableOpacity style={[styles.button, busy && styles.dim]} onPress={() => run(() => client.join(view.id, joinAuto))} disabled={busy} accessibilityRole="button" testID="twin-huddle-series-join">
            <Text style={styles.buttonText}>{t({ en: 'Join', zh: '加入' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondary, busy && styles.dim]} onPress={() => run(() => client.decline(view.id))} disabled={busy} accessibilityRole="button" testID="twin-huddle-series-decline">
            <Text style={styles.secondaryText}>{t({ en: 'Not joining', zh: '不加入' })}</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {view.myState === 'joined' && view.status === 'active' ? (
        <>
          <MineSwitch {...AS_USUAL} value={view.auto} disabled={busy} onChange={(auto) => setMine({ auto })} styles={styles} testID="twin-huddle-series-auto" />
          <MineSwitch
            label={{ en: 'Skip me next week', zh: '下周跳过我' }}
            hint={{ en: 'Only the next plan leaves you out; after that it is back to normal.', zh: '只管下一次，过后自动恢复。' }}
            value={view.skipNext}
            disabled={busy}
            onChange={(skipNext) => setMine({ skipNext })}
            styles={styles}
            testID="twin-huddle-series-skip"
          />
        </>
      ) : null}

      {view.canLeave ? (
        <TouchableOpacity style={[styles.secondary, busy && styles.dim]} onPress={confirmLeave} disabled={busy} accessibilityRole="button" testID="twin-huddle-series-leave">
          <Text style={styles.secondaryText}>{t({ en: 'Leave', zh: '退出' })}</Text>
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
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    alert: { color: c.accent, fontSize: 13, fontWeight: '700' },
    label: { color: c.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 6 },
    card: { padding: 14, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border, gap: 4 },
    cardTitle: { color: c.textPrimary, fontSize: 16, fontWeight: '700' },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 12, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border },
    rowLabel: { flex: 1, color: c.textPrimary, fontSize: 15, fontWeight: '600' },
    rowHint: { color: c.textMuted, fontSize: 13 },
    rowGood: { color: c.accent, fontSize: 13, fontWeight: '700' },
    grow: { flex: 1 },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
    switchLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '600' },
    dim: { opacity: 0.45 },
    problem: { color: c.error, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    button: { minHeight: 44, marginTop: 12, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    secondary: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
  });
