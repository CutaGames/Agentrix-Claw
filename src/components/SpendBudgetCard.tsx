/**
 * SpendBudgetCard — 花费预算 on the passport screen (D1 settings entry, mobile; spendBudget.ts, contract v0.2).
 * Rendered only behind EXPO_PUBLIC_SPEND_BUDGET_CARD=1; a 404 (server routes off, or not your Agent) shows nothing.
 * Lowering saves at once; raising opens StepUpSheet and sends the same change once more (runSpendBudgetSave);
 * a change made elsewhere first (409) is not overwritten: the card shows the budget as read again.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiConfig } from '../services/api';
import { mobileV6HttpTransport } from '../services/mobileV6Runtime';
import { formatSpendUsdCents } from '../services/spendApproval';
import {
  SPEND_BUDGET_AMOUNT_PROBLEM,
  SPEND_BUDGET_FAILURE_COPY,
  SPEND_BUDGET_FIELDS,
  SpendBudgetError,
  createMobileSpendBudgetClient,
  runSpendBudgetSave,
  spendBudgetDraft,
  spendBudgetFromDraft,
  spendBudgetProblem,
  spendBudgetWidens,
  type MobileSpendBudgetClientV0,
  type SpendBudgetDraft,
} from '../services/spendBudget';
import { useAuthStore } from '../stores/authStore';
import { useI18n } from '../stores/i18nStore';
import { useThemedStyles, type Palette } from '../theme/useTheme';
import { StepUpSheet } from './StepUpSheet';

type Copy = { zh: string; en: string };

const COPY = {
  title: { zh: '花费预算', en: 'Spending budget' },
  intro: {
    zh: 'Agent 每次花钱都先对照这里的上限。改小立即生效；改大要再确认一次是你本人。',
    en: 'Every payment your Agent makes is checked against these limits. Lowering takes effect at once; raising asks you to confirm it is you.',
  },
  cannotSpend: { zh: '有上限是 0，这只 Agent 现在还不能花钱。', en: 'A limit is 0, so this Agent cannot spend yet.' },
  usd: { zh: '（美元）', en: ' (USD)' },
  edit: { zh: '调整预算', en: 'Adjust budget' },
  save: { zh: '保存', en: 'Save' },
  saving: { zh: '正在保存…', en: 'Saving…' },
  cancel: { zh: '取消', en: 'Cancel' },
  loading: { zh: '正在读取预算…', en: 'Reading the budget…' },
  retry: { zh: '重新读取', en: 'Read again' },
  widens: { zh: '有几项改大了，保存时要再确认一次是你本人。', en: 'Some limits go up, so you will confirm it is you when saving.' },
  saved: { zh: '已保存，新的预算已经生效。', en: 'Saved; the new budget is in effect.' },
} satisfies Record<string, Copy>;

function mobileSpendBudgetClient(): MobileSpendBudgetClientV0 {
  return createMobileSpendBudgetClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}

export function SpendBudgetCard({ agentAccountId }: { agentAccountId: string }) {
  const { t, language } = useI18n();
  const lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const key = ['four-zone', 'spend-budget', agentAccountId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => mobileSpendBudgetClient().read(agentAccountId),
    enabled: Boolean(agentAccountId),
    retry: 0,
    staleTime: 30_000,
  });
  const [draft, setDraft] = useState<SpendBudgetDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ copy: Copy; ok: boolean } | null>(null);
  const [stepUpVisible, setStepUpVisible] = useState(false);
  const stepUpAnswer = useRef<((confirmed: boolean) => void) | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  if (query.isError && query.error instanceof SpendBudgetError && query.error.failure === 'not_found') return null;
  const view = query.data;

  const confirmStepUp = () =>
    new Promise<boolean>((resolve) => {
      stepUpAnswer.current = resolve;
      setStepUpVisible(true);
    });
  const closeStepUp = (confirmed: boolean) => {
    setStepUpVisible(false);
    stepUpAnswer.current?.(confirmed);
    stepUpAnswer.current = null;
  };

  const save = async () => {
    if (busy || !view || !draft) return;
    const settings = spendBudgetFromDraft(draft, view.revision);
    if (!settings) return setMessage({ copy: SPEND_BUDGET_AMOUNT_PROBLEM, ok: false });
    const invalid = spendBudgetProblem(settings);
    if (invalid) return setMessage({ copy: invalid, ok: false });
    setBusy(true);
    setMessage(null);
    const outcome = await runSpendBudgetSave({ client: mobileSpendBudgetClient(), agentAccountId, settings, confirmStepUp });
    if (!alive.current) return;
    setBusy(false);
    if (outcome.kind === 'done') {
      queryClient.setQueryData(key, outcome.view);
      setDraft(null);
      setMessage({ copy: COPY.saved, ok: true });
      return;
    }
    if (outcome.view) {
      queryClient.setQueryData(key, outcome.view);
      setDraft(null);
    }
    if (outcome.failure === 'not_found') void queryClient.invalidateQueries({ queryKey: key });
    setMessage({ copy: SPEND_BUDGET_FAILURE_COPY[outcome.failure], ok: false });
  };

  const parsed = view && draft ? spendBudgetFromDraft(draft, view.revision) : null;
  const widens = view && parsed ? spendBudgetWidens(view, parsed) : false;
  const cannotSpend = Boolean(view) && (view.singleTxLimitCents === 0 || view.dailyLimitCents === 0 || view.monthlyLimitCents === 0);

  return (
    <>
      <Text style={styles.section}>{t(COPY.title)}</Text>
      <View style={styles.block} testID="spend-budget-card">
        <Text style={styles.note}>{t(COPY.intro)}</Text>
        {!view ? (
          query.isError ? (
            <>
              <Text style={styles.note}>{t(SPEND_BUDGET_FAILURE_COPY.unreadable)}</Text>
              <TouchableOpacity onPress={() => void query.refetch()} accessibilityRole="button" style={styles.linkButton}>
                <Text style={styles.linkText}>{t(COPY.retry)}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.note}>{t(COPY.loading)}</Text>
          )
        ) : draft ? (
          <>
            {SPEND_BUDGET_FIELDS.map(({ key: field, label, hint }) => (
              <View key={field} style={styles.field}>
                <Text style={styles.label}>
                  {t(label)}
                  {t(COPY.usd)}
                </Text>
                <TextInput
                  value={draft[field]}
                  onChangeText={(text) => setDraft((current) => (current ? { ...current, [field]: text } : current))}
                  keyboardType="decimal-pad"
                  accessibilityLabel={t(label)}
                  style={styles.input}
                  testID={`spend-budget-input-${field}`}
                />
                {hint ? <Text style={styles.hint}>{t(hint)}</Text> : null}
              </View>
            ))}
            {widens ? <Text style={styles.note}>{t(COPY.widens)}</Text> : null}
            <View style={styles.row}>
              <TouchableOpacity
                onPress={() => void save()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                style={[styles.primary, busy ? styles.disabled : null]}
                testID="spend-budget-save"
              >
                <Text style={styles.primaryText}>{busy ? t(COPY.saving) : t(COPY.save)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setDraft(null);
                  setMessage(null);
                }}
                disabled={busy}
                accessibilityRole="button"
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>{t(COPY.cancel)}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            {SPEND_BUDGET_FIELDS.map(({ key: field, label }) => (
              <View key={field} style={styles.valueRow}>
                <Text style={styles.label}>{t(label)}</Text>
                <Text style={styles.value}>{formatSpendUsdCents(view[field], lang) ?? '—'}</Text>
              </View>
            ))}
            {cannotSpend ? <Text style={styles.note}>{t(COPY.cannotSpend)}</Text> : null}
            <TouchableOpacity
              onPress={() => {
                setDraft(spendBudgetDraft(view));
                setMessage(null);
              }}
              accessibilityRole="button"
              style={styles.secondary}
              testID="spend-budget-edit"
            >
              <Text style={styles.secondaryText}>{t(COPY.edit)}</Text>
            </TouchableOpacity>
          </>
        )}
        {message ? (
          <Text style={message.ok ? styles.ok : styles.danger} accessibilityLiveRegion="polite">
            {t(message.copy)}
          </Text>
        ) : null}
      </View>
      <StepUpSheet visible={stepUpVisible} onConfirmed={() => closeStepUp(true)} onCancel={() => closeStepUp(false)} />
    </>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    section: { color: c.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 4 },
    block: { backgroundColor: c.bgCard, borderRadius: 16, padding: 15, borderWidth: 1, borderColor: c.border, gap: 8 },
    note: { color: c.textSecondary, fontSize: 13, lineHeight: 20 },
    field: { gap: 4 },
    label: { color: c.textPrimary, fontSize: 13, fontWeight: '700' },
    hint: { color: c.textSecondary, fontSize: 12, lineHeight: 18 },
    input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, color: c.textPrimary, fontSize: 15 },
    valueRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    value: { color: c.textPrimary, fontSize: 14, fontWeight: '800' },
    row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    primary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    primaryText: { color: c.onAccent, fontSize: 14, fontWeight: '800' },
    secondary: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: c.textPrimary, fontSize: 14, fontWeight: '700' },
    disabled: { opacity: 0.5 },
    ok: { color: c.success, fontSize: 13, fontWeight: '800' },
    danger: { color: c.danger, fontSize: 13, fontWeight: '800' },
    linkButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
    linkText: { color: c.accent, fontSize: 13, fontWeight: '800' },
  });
