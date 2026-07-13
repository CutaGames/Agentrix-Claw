/**
 * DepositSheet — USDC 充值（agent-wallet-identity-tangibility 需求 4：托管/外部 双路径切换）。
 *
 * 两个页签：
 *  - 托管钱包（Managed）：用 MPC 钱包走合约 deposit()（signAndSendManaged），gas 由 relayer 代付。
 *    未备份 → 引导去备份（BACKUP_REQUIRED）；flag 关 → 提示未开放。
 *  - 外部钱包（External）：展示金库合约地址，用户从自有钱包（WalletConnect / 交易所）转 USDC 入金。
 *
 * 合规：测试网资产无真实价值、非投资建议；USDC 为链上真实结算，与 AXP 分列不混。
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ActivityIndicator, Alert, Linking,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import { signAndSendManaged } from '../../services/mpcWallet';

// Injective EVM testnet(1439) CollateralVault（与后端 chain-registry 默认一致）
const DEFAULT_CHAIN_ID = 1439;
const VAULT_ADDRESS = '0x760ee31334EA03c2e47900eb3c419C232b4375C0';
const EXPLORER_ADDR = `https://testnet.blockscout.injective.network/address/${VAULT_ADDRESS}`;

type Path = 'managed' | 'external';

export function DepositSheet({
  visible, onClose, walletAddress, chainId = DEFAULT_CHAIN_ID, onBackupNeeded,
}: {
  visible: boolean;
  onClose: () => void;
  walletAddress?: string | null;
  chainId?: number;
  onBackupNeeded?: () => void;
}) {
  const c = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);

  const [path, setPath] = useState<Path>('managed');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const doManagedDeposit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      Alert.alert(t({ en: 'Invalid amount', zh: '金额无效' }));
      return;
    }
    if (!walletAddress) {
      Alert.alert(t({ en: 'No managed wallet', zh: '无托管钱包' }));
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await signAndSendManaged({
        walletAddress,
        userId: user?.id || '',
        intent: { kind: 'vault_deposit', chainId, amountUsdc: String(amt) },
      });
      if (res.reason === 'BACKUP_REQUIRED') {
        setBusy(false);
        Alert.alert(
          t({ en: 'Backup required', zh: '需要先备份' }),
          t({ en: 'Please back up your recovery code before depositing.', zh: '充值前请先完成恢复码备份。' }),
          [
            { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
            { text: t({ en: 'Back up now', zh: '去备份' }), onPress: () => { onClose(); onBackupNeeded?.(); } },
          ],
        );
        return;
      }
      if (res.reason === 'FEATURE_DISABLED') {
        setResult(t({ en: 'Managed deposit is not enabled yet.', zh: '托管充值尚未开放。' }));
      } else if (res.status === 'failed') {
        setResult(`${t({ en: 'Failed', zh: '失败' })}: ${res.reason || 'unknown'}`);
      } else {
        setResult(`${t({ en: 'Submitted', zh: '已提交' })} · ${res.status} · ${res.txHash.slice(0, 12)}…`);
      }
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes('RECOVERY_REQUIRED')) {
        setResult(t({ en: 'This device has no wallet shard — recover first.', zh: '本设备无钱包分片，请先恢复。' }));
      } else {
        setResult(`${t({ en: 'Error', zh: '错误' })}: ${msg}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const copyVault = async () => {
    await Clipboard.setStringAsync(VAULT_ADDRESS);
    Alert.alert(t({ en: 'Copied', zh: '已复制' }), t({ en: 'Vault address copied', zh: '金库地址已复制' }));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{t({ en: 'Deposit USDC', zh: '充值 USDC' })}</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.close}>✕</Text></TouchableOpacity>
          </View>

          {/* Path toggle */}
          <View style={styles.toggle}>
            {(['managed', 'external'] as Path[]).map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.toggleBtn, path === p && styles.toggleBtnActive]}
                onPress={() => { setPath(p); setResult(null); }}
                testID={`deposit-path-${p}`}
              >
                <Text style={[styles.toggleText, path === p && styles.toggleTextActive]}>
                  {p === 'managed' ? t({ en: 'Managed wallet', zh: '托管钱包' }) : t({ en: 'External wallet', zh: '外部钱包' })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {path === 'managed' ? (
            <View style={styles.body}>
              <Text style={styles.muted}>
                {t({ en: 'Deposit from your agent’s managed wallet. Gas is sponsored — no native token needed.', zh: '用你的 agent 托管钱包充值，gas 由平台代付，无需持有原生币。' })}
              </Text>
              <TextInput
                style={styles.input}
                placeholder={t({ en: 'Amount (USDC)', zh: '金额 (USDC)' })}
                placeholderTextColor={c.textMuted}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                testID="deposit-amount"
              />
              <TouchableOpacity style={styles.primaryBtn} onPress={doManagedDeposit} disabled={busy} testID="deposit-managed-submit">
                {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryBtnText}>{t({ en: 'Deposit', zh: '充值' })}</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.body}>
              <Text style={styles.muted}>
                {t({ en: 'Send USDC from your own wallet (WalletConnect / exchange) to the vault address below.', zh: '从你自己的钱包（WalletConnect / 交易所）向下面的金库地址转入 USDC。' })}
              </Text>
              <TouchableOpacity style={styles.addrBox} onPress={copyVault}>
                <Text style={styles.addrText}>{VAULT_ADDRESS}</Text>
                <Text style={styles.copyHint}>{t({ en: 'tap to copy', zh: '点击复制' })}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Linking.openURL(EXPLORER_ADDR)}>
                <Text style={styles.link}>{t({ en: 'View vault on explorer ↗', zh: '在区块浏览器查看金库 ↗' })}</Text>
              </TouchableOpacity>
              <Text style={styles.warn}>
                {t({ en: 'Only send USDC on Injective EVM testnet (chain 1439). Other assets/chains may be lost.', zh: '仅可在 Injective EVM 测试网（链 1439）转入 USDC，其它资产/链可能丢失。' })}
              </Text>
            </View>
          )}

          {result ? <Text style={styles.result} testID="deposit-result">{result}</Text> : null}

          <Text style={styles.disclosure}>
            {t({ en: 'Testnet assets have no real value. Not investment advice. USDC = on-chain settlement; AXP = in-app points (separate, non-withdrawable).', zh: '测试网资产无真实价值，非投资建议。USDC 为链上真实结算；AXP 为站内积分（性质不同、不可提现）。' })}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14, paddingBottom: 32 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: 18, fontWeight: '800', color: c.textPrimary },
    close: { fontSize: 18, color: c.textMuted, padding: 4 },
    toggle: { flexDirection: 'row', backgroundColor: c.bgCard, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: c.border },
    toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
    toggleBtnActive: { backgroundColor: c.accent + '22' },
    toggleText: { fontSize: 13, fontWeight: '700', color: c.textMuted },
    toggleTextActive: { color: c.accent },
    body: { gap: 12 },
    muted: { fontSize: 13, color: c.textMuted, lineHeight: 19 },
    input: { backgroundColor: c.bgCard, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14, fontSize: 16, color: c.textPrimary },
    primaryBtn: { backgroundColor: c.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
    primaryBtnText: { color: '#000', fontSize: 16, fontWeight: '800' },
    addrBox: { backgroundColor: c.bgCard, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14, gap: 4 },
    addrText: { fontFamily: 'monospace', fontSize: 12, color: c.textPrimary },
    copyHint: { fontSize: 11, color: c.textMuted },
    link: { fontSize: 13, color: c.accent, fontWeight: '700' },
    warn: { fontSize: 12, color: c.warning ?? '#d97706', lineHeight: 17 },
    result: { fontSize: 13, color: c.textPrimary, fontWeight: '600', paddingTop: 4 },
    disclosure: { fontSize: 11, color: c.textMuted, lineHeight: 16, paddingTop: 4 },
  });
}
