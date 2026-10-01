import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getRandomBytesAsync } from 'expo-crypto';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import {
  cancelSoulCoreTap,
  tapReadSoulCoreAttestation,
  tapSignAndReadSoulCoreAttestation,
  type SoulCoreTapStage,
} from '../../services/soul-core-l1/androidIsoDep';
import { SoulCoreCardError, type SoulCoreDevelopmentAttestation } from '../../services/soul-core-l1/protocol';
import {
  requestSoulChipDevelopmentChallenge,
  verifySoulChipDevelopmentAttestation,
  type SoulChipDevelopmentVerification,
} from '../../services/soulCoreApi';

const T2_FROZEN_TX = {
  chainId: '0x059f',
  nonce: 5,
  maxPriorityFeePerGas: '0x3b9aca00',
  maxFeePerGas: '0x04a817c800',
  gasLimit: '0x5208',
  to: '1111111111111111111111111111111111111111',
  value: 1_000_000,
  data: '',
  merkleProof: [],
};

const STAGE_LABEL: Record<SoulCoreTapStage, { en: string; zh: string }> = {
  checking_nfc: { en: 'Checking NFC…', zh: '正在检查 NFC…' },
  waiting_for_card: { en: 'Hold the Soul Core card against the phone…', zh: '请将元神芯贴在手机 NFC 区域并保持不动…' },
  card_connected: { en: 'Card connected…', zh: '已连接卡片…' },
  applet_selected: { en: 'Soul Core applet selected…', zh: '已选择元神芯 Applet…' },
  signing: { en: 'Card is validating and signing; keep it still…', zh: '卡片正在校验并签名，请保持贴卡…' },
  reading_attestation: { en: 'Reading nonce-bound attestation…', zh: '正在读取绑定 nonce 的证明…' },
  done: { en: 'Completed.', zh: '已完成。' },
};

type ProbeResult = {
  kind: 'read' | 'sign';
  fundingPublicKeyHex: string;
  attestationPublicKeyHex: string;
  rollingCounter: number;
  usedTotal: bigint;
  signatureDerHex?: string;
  keySeparation: boolean;
  backend: SoulChipDevelopmentVerification | null;
  backendError?: string;
};

