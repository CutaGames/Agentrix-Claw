/**
 * P0-W2-3 — Mobile Stripe → MPC L2 single-payment demo (PRD mobile-prd-v3 §4.4)
 *
 * Flow:
 *   1. User taps "Pay with Stripe" → backend creates PaymentIntent → presents Stripe sheet (mock here).
 *   2. On success, payment is settled to user's MPC custodial wallet on AWS KMS Singapore.
 *   3. To withdraw / forward funds (L2 risk), trigger /api/v1/approval/request → user authenticates
 *      with biometric (Face ID / Fingerprint) on this device → /api/v1/approval/:id/approve.
 *
 * Pure scaffold for end-to-end happy-path; production code will use:
 *   - @stripe/stripe-react-native PaymentSheet
 *   - expo-local-authentication for biometric
 *   - Real MPC sign-and-broadcast on backend
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { colors } from '../../theme/colors';

type Stage = 'idle' | 'paying' | 'paid' | 'requesting' | 'awaiting_biometric' | 'approving' | 'done' | 'error';

export function PayMpcDemoScreen() {
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [approvalId, setApprovalId] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStage('idle');
    setError(null);
    setApprovalId(null);
  }, []);

  const startStripePayment = useCallback(async () => {
    setStage('paying');
    setError(null);
    try {
      // Mock — production: stripe.confirmPaymentSheetPayment()
      await new Promise((r) => setTimeout(r, 1200));
      setStage('paid');
    } catch (e: any) {
      setError(e?.message || 'Stripe payment failed');
      setStage('error');
    }
  }, []);

  const requestL2Approval = useCallback(async () => {
    setStage('requesting');
    setError(null);
    try {
      // POST /api/v1/approval/request — mock approvalId
      const id = `apv_${Date.now()}`;
      setApprovalId(id);
      setStage('awaiting_biometric');
    } catch (e: any) {
      setError(e?.message || 'Approval request failed');
      setStage('error');
    }
  }, []);

  const authenticateAndApprove = useCallback(async () => {
    if (!approvalId) return;
    setStage('approving');
    setError(null);
    try {
      // expo-local-authentication.authenticateAsync(...) — mock
      await new Promise((r) => setTimeout(r, 800));
      // POST /api/v1/approval/:id/approve { surface: 'mobile', biometric: true }
      await new Promise((r) => setTimeout(r, 600));
      setStage('done');
      Alert.alert('完成', 'L2 支付已签名并广播');
    } catch (e: any) {
      setError(e?.message || 'Biometric authentication failed');
      setStage('error');
    }
  }, [approvalId]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Stripe → MPC L2 支付 Demo</Text>
      <Text style={styles.subtitle}>
        Stripe 充值 → AWS KMS Singapore 托管钱包 → 生物认证授权 L2 出金
      </Text>

      <View style={styles.timeline}>
        <TimelineStep label="Stripe 收款" active={['paying', 'paid', 'requesting', 'awaiting_biometric', 'approving', 'done'].includes(stage)} />
        <TimelineStep label="MPC 入账" active={['paid', 'requesting', 'awaiting_biometric', 'approving', 'done'].includes(stage)} />
        <TimelineStep label="L2 申请" active={['requesting', 'awaiting_biometric', 'approving', 'done'].includes(stage)} />
        <TimelineStep label="生物认证" active={['approving', 'done'].includes(stage)} />
        <TimelineStep label="完成" active={stage === 'done'} />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.actions}>
        {stage === 'idle' && (
          <PrimaryButton label="① Stripe 支付 $10" onPress={startStripePayment} />
        )}
        {stage === 'paying' && <ActivityIndicator color={colors.accent} />}
        {stage === 'paid' && (
          <PrimaryButton label="② 申请 L2 出金授权" onPress={requestL2Approval} />
        )}
        {stage === 'requesting' && <ActivityIndicator color={colors.accent} />}
        {stage === 'awaiting_biometric' && (
          <PrimaryButton label="③ Face ID / 指纹授权" onPress={authenticateAndApprove} />
        )}
        {stage === 'approving' && <ActivityIndicator color={colors.accent} />}
        {(stage === 'done' || stage === 'error') && (
          <PrimaryButton label="重置" onPress={reset} />
        )}
      </View>
    </View>
  );
}

function TimelineStep({ label, active }: { label: string; active: boolean }) {
  return (
    <View style={styles.timelineRow}>
      <View style={[styles.dot, active && styles.dotActive]} />
      <Text style={[styles.timelineLabel, active && styles.timelineLabelActive]}>{label}</Text>
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.btn} onPress={onPress}>
      <Text style={styles.btnLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, padding: 20 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: 24 },
  timeline: { gap: 12, marginBottom: 24 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accent },
  timelineLabel: { color: colors.textMuted, fontSize: 14 },
  timelineLabelActive: { color: colors.textPrimary, fontWeight: '600' },
  error: { color: '#ef4444', marginVertical: 12 },
  actions: { marginTop: 'auto' },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnLabel: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

export default PayMpcDemoScreen;
