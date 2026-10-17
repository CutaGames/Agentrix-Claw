/**
 * SpendApprovalCard — D2 on the phone: one payment that waits for the owner (spendApproval.ts, contract
 * `shared/types/spend-budget.ts` v0). Shown in 事项 → 待我处理 (push ref `spa_…`) and under the assistant bubble
 * (chat `approval_required` with `approvalRef`). Only in builds with `EXPO_PUBLIC_SPEND_APPROVAL_CARD=1`.
 *
 * - Shows the server's record: amount in USD from `amountCents`, the original currency when not USD, payee,
 *   payment kind, minutes left. Until the first read answers, the chat event's summary is shown as "读取中".
 * - Buttons follow `spendApprovalButtons`; each decision is two taps (button + confirm).
 * - A step-up request opens StepUpSheet; after it confirms the decision is retried once (runSpendApprovalDecision).
 * - After any decision the card shows the record the server returned or a fresh read, never what was sent.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../stores/i18nStore';
import { useThemedStyles, type Palette } from '../theme/useTheme';
import { StepUpSheet } from './StepUpSheet';
import {
  SPEND_APPROVAL_COPY,
  SPEND_APPROVAL_PHONE_COPY,
  SPEND_APPROVAL_STATUS_TITLE,
  spendApprovalProblemCopy,
  type SpendApprovalProblemV0,
} from '../services/spendApprovalCopy';
import {
  SpendApprovalError,
  effectiveSpendApprovalStatus,
  formatSpendOriginal,
  formatSpendUsdCents,
  runSpendApprovalDecision,
  spendApprovalButtons,
  spendApprovalMinutesLeft,
  spendPathLabel,
  spendPayeeDisplay,
  type SpendApprovalDecisionV0,
  type SpendApprovalFailureV0,
} from '../services/spendApproval';
// Words: spendApprovalCopy.ts, the same as the web card (compared word for word in its test).
import { mobileSpendApprovalClient } from '../services/spendApprovalSession';
import type { SpendApprovalSummaryV0, SpendApprovalViewV0 } from '../../shared/types/spend-budget';

type Lang = 'zh' | 'en';
type Problem = SpendApprovalProblemV0;

export interface SpendApprovalCardProps {
  approvalRef: string;
  /** From the chat event: shown (as "reading") until the first read answers. */
  initial?: { spend: SpendApprovalSummaryV0; expiresAt: string } | null;
  testID?: string;
}

export const spendApprovalQueryKey = (approvalRef: string) => ['spend-approval', approvalRef] as const;

