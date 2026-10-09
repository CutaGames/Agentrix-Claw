/**
 * AutomationProposalCard — E1 / E2 slice 4 on the phone: one automation the Agent proposed in chat
 * (automationProposal.ts, contract `shared/types/agent-automation.ts` v0). Shown under the assistant bubble when the
 * chat stream sends an `automation_proposal` event; only in builds with `EXPO_PUBLIC_AGENT_AUTOMATIONS=1`.
 *
 * - Everything the Agent wrote (title, instruction, trigger summary) is plain text.
 * - Confirm / decline answer once; a step-up request opens StepUpSheet, then retries once.
 * - After an answer the card shows what the server said (created with its next run, or declined), never what was sent.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useI18n } from '../stores/i18nStore';
import { useThemedStyles, type Palette } from '../theme/useTheme';
import { StepUpSheet } from './StepUpSheet';
import {
  AUTOMATION_PROPOSAL_COPY as COPY,
  automationProposalDelivery,
  automationProposalFailureCopy,
  automationProposalInstruction,
  automationProposalSpend,
  automationProposalTitle,
  automationProposalWhen,
  runAutomationProposalAnswer,
  type AutomationProposalActionV0,
  type AutomationProposalOutcomeV0,
  type MobileAutomationProposalClientV0,
} from '../services/automationProposal';
import { mobileAutomationProposalClient } from '../services/automationProposalSession';
import { automationConfirmNeedsStepUpV0, type AutomationProposalV0 } from '../../shared/types/agent-automation';

export interface AutomationProposalCardProps {
  proposal: AutomationProposalV0;
  client?: MobileAutomationProposalClientV0;
  testID?: string;
}

export function AutomationProposalCard({ proposal, client, testID }: AutomationProposalCardProps) {
  const { t, language } = useI18n();
  const lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<AutomationProposalOutcomeV0 | null>(null);
  const [stepUpVisible, setStepUpVisible] = useState(false);
  const stepUpAnswer = useRef<((confirmed: boolean) => void) | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stepUpAnswer.current?.(false);
      stepUpAnswer.current = null;
    };
  }, []);

  const locale = lang === 'zh' ? 'zh-CN' : 'en-US';
  const time = (value: string) => new Date(value).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const done = outcome?.kind === 'confirmed' || outcome?.kind === 'declined';
  const spend = automationProposalSpend(proposal);

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

  const answer = async (action: AutomationProposalActionV0) => {
    setBusy(true);
    setOutcome(null);
    const result = await runAutomationProposalAnswer({
      client: client ?? mobileAutomationProposalClient(),
      proposalRef: proposal.proposalRef,
      action,
      confirmStepUp,
    });
    if (!alive.current) return;
    setBusy(false);
    setOutcome(result);
  };

  return (
    <View style={styles.card} testID={testID ?? `automation-proposal-${proposal.proposalRef}`}>
      <Text style={styles.muted}>{t(COPY.heading)}</Text>
      <Text style={styles.title} accessibilityRole="header">
        {automationProposalTitle(proposal, lang)}
      </Text>
      <Text style={styles.label}>{t(COPY.when)}</Text>
      <Text style={styles.detail} testID="automation-proposal-when">{automationProposalWhen(proposal, lang)}</Text>
      <Text style={styles.label}>{t(COPY.what)}</Text>
      <Text style={styles.detail} testID="automation-proposal-instruction">{automationProposalInstruction(proposal)}</Text>
      <Text style={styles.label}>{t(COPY.where)}</Text>
      <Text style={styles.detail}>{automationProposalDelivery(proposal, lang)}</Text>
      <Text style={styles.label}>{t(COPY.spend)}</Text>
      <Text style={styles.detail} testID="automation-proposal-spend">{spend ?? t(COPY.noSpend)}</Text>
      <Text style={styles.label}>{t(COPY.tools)}</Text>
      <Text style={styles.detail}>{proposal.tools.length > 0 ? proposal.tools.join(', ') : t(COPY.noTools)}</Text>
      {automationConfirmNeedsStepUpV0(proposal) && !done ? <Text style={styles.hint}>{t(COPY.stepUp)}</Text> : null}
      {!done ? <Text style={styles.hint}>{`${t(COPY.expires)}${time(proposal.expiresAt)}`}</Text> : null}
      {outcome?.kind === 'confirmed' ? (
        <Text style={styles.result} testID="automation-proposal-result">
          {`${t(COPY.confirmed)}${outcome.nextRunAt ? ` ${t(COPY.nextRun)}${time(outcome.nextRunAt)}` : ''}`}
        </Text>
      ) : null}
      {outcome?.kind === 'declined' ? (
        <Text style={styles.result} testID="automation-proposal-result">{t(COPY.declined)}</Text>
      ) : null}
      {outcome?.kind === 'failed' ? (
        <Text style={styles.problem} accessibilityRole="alert" testID="automation-proposal-error">
          {t(automationProposalFailureCopy(outcome.failure))}
        </Text>
      ) : null}
      {!done ? (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.declineButton}
            onPress={() => void answer('decline')}
            disabled={busy}
            accessibilityRole="button"
            testID="automation-proposal-decline"
          >
            <Text style={styles.declineText}>{t(COPY.decline)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.confirmButton}
            onPress={() => void answer('confirm')}
            disabled={busy}
            accessibilityRole="button"
            testID="automation-proposal-confirm"
          >
            <Text style={styles.confirmText}>{t(busy ? COPY.busy : COPY.confirm)}</Text>
          </TouchableOpacity>
          {busy ? <ActivityIndicator /> : null}
        </View>
      ) : null}
      <StepUpSheet visible={stepUpVisible} onConfirmed={() => closeStepUp(true)} onCancel={() => closeStepUp(false)} />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: { backgroundColor: c.bgCard, borderColor: c.accent, borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
    title: { color: c.textPrimary, fontSize: 15, fontWeight: '800', marginBottom: 4 },
    label: { color: c.textMuted, fontSize: 12, marginTop: 4 },
    detail: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
    muted: { color: c.textMuted, fontSize: 12 },
    hint: { color: c.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
    result: { color: c.textPrimary, fontSize: 13, lineHeight: 19, marginTop: 6 },
    problem: { color: c.danger, fontSize: 13, lineHeight: 18, marginTop: 6 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 8 },
    declineButton: {
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    declineText: { color: c.textPrimary, fontSize: 14, fontWeight: '800' },
    // Token pair: text on the primary fill is onAccent.
    confirmButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    confirmText: { color: c.onAccent, fontSize: 14, fontWeight: '800' },
  });
