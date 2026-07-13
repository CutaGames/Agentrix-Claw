/**
 * Trust3SigningSheet — unified high-risk signing surface (R6).
 *
 * Behaviour:
 *   1. Caller emits `companionEvents.emit('trust3-signing-request', ...)`
 *      OR imperatively calls `trust3SigningSheetRef.current.present(req)`.
 *   2. The CompanionLayer subscribes to the event and calls present(req).
 *   3. Sheet pops to 70% snap point; ball is locked into 'signing' mode.
 *   4. Pre-flight dedup: if backend says signRequestId is already
 *      completed (R6.12), short-circuit with cached signature, fire
 *      onConfirm, dismiss without prompting biometric.
 *   5. User taps Face ID / fingerprint → expo-local-authentication →
 *      synthetic signature is POSTed to `/v1/wallet/sign-request/:id/complete`.
 *      Phase 1 the "signature" we submit is the biometric-attested device
 *      attestation token; backend's `mpc-signer` is the actual chain
 *      signer. This matches the existing PayMpcDemoScreen mock contract.
 *   6. 60s countdown drives a progress bar; on timeout we POST cancel.
 *   7. On any terminal state (success/cancel/timeout) we emit
 *      `trust3-signing-completed` or `-cancelled`, set ball mode back to
 *      'companion', and dismiss.
 *
 * Spec: requirements.md R1.11 / R6.1 / R6.2 / R6.3 / R6.4 / R6.6 / R6.10
 *       / R6.11 / R6.12, design.md §Components/Core 4.
 */
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { useActivePet } from '../../services/activePet.service';
import { companionEvents } from '../../services/companionEvents.service';
import { setCompanionMode, getCompanionMode } from '../../services/petMode';
import {
  cancelSignRequest,
  completeSignRequest,
  getSignRequest,
  type SignRequestStatus,
} from '../../services/signRequest.service';
import {
  trust3SigningSheetRef,
  type Trust3SignRequest,
  type Trust3SigningSheetHandle,
} from './sheetRefRegistry';
import { themedStyles } from '../../theme/useTheme';

const SNAP_POINTS = ['70%'];
const DEFAULT_TIMEOUT_MS = 60_000;

type SheetState =
  | { phase: 'idle' }
  | { phase: 'pending'; req: Trust3SignRequest; expiresAt: number }
  | { phase: 'biometric'; req: Trust3SignRequest; expiresAt: number }
  | { phase: 'submitting'; req: Trust3SignRequest }
  | { phase: 'completed'; req: Trust3SignRequest; signature: string }
  | { phase: 'failed'; req: Trust3SignRequest; reason: string };

const RISK_BADGE: Record<NonNullable<Trust3SignRequest['metadata']['risk']>, { emoji: string; label: string; color: string }> = {
  L0: { emoji: '🟢', label: '最低风险', color: colors.success },
  L1: { emoji: '🟡', label: '一般风险', color: colors.info },
  L2: { emoji: '🟠', label: '关注风险', color: colors.warning },
  L3: { emoji: '🔴', label: '高风险', color: colors.danger },
};

const REASON_TITLE_ZH: Record<Trust3SignRequest['reason'], string> = {
  'wallet-transfer': '转账签名',
  'marketplace-purchase': '集市购买签名',
  'skill-install': '技能安装签名',
  'remote-control': '远程控制签名',
  approval: '审批签名',
  'agentic-commerce-overlimit': '自主交易超额签名',
};