export function SpendApprovalCard({ approvalRef, initial, testID }: SpendApprovalCardProps) {
  const { t, language } = useI18n();
  const lang: Lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<SpendApprovalDecisionV0 | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [stepUpVisible, setStepUpVisible] = useState(false);
  const stepUpAnswer = useRef<((confirmed: boolean) => void) | null>(null);
  const alive = useRef(true);
  const key = spendApprovalQueryKey(approvalRef);
  const record = useQuery({
    queryKey: key,
    queryFn: () => mobileSpendApprovalClient().read(approvalRef),
    retry: 0,
    staleTime: 5_000,
  });

  useEffect(() => {
    alive.current = true;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      alive.current = false;
      clearInterval(timer);
      stepUpAnswer.current?.(false);
      stepUpAnswer.current = null;
    };
  }, []);

  const view: SpendApprovalViewV0 | undefined = record.data;
  const spend = view?.spend ?? initial?.spend ?? null;
  const expiresAt = view?.expiresAt ?? initial?.expiresAt ?? null;
  const readFailure: SpendApprovalFailureV0 | null =
    record.isError ? (record.error instanceof SpendApprovalError ? record.error.failure : 'unavailable') : null;

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

  const decide = async (decision: SpendApprovalDecisionV0) => {
    setBusy(decision);
    setProblem(null);
    const outcome = await runSpendApprovalDecision({ client: mobileSpendApprovalClient(), approvalRef, decision, confirmStepUp });
    if (!alive.current) return;
    setBusy(null);
    if (outcome.view) queryClient.setQueryData(key, outcome.view);
    else void queryClient.invalidateQueries({ queryKey: key });
    if (outcome.kind === 'failed') setProblem(outcome.failure);
  };

  const ask = (decision: SpendApprovalDecisionV0) => {
    const amount = spend ? formatSpendUsdCents(spend.amountCents, lang) : null;
    const payee = spend ? spendPayeeDisplay(spend.payeeLabel, lang) : '';
    const approve = decision === 'approve';
    Alert.alert(
      approve ? t(SPEND_APPROVAL_PHONE_COPY.confirmApprove) : t(SPEND_APPROVAL_PHONE_COPY.confirmReject),
      amount ? `${amount} · ${payee}` : payee,
      [
        { text: t(SPEND_APPROVAL_PHONE_COPY.cancel), style: 'cancel' },
        {
          text: approve ? t(SPEND_APPROVAL_COPY.approve) : t(SPEND_APPROVAL_COPY.reject),
          style: approve ? 'default' : 'destructive',
          onPress: () => void decide(decision),
        },
      ],
    );
  };

  const status = view ? effectiveSpendApprovalStatus(view, now) : null;
  const buttons = view ? spendApprovalButtons(view, now) : { approve: false, reject: false };
  const minutes = expiresAt && status === 'pending' ? spendApprovalMinutesLeft(expiresAt, now) : 0;
  const amount = spend ? formatSpendUsdCents(spend.amountCents, lang) : null;
  const original = spend ? formatSpendOriginal(spend.original) : null;

  return (
    <View style={styles.card} testID={testID ?? `spend-approval-${approvalRef}`}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {status ? t(SPEND_APPROVAL_STATUS_TITLE[status]) : t(SPEND_APPROVAL_COPY.loading)}
        </Text>
        {status === 'pending' && minutes > 0 ? <Text style={styles.due}>{t(SPEND_APPROVAL_PHONE_COPY.minutesLeft(minutes))}</Text> : null}
      </View>
      {spend ? (
        <>
          {amount ? (
            <Text style={styles.amount} accessibilityLabel={`${t(SPEND_APPROVAL_COPY.amount)} ${amount}`}>
              {amount}
            </Text>
          ) : null}
          {original ? <Text style={styles.muted}>{t(SPEND_APPROVAL_PHONE_COPY.original(original))}</Text> : null}
          <Text style={styles.detail} numberOfLines={2}>
            {t(SPEND_APPROVAL_COPY.payee)} {spendPayeeDisplay(spend.payeeLabel, lang)}
          </Text>
          <Text style={styles.detail}>
            {t(SPEND_APPROVAL_COPY.kind)} {t(spendPathLabel(spend.path))}
          </Text>
          {spend.stepUpRequired && (!status || status === 'pending') ? <Text style={styles.hint}>{t(SPEND_APPROVAL_COPY.stepUpNote)}</Text> : null}
        </>
      ) : null}
      {view?.resultSummary ? (
        <Text style={styles.detail} numberOfLines={3}>
          {view.resultSummary}
        </Text>
      ) : null}
      {readFailure && !view ? (
        <View style={styles.problemRow}>
          <Text style={styles.problem} testID="spend-approval-read-failed">
            {t(spendApprovalProblemCopy(readFailure === 'not_found' ? 'not_found' : 'unreadable'))}
          </Text>
          {readFailure !== 'not_found' ? (
            <TouchableOpacity onPress={() => void record.refetch()} accessibilityRole="button" testID="spend-approval-retry">
              <Text style={styles.link}>{t(SPEND_APPROVAL_COPY.retry)}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {problem && problem !== 'expired' ? (
        <Text style={styles.problem} testID="spend-approval-problem">
          {t(spendApprovalProblemCopy(problem))}
        </Text>
      ) : null}
      {buttons.approve || buttons.reject ? (
        <View style={styles.actions}>
          {buttons.reject ? (
            <TouchableOpacity
              style={styles.rejectButton}
              onPress={() => ask('reject')}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel={`${t(SPEND_APPROVAL_COPY.reject)} ${amount ?? ''}`}
              testID="spend-approval-reject"
            >
              <Text style={styles.rejectText}>{t(busy === 'reject' ? SPEND_APPROVAL_COPY.rejecting : SPEND_APPROVAL_COPY.reject)}</Text>
            </TouchableOpacity>
          ) : null}
          {buttons.approve ? (
            <TouchableOpacity
              style={styles.approveButton}
              onPress={() => ask('approve')}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel={`${t(SPEND_APPROVAL_COPY.approve)} ${amount ?? ''}`}
              testID="spend-approval-approve"
            >
              <Text style={styles.approveText}>{t(busy === 'approve' ? SPEND_APPROVAL_COPY.approving : SPEND_APPROVAL_COPY.approve)}</Text>
            </TouchableOpacity>
          ) : null}
          {busy ? <ActivityIndicator /> : null}
        </View>
      ) : null}
      <StepUpSheet visible={stepUpVisible} onConfirmed={() => closeStepUp(true)} onCancel={() => closeStepUp(false)} />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: c.bgCard, borderColor: c.accent, borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    title: { color: c.textPrimary, fontSize: 15, fontWeight: '800', flexShrink: 1 },
    due: { color: c.warning, fontSize: 12, fontWeight: '800' },
    amount: { color: c.textPrimary, fontSize: 24, fontWeight: '800' },
    detail: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
    muted: { color: c.textMuted, fontSize: 12 },
    hint: { color: c.textMuted, fontSize: 12, lineHeight: 17 },
    problemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
    problem: { color: c.danger, fontSize: 13, lineHeight: 18 },
    link: { color: c.accent, fontSize: 13, fontWeight: '800', minHeight: 32, textAlignVertical: 'center' },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 4 },
    rejectButton: {
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rejectText: { color: c.danger, fontSize: 14, fontWeight: '800' },
    // Token pair: text on the primary fill is onAccent (11.4).
    approveButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    approveText: { color: c.onAccent, fontSize: 14, fontWeight: '800' },
  });
