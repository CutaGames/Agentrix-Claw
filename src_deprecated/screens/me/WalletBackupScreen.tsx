// MPC 钱包备份屏幕 — 显示并引导用户保存恢复码
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Clipboard, Alert, Share, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { getRecoveryCode, getStoredShardA } from '../../services/mpcWallet';
import type { MeStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MeStackParamList>;

export function WalletBackupScreen() {
  const navigation = useNavigation<Nav>();
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [shardA, setShardA] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([getRecoveryCode(), getStoredShardA()]).then(([rc, sa]) => {
      setRecoveryCode(rc);
      setShardA(sa);
    }).finally(() => setLoading(false));
  }, []);

  const handleCopy = () => {
    if (!recoveryCode) return;
    Clipboard.setString(recoveryCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!recoveryCode) return;
    try {
      await Share.share({
        message: `ClawLink MPC Wallet Recovery Code\n\n${recoveryCode}\n\n⚠️ KEEP THIS PRIVATE — never share it publicly.`,
        title: 'Wallet Recovery Code',
      });
    } catch {}
  };

  const hasLocalShard = !!shardA;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <Text style={styles.shieldIcon}>🔐</Text>
        <Text style={styles.title}>Wallet Backup</Text>
        <Text style={styles.subtitle}>
          Your MPC wallet is split into 3 shards. Shard A is on this device. Shard B is on Agentrix servers.
          The Recovery Code below is Shard C — back it up now.
        </Text>

        {/* Shard A status */}
        <View style={[styles.statusRow, hasLocalShard ? styles.statusOk : styles.statusWarn]}>
          <Text style={styles.statusIcon}>{hasLocalShard ? '✅' : '⚠️'}</Text>
          <Text style={styles.statusText}>
            {hasLocalShard ? 'Shard A stored securely on this device' : 'Shard A missing — shard may need recovery'}
          </Text>
        </View>

        {/* Recovery Code */}
        <Text style={styles.sectionTitle}>Recovery Code (Shard C)</Text>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
        ) : recoveryCode ? (
          <>
            <View style={styles.codeBox}>
              <Text style={styles.codeText} selectable>{recoveryCode}</Text>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={handleCopy}>
                <Text style={styles.actionBtnText}>{copied ? '✅ Copied' : '📋 Copy'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
                <Text style={styles.actionBtnText}>📤 Save / Share</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.noCodeBox}>
            <Text style={styles.noCodeText}>
              No recovery code found locally. This may mean your wallet was created on a different device,
              or the recovery code was not saved. Contact support if you need to recover access.
            </Text>
          </View>
        )}

        {/* Warning card */}
        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>⚠️ Important</Text>
          <Text style={styles.warningText}>
            • Store your Recovery Code in a password manager (1Password, Bitwarden, etc.) or write it on paper.{'\n'}
            • If you lose your device AND your Recovery Code, your wallet CANNOT be recovered.{'\n'}
            • Never share this code with anyone — Agentrix support will never ask for it.{'\n'}
            • Your Recovery Code is encrypted — it requires your login credentials to decrypt.
          </Text>
        </View>

        {/* What is MPC */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>ℹ️ What is MPC Wallet?</Text>
          <Text style={styles.infoText}>
            Multi-Party Computation (MPC) splits your wallet private key into 3 encrypted shards.
            Any 2 of 3 shards can reconstruct the key. This means Agentrix can NEVER access your funds
            alone — your device shard is required for every transaction.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.doneBtnText}>I've saved my backup</Text>
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

  codeBox: {
    width: '100%', backgroundColor: colors.bgCard, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 12,
  },
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
