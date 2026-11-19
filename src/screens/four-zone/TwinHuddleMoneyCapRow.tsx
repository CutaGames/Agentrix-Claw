/**
 * TwinHuddleMoneyCapRow — 「上限内不用问我」 at the bottom of the bill card (TwinHuddleMoneyCard, money-cap-design.md). Test mode
 * only, like the card: the person sets how much their twin may agree to for them, and nothing is charged. Rendered only
 * in builds with `EXPO_PUBLIC_TWIN_HUDDLE_MONEY_CAP=1`. When the server has the feature off it answers 404 and the row
 * shows nothing.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { TWIN_HUDDLE_MONEY_CURRENCIES_V0, type TwinHuddleMoneyCapViewV0 } from '../../../shared/types/twin-huddle-money';
import { TwinHuddleError } from '../../services/twinHuddle';
import {
  TWIN_HUDDLE_MONEY_CAP_COPY,
  TWIN_HUDDLE_MONEY_CAP_RULES,
  TWIN_HUDDLE_MONEY_TEST_BADGE,
  twinHuddleMoneyCapFailureWords,
  twinHuddleMoneyCapInput,
  twinHuddleMoneyCapProblem,
  twinHuddleMoneyCapStateWords,
  type TwinHuddleMoneyCapDraft,
} from '../../services/twinHuddleMoney';
import { mobileTwinHuddleMoneyCapClient } from '../../services/twinHuddleMoneySession';

/** The limit belongs to the person, not to one plan: every bill card reads and updates this one entry. */
export const TWIN_HUDDLE_MONEY_CAP_QUERY_KEY = ['twin-huddle', 'money-cap'] as const;

