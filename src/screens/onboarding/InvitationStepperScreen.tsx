/**
 * P0-W2-2 — Mobile invitation 5-step stepper (PRD mobile-prd-v3 §4.2)
 *
 * Steps:
 *   1. Welcome / value prop
 *   2. Enter invitation code
 *   3. Verify code (calls /api/v1/invitation/validate)
 *   4. Choose handle / display name
 *   5. Confirm + redeem (POST /api/v1/invitation/redeem)
 *
 * On success → navigates to Onboarding/DeploySelect.
 * Pure scaffold — wires to existing backend invitation module.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { colors } from '../../theme/colors';

const TOTAL_STEPS = 5;

interface InvitationStepperProps {
  onComplete?: (payload: { code: string; handle: string }) => void;
  onSkip?: () => void;
  validateCode?: (code: string) => Promise<{ valid: boolean; message?: string }>;
  redeemCode?: (code: string, handle: string) => Promise<void>;
}

export function InvitationStepperScreen({
  onComplete,
  onSkip,
  validateCode,
  redeemCode,
}: InvitationStepperProps) {
  const [step, setStep] = useState(1);
  const [code, setCode] = useState('');
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = useCallback(() => setStep((s) => Math.min(TOTAL_STEPS, s + 1)), []);
  const prev = useCallback(() => setStep((s) => Math.max(1, s - 1)), []);

  const handleValidate = useCallback(async () => {
    if (!code.trim()) {
      setError('请输入邀请码');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = validateCode
        ? await validateCode(code.trim())
        : { valid: true };
      if (!result.valid) {
        setError(result.message || '邀请码无效');
        return;
      }
      next();
    } catch (e: any) {
      setError(e?.message || '验证失败');
    } finally {
      setBusy(false);
    }
  }, [code, validateCode, next]);

  const handleRedeem = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (redeemCode) {
        await redeemCode(code.trim(), handle.trim());
      }
      onComplete?.({ code: code.trim(), handle: handle.trim() });
    } catch (e: any) {
      setError(e?.message || '兑换失败');
      Alert.alert('兑换失败', e?.message || '请重试');
    } finally {
      setBusy(false);
    }
  }, [code, handle, redeemCode, onComplete]);

  return (
    <View style={styles.container}>
      <ProgressBar current={step} total={TOTAL_STEPS} />

      <View style={styles.body}>
        {step === 1 && (
          <StepWelcome onNext={next} onSkip={onSkip} />
        )}
        {step === 2 && (
          <StepEnterCode
            code={code}
            onCode={setCode}
            onNext={next}
            onBack={prev}
          />
        )}
        {step === 3 && (
          <StepVerify
            code={code}
            busy={busy}
            error={error}
            onVerify={handleValidate}
            onBack={prev}
          />
        )}
        {step === 4 && (
          <StepHandle
            handle={handle}
            onHandle={setHandle}
            onNext={next}
            onBack={prev}
          />
        )}
        {step === 5 && (
          <StepConfirm
            code={code}
            handle={handle}
            busy={busy}
            error={error}
            onConfirm={handleRedeem}
            onBack={prev}
          />
        )}
      </View>
    </View>
  );
}

// ── Sub-components ──

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.progressBar}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.progressDot,
            i + 1 <= current && styles.progressDotActive,
          ]}
        />
      ))}
      <Text style={styles.progressLabel}>{`${current} / ${total}`}</Text>
    </View>
  );
}

function StepWelcome({ onNext, onSkip }: { onNext: () => void; onSkip?: () => void }) {
  return (
    <>
      <Text style={styles.title}>欢迎来到 Agentrix</Text>
      <Text style={styles.subtitle}>使用邀请码加入，解锁完整 AI Agent 经济体。</Text>
      <PrimaryButton label="我有邀请码" onPress={onNext} />
      {onSkip && (
        <TouchableOpacity onPress={onSkip} style={styles.linkBtn}>
          <Text style={styles.linkText}>稍后再说</Text>
        </TouchableOpacity>
      )}
    </>
  );
}

function StepEnterCode({
  code,
  onCode,
  onNext,
  onBack,
}: {
  code: string;
  onCode: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <Text style={styles.title}>输入邀请码</Text>
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={onCode}
        placeholder="例如 ARX-2026"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <View style={styles.row}>
        <SecondaryButton label="返回" onPress={onBack} />
        <PrimaryButton label="下一步" onPress={onNext} disabled={!code.trim()} />
      </View>
    </>
  );
}

function StepVerify({
  code,
  busy,
  error,
  onVerify,
  onBack,
}: {
  code: string;
  busy: boolean;
  error: string | null;
  onVerify: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <Text style={styles.title}>验证邀请码</Text>
      <Text style={styles.subtitle}>{`即将验证: ${code}`}</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.row}>
        <SecondaryButton label="返回" onPress={onBack} disabled={busy} />
        {busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <PrimaryButton label="验证" onPress={onVerify} />
        )}
      </View>
    </>
  );
}

function StepHandle({
  handle,
  onHandle,
  onNext,
  onBack,
}: {
  handle: string;
  onHandle: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <Text style={styles.title}>选择你的昵称</Text>
      <TextInput
        style={styles.input}
        value={handle}
        onChangeText={onHandle}
        placeholder="aira-fan"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.row}>
        <SecondaryButton label="返回" onPress={onBack} />
        <PrimaryButton label="下一步" onPress={onNext} disabled={!handle.trim()} />
      </View>
    </>
  );
}

function StepConfirm({
  code,
  handle,
  busy,
  error,
  onConfirm,
  onBack,
}: {
  code: string;
  handle: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <Text style={styles.title}>确认信息</Text>
      <Text style={styles.row}>{`邀请码: ${code}`}</Text>
      <Text style={styles.row}>{`昵称: ${handle}`}</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.row}>
        <SecondaryButton label="返回" onPress={onBack} disabled={busy} />
        {busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <PrimaryButton label="完成兑换" onPress={onConfirm} />
        )}
      </View>
    </>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.primaryBtnLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.secondaryBtn, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.secondaryBtnLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, padding: 20 },
  progressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 28,
  },
  progressDot: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  progressDotActive: { backgroundColor: colors.accent },
  progressLabel: { color: colors.textMuted, fontSize: 12, marginLeft: 8 },
  body: { flex: 1, justifyContent: 'center', gap: 16 },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  input: {
    color: colors.textPrimary,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  row: { flexDirection: 'row', gap: 12, marginTop: 8, color: colors.textPrimary },
  error: { color: '#ef4444', fontSize: 13 },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnLabel: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnLabel: { color: colors.textPrimary, fontWeight: '600', fontSize: 15 },
  btnDisabled: { opacity: 0.4 },
  linkBtn: { alignItems: 'center', paddingVertical: 8 },
  linkText: { color: colors.textMuted, fontSize: 13 },
});

export default InvitationStepperScreen;