function shortHex(value: string): string {
  return value.length <= 28 ? value : `${value.slice(0, 14)}…${value.slice(-12)}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof SoulCoreCardError) {
    return `${error.code} · SW=${error.statusWord.toString(16).padStart(4, '0').toUpperCase()}`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function requestChallengeOrLocal(agentId: string): Promise<{
  verifierNonceHex: string;
  backendChallenge: boolean;
  backendError?: string;
}> {
  try {
    const challenge = await requestSoulChipDevelopmentChallenge(agentId);
    return { verifierNonceHex: challenge.verifierNonceHex, backendChallenge: true };
  } catch (error) {
    const localNonce = await getRandomBytesAsync(16);
    return {
      verifierNonceHex: Array.from(localNonce)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(''),
      backendChallenge: false,
      backendError: errorMessage(error),
    };
  }
}

async function submitAttestation(
  agentId: string,
  attestation: SoulCoreDevelopmentAttestation,
): Promise<SoulChipDevelopmentVerification> {
  return verifySoulChipDevelopmentAttestation(agentId, {
    fundingPublicKeyHex: attestation.fundingPublicKeyHex,
    attestationPublicKeyHex: attestation.attestationPublicKeyHex,
    verifierNonceHex: attestation.verifierNonceHex,
    rollingCounter: attestation.rollingCounter,
    singleLimit: attestation.singleLimit.toString(),
    totalLimit: attestation.totalLimit.toString(),
    usedTotal: attestation.usedTotal.toString(),
    whitelistRootHex: attestation.whitelistRootHex,
    signatureDerHex: attestation.signatureDerHex,
  });
}

/**
 * Debug-build-only T11 hardware panel. The backend verifies a one-time
 * development-card challenge but deliberately returns enforcedBy=null: this
 * proves only possession of the presented key; the self-attested format has no
 * production CA/registry/reference values and cannot prove genuine hardware.
 */
export function SoulCoreNfcDevelopmentCard({ agentId }: { agentId: string }) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const [stage, setStage] = React.useState<SoulCoreTapStage | null>(null);
  const [result, setResult] = React.useState<ProbeResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const busy = stage !== null && stage !== 'done';

  const begin = () => {
    setResult(null);
    setError(null);
  };

  const readAttestation = async () => {
    begin();
    setStage('checking_nfc');
    try {
      const challenge = await requestChallengeOrLocal(agentId);
      const attestation = await tapReadSoulCoreAttestation(challenge.verifierNonceHex, {
        onProgress: setStage,
      });
      let backend: SoulChipDevelopmentVerification | null = null;
      let backendError = challenge.backendError;
      if (challenge.backendChallenge) {
        try {
          backend = await submitAttestation(agentId, attestation);
        } catch (submitError) {
          backendError = errorMessage(submitError);
        }
      }
      setResult({
        kind: 'read',
        fundingPublicKeyHex: attestation.fundingPublicKeyHex,
        attestationPublicKeyHex: attestation.attestationPublicKeyHex,
        rollingCounter: attestation.rollingCounter,
        usedTotal: attestation.usedTotal,
        keySeparation: attestation.fundingPublicKeyHex !== attestation.attestationPublicKeyHex,
        backend,
        backendError,
      });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setStage(null);
    }
  };

  const signProbe = async () => {
    begin();
    setStage('checking_nfc');
    try {
      const [requestId, challenge] = await Promise.all([
        getRandomBytesAsync(4),
        requestChallengeOrLocal(agentId),
      ]);
      const output = await tapSignAndReadSoulCoreAttestation(
        { ...T2_FROZEN_TX, requestId },
        challenge.verifierNonceHex,
        { onProgress: setStage, transceiveTimeoutMs: 60_000 },
      );
      let backend: SoulChipDevelopmentVerification | null = null;
      let backendError = challenge.backendError;
      if (challenge.backendChallenge) {
        try {
          backend = await submitAttestation(agentId, output.attestation);
        } catch (submitError) {
          backendError = errorMessage(submitError);
        }
      }
      setResult({
        kind: 'sign',
        fundingPublicKeyHex: output.attestation.fundingPublicKeyHex,
        attestationPublicKeyHex: output.attestation.attestationPublicKeyHex,
        rollingCounter: output.attestation.rollingCounter,
        usedTotal: output.attestation.usedTotal,
        signatureDerHex: output.signing.signatureDerHex,
        keySeparation:
          output.attestation.fundingPublicKeyHex !== output.attestation.attestationPublicKeyHex,
        backend,
        backendError,
      });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setStage(null);
    }
  };

  const confirmSignProbe = () => {
    Alert.alert(
      t({ en: 'Run development-card sign probe?', zh: '执行开发卡签名探针？' }),
      t({
        en: 'This does not broadcast a transaction, but it irreversibly increments the card counter and used-total by 1,000,000 units. Keep the card still until completion.',
        zh: '不会广播链上交易，但会不可逆地将卡内计数器和累计用量增加 1,000,000 单位。执行期间请保持贴卡。',
      }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        { text: t({ en: 'Run once', zh: '执行一次' }), onPress: () => { void signProbe(); } },
      ],
    );
  };

  return (
    <View style={styles.card} testID="soul-core-nfc-development-card">
      <Text style={styles.kicker}>T11 · ANDROID ISO-DEP · DEVELOPMENT CARD</Text>
      <Text style={styles.title}>{t({ en: 'Tap your Soul Core card', zh: '贴上你的元神芯' })}</Text>
      <Text style={styles.body}>{t({
        en: 'The app attempts a one-time backend challenge. If unavailable it visibly falls back to local-only validation; neither result proves genuine hardware or grants production SE assurance.',
        zh: '应用会尝试后端一次性 challenge；不可用时明确降级为仅本地验证。两者都不能独立证明硬件真伪，也不会升级为生产级 SE 保证。',
      })}</Text>

      {stage ? (
        <View style={styles.statusRow}>
          {busy ? <ActivityIndicator size="small" color="#22d3ee" /> : null}
          <Text style={styles.status}>{t(STAGE_LABEL[stage])}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          onPress={() => { void readAttestation(); }}
          style={[styles.button, busy && styles.disabled]}
          testID="soul-core-nfc-read-attestation"
        >
          <Text style={styles.buttonText}>{t({ en: 'Read card + attestation', zh: '读取卡片与证明' })}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={busy}
          onPress={confirmSignProbe}
          style={[styles.button, styles.signButton, busy && styles.disabled]}
          testID="soul-core-nfc-sign-probe"
        >
          <Text style={styles.signButtonText}>{t({ en: 'Run T11 sign probe', zh: '执行 T11 签名探针' })}</Text>
        </TouchableOpacity>
        {busy ? (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => { void cancelSoulCoreTap(); }}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelText}>{t({ en: 'Cancel NFC', zh: '取消 NFC' })}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {error ? <Text style={styles.error} selectable>{error}</Text> : null}
      {result ? (
        <View style={styles.result}>
          <Text style={styles.resultTitle}>
            {result.kind === 'sign' ? 'SIGN_TX + GET_ATTESTATION' : 'GET_ATTESTATION'} · OK
          </Text>
          <Text style={styles.mono} selectable>funding {shortHex(result.fundingPublicKeyHex)}</Text>
          <Text style={styles.mono} selectable>attest  {shortHex(result.attestationPublicKeyHex)}</Text>
          <Text style={styles.value}>KEY_SEPARATION={String(result.keySeparation)}</Text>
          <Text style={styles.value}>counter={result.rollingCounter} · used={result.usedTotal.toString()}</Text>
          {result.backend ? (
            <>
              <Text style={result.backend.verified ? styles.backendOk : styles.error}>
                BACKEND_SIGNATURE_VALID={String(result.backend.verified)} · assurance={result.backend.effectiveAssurance} · enforcedBy=none
              </Text>
              {result.backend.reasons.length > 0 ? (
                <Text style={styles.error} selectable>{result.backend.reasons.join(', ')}</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.warning} selectable>
              BACKEND_NOT_VERIFIED · local_only{result.backendError ? ` · ${result.backendError}` : ''}
            </Text>
          )}
          {result.signatureDerHex ? (
            <Text style={styles.mono} selectable>sigDER {shortHex(result.signatureDerHex)}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(c: Palette) {
  return {
    card: {
      backgroundColor: c.bgCard,
      borderRadius: 14,
      padding: 16,
      gap: 8,
      borderWidth: 1,
      borderColor: '#22d3ee66',
    },
    kicker: { fontSize: 10, letterSpacing: 1.2, color: '#22d3ee', fontWeight: '800' as const },
    title: { fontSize: 16, color: c.textPrimary, fontWeight: '800' as const },
    body: { fontSize: 12, color: c.textSecondary, lineHeight: 18 },
    statusRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingVertical: 4 },
    status: { flex: 1, fontSize: 12, color: '#22d3ee', fontWeight: '700' as const },
    actions: { gap: 8, marginTop: 4 },
    button: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#22d3ee22', borderWidth: 1, borderColor: '#22d3ee77' },
    buttonText: { color: '#22d3ee', fontSize: 12, fontWeight: '800' as const, textAlign: 'center' as const },
    signButton: { backgroundColor: '#d5b97e22', borderColor: '#d5b97e88' },
    signButtonText: { color: '#d5b97e', fontSize: 12, fontWeight: '800' as const, textAlign: 'center' as const },
    disabled: { opacity: 0.5 },
    cancelButton: { alignSelf: 'center' as const, paddingHorizontal: 12, paddingVertical: 6 },
    cancelText: { color: c.textMuted, fontSize: 12, fontWeight: '700' as const },
    error: { fontSize: 12, lineHeight: 17, color: c.error, fontFamily: 'monospace' },
    warning: { fontSize: 11, lineHeight: 17, color: '#d97706', fontFamily: 'monospace' },
    result: { gap: 3, padding: 10, borderRadius: 10, backgroundColor: c.bgPrimary, borderWidth: 1, borderColor: c.border },
    resultTitle: { fontSize: 12, color: c.success, fontWeight: '800' as const },
    backendOk: { fontSize: 11, lineHeight: 17, color: c.success, fontFamily: 'monospace' },
    mono: { fontSize: 11, color: c.textSecondary, fontFamily: 'monospace' },
    value: { fontSize: 12, color: c.textPrimary, fontWeight: '700' as const },
  };
}
