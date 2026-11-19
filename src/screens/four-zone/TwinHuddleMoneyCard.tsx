/**
 * TwinHuddleMoneyCard — the 「账单」 block on a settled plan (TwinHuddleDetailScreen, twinHuddleMoney.ts). Test mode only:
 * it keeps a record and moves no money, and says so next to the heading at all times. Rendered only in builds with
 * `EXPO_PUBLIC_TWIN_HUDDLE_MONEY=1`. The organizer opens a sheet; everyone on it answers for their own part. When the
 * server has the feature off it answers 404 and this block shows nothing. Builds with `EXPO_PUBLIC_TWIN_HUDDLE_MONEY_CAP=1`
 * also show the limit row at the bottom (TwinHuddleMoneyCapRow).
 */
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import type { TwinHuddlePersonV0 } from '../../../shared/types/twin-huddle';
import {
  TWIN_HUDDLE_MONEY_CURRENCIES_V0,
  twinHuddleMoneyFormatV0,
  type TwinHuddleMoneyCurrencyV0,
  type TwinHuddleMoneyKindV0,
  type TwinHuddleMoneyViewV0,
} from '../../../shared/types/twin-huddle-money';
import { TwinHuddleError } from '../../services/twinHuddle';
import {
  TWIN_HUDDLE_BILL_STATUS_COPY,
  TWIN_HUDDLE_MONEY_CAP_COPY,
  TWIN_HUDDLE_MONEY_CAP_ENABLED,
  TWIN_HUDDLE_MONEY_CONFLICT_COPY,
  TWIN_HUDDLE_MONEY_KIND_COPY,
  TWIN_HUDDLE_MONEY_TEST_BADGE,
  TWIN_HUDDLE_SHARE_STATUS_COPY,
  twinHuddleBillMineWords,
  twinHuddleBillProgressWords,
  twinHuddleBillTitleWords,
  twinHuddleMoneyFailureWords,
  twinHuddleMoneyFormProblem,
  twinHuddleMoneyGuestsWords,
  twinHuddleMoneyHintWords,
  twinHuddleMoneyPreviewWords,
  twinHuddleMoneyRefsToggled,
  twinHuddleShareWhoWords,
} from '../../services/twinHuddleMoney';
import { mobileTwinHuddleMoneyClient } from '../../services/twinHuddleMoneySession';
import { TWIN_HUDDLE_MONEY_CAP_QUERY_KEY, TwinHuddleMoneyCapRow } from './TwinHuddleMoneyCapRow';

interface Props {
  huddleId: string;
  /** Only the organizer has these: their own names for the people they invited. */
  people?: readonly TwinHuddlePersonV0[];
}

