// MPC 钱包备份屏幕 — 显示并引导用户保存恢复码
import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, Share, ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { getRecoveryCode, getStoredShardA, markMPCBackupCompleted } from '../../services/mpcWallet';
import type { MeStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MeStackParamList>;

export function WalletBackupScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [shardA, setShardA] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const loadBackupData = React.useCallback(() => {
    setLoading(true);
    Promise.all([getRecoveryCode(), getStoredShardA()])
      .then(([rc, sa]) => {
        setRecoveryCode(rc);
        setShardA(sa);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadBackupData();
  }, [loadBackupData]);

  useFocusEffect(
    React.useCallback(() => {
      loadBackupData();
    }, [loadBackupData]),
  );

  const handleCopy = async () => {
    if (!recoveryCode) return;
    await Clipboard.setStringAsync(recoveryCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!recoveryCode) return;
    try {
      await Share.share({
        message: `${t({ en: 'Agentrix MPC Wallet Recovery Code', zh: 'Agentrix MPC 钱包恢复码' })}\n\n${recoveryCode}\n\n${t({ en: '⚠️ KEEP THIS PRIVATE — never share it publicly.', zh: '⚠️ 请务必私下保存，切勿公开分享。' })}`,
        title: t({ en: 'Wallet Recovery Code', zh: '钱包恢复码' }),
      });
    } catch {}
  };

  const handleDone = async () => {
    await markMPCBackupCompleted();
    Alert.alert(
      t({ en: 'Backup Saved', zh: '备份已确认' }),
      t({ en: 'Your MPC recovery code has been marked as backed up.', zh: '已将你的 MPC 恢复码标记为完成备份。' }),
      [{ text: t({ en: 'OK', zh: '知道了' }), onPress: () => navigation.goBack() }],
    );
  };

  const hasLocalShard = !!shardA;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.shieldIcon}>🔐</Text>
        <Text style={styles.title}>{t({ en: 'Wallet Backup', zh: '钱包备份' })}</Text>
        <Text style={styles.subtitle}>
          {t({
            en: 'Your MPC wallet is split into 3 shards. Shard A is on this device. Shard B is on Agentrix servers. The recovery code below is Shard C — back it up now.',
            zh: '你的 MPC 钱包被拆分为 3 个分片。分片 A 保存在当前设备，分片 B 保存在 Agentrix 服务器，下面显示的恢复码就是分片 C，请立即备份。',
          })}
        </Text>

        <View style={[styles.statusRow, hasLocalShard ? styles.statusOk : styles.statusWarn]}>
          <Text style={styles.statusIcon}>{hasLocalShard ? '✅' : '⚠️'}</Text>
          <Text style={styles.statusText}>
            {hasLocalShard
              ? t({ en: 'Shard A is stored securely on this device', zh: '分片 A 已安全保存在当前设备' })
              : t({ en: 'Shard A is missing — recovery may be needed', zh: '分片 A 缺失，后续可能需要恢复流程' })}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>{t({ en: 'Recovery Code (Shard C)', zh: '恢复码（分片 C）' })}</Text>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
        ) : recoveryCode ? (
          <>
            <View style={styles.codeBox}>
              <Text style={styles.codeText} selectable>{recoveryCode}</Text>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={handleCopy}>
                <Text style={styles.actionBtnText}>{copied ? t({ en: '✅ Copied', zh: '✅ 已复制' }) : t({ en: '📋 Copy', zh: '📋 复制' })}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
                <Text style={styles.actionBtnText}>{t({ en: '📤 Save / Share', zh: '📤 保存 / 分享' })}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.noCodeBox}>
            <Text style={styles.noCodeText}>
              {t({
                en: 'No recovery code was found on this device. Your wallet may have been created on another device, or the recovery code was never saved. Contact support if you need help recovering access.',
                zh: '当前设备未找到恢复码。可能是钱包在其他设备上创建的，或者恢复码当时没有保存。如需恢复访问权限，请联系支持团队。',
              })}
            </Text>
          </View>
        )}

        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>{t({ en: '⚠️ Important', zh: '⚠️ 重要提示' })}</Text>
          <Text style={styles.warningText}>
            {t({
              en: '• Save the recovery code in a password manager (1Password, Bitwarden, etc.) or write it down offline.\n• If you lose both your device and this recovery code, your wallet cannot be recovered.\n• Never share this code with anyone — Agentrix support will never ask for it.\n• This recovery code is encrypted and still requires your login credentials for use.',
              zh: '• 建议把恢复码保存到密码管理器（如 1Password、Bitwarden）或离线纸质记录。\n• 如果设备和恢复码同时丢失，你的钱包将无法恢复。\n• 不要把这串代码发给任何人，Agentrix 官方也不会索取。\n• 恢复码本身已加密，使用时仍需要你的登录凭证。',
            })}
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>{t({ en: 'ℹ️ What is an MPC Wallet?', zh: 'ℹ️ 什么是 MPC 钱包？' })}</Text>
          <Text style={styles.infoText}>
            {t({
              en: 'Multi-Party Computation (MPC) splits your private key into 3 encrypted shards. Any 2 of the 3 shards can reconstruct the key. That means Agentrix cannot access your funds alone — your device shard participates in every transaction.',
              zh: 'MPC（多方计算）会把私钥拆分成 3 个加密分片，其中任意 2 个都可以恢复密钥。这意味着 Agentrix 无法单独控制你的资金——每一笔交易都需要你的设备分片参与。',
            })}
          </Text>
        </View>

        <TouchableOpacity style={styles.doneBtn} onPress={handleDone}>
          <Text style={styles.doneBtnText}>{t({ en: "I've saved my backup", zh: '我已完成备份' })}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  scroll: { padding: 20, paddingBottom: 40, alignItems: 'center' },
  shieldIcon: { fontSize: 64, marginTop: 8, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, marginBottom: 12 },
  subtitle: { fontSize: 14, color: colors.textSecondary, lineHeight: 21, textAlign: 'center', marginBottom: 24, paddingHorizontal: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, width: '100%', marginBottom: 24, borderWidth: 1 },
  statusOk: { backgroundColor: colors.success + '18', borderColor: colors.success + '44' },
  statusWarn: { backgroundColor: colors.warning + '18', borderColor: colors.warning + '44' },
  statusIcon: { fontSize: 18 },
  statusText: { flex: 1, fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
  sectionTitle: { fontSize: 13, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, alignSelf: 'flex-start', marginBottom: 10 },
  codeBox: { width: '100%', backgroundColor: colors.bgCard, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  codeText: { fontFamily: 'monospace', fontSize: 12, color: colors.accent, lineHeight: 20 },
  actionRow: { flexDirection: 'row', gap: 12, width: '100%', marginBottom: 24 },
  actionBtn: { flex: 1, backgroundColor: colors.bgCard, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  actionBtnText: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
  noCodeBox: { width: '100%', backgroundColor: colors.bgCard, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.warning + '44', marginBottom: 24 },
  noCodeText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  warningCard: { width: '100%', backgroundColor: colors.error + '12', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.error + '33', marginBottom: 16 },
  warningTitle: { fontSize: 14, fontWeight: '800', color: colors.error, marginBottom: 8 },
  warningText: { fontSize: 13, color: colors.textSecondary, lineHeight: 21 },
  infoCard: { width: '100%', backgroundColor: colors.bgCard, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 24 },
  infoTitle: { fontSize: 13, fontWeight: '700', color: colors.accent, marginBottom: 8 },
  infoText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  doneBtn: { backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 40, width: '100%', alignItems: 'center' },
  doneBtnText: { color: '#000', fontSize: 16, fontWeight: '800' },
});
