/**
 * TwinFindCardEditor — 分身 → 帮我找人 → 「找对象：我的条件卡」 (twinFind.ts `card`, `setCard`; twinFindCardView.ts). Only in
 * builds with `EXPO_PUBLIC_TWIN_FIND_CARD=1` on top of the dating build. The person's own card: six parts, each with
 * "I am" and "I am fine with", every one optional. Before the platform asks them in the app about dating, the server
 * compares it with the asker's; nobody else ever sees it, so the notice under the title says exactly that. Saving an
 * empty card clears it; clearing always works, also while the server has the card switched off. Without `canSave` (the
 * server has not opened dating to this person) it shows nothing but a card saved earlier and the button that clears it.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { TWIN_FIND_CARD_CHOICE_ITEMS_V0, TWIN_FIND_CARD_LIMITS_V0, type TwinFindCardV0 } from '../../../shared/types/twin-find-card';
import { mobileTwinFindClient } from '../../services/twinFindSession';
import {
  TWIN_FIND_CARD_ACCEPT_WORDS,
  TWIN_FIND_CARD_CITY_PLACEHOLDER_WORDS,
  TWIN_FIND_CARD_CLEARED_WORDS,
  TWIN_FIND_CARD_CLEAR_WORDS,
  TWIN_FIND_CARD_NOTICE_WORDS,
  TWIN_FIND_CARD_SAME_CITY_WORDS,
  TWIN_FIND_CARD_SAVED_WORDS,
  TWIN_FIND_CARD_SAVE_WORDS,
  TWIN_FIND_CARD_SELF_WORDS,
  TWIN_FIND_CARD_TITLE_WORDS,
  twinFindCardFailureWords,
  twinFindCardFormOf,
  twinFindCardFromForm,
  twinFindCardItemWords,
  twinFindCardOptionWords,
  twinFindCardOptions,
  twinFindCardProblemWords,
  twinFindCardWithAccept,
  twinFindCardWithSelf,
  type TwinFindCardForm,
} from '../../services/twinFindCardView';
import { twinFindFailureWords, type TwinFindWords } from '../../services/twinFindView';
import { TwinAskChip as Chip } from './TwinAskChip';

const KEY = ['twin-find', 'card'];

export function TwinFindCardEditor({ canSave }: { canSave: boolean }) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TwinFindCardForm | null>(null);
  const [message, setMessage] = useState<{ words: TwinFindWords; problem: boolean } | null>(null);
  const card = useQuery({ queryKey: KEY, queryFn: () => mobileTwinFindClient().card() });
  useEffect(() => {
    if (card.isSuccess && form === null) setForm(twinFindCardFormOf(card.data));
  }, [card.isSuccess, card.data, form]);
  const save = useMutation({
    mutationFn: (next: TwinFindCardV0 | null) => mobileTwinFindClient().setCard(next),
    onSuccess: (saved) => {
      queryClient.setQueryData(KEY, saved);
      setForm(twinFindCardFormOf(saved));
      setMessage({ words: saved === null ? TWIN_FIND_CARD_CLEARED_WORDS : TWIN_FIND_CARD_SAVED_WORDS, problem: false });
    },
    onError: (error) => setMessage({ words: twinFindCardFailureWords(error), problem: true }),
  });
  const edit = (next: TwinFindCardForm) => {
    setForm(next);
    setMessage(null);
  };
  const submit = () => {
    if (!form) return;
    const built = twinFindCardFromForm(form);
    if (built.ok === false) {
      setMessage({ words: twinFindCardProblemWords(built.reasonCode, built.field), problem: true });
      return;
    }
    save.mutate(built.value);
  };
  const cityLabel = t(twinFindCardItemWords('city'));
  const sameCityLabel = t(TWIN_FIND_CARD_SAME_CITY_WORDS);

  if (!canSave && !card.data) return null;
  return (
    <View style={styles.card} testID="twin-find-card-editor">
      <Text style={styles.title}>{t(TWIN_FIND_CARD_TITLE_WORDS)}</Text>
      <Text style={styles.muted}>{t(TWIN_FIND_CARD_NOTICE_WORDS)}</Text>
      {card.isPending ? <ActivityIndicator /> : null}
      {card.isError ? (
        <Text style={styles.problem} testID="twin-find-card-error">
          {t(twinFindFailureWords(card.error))}
        </Text>
      ) : null}
      {form && canSave ? (
        <>
          <Text style={styles.part}>{cityLabel}</Text>
          <TextInput
            style={styles.input}
            value={form.city}
            onChangeText={(city) => edit({ ...form, city })}
            maxLength={TWIN_FIND_CARD_LIMITS_V0.cityMax}
            placeholder={t(TWIN_FIND_CARD_CITY_PLACEHOLDER_WORDS)}
            accessibilityLabel={cityLabel}
            testID="twin-find-card-city"
          />
          <View style={styles.row}>
            <Text style={styles.body}>{sameCityLabel}</Text>
            <Switch value={form.sameCity} onValueChange={(sameCity) => edit({ ...form, sameCity })} accessibilityLabel={sameCityLabel} testID="twin-find-card-same-city" />
          </View>
          {TWIN_FIND_CARD_CHOICE_ITEMS_V0.map((item) => (
            <View key={item} style={styles.group} testID={`twin-find-card-${item}`}>
              <Text style={styles.part}>{t(twinFindCardItemWords(item))}</Text>
              <Text style={styles.small}>{t(TWIN_FIND_CARD_SELF_WORDS)}</Text>
              <View style={styles.chips}>
                {twinFindCardOptions(item).map((option) => (
                  <Chip
                    key={option}
                    label={t(twinFindCardOptionWords(item, option))}
                    on={form.choices[item].self === option}
                    onPress={() => edit(twinFindCardWithSelf(form, item, option))}
                    testID={`twin-find-card-${item}-self-${option}`}
                  />
                ))}
              </View>
              <Text style={styles.small}>{t(TWIN_FIND_CARD_ACCEPT_WORDS)}</Text>
              <View style={styles.chips}>
                {twinFindCardOptions(item).map((option) => (
                  <Chip
                    key={option}
                    label={t(twinFindCardOptionWords(item, option))}
                    on={(form.choices[item].accept as readonly string[]).includes(option)}
                    onPress={() => edit(twinFindCardWithAccept(form, item, option))}
                    testID={`twin-find-card-${item}-accept-${option}`}
                  />
                ))}
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.button} onPress={submit} disabled={save.isPending} accessibilityRole="button" testID="twin-find-card-save">
            <Text style={styles.buttonText}>{t(TWIN_FIND_CARD_SAVE_WORDS)}</Text>
          </TouchableOpacity>
        </>
      ) : null}
      {card.data ? (
        <TouchableOpacity style={styles.secondary} onPress={() => save.mutate(null)} disabled={save.isPending} accessibilityRole="button" testID="twin-find-card-clear">
          <Text style={styles.secondaryText}>{t(TWIN_FIND_CARD_CLEAR_WORDS)}</Text>
        </TouchableOpacity>
      ) : null}
      {message ? (
        <Text style={message.problem ? styles.problem : styles.muted} testID="twin-find-card-message">
          {t(message.words)}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: { padding: 14, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border, gap: 6 },
    title: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    body: { flex: 1, color: c.textPrimary, fontSize: 14, lineHeight: 20 },
    part: { color: c.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 8 },
    small: { color: c.textMuted, fontSize: 12 },
    group: { gap: 6 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, color: c.textPrimary, backgroundColor: c.bgPrimary },
    problem: { color: c.error, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    button: { minHeight: 44, marginTop: 12, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    secondary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
  });