export function TwinHuddleMoneyCapRow() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const cap = useQuery({ queryKey: TWIN_HUDDLE_MONEY_CAP_QUERY_KEY, queryFn: () => mobileTwinHuddleMoneyCapClient().get(), retry: false });
  const [open, setOpen] = useState(false);
  // Empty until the person types: the form starts from the limit already set.
  const [typed, setTyped] = useState<Partial<TwinHuddleMoneyCapDraft>>({});
  const [problem, setProblem] = useState<{ en: string; zh: string } | null>(null);

  const change = useMutation({
    mutationFn: (run: () => Promise<TwinHuddleMoneyCapViewV0>) => run(),
    onSuccess: (view) => {
      setProblem(null);
      setTyped({});
      queryClient.setQueryData(TWIN_HUDDLE_MONEY_CAP_QUERY_KEY, view);
    },
    onError: (error) => setProblem(twinHuddleMoneyCapFailureWords(error)),
  });
  const busy = change.isPending;

  if (cap.isPending) return null;
  if (cap.isError) {
    if (cap.error instanceof TwinHuddleError && cap.error.failure === 'not_found') return null;
    return (
      <View style={styles.row} testID="twin-huddle-money-cap-error">
        <Text style={styles.label}>{t(TWIN_HUDDLE_MONEY_CAP_COPY.row)}</Text>
        <Text style={styles.hint}>{t(twinHuddleMoneyCapFailureWords(cap.error))}</Text>
        <TouchableOpacity style={styles.smallButton} onPress={() => void cap.refetch()} accessibilityRole="button" testID="twin-huddle-money-cap-retry">
          <Text style={styles.smallButtonText}>{t({ en: 'Try again', zh: '重试' })}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const view = cap.data;
  const draft: TwinHuddleMoneyCapDraft = {
    currency: typed.currency ?? view.cap?.currency ?? 'USD',
    perBill: typed.perBill ?? (view.cap ? twinHuddleMoneyCapInput(view.cap.perBillMinor) : ''),
    weekly: typed.weekly ?? (view.cap ? twinHuddleMoneyCapInput(view.cap.weeklyMinor) : ''),
  };
  const type = (next: Partial<TwinHuddleMoneyCapDraft>): void => {
    setTyped({ ...typed, ...next });
    setProblem(null);
  };
  const save = (): void => {
    const local = twinHuddleMoneyCapProblem(draft);
    if (local) {
      setProblem(local);
      return;
    }
    change.mutate(() => mobileTwinHuddleMoneyCapClient().set(draft));
  };

  return (
    <View style={styles.row} testID="twin-huddle-money-cap-row">
      <View style={styles.inline}>
        <Text style={[styles.label, styles.grow]}>{t(TWIN_HUDDLE_MONEY_CAP_COPY.row)}</Text>
        <TouchableOpacity
          style={styles.smallButton}
          onPress={() => setOpen(!open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          testID="twin-huddle-money-cap-toggle"
        >
          <Text style={styles.smallButtonText}>{t(open ? { en: 'Close', zh: '收起' } : { en: 'Set', zh: '设置' })}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hint} testID="twin-huddle-money-cap-state">
        {t(twinHuddleMoneyCapStateWords(view))}
      </Text>
      {open ? (
        <View style={styles.form} testID="twin-huddle-money-cap-form">
          <Text style={styles.badge}>{t(TWIN_HUDDLE_MONEY_TEST_BADGE)}</Text>
          <Text style={styles.hint} testID="twin-huddle-money-cap-rules">
            {t(TWIN_HUDDLE_MONEY_CAP_RULES)}
          </Text>
          {view.available ? (
            <View style={styles.form}>
              <View style={styles.inline}>
                {TWIN_HUDDLE_MONEY_CURRENCIES_V0.map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={item === draft.currency ? styles.on : styles.smallButton}
                    onPress={() => type({ currency: item })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: item === draft.currency }}
                    testID={`twin-huddle-money-cap-currency-${item}`}
                  >
                    <Text style={item === draft.currency ? styles.onText : styles.smallButtonText}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.inline}>
                <Text style={styles.field}>{t(TWIN_HUDDLE_MONEY_CAP_COPY.perBill)}</Text>
                <TextInput
                  style={[styles.input, styles.grow]}
                  value={draft.perBill}
                  onChangeText={(text) => type({ perBill: text })}
                  keyboardType="decimal-pad"
                  maxLength={10}
                  placeholder={t({ en: 'For example 50', zh: '比如 50' })}
                  editable={!busy}
                  testID="twin-huddle-money-cap-per-bill"
                />
              </View>
              <View style={styles.inline}>
                <Text style={styles.field}>{t(TWIN_HUDDLE_MONEY_CAP_COPY.weekly)}</Text>
                <TextInput
                  style={[styles.input, styles.grow]}
                  value={draft.weekly}
                  onChangeText={(text) => type({ weekly: text })}
                  keyboardType="decimal-pad"
                  maxLength={10}
                  placeholder={t({ en: 'For example 80', zh: '比如 80' })}
                  editable={!busy}
                  testID="twin-huddle-money-cap-weekly"
                />
              </View>
              <TouchableOpacity style={[styles.on, busy && styles.dim]} disabled={busy} onPress={save} accessibilityRole="button" testID="twin-huddle-money-cap-save">
                <Text style={styles.onText}>{t(TWIN_HUDDLE_MONEY_CAP_COPY.save)}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {view.cap ? (
            <TouchableOpacity
              style={[styles.remove, busy && styles.dim]}
              disabled={busy}
              onPress={() => change.mutate(() => mobileTwinHuddleMoneyCapClient().clear())}
              accessibilityRole="button"
              testID="twin-huddle-money-cap-clear"
            >
              <Text style={styles.removeText}>{t(TWIN_HUDDLE_MONEY_CAP_COPY.clear)}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {problem ? (
        <Text style={styles.problem} testID="twin-huddle-money-cap-problem">
          {t(problem)}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: { gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.border },
    form: { gap: 8 },
    inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    grow: { flex: 1 },
    label: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    hint: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    field: { color: c.textMuted, fontSize: 13, minWidth: 84 },
    badge: { alignSelf: 'flex-start', color: c.accent, fontSize: 12, fontWeight: '700', borderWidth: 1, borderColor: c.accent, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
    input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, color: c.textPrimary, backgroundColor: c.bgPrimary },
    smallButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    smallButtonText: { color: c.accent, fontSize: 13, fontWeight: '700' },
    on: { minHeight: 36, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    onText: { color: c.onAccent, fontSize: 13, fontWeight: '700' },
    remove: { minHeight: 36, alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center' },
    removeText: { color: c.error, fontSize: 13, fontWeight: '600' },
    problem: { color: c.error, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    dim: { opacity: 0.45 },
  });
