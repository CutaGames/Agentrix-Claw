import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import {
  checkMPCWallet,
  createMPCWalletForSocialLogin,
  getRecoveryCode,
  getStoredShardA,
  markMPCBackupCompleted,
  recoverWithSavedCode,
  rotateWallet,
  verifyAndConfirmBackup,
} from '../../services/mpcWallet';
import { TextInput } from 'react-native';
import type { MeStackParamList } from '../../navigation/types';
import { themedStyles } from '../../theme/useTheme';

type Nav = NativeStackNavigationProp<MeStackParamList>;
type Step = 'intro' | 'creating' | 'backup' | 'confirm';

export function WalletSetupScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const [step, setStep] = useState<Step>('intro');
  const [address, setAddress] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [hasLocalShard, setHasLocalShard] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  // 钱包在其他设备/会话创建、本设备无分片 A 且无恢复码 → 需恢复（诚实态，非无限"加载中"）。
  const [recoveryNeeded, setRecoveryNeeded] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [busy, setBusy] = useState(false);

  const loadBackupData = useCallback(async () => {
    const [rc, shardA] = await Promise.all([getRecoveryCode(), getStoredShardA()]);
    setRecoveryCode(rc);
    setHasLocalShard(!!shardA);
  }, []);

  useEffect(() => {
    void loadBackupData();
  }, [loadBackupData]);

  const handleStart = useCallback(async () => {
    if (!user?.id) {
      Alert.alert(t({ en: 'Sign in required', zh: '请先登录' }));
      return;
    }

    try {
      setStep('creating');
      setRecoveryNeeded(false);
      // 先查是否已有钱包，区分「首次创建」与「已存在但本设备无分片」两条路径。
      const check = await checkMPCWallet();
      if (check.hasWallet && check.wallet) {
        setAddress(check.wallet.walletAddress);
        const [rc, shardA] = await Promise.all([getRecoveryCode(), getStoredShardA()]);
        setRecoveryCode(rc);
        setHasLocalShard(!!shardA);
        // 已有钱包但本设备既无分片 A 也无恢复码 → 无法凭空"加载"出恢复码（2/3 随机分片，
        // 服务端仅持分片 B、无法重建）。进入诚实的"需恢复"态，而非无限加载。
        if (!shardA && !rc) {
          setRecoveryNeeded(true);
        }
        setStep('backup');
        return;
      }
      // 首次创建：createForSocial 会返回并本地存储分片 A + 恢复码 C。
      const created = await createMPCWalletForSocialLogin(user.id);
      setAddress(created.walletAddress);
      await loadBackupData();
      setStep('backup');
    } catch (e: any) {
      setStep('intro');
      Alert.alert(
        t({ en: 'Wallet setup failed', zh: '钱包创建失败' }),
        e?.message || t({ en: 'Please try again later', zh: '请稍后重试' }),
      );
    }
  }, [loadBackupData, t, user?.id]);

  const handleCopy = useCallback(async () => {
    if (!recoveryCode) return;
    await Clipboard.setStringAsync(recoveryCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [recoveryCode]);

  const handleShare = useCallback(async () => {
    if (!recoveryCode) return;
    try {
      await Share.share({
        title: t({ en: 'Wallet Recovery Code', zh: '钱包恢复码' }),
        message: `${t({ en: 'Agentrix MPC Wallet Recovery Code', zh: 'Agentrix MPC 钱包恢复码' })}\n\n${recoveryCode}\n\n${t({ en: '⚠️ Keep this private and store it in a safe place.', zh: '⚠️ 请私密保存，并放在安全的位置。' })}`,
      });
    } catch {}
  }, [recoveryCode, t]);

  const handleContinueToConfirm = useCallback(() => {
    if (!recoveryCode) {
      Alert.alert(
        t({ en: 'Recovery code missing', zh: '未找到恢复码' }),
        t({ en: 'Please wait for the wallet backup code to load first.', zh: '请等待恢复码加载完成后再继续。' }),
      );
      return;
    }
    setStep('confirm');
  }, [recoveryCode, t]);

  // 强制备份：完成时跑真实读回校验（verifyAndConfirmBackup），服务端 sha256(分片C) 比对通过才算数，
  // 而非仅勾选框自证。校验失败 → 不放行，提示重新核对恢复码。
  const handleFinish = useCallback(async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    try {
      const res = await verifyAndConfirmBackup();
      if (!res.confirmed) throw new Error('verification failed');
      await markMPCBackupCompleted();
      Alert.alert(
        t({ en: 'Setup complete', zh: '设置完成' }),
        t({ en: 'Backup verified. Your MPC wallet is ready.', zh: '备份已通过校验，你的 MPC 钱包已就绪。' }),
        [{ text: t({ en: 'Done', zh: '完成' }), onPress: () => navigation.goBack() }],
      );
    } catch (e: any) {
      Alert.alert(
        t({ en: 'Backup verification failed', zh: '备份校验未通过' }),
        t({
          en: 'We could not verify your recovery code on this device. Please make sure it was saved correctly, then try again.',
          zh: '无法在本设备校验你的恢复码。请确认已正确保存恢复码后重试。',
        }),
      );
    } finally {
      setBusy(false);
    }
  }, [confirmed, busy, navigation, t]);

  // 恢复码录入恢复（主）：地址不变。
  const handleRecoverWithCode = useCallback(async () => {
    const code = recoveryInput.trim();
    if (!code || busy) {
      if (!code) Alert.alert(t({ en: 'Enter recovery code', zh: '请输入恢复码' }));
      return;
    }
    setBusy(true);
    try {
      const res = await recoverWithSavedCode(code);
      setAddress(res.walletAddress);
      const rc = await getRecoveryCode();
      setRecoveryCode(rc);
      setHasLocalShard(true);
      setRecoveryNeeded(false);
      setRecoveryInput('');
      Alert.alert(
        t({ en: 'Wallet recovered', zh: '钱包已恢复' }),
        t({
          en: 'Recovered successfully. Your recovery code was rotated — please back up the new one below.',
          zh: '恢复成功。恢复码已轮换，请在下方重新备份新的恢复码。',
        }),
      );
    } catch (e: any) {
      Alert.alert(
        t({ en: 'Recovery failed', zh: '恢复失败' }),
        e?.message?.includes('INVALID_RECOVERY_CODE')
          ? t({ en: 'This recovery code is invalid for your wallet.', zh: '该恢复码与你的钱包不匹配。' })
          : e?.message || t({ en: 'Please try again later', zh: '请稍后重试' }),
      );
    } finally {
      setBusy(false);
    }
  }, [recoveryInput, busy, t]);

  // 测试网换钱包（兜底）：破坏性，强确认。
  const handleRotate = useCallback(() => {
    Alert.alert(
      t({ en: 'Create a new wallet?', zh: '创建新钱包？' }),
      t({
        en: 'The OLD wallet address and any assets on it will be abandoned and cannot be recovered. Continue? (testnet)',
        zh: '旧钱包地址及其上的资产将被弃用且无法找回。确定继续吗？（测试网）',
      }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Create new', zh: '创建新钱包' }),
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const res = await rotateWallet();
              setAddress(res.walletAddress);
              const rc = await getRecoveryCode();
              setRecoveryCode(rc);
              setHasLocalShard(true);
              setRecoveryNeeded(false);
            } catch (e: any) {
              Alert.alert(
                t({ en: 'Failed', zh: '失败' }),
                e?.message?.includes('WALLET_ROTATION_DISABLED')
                  ? t({ en: 'Wallet rotation is not enabled.', zh: '换钱包功能未开启。' })
                  : e?.message || '',
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }, [t]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.progressRow}>
          {[
            t({ en: 'Intro', zh: '介绍' }),
            t({ en: 'Create', zh: '创建' }),
            t({ en: 'Backup', zh: '备份' }),
            t({ en: 'Confirm', zh: '确认' }),
          ].map((label, index) => {
            const activeIndex = step === 'intro' ? 0 : step === 'creating' ? 1 : step === 'backup' ? 2 : 3;
            const done = index <= activeIndex;
            return (
              <View key={label} style={styles.progressItem}>
                <View style={[styles.progressDot, done && styles.progressDotActive]} />
                <Text style={[styles.progressText, done && styles.progressTextActive]}>{label}</Text>
              </View>
            );
          })}
        </View>

        {step === 'intro' && (
          <View style={styles.card}>
            <Text style={styles.hero}>🔐</Text>
            <Text style={styles.title}>{t({ en: 'Set up your MPC wallet', zh: '设置你的 MPC 钱包' })}</Text>
            <Text style={styles.subtitle}>
              {t({
                en: 'We will create a self-custodial wallet for you, then guide you to save the recovery shard before you leave.',
                zh: '我们会先为你创建一个自托管钱包，再引导你在离开前保存恢复分片。',
              })}
            </Text>

            <View style={styles.featureList}>
              <Text style={styles.featureItem}>{t({ en: '• No seed phrase to manage manually', zh: '• 无需手动管理助记词' })}</Text>
              <Text style={styles.featureItem}>{t({ en: '• Key is split into 3 encrypted shards', zh: '• 私钥会被拆分成 3 个加密分片' })}</Text>
              <Text style={styles.featureItem}>{t({ en: '• Any 2 shards can recover the wallet', zh: '• 任意 2 个分片即可恢复钱包' })}</Text>
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={handleStart}>
              <Text style={styles.primaryBtnText}>{t({ en: 'Create wallet now', zh: '立即创建钱包' })}</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'creating' && (
          <View style={styles.card}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.title}>{t({ en: 'Creating your wallet...', zh: '正在创建钱包…' })}</Text>
            <Text style={styles.subtitle}>
              {t({
                en: 'We are generating your MPC wallet shards and storing them securely.',
                zh: '我们正在生成你的 MPC 钱包分片，并安全保存它们。',
              })}
            </Text>
          </View>
        )}

        {step === 'backup' && (
          <View style={styles.card}>
            <Text style={styles.title}>{t({ en: 'Back up your recovery shard', zh: '备份你的恢复分片' })}</Text>
            <Text style={styles.subtitle}>
              {t({
                en: 'Shard A stays on this device. Agentrix keeps shard B. Save shard C below so you can recover the wallet later.',
                zh: '分片 A 保存在当前设备，Agentrix 保存分片 B。请把下面的分片 C 保存好，以便后续恢复钱包。',
              })}
            </Text>

            {!!address && (
              <View style={styles.addressBox}>
                <Text style={styles.addressLabel}>{t({ en: 'Wallet address', zh: '钱包地址' })}</Text>
                <Text style={styles.addressValue}>{address}</Text>
              </View>
            )}

            {recoveryNeeded ? (
              // 诚实态：钱包在其他设备/会话创建，本设备无分片 A、无恢复码。
              // 私钥为随机 2/3 分片、服务端仅持分片 B，无法凭空重建恢复码。
              <>
                <View style={[styles.statusRow, styles.statusWarn]}>
                  <Text style={styles.statusIcon}>⚠️</Text>
                  <Text style={styles.statusText}>
                    {t({
                      en: 'This wallet was created on another device or session. This device holds no shard, and the recovery code is not generated here.',
                      zh: '该钱包在其他设备或会话创建。本设备没有分片，也不会在这里重新生成恢复码。',
                    })}
                  </Text>
                </View>
                <View style={styles.warningCard}>
                  <Text style={styles.warningTitle}>{t({ en: 'How recovery works', zh: '如何恢复' })}</Text>
                  <Text style={styles.warningText}>
                    {t({
                      en: 'The key is split 2-of-3 (device / Agentrix / your recovery code). With only the server shard, it cannot be rebuilt. To restore this exact wallet, use the recovery code you saved when it was first created.',
                      zh: '私钥按 2/3 分片保存（设备 / Agentrix / 你的恢复码）。仅凭服务端分片无法重建。要恢复这个钱包地址，需要你在首次创建时保存的恢复码。',
                    })}
                  </Text>
                </View>
                <Text style={styles.sectionTitle}>{t({ en: 'Restore with recovery code', zh: '用恢复码恢复' })}</Text>
                <TextInput
                  style={styles.recoveryInput}
                  value={recoveryInput}
                  onChangeText={setRecoveryInput}
                  placeholder={t({ en: 'Paste your recovery code (Shard C)', zh: '粘贴你的恢复码（分片 C）' })}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]}
                  onPress={handleRecoverWithCode}
                  disabled={busy}
                >
                  <Text style={styles.primaryBtnText}>
                    {busy ? t({ en: 'Restoring…', zh: '恢复中…' }) : t({ en: 'Restore wallet', zh: '恢复钱包' })}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.secondaryBtn} onPress={handleRotate} disabled={busy}>
                  <Text style={styles.secondaryBtnText}>
                    {t({ en: 'No code? Create a new wallet (testnet)', zh: '没有恢复码？换新钱包（测试网）' })}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={[styles.statusRow, hasLocalShard ? styles.statusOk : styles.statusWarn]}>
                  <Text style={styles.statusIcon}>{hasLocalShard ? '✅' : '⚠️'}</Text>
                  <Text style={styles.statusText}>
                    {hasLocalShard
                      ? t({ en: 'Your device shard is stored locally.', zh: '设备分片已保存在本地。' })
                      : t({ en: 'Local device shard is missing. Recovery may be required later.', zh: '本地设备分片缺失，后续可能需要恢复流程。' })}
                  </Text>
                </View>

                <Text style={styles.sectionTitle}>{t({ en: 'Recovery code (Shard C)', zh: '恢复码（分片 C）' })}</Text>
                <View style={styles.codeBox}>
                  <Text style={styles.codeText} selectable>{recoveryCode || t({ en: 'Loading recovery code...', zh: '恢复码加载中…' })}</Text>
                </View>

                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={handleCopy}>
                    <Text style={styles.secondaryBtnText}>{copied ? t({ en: '✅ Copied', zh: '✅ 已复制' }) : t({ en: '📋 Copy', zh: '📋 复制' })}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={handleShare}>
                    <Text style={styles.secondaryBtnText}>{t({ en: '📤 Save / Share', zh: '📤 保存 / 分享' })}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.primaryBtn} onPress={handleContinueToConfirm}>
                  <Text style={styles.primaryBtnText}>{t({ en: 'I saved it, continue', zh: '我已保存，继续' })}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {step === 'confirm' && (
          <View style={styles.card}>
            <Text style={styles.title}>{t({ en: 'Confirm your backup', zh: '确认你的备份' })}</Text>
            <Text style={styles.subtitle}>
              {t({
                en: 'Please confirm that you stored the recovery shard somewhere safe before finishing setup.',
                zh: '请确认你已经将恢复分片保存在安全的位置，然后再完成设置。',
              })}
            </Text>

            <TouchableOpacity
              style={[styles.confirmCard, confirmed && styles.confirmCardActive]}
              onPress={() => setConfirmed((prev) => !prev)}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmIcon}>{confirmed ? '✅' : '⬜'}</Text>
              <Text style={styles.confirmText}>
                {t({
                  en: 'I understand that losing both this device and the recovery code may make the wallet unrecoverable.',
                  zh: '我已了解：如果同时丢失当前设备和恢复码，钱包可能将无法恢复。',
                })}
              </Text>
            </TouchableOpacity>

            <View style={styles.warningCard}>
              <Text style={styles.warningTitle}>{t({ en: 'Recommended storage methods', zh: '建议保存方式' })}</Text>
              <Text style={styles.warningText}>
                {t({
                  en: '• Password manager\n• Offline written copy\n• Encrypted personal notes\n\nNever post it in chat groups or public cloud docs.',
                  zh: '• 密码管理器\n• 离线纸质记录\n• 加密私人笔记\n\n不要把它发到群聊或公开云文档中。',
                })}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, (!confirmed || busy) && styles.primaryBtnDisabled]}
              onPress={handleFinish}
              disabled={!confirmed || busy}
            >
              <Text style={styles.primaryBtnText}>
                {busy
                  ? t({ en: 'Verifying backup…', zh: '校验备份中…' })
                  : t({ en: 'Verify & finish', zh: '校验并完成' })}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  container: { padding: 20, paddingBottom: 40, gap: 16 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  progressItem: { flex: 1, alignItems: 'center', gap: 6 },
  progressDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border },
  progressDotActive: { backgroundColor: colors.accent },
  progressText: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  progressTextActive: { color: colors.textPrimary, fontWeight: '700' },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  hero: { fontSize: 60, textAlign: 'center', marginTop: 8 },
  title: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.textSecondary, lineHeight: 22, textAlign: 'center' },
  featureList: { gap: 8, paddingTop: 6 },
  featureItem: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#000', fontWeight: '800', fontSize: 16 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: { color: colors.textPrimary, fontWeight: '600', fontSize: 14 },
  addressBox: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  addressLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  addressValue: { color: colors.textPrimary, fontSize: 12 },
  statusRow: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  statusOk: { backgroundColor: colors.success + '18', borderColor: colors.success + '44' },
  statusWarn: { backgroundColor: colors.warning + '18', borderColor: colors.warning + '44' },
  statusIcon: { fontSize: 18 },
  statusText: { flex: 1, color: colors.textPrimary, fontSize: 13, lineHeight: 19 },
  sectionTitle: { fontSize: 12, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  codeBox: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeText: { color: colors.accent, fontFamily: 'monospace', fontSize: 12, lineHeight: 20 },
  recoveryInput: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontFamily: 'monospace',
    fontSize: 12,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  actionRow: { flexDirection: 'row', gap: 12 },
  confirmCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: colors.bgSecondary,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmCardActive: { borderColor: colors.accent, backgroundColor: colors.accent + '15' },
  confirmIcon: { fontSize: 20 },
  confirmText: { flex: 1, color: colors.textPrimary, fontSize: 14, lineHeight: 22 },
  warningCard: {
    backgroundColor: colors.warning + '12',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.warning + '33',
  },
  warningTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  warningText: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
}));