export const Trust3SigningSheet = forwardRef<Trust3SigningSheetHandle>(
  function Trust3SigningSheet(_props, externalRef) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const pet = useActivePet();
    const [state, setState] = useState<SheetState>({ phase: 'idle' });
    const countdownAnim = useRef(new Animated.Value(1)).current;
    const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearExpiryTimer = useCallback(() => {
      if (expiryTimerRef.current) {
        clearTimeout(expiryTimerRef.current);
        expiryTimerRef.current = null;
      }
    }, []);

    const finalizeAndDismiss = useCallback(
      (reason: 'user' | 'timeout' | 'error', payload?: { signature?: string; errorReason?: string }) => {
        clearExpiryTimer();
        const cur = state.phase !== 'idle' ? (state as any).req as Trust3SignRequest : null;
        if (cur) {
          if (reason === 'user' || reason === 'timeout' || (reason === 'error' && !payload?.signature)) {
            companionEvents.emit({
              type: 'trust3-signing-cancelled',
              signRequestId: cur.signRequestId,
              reason: reason === 'timeout' ? 'timeout' : payload?.errorReason ?? reason,
            });
            try {
              cur.onCancel?.(reason);
            } catch {
              /* ignore */
            }
          }
        }
        // Always reset companion mode out of 'signing'.
        const m = getCompanionMode();
        if (m === 'signing') setCompanionMode('companion', 'trust3-sheet-closed');
        setState({ phase: 'idle' });
        countdownAnim.setValue(1);
        sheetRef.current?.dismiss();
      },
      [clearExpiryTimer, countdownAnim, state],
    );

    const present = useCallback(
      async (req: Trust3SignRequest) => {
        const timeoutMs = Math.max(5_000, req.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        const expiresAt = Date.now() + timeoutMs;

        // P-9 wave 14 (T24.2): perf budget is P95 ≤ 200ms from emit →
        // sheet visible. Mark closes after the present() call returns.
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const perfMod = require('../../services/companionPerf') as typeof import('../../services/companionPerf');
        const perfTok = perfMod.beginMark('trust3-sheet-present', {
          reason: req.reason,
        });

        // Pre-flight dedup (R6.12): skip biometric if signature already cached.
        try {
          const remote = await getSignRequest(req.signRequestId);
          if (remote.status === 'completed' && remote.signature) {
            setCompanionMode('signing', 'trust3-dedup-hit', { force: true });
            companionEvents.emit({
              type: 'trust3-signing-completed',
              signRequestId: req.signRequestId,
              success: true,
              durationMs: 0,
            });
            try {
              await req.onConfirm?.(remote.signature);
            } catch {
              /* ignore */
            }
            setCompanionMode('companion', 'trust3-dedup-done', { force: true });
            return;
          }
          if (remote.status === 'cancelled' || remote.status === 'expired') {
            // Already invalid — short-circuit with onCancel.
            try {
              req.onCancel?.('error');
            } catch {
              /* ignore */
            }
            return;
          }
        } catch {
          // Network failure — proceed with full flow; backend will reject
          // duplicates via idempotencyKey if applicable.
        }

        // Lock the ball into signing mode (R1.11). force=true bypasses the
        // Local_Action_Wins debouncer because user pressed something high-risk.
        setCompanionMode('signing', 'trust3-sheet-open', { force: true });

        setState({ phase: 'pending', req, expiresAt });
        sheetRef.current?.present();

        // Drive a 0..1 countdown bar.
        countdownAnim.setValue(1);
        Animated.timing(countdownAnim, {
          toValue: 0,
          duration: timeoutMs,
          easing: Easing.linear,
          useNativeDriver: false,
        }).start();
        perfMod.endMark(perfTok);

        // Fail-safe expiry timer (covers app backgrounding etc).
        clearExpiryTimer();
        expiryTimerRef.current = setTimeout(() => {
          // Fire cancel to backend best-effort.
          cancelSignRequest(req.signRequestId, 'timeout').catch(() => undefined);
          finalizeAndDismiss('timeout');
        }, timeoutMs);
      },
      [clearExpiryTimer, countdownAnim, finalizeAndDismiss],
    );

    const dismiss = useCallback(() => {
      // Treat as user cancel; explicit cancel sends backend cancel too.
      if (state.phase !== 'idle') {
        const req = (state as any).req as Trust3SignRequest;
        cancelSignRequest(req.signRequestId, 'user-dismissed').catch(() => undefined);
      }
      finalizeAndDismiss('user');
    }, [state, finalizeAndDismiss]);

    const handle = useMemo<Trust3SigningSheetHandle>(
      () => ({ present, dismiss }),
      [present, dismiss],
    );
    useImperativeHandle(externalRef, () => handle, [handle]);
    useEffect(() => {
      trust3SigningSheetRef.current = handle;
      return () => {
        trust3SigningSheetRef.current = null;
      };
    }, [handle]);

    // Subscribe to bus events that originate sign requests.
    useEffect(() => {
      const off = companionEvents.subscribe('trust3-signing-request', (evt) => {
        present({
          signRequestId: evt.signRequestId,
          reason: evt.reason,
          metadata: (evt.metadata as Trust3SignRequest['metadata']) ?? {},
          timeoutMs: Math.max(5_000, evt.expiresAtMs - Date.now()),
        });
      });
      return () => off();
    }, [present]);

    const performBiometric = useCallback(async () => {
      if (state.phase !== 'pending') return;
      const req = state.req;
      const startedAt = Date.now();
      try {
        setState({ phase: 'biometric', req, expiresAt: state.expiresAt });
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } catch {
          /* ignore */
        }
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHardware || !isEnrolled) {
          // R6.5 fallback: PIN. Phase 1 falls back to a basic device passcode
          // prompt via authenticateAsync's `disableDeviceFallback: false`.
        }
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: REASON_TITLE_ZH[req.reason] ?? '签名验证',
          cancelLabel: '取消',
          disableDeviceFallback: false,
        });
        if (!result.success) {
          // User cancelled biometric prompt — don't auto-cancel the sheet
          // (they may try again). Just return to pending.
          setState({ phase: 'pending', req, expiresAt: state.expiresAt });
          return;
        }
        // Phase 1: synthesize a device-attested signature placeholder.
        // Backend mpc-signer is the actual chain signer; we only need to
        // signal a successful biometric to the queue.
        const attestation = `biometric:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        setState({ phase: 'submitting', req });
        const updated = await completeSignRequest(req.signRequestId, attestation);
        if (updated.status !== 'completed' || !updated.signature) {
          throw new Error('Backend did not return signature');
        }
        const dur = Date.now() - startedAt;
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          /* ignore */
        }
        companionEvents.emit({
          type: 'trust3-signing-completed',
          signRequestId: req.signRequestId,
          success: true,
          durationMs: dur,
        });
        try {
          await req.onConfirm?.(updated.signature);
        } catch {
          /* ignore — caller is responsible for their own error UX */
        }
        setState({ phase: 'completed', req, signature: updated.signature });
        // Brief success state then dismiss.
        setTimeout(() => finalizeAndDismiss('user', { signature: updated.signature ?? undefined }), 600);
      } catch (err) {
        console.warn('[Trust3SigningSheet] sign failed:', err);
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch {
          /* ignore */
        }
        const reason = err instanceof Error ? err.message : 'unknown';
        setState({ phase: 'failed', req, reason });
        // Roll back to pending after a moment so user can retry within the
        // 60s window if they want.
        setTimeout(() => {
          // Use functional setState so we read the freshest phase rather
          // than the stale `state` captured in this closure.
          setState((prev) => {
            if (prev.phase === 'idle' || prev.phase === 'completed') return prev;
            const expiresAt =
              'expiresAt' in prev ? prev.expiresAt : Date.now() + DEFAULT_TIMEOUT_MS;
            return { phase: 'pending', req, expiresAt };
          });
        }, 1200);
      }
    }, [finalizeAndDismiss, state]);

    useEffect(() => {
      return () => clearExpiryTimer();
    }, [clearExpiryTimer]);

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior="none"
          opacity={0.6}
        />
      ),
      [],
    );

    const phase = state.phase;
    const req = phase !== 'idle' ? (state as any).req as Trust3SignRequest : null;
    const risk = req?.metadata?.risk ?? 'L1';
    const badge = RISK_BADGE[risk];
    const summary = req?.metadata?.summary ?? {};
    const explanationZh =
      req?.metadata?.riskExplanationZh ?? '请确认签名详情后,使用 Face ID 或指纹完成。';

    const countdownWidth = countdownAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0%', '100%'],
    });

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={SNAP_POINTS}
        index={0}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handleIndicator}
        // Don't allow swipe-to-close — user must explicitly cancel.
        enablePanDownToClose={false}
        enableDismissOnClose
      >
        <BottomSheetView style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerEmoji}>🐾</Text>
              <View>
                <Text style={styles.headerName}>{pet.name} 见证签名</Text>
                <Text style={styles.headerReason}>
                  {req ? REASON_TITLE_ZH[req.reason] : ''}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={dismiss} style={styles.cancelIcon} accessibilityLabel="取消">
              <Text style={styles.cancelIconText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Risk badge */}
          <View style={[styles.riskRow, { borderColor: badge.color }]}>
            <Text style={styles.riskEmoji}>{badge.emoji}</Text>
            <Text style={[styles.riskLabel, { color: badge.color }]}>{badge.label}</Text>
          </View>

          {/* Action summary */}
          <View style={styles.summaryBlock}>
            {summary.from ? (
              <SummaryRow label="来自" value={summary.from} />
            ) : null}
            {summary.to ? <SummaryRow label="接收方" value={summary.to} /> : null}
            {summary.amount ? <SummaryRow label="金额" value={summary.amount} highlight /> : null}
            {summary.gas ? <SummaryRow label="网络费" value={summary.gas} /> : null}
          </View>

          <Text style={styles.explanation}>{explanationZh}</Text>

          {/* Status / phase indicator */}
          {phase === 'biometric' ? (
            <View style={styles.statusRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.statusText}>正在等待生物识别…</Text>
            </View>
          ) : null}
          {phase === 'submitting' ? (
            <View style={styles.statusRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.statusText}>提交签名中…</Text>
            </View>
          ) : null}
          {phase === 'completed' ? (
            <View style={styles.statusRow}>
              <Text style={[styles.statusText, { color: colors.success }]}>✅ 签名完成</Text>
            </View>
          ) : null}
          {phase === 'failed' ? (
            <View style={styles.statusRow}>
              <Text style={[styles.statusText, { color: colors.danger }]}>
                签名失败,请重试 ({(state as any).reason})
              </Text>
            </View>
          ) : null}

          {/* Countdown */}
          <View style={styles.countdownBg}>
            <Animated.View
              style={[
                styles.countdownFill,
                { width: countdownWidth as any, backgroundColor: badge.color },
              ]}
            />
          </View>

          {/* Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.cancelBtn]}
              onPress={dismiss}
              disabled={phase === 'submitting'}
              accessibilityLabel="取消签名"
            >
              <Text style={styles.cancelBtnText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                phase === 'biometric' || phase === 'submitting' || phase === 'completed'
                  ? styles.confirmBtnDisabled
                  : null,
              ]}
              onPress={performBiometric}
              disabled={phase !== 'pending'}
              accessibilityLabel="使用生物识别签名"
            >
              <Text style={styles.confirmBtnText}>🔐 Face ID / 指纹</Text>
            </TouchableOpacity>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

interface SummaryRowProps {
  label: string;
  value: string;
  highlight?: boolean;
}
function SummaryRow({ label, value, highlight }: SummaryRowProps) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, highlight ? styles.summaryValueHighlight : null]}>
        {value}
      </Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  sheetBg: {
    backgroundColor: colors.bgPrimary,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  handleIndicator: { backgroundColor: colors.border, width: 40 },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerEmoji: { fontSize: 26 },
  headerName: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  headerReason: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  cancelIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  cancelIconText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  riskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 14,
    alignSelf: 'flex-start',
  },
  riskEmoji: { fontSize: 16 },
  riskLabel: { fontSize: 13, fontWeight: '700' },
  summaryBlock: {
    marginTop: 14,
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderColor: colors.border,
    borderWidth: 1,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryLabel: { color: colors.textMuted, fontSize: 13 },
  summaryValue: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', maxWidth: '60%' },
  summaryValueHighlight: { color: colors.accent, fontSize: 16 },
  explanation: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  statusText: { color: colors.textPrimary, fontSize: 13 },
  countdownBg: {
    height: 4,
    backgroundColor: colors.bgCard,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 18,
  },
  countdownFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    paddingBottom: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: 'transparent',
    borderColor: colors.border,
    borderWidth: 1,
  },
  cancelBtnText: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  confirmBtn: {
    flex: 2,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  confirmBtnDisabled: { backgroundColor: colors.bgCard },
  confirmBtnText: { color: '#0B1220', fontSize: 14, fontWeight: '700' },
}));
