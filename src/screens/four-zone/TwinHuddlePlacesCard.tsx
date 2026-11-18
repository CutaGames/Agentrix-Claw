/**
 * TwinHuddlePlacesCard — the 「去哪」 block on one plan (TwinHuddleDetailScreen, twinHuddlePlaces.ts). Rendered only in
 * builds with `EXPO_PUBLIC_TWIN_HUDDLE_PLACES=1`. The organizer adds places and settles on one before choosing the time;
 * an invited person marks the ones that work and may add one. When the server has the feature off it answers 404 and
 * this block shows nothing.
 */
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import type { TwinHuddlePersonV0 } from '../../../shared/types/twin-huddle';
import { TWIN_HUDDLE_PLACES_LIMITS_V0, type TwinHuddlePlacesViewV0 } from '../../../shared/types/twin-huddle-places';
import { TwinHuddleError } from '../../services/twinHuddle';
import {
  twinHuddlePlaceByWords,
  twinHuddlePlaceFailureWords,
  twinHuddlePlaceLabelProblem,
  twinHuddlePlaceOkWords,
  twinHuddlePlacePicksToggled,
  twinHuddlePlacesHintWords,
} from '../../services/twinHuddlePlaces';
import { mobileTwinHuddlePlacesClient } from '../../services/twinHuddlePlacesSession';

interface Props {
  huddleId: string;
  /** The plan's current stage. Part of the query key: when the plan moves on, the places are read again. */
  stage: string;
  /** Only the organizer has these: their own names for the people they invited. */
  people?: readonly TwinHuddlePersonV0[];
}

