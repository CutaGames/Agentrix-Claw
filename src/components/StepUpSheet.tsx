/**
 * StepUpSheet — E84 B on the phone: "confirm it is you" with an e-mail code, on the spot (stepUp.ts).
 *
 * - Opens on a business answer that `needsStepUp`; reads the methods; e-mail code → sends it and asks for the
 *   six digits; otherwise (no e-mail, mail down, passkey only, a session that cannot confirm) offers
 *   到网页上确认 and 重新登录.
 * - Confirmed = a decoded `finish` answer; then the token is replaced (stepUpSession.ts) and `onConfirmed`
 *   runs, so the caller retries its request once. A wrong code keeps the sheet open; it never signs out.
 * - First caller: the in-chat approval card (D2). Nothing opens it yet.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useI18n } from '../stores/i18nStore';
import { useAuthStore } from '../stores/authStore';
import { useThemedStyles, type Palette } from '../theme/useTheme';
import { APP_URL } from '../config/env';
import {
  STEP_UP_COPY,
  STEP_UP_FAILURE_COPY,
  StepUpError,
  planStepUp,
  stepUpFallsBackToWeb,
  type StepUpFailureV1,
} from '../services/stepUp';
import { applyStepUpToken, mobileStepUpClient } from '../services/stepUpSession';

type Phase =
  | { kind: 'loading' }
  | { kind: 'code'; stepUpRef: string; maskedEmail: string; resendAt: number }
  | { kind: 'finishing'; stepUpRef: string; maskedEmail: string; resendAt: number }
  | { kind: 'web_only' };

export interface StepUpSheetProps {
  visible: boolean;
  onConfirmed: () => void;
  onCancel: () => void;
  /** Where 到网页上确认 opens (the page of the action); the web home otherwise. Only https agentrix.top. */
  webUrl?: string;
}

const failureOf = (error: unknown): StepUpFailureV1 => (error instanceof StepUpError ? error.failure : 'unavailable');