export function TwinHuddleMoneyCard({ huddleId, people }: Props) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const key = ['twin-huddle', 'money', huddleId];
  const money = useQuery({ queryKey: key, queryFn: () => mobileTwinHuddleMoneyClient().get(huddleId), retry: false });
  const [kind, setKind] = useState<TwinHuddleMoneyKindV0 | null>(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<TwinHuddleMoneyCurrencyV0>('USD');
  // Everyone who can be on the next sheet is on it until the organizer taps their name.
  const [leftOut, setLeftOut] = useState<string[]>([]);
  const [problem, setProblem] = useState<{ en: string; zh: string } | null>(null);

  const change = useMutation({
    mutationFn: (run: () => Promise<TwinHuddleMoneyViewV0>) => run(),
    onSuccess: (view) => {
      setProblem(null);
      queryClient.setQueryData(key, view);
    },
    onError: (error) => {
      setProblem(twinHuddleMoneyFailureWords(error));
      if (error instanceof TwinHuddleError && error.failure === 'changed') void money.refetch();
    },
  });
  const busy = change.isPending;

  const heading = (
    <View style={styles.headingRow}>
      <Text style={styles.heading}>{t({ en: 'Money', zh: '账单' })}</Text>
      <Text style={styles.badge} testID="twin-huddle-money-test-badge">
        {t(TWIN_HUDDLE_MONEY_TEST_BADGE)}
      </Text>
    </View>
  );

  if (money.isPending) {
    return (
      <View style={styles.card} testID="twin-huddle-money-loading">
        <ActivityIndicator />
      </View>
    );
  }
  if (money.isError) {
    // Not open on the server, or not for this person: say nothing rather than show an error for a feature they never saw.
    if (money.error instanceof TwinHuddleError && money.error.failure === 'not_found') return null;
    return (
      <View style={styles.card} testID="twin-huddle-money-error">
        {heading}
        <Text style={styles.muted}>{t(twinHuddleMoneyFailureWords(money.error))}</Text>
        <TouchableOpacity style={styles.smallButton} onPress={() => void money.refetch()} accessibilityRole="button" testID="twin-huddle-money-retry">
          <Text style={styles.smallButtonText}>{t({ en: 'Try again', zh: '重试' })}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const view = money.data;
  const picked = view.eligibleRefs.filter((ref) => !leftOut.includes(ref));
  const nextKind = kind !== null && view.canCreate.includes(kind) ? kind : view.canCreate[0];
  const preview = twinHuddleMoneyPreviewWords(amount, picked.length, currency);
  const guests = twinHuddleMoneyGuestsWords(view.guestsLeftOut);

  const open = (): void => {
    const local = twinHuddleMoneyFormProblem(amount, picked);
    if (local) {
      setProblem(local);
      return;
    }
    change.mutate(() => mobileTwinHuddleMoneyClient().create(huddleId, { kind: nextKind, amount, currency, refs: picked }), { onSuccess: () => setAmount('') });
  };

  return (
    <View style={styles.card} testID="twin-huddle-money-card">
      {heading}
      <Text style={styles.muted}>{t(twinHuddleMoneyHintWords(view))}</Text>
      {view.bills.length === 0 && view.canCreate.length === 0 && view.available ? (
        <Text style={styles.muted} testID="twin-huddle-money-empty">
          {t(view.role === 'initiator' ? TWIN_HUDDLE_MONEY_CONFLICT_COPY.nobody_to_split : { en: 'No sheet has been opened.', zh: '发起人还没有开单。' })}
        </Text>
      ) : null}
      {view.bills.map((bill) => {
        const mine = bill.shares === null ? twinHuddleBillMineWords(bill) : null;
        return (
          <View key={bill.id} style={[styles.bill, bill.status === 'held' && styles.billHeld]} testID={`twin-huddle-bill-${bill.id}`}>
            <Text style={styles.label}>{t(twinHuddleBillTitleWords(bill))}</Text>
            <Text style={styles.hint}>
              {t(TWIN_HUDDLE_BILL_STATUS_COPY[bill.status])} · {t(twinHuddleBillProgressWords(bill))}
            </Text>
            {mine ? (
              <Text style={styles.hint} testID={`twin-huddle-bill-mine-${bill.id}`}>
                {t(mine)}
              </Text>
            ) : null}
            {/* Whatever this build's limit switch says: the person can always see and take back what the twin agreed to. */}
            {bill.mine?.byCap ? (
              <View style={styles.inline}>
                <Text style={[styles.hint, styles.grow]} testID={`twin-huddle-bill-by-cap-${bill.id}`}>
                  {t(TWIN_HUDDLE_MONEY_CAP_COPY.byCap)}
                </Text>
                {bill.canRevoke ? (
                  <TouchableOpacity
                    style={[styles.smallButton, busy && styles.dim]}
                    disabled={busy}
                    onPress={() =>
                      change.mutate(() => mobileTwinHuddleMoneyClient().decide(huddleId, bill.id, 'declined'), {
                        onSuccess: () => void queryClient.invalidateQueries({ queryKey: TWIN_HUDDLE_MONEY_CAP_QUERY_KEY }),
                      })
                    }
                    accessibilityRole="button"
                    testID={`twin-huddle-bill-revoke-${bill.id}`}
                  >
                    <Text style={styles.smallButtonText}>{t(TWIN_HUDDLE_MONEY_CAP_COPY.revoke)}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            {bill.shares
              ? bill.shares.map((share, index) => (
                  <Text key={`${bill.id}-${index}`} style={styles.hint}>
                    {t(twinHuddleShareWhoWords(share, people))} · {twinHuddleMoneyFormatV0(share.amountMinor, bill.total.currency)} · {t(TWIN_HUDDLE_SHARE_STATUS_COPY[share.status])}
                  </Text>
                ))
              : null}
            {bill.canDecide ? (
              <View style={styles.inline}>
                <TouchableOpacity
                  style={[styles.on, busy && styles.dim]}
                  disabled={busy}
                  onPress={() => change.mutate(() => mobileTwinHuddleMoneyClient().decide(huddleId, bill.id, 'confirmed'))}
                  accessibilityRole="button"
                  testID={`twin-huddle-bill-agree-${bill.id}`}
                >
                  <Text style={styles.onText}>{t({ en: 'Agree to my part', zh: '同意我这份' })}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallButton, busy && styles.dim]}
                  disabled={busy}
                  onPress={() => change.mutate(() => mobileTwinHuddleMoneyClient().decide(huddleId, bill.id, 'declined'))}
                  accessibilityRole="button"
                  testID={`twin-huddle-bill-decline-${bill.id}`}
                >
                  <Text style={styles.smallButtonText}>{t({ en: 'No', zh: '不同意' })}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {bill.canCancel ? (
              <TouchableOpacity
                style={[styles.remove, busy && styles.dim]}
                disabled={busy}
                onPress={() => change.mutate(() => mobileTwinHuddleMoneyClient().cancel(huddleId, bill.id))}
                accessibilityRole="button"
                testID={`twin-huddle-bill-cancel-${bill.id}`}
              >
                <Text style={styles.removeText}>{t({ en: 'Cancel this sheet', zh: '取消这张单' })}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })}
      {view.canCreate.length > 0 ? (
        <View style={styles.form} testID="twin-huddle-money-form">
          <View style={styles.inline}>
            {view.canCreate.map((item) => (
              <TouchableOpacity
                key={item}
                style={item === nextKind ? styles.on : styles.smallButton}
                onPress={() => setKind(item)}
                accessibilityRole="radio"
                accessibilityState={{ selected: item === nextKind }}
                testID={`twin-huddle-money-kind-${item}`}
              >
                <Text style={item === nextKind ? styles.onText : styles.smallButtonText}>{t(TWIN_HUDDLE_MONEY_KIND_COPY[item])}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.inline}>
            <TextInput
              style={[styles.input, styles.grow]}
              value={amount}
              onChangeText={(text) => {
                setAmount(text);
                setProblem(null);
              }}
              keyboardType="decimal-pad"
              maxLength={10}
              placeholder={t({ en: 'Total, for example 300', zh: '总额，比如 300' })}
              editable={!busy}
              testID="twin-huddle-money-amount"
            />
            {TWIN_HUDDLE_MONEY_CURRENCIES_V0.map((item) => (
              <TouchableOpacity
                key={item}
                style={item === currency ? styles.on : styles.smallButton}
                onPress={() => setCurrency(item)}
                accessibilityRole="radio"
                accessibilityState={{ selected: item === currency }}
                testID={`twin-huddle-money-currency-${item}`}
              >
                <Text style={item === currency ? styles.onText : styles.smallButtonText}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>{t({ en: 'Split with:', zh: '和谁一起分：' })}</Text>
          <View style={styles.chips}>
            {view.eligibleRefs.map((ref) => {
              const on = picked.includes(ref);
              return (
                <TouchableOpacity
                  key={ref}
                  style={on ? styles.on : styles.smallButton}
                  onPress={() => {
                    const next = twinHuddleMoneyRefsToggled(view.eligibleRefs, picked, ref);
                    setLeftOut(view.eligibleRefs.filter((item) => !next.includes(item)));
                    setProblem(null);
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  testID={`twin-huddle-money-ref-${ref}`}
                >
                  <Text style={on ? styles.onText : styles.smallButtonText}>{t(twinHuddleShareWhoWords({ ref }, people))}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {preview ? (
            <Text style={styles.hint} testID="twin-huddle-money-preview">
              {t(preview)}
            </Text>
          ) : null}
          {guests ? <Text style={styles.hint}>{t(guests)}</Text> : null}
          <TouchableOpacity style={[styles.smallButton, busy && styles.dim]} onPress={open} disabled={busy} accessibilityRole="button" testID="twin-huddle-money-open">
            <Text style={styles.smallButtonText}>{t({ en: 'Open the sheet', zh: '开单' })}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {problem ? (
        <Text style={styles.problem} testID="twin-huddle-money-problem">
          {t(problem)}
        </Text>
      ) : null}
      {TWIN_HUDDLE_MONEY_CAP_ENABLED ? <TwinHuddleMoneyCapRow /> : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: { padding: 14, borderRadius: 12, backgroundColor: c.bgCard, borderWidth: 1, borderColor: c.border, gap: 8 },
    headingRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    heading: { color: c.textPrimary, fontSize: 16, fontWeight: '700' },
    badge: { color: c.accent, fontSize: 12, fontWeight: '700', borderWidth: 1, borderColor: c.accent, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    bill: { gap: 4, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border },
    billHeld: { borderTopColor: c.accent },
    form: { gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.border },
    grow: { flex: 1 },
    label: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    hint: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
