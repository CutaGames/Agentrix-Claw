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
  ensureMPCWallet,
  getRecoveryCode,
  getStoredShardA,
  markMPCBackupCompleted,
} from '../../services/mpcWallet';
import type { MeStackParamList } from '../../navigation/types';

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
      const walletAddress = await ensureMPCWallet(user.id);
      setAddress(walletAddress);
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

  const handleFinish = useCallback(async () => {
    if (!confirmed) return;
    await markMPCBackupCompleted();
    Alert.alert(
      t({ en: 'Setup complete', zh: '设置完成' }),
      t({ en: 'Your MPC wallet is ready and your backup has been confirmed.', zh: '你的 MPC 钱包已就绪，且备份已确认完成。' }),
      [{ text: t({ en: 'Done', zh: '完成' }), onPress: () => navigation.goBack() }],
    );
  }, [confirmed, navigation, t]);

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
              style={[styles.primaryBtn, !confirmed && styles.primaryBtnDisabled]}
              onPress={handleFinish}
              disabled={!confirmed}
            >
              <Text style={styles.primaryBtnText}>{t({ en: 'Finish setup', zh: '完成设置' })}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
});