export function TwinHuddlePlacesCard({ huddleId, stage, people }: Props) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const key = ['twin-huddle', 'places', huddleId, stage];
  const places = useQuery({ queryKey: key, queryFn: () => mobileTwinHuddlePlacesClient().get(huddleId), retry: false });
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<{ en: string; zh: string } | null>(null);

  const change = useMutation({
    mutationFn: (run: () => Promise<TwinHuddlePlacesViewV0>) => run(),
    onSuccess: (view) => {
      setProblem(null);
      queryClient.setQueryData(key, view);
    },
    onError: (error) => {
      setProblem(twinHuddlePlaceFailureWords(error));
      if (error instanceof TwinHuddleError && error.failure === 'changed') void places.refetch();
    },
  });
  const busy = change.isPending;

  const add = (): void => {
    const local = twinHuddlePlaceLabelProblem(draft);
    if (local) {
      setProblem(local);
      return;
    }
    change.mutate(() => mobileTwinHuddlePlacesClient().add(huddleId, draft.trim()), { onSuccess: () => setDraft('') });
  };

  if (places.isPending) {
    return (
      <View style={styles.card} testID="twin-huddle-places-loading">
        <ActivityIndicator />
      </View>
    );
  }
  if (places.isError) {
    // Not open on the server, or not for this person: say nothing rather than show an error for a feature they never saw.
    if (places.error instanceof TwinHuddleError && places.error.failure === 'not_found') return null;
    return (
      <View style={styles.card} testID="twin-huddle-places-error">
        <Text style={styles.heading}>{t({ en: 'Where', zh: '去哪' })}</Text>
        <Text style={styles.muted}>{t(twinHuddlePlaceFailureWords(places.error))}</Text>
        <TouchableOpacity style={styles.smallButton} onPress={() => void places.refetch()} accessibilityRole="button" testID="twin-huddle-places-retry">
          <Text style={styles.smallButtonText}>{t({ en: 'Try again', zh: '重试' })}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const view = places.data;
  return (
    <View style={styles.card} testID="twin-huddle-places-card">
      <Text style={styles.heading}>{t({ en: 'Where', zh: '去哪' })}</Text>
      <Text style={styles.muted}>{t(twinHuddlePlacesHintWords(view))}</Text>
      {view.places.length === 0 && view.open ? (
        <Text style={styles.muted} testID="twin-huddle-places-empty">
          {t({ en: 'No places yet.', zh: '还没有候选地点。' })}
        </Text>
      ) : null}
      {view.places.map((place) => (
        <View key={place.id} style={[styles.row, place.chosen && styles.rowChosen]} testID={`twin-huddle-place-${place.id}`}>
          <View style={styles.grow}>
            <Text style={styles.label}>
              {place.label}
              {place.chosen ? ` · ${t({ en: 'settled', zh: '已定' })}` : ''}
            </Text>
            <Text style={styles.hint}>
              {t(twinHuddlePlaceByWords(place, people))} · {t(twinHuddlePlaceOkWords(place.okCount))}
            </Text>
          </View>
          {view.canPick ? (
            <TouchableOpacity
              style={[place.ok ? styles.on : styles.smallButton, busy && styles.dim]}
              disabled={busy}
              onPress={() => change.mutate(() => mobileTwinHuddlePlacesClient().setPicks(huddleId, twinHuddlePlacePicksToggled(view.places, place.id)))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: place.ok, disabled: busy }}
              testID={`twin-huddle-place-pick-${place.id}`}
            >
              <Text style={place.ok ? styles.onText : styles.smallButtonText}>{t(place.ok ? { en: 'Works for me ✓', zh: '我可以 ✓' } : { en: 'Works for me', zh: '这家我可以' })}</Text>
            </TouchableOpacity>
          ) : null}
          {view.canChoose ? (
            <TouchableOpacity
              style={[place.chosen ? styles.on : styles.smallButton, busy && styles.dim]}
              disabled={busy}
              onPress={() => change.mutate(() => mobileTwinHuddlePlacesClient().choose(huddleId, place.chosen ? null : place.id))}
              accessibilityRole="button"
              testID={`twin-huddle-place-choose-${place.id}`}
            >
              <Text style={place.chosen ? styles.onText : styles.smallButtonText}>{t(place.chosen ? { en: 'Undo', zh: '取消' } : { en: 'Go here', zh: '定这家' })}</Text>
            </TouchableOpacity>
          ) : null}
          {place.canRemove ? (
            <TouchableOpacity
              style={[styles.remove, busy && styles.dim]}
              disabled={busy}
              onPress={() => change.mutate(() => mobileTwinHuddlePlacesClient().remove(huddleId, place.id))}
              accessibilityRole="button"
              accessibilityLabel={t({ en: `Remove ${place.label}`, zh: `删掉${place.label}` })}
              testID={`twin-huddle-place-remove-${place.id}`}
            >
              <Text style={styles.removeText}>{t({ en: 'Remove', zh: '删掉' })}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
      {view.canAdd ? (
        <View style={styles.inline}>
          <TextInput
            style={[styles.input, styles.grow]}
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              setProblem(null);
            }}
            onSubmitEditing={add}
            maxLength={TWIN_HUDDLE_PLACES_LIMITS_V0.labelMax}
            placeholder={t({ en: 'Name of a place', zh: '店名，比如：老地方火锅' })}
            returnKeyType="done"
            editable={!busy}
            testID="twin-huddle-place-input"
          />
          <TouchableOpacity style={[styles.smallButton, busy && styles.dim]} onPress={add} disabled={busy} accessibilityRole="button" testID="twin-huddle-place-add">
            <Text style={styles.smallButtonText}>{t({ en: 'Add', zh: '加上' })}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {problem ? (
        <Text style={styles.problem} testID="twin-huddle-places-problem">
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
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border },
    rowChosen: { borderTopColor: c.accent },
    grow: { flex: 1 },
    label: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    hint: { color: c.textMuted, fontSize: 13, marginTop: 2 },
    inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, color: c.textPrimary, backgroundColor: c.bgPrimary },
    smallButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    smallButtonText: { color: c.accent, fontSize: 13, fontWeight: '700' },
    on: { minHeight: 36, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    onText: { color: c.onAccent, fontSize: 13, fontWeight: '700' },
    remove: { minHeight: 36, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
    removeText: { color: c.error, fontSize: 13, fontWeight: '600' },
    problem: { color: c.error, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    dim: { opacity: 0.45 },
  });