export function StepUpSheet({ visible, onConfirmed, onCancel, webUrl }: StepUpSheetProps) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<{ failure: StepUpFailureV1; retryAfterSeconds: number | null } | null>(null);
  const [now, setNow] = useState(Date.now());
  const alive = useRef(true);

  const fail = useCallback((error: unknown) => {
    if (!alive.current) return;
    const failure = failureOf(error);
    setProblem({ failure, retryAfterSeconds: error instanceof StepUpError ? error.retryAfterSeconds : null });
    if (stepUpFallsBackToWeb(failure)) setPhase({ kind: 'web_only' });
  }, []);

  const send = useCallback(async () => {
    const client = mobileStepUpClient();
    try {
      const started = await client.startEmailCode();
      if (!alive.current) return;
      setCode('');
      setPhase({ kind: 'code', stepUpRef: started.stepUpRef, maskedEmail: started.maskedEmail, resendAt: Date.now() + started.resendAfterSeconds * 1000 });
    } catch (error) {
      fail(error);
      if (alive.current) setPhase((p) => (p.kind === 'loading' ? { kind: 'web_only' } : p));
    }
  }, [fail]);

  useEffect(() => {
    alive.current = true;
    if (!visible) return () => undefined;
    setPhase({ kind: 'loading' });
    setProblem(null);
    setCode('');
    void (async () => {
      try {
        const plan = planStepUp(await mobileStepUpClient().methods());
        if (!alive.current) return;
        if (plan.kind === 'email_code') await send();
        else setPhase({ kind: 'web_only' });
      } catch (error) {
        fail(error);
        if (alive.current) setPhase({ kind: 'web_only' });
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [visible, send, fail]);

  useEffect(() => {
    if (phase.kind !== 'code') return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase.kind]);

  const confirm = async () => {
    if (phase.kind !== 'code') return;
    setProblem(null);
    setPhase({ ...phase, kind: 'finishing' });
    try {
      const done = await mobileStepUpClient().finishEmailCode(phase.stepUpRef, code);
      await applyStepUpToken(done.accessToken);
      if (alive.current) onConfirmed();
    } catch (error) {
      if (!alive.current) return;
      setPhase({ ...phase, kind: 'code' });
      fail(error);
    }
  };

  const openWeb = () => {
    const target = webUrl && /^https:\/\/(?:[a-z0-9-]+\.)*agentrix\.top(?:\/|$)/i.test(webUrl) ? webUrl : APP_URL;
    void Linking.openURL(target);
  };
  const signInAgain = () => {
    onCancel();
    void useAuthStore.getState().clearAuth();
  };

  const resendIn = phase.kind === 'code' ? Math.max(0, Math.ceil((phase.resendAt - now) / 1000)) : 0;
  const problemText = problem
    ? problem.failure === 'rate_limited' && problem.retryAfterSeconds
      ? `${t(STEP_UP_FAILURE_COPY.rate_limited)} (${problem.retryAfterSeconds}s)`
      : t(STEP_UP_FAILURE_COPY[problem.failure])
    : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal testID="step-up-sheet">
          <Text style={styles.title} accessibilityRole="header">
            {t(STEP_UP_COPY.title)}
          </Text>
          {phase.kind === 'loading' ? <ActivityIndicator testID="step-up-loading" /> : null}
          {phase.kind === 'code' || phase.kind === 'finishing' ? (
            <>
              <Text style={styles.body}>{t(STEP_UP_COPY.sent(phase.maskedEmail))}</Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={(value) => setCode(value.replace(/[^0-9]/g, '').slice(0, 6))}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder={t(STEP_UP_COPY.codePlaceholder)}
                accessibilityLabel={t(STEP_UP_COPY.codePlaceholder)}
                editable={phase.kind === 'code'}
                testID="step-up-code"
              />
              <TouchableOpacity
                style={[styles.primary, code.length !== 6 || phase.kind === 'finishing' ? styles.disabled : null]}
                onPress={() => void confirm()}
                disabled={code.length !== 6 || phase.kind === 'finishing'}
                accessibilityRole="button"
                testID="step-up-confirm"
              >
                {phase.kind === 'finishing' ? <ActivityIndicator /> : <Text style={styles.primaryText}>{t(STEP_UP_COPY.confirm)}</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondary}
                onPress={() => void send()}
                disabled={resendIn > 0 || phase.kind === 'finishing'}
                accessibilityRole="button"
                testID="step-up-resend"
              >
                <Text style={styles.secondaryText}>{resendIn > 0 ? t(STEP_UP_COPY.resendIn(resendIn)) : t(STEP_UP_COPY.resend)}</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {phase.kind === 'web_only' ? (
            <>
              <Text style={styles.body}>{t(STEP_UP_COPY.webOnly)}</Text>
              <TouchableOpacity style={styles.primary} onPress={openWeb} accessibilityRole="link" testID="step-up-on-web">
                <Text style={styles.primaryText}>{t(STEP_UP_COPY.onWeb)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondary} onPress={signInAgain} accessibilityRole="button" testID="step-up-sign-in-again">
                <Text style={styles.secondaryText}>{t(STEP_UP_COPY.signInAgain)}</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {problemText ? (
            <Text style={styles.problem} accessibilityLiveRegion="polite" testID="step-up-problem">
              {problemText}
            </Text>
          ) : null}
          <TouchableOpacity style={styles.secondary} onPress={onCancel} accessibilityRole="button" testID="step-up-cancel">
            <Text style={styles.secondaryText}>{t(STEP_UP_COPY.cancel)}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: { backgroundColor: c.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
    title: { color: c.textPrimary, fontSize: 19, fontWeight: '800' },
    body: { color: c.textSecondary, fontSize: 14, lineHeight: 20 },
    input: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      color: c.textPrimary,
      fontSize: 22,
      letterSpacing: 6,
      textAlign: 'center',
    },
    primary: { minHeight: 48, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    primaryText: { color: c.onAccent, fontSize: 15, fontWeight: '800' },
    disabled: { opacity: 0.5 },
    secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: c.accent, fontSize: 14, fontWeight: '700' },
    problem: { color: c.danger, fontSize: 13, lineHeight: 19 },
  });
