/**
 * TrustLadderCard — 放手程度 on the passport screen (L6-6, trustLadder.ts), next to the D1 budget card.
 * Rendered only behind EXPO_PUBLIC_TRUST_LADDER=1; a 404 (server off, or not your Agent) shows nothing.
 * The budget follows the level, so a save also refreshes the budget card.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TRUST_LADDER_LEVELS_V0, type TrustLadderLevelV0, type TrustLadderUpdateV0 } from '../../shared/types/trust-ladder';
import { getApiConfig } from '../services/api';
import { mobileV6HttpTransport } from '../services/mobileV6Runtime';
import { parseDollarsToCents } from '../services/spendBudget';
import {
  TRUST_LADDER_FAILURE_COPY,
  TRUST_LADDER_LEVEL_COPY,
  TrustLadderError,
  createMobileTrustLadderClient,
  runTrustLadderSave,
  type MobileTrustLadderClientV0,
} from '../services/trustLadder';
import { useAuthStore } from '../stores/authStore';
import { useI18n } from '../stores/i18nStore';
import { useThemedStyles, type Palette } from '../theme/useTheme';
import { StepUpSheet } from './StepUpSheet';

type Copy = { zh: string; en: string };

const LIMIT_FIELDS = [
  ['singleTxLimitCents', { zh: '单笔上限（美元）', en: 'Per payment (USD)' }],
  ['dailyLimitCents', { zh: '每天上限（美元）', en: 'Per day (USD)' }],
  ['monthlyLimitCents', { zh: '每月上限（美元）', en: 'Per month (USD)' }],
  ['freeApprovalCents', { zh: '免批准额度（美元）', en: 'No approval up to (USD)' }],
] as const;
type LimitKey = (typeof LIMIT_FIELDS)[number][0];

function mobileTrustLadderClient(): MobileTrustLadderClientV0 {
  return createMobileTrustLadderClient({
    transport: mobileV6HttpTransport,
    baseUrl: getApiConfig().baseUrl || 'https://api.agentrix.top/api',
    token: () => getApiConfig().token || useAuthStore.getState().token,
  });
}

export function TrustLadderCard({ agentAccountId }: { agentAccountId: string }) {
  const { language } = useI18n();
  const lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const key = ['four-zone', 'trust-ladder', agentAccountId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => mobileTrustLadderClient().read(agentAccountId),
    enabled: Boolean(agentAccountId),
    retry: 0,
    staleTime: 30_000,
  });
  const [picked, setPicked] = useState<TrustLadderLevelV0 | null>(null);
  const [limits, setLimits] = useState<Record<LimitKey, string>>({ singleTxLimitCents: '', dailyLimitCents: '', monthlyLimitCents: '', freeApprovalCents: '' });
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

  if (query.isError && query.error instanceof TrustLadderError && query.error.failure === 'closed') return null;
  const view = query.data;
  const level = picked ?? view?.level ?? null;

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
    if (busy || !view || !level) return;
    let update: TrustLadderUpdateV0 = { level, budgetRevision: view.budgetRevision };
    if (level === 'commit') {
      const cents = {} as Record<LimitKey, number>;
      for (const [field] of LIMIT_FIELDS) {
        const value = parseDollarsToCents(limits[field]);
        if (value === null) return setMessage({ copy: TRUST_LADDER_FAILURE_COPY.limits_required, ok: false });
        cents[field] = value;
      }
      update = { ...update, limits: cents };
    }
    setBusy(true);
    setMessage(null);
    const outcome = await runTrustLadderSave({ client: mobileTrustLadderClient(), agentAccountId, update, confirmStepUp });
    if (!alive.current) return;
    setBusy(false);
    if (outcome.kind === 'done') {
      queryClient.setQueryData(key, outcome.view);
      setPicked(null);
      void queryClient.invalidateQueries({ queryKey: ['four-zone', 'spend-budget', agentAccountId] });
      setMessage({ copy: { zh: '已保存。', en: 'Saved.' }, ok: true });
      return;
    }
    if (outcome.view) {
      queryClient.setQueryData(key, outcome.view);
      setPicked(null);
    }
    setMessage({ copy: TRUST_LADDER_FAILURE_COPY[outcome.failure], ok: false });
  };

  const failure = query.error instanceof TrustLadderError ? query.error.failure : query.error ? 'unavailable' : null;
  return (
    <View style={styles.card} testID="trust-ladder-card">
      <Text style={styles.title}>{lang === 'zh' ? '放手程度' : 'How far it may go alone'}</Text>
      {query.isLoading ? <Text style={styles.muted}>{lang === 'zh' ? '正在读取…' : 'Reading…'}</Text> : null}
      {failure ? <Text style={styles.muted}>{TRUST_LADDER_FAILURE_COPY[failure][lang]}</Text> : null}
      {view
        ? TRUST_LADDER_LEVELS_V0.map((option) => (
            <TouchableOpacity
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected: level === option }}
              onPress={() => setPicked(option)}
              style={styles.option}
            >
              <Text style={[styles.radio, level === option ? styles.radioOn : null]}>{level === option ? '●' : '○'}</Text>
              <Text style={styles.optionText}>
                <Text style={styles.optionLabel}>{TRUST_LADDER_LEVEL_COPY[option].label[lang]}</Text>
                {' · '}
                {TRUST_LADDER_LEVEL_COPY[option].detail[lang]}
              </Text>
            </TouchableOpacity>
          ))
        : null}
      {view && level === 'commit'
        ? LIMIT_FIELDS.map(([field, label]) => (
            <View key={field} style={styles.row}>
              <Text style={styles.limitLabel}>{label[lang]}</Text>
              <TextInput
                value={limits[field]}
                onChangeText={(text) => setLimits((current) => ({ ...current, [field]: text }))}
                keyboardType="decimal-pad"
                style={styles.input}
                accessibilityLabel={label[lang]}
              />
            </View>
          ))
        : null}
      {view ? (
        <Text style={styles.muted} testID="trust-ladder-checklist">
          {lang === 'zh' ? '第一周两步：' : 'First week: '}
          {view.checklist.connectCalendar === 'done'
            ? lang === 'zh' ? '✓ 连上日历' : '✓ calendar connected'
            : lang === 'zh' ? '○ 连上日历，拿到第一笔预约' : '○ connect the calendar for a first booking'}
          {' · '}
          {view.checklist.setBudget === 'done'
            ? lang === 'zh' ? '✓ 设好预算' : '✓ budget set'
            : lang === 'zh' ? '○ 设好预算，付第一笔' : '○ set a budget for a first payment'}
        </Text>
      ) : null}
      {view ? (
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void save()}>
          <Text style={[styles.link, busy ? styles.disabled : null]}>{busy ? (lang === 'zh' ? '保存中…' : 'Saving…') : lang === 'zh' ? '保存' : 'Save'}</Text>
        </TouchableOpacity>
      ) : null}
      {message ? <Text style={message.ok ? styles.ok : styles.muted}>{message.copy[lang]}</Text> : null}
      <StepUpSheet visible={stepUpVisible} onConfirmed={() => closeStepUp(true)} onCancel={() => closeStepUp(false)} />
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: p.card, borderRadius: 16, padding: 16, marginTop: 12, gap: 8 },
    title: { color: p.text, fontSize: 16, fontWeight: '700' },
    option: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    radio: { color: p.textMuted, fontSize: 14, lineHeight: 20 },
    radioOn: { color: p.accent },
    optionText: { flex: 1, color: p.text, fontSize: 13, lineHeight: 20 },
    optionLabel: { fontWeight: '700' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    limitLabel: { flex: 1, color: p.text, fontSize: 13 },
    input: { width: 110, color: p.text, borderWidth: 1, borderColor: p.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    muted: { color: p.textMuted, fontSize: 13 },
    ok: { color: p.accent, fontSize: 13 },
    link: { color: p.accent, fontSize: 14, fontWeight: '600' },
    disabled: { opacity: 0.4 },
  });
