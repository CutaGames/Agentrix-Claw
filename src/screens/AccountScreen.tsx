// 统一账户管理 — 社交账号绑定 + MPC钱包 + 外部钱包
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { colors } from '../theme/colors';
import { useAuthStore } from '../stores/authStore';
import { apiFetch } from '../services/api';
import { useI18n } from '../stores/i18nStore';
import { checkMPCWallet, ensureMPCWallet, isMPCBackupCompleted } from '../services/mpcWallet';

interface SocialAccount {
  id: string;
  type: string;
  socialId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  createdAt: string;
  permissions?: string[]; // e.g. ['read', 'write', 'delete']
}

interface WalletConnection {
  id: string;
  walletAddress: string;
  chain: string;
  walletType: string;
  isDefault: boolean;
  createdAt: string;
}

const SOCIAL_PROVIDERS = [
  { type: 'google', icon: 'G', label: 'Google', color: '#EA4335', bgColor: '#EA433520' },
  { type: 'x', icon: '𝕏', label: 'Twitter/X', color: '#000', bgColor: '#00000020' },
  { type: 'discord', icon: 'D', label: 'Discord', color: '#5865F2', bgColor: '#5865F220' },
  { type: 'telegram', icon: '✈', label: 'Telegram', color: '#2AABEE', bgColor: '#2AABEE20' },
];

export function AccountScreen({ navigation }: { navigation: any }) {
  const user = useAuthStore((s) => s.user);
  const { t } = useI18n();
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]);
  const [wallets, setWallets] = useState<WalletConnection[]>([]);
  const [mpcWallet, setMpcWallet] = useState<{ address: string; chain: string } | null>(null);
  const [mpcBackupCompleted, setMpcBackupCompleted] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingMpc, setCreatingMpc] = useState(false);

  const loadData = useCallback(async () => {
    try {
      // 并行加载社交账号、钱包、MPC钱包
      const [socialRes, walletRes, mpcRes] = await Promise.allSettled([
        apiFetch<SocialAccount[]>('/auth/social/accounts'),
        apiFetch<WalletConnection[]>('/auth/wallet/connections'),
        checkMPCWallet(),
      ]);

      if (socialRes.status === 'fulfilled') setSocialAccounts(socialRes.value || []);
      if (walletRes.status === 'fulfilled') setWallets(walletRes.value || []);
      if (mpcRes.status === 'fulfilled' && mpcRes.value.hasWallet && mpcRes.value.wallet) {
        setMpcWallet({ address: mpcRes.value.wallet.walletAddress, chain: mpcRes.value.wallet.chain });
        setMpcBackupCompleted(await isMPCBackupCompleted());
      } else {
        setMpcWallet(null);
        setMpcBackupCompleted(true);
      }
    } catch (e) {
      console.warn('Failed to load account data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const handleCreateMpcWallet = async () => {
    if (!user?.id) return;
    setCreatingMpc(true);
    try {
      const address = await ensureMPCWallet(user.id);
      setMpcWallet({ address, chain: 'BSC' });
      setMpcBackupCompleted(false);
      Alert.alert(
        t({ en: 'MPC wallet created', zh: 'MPC 钱包已创建' }),
        t({
          en: `Address: ${address.slice(0, 10)}...${address.slice(-8)}\n\nNext, back up your recovery shard so the wallet can be restored later.`,
          zh: `地址：${address.slice(0, 10)}...${address.slice(-8)}\n\n下一步请立即备份恢复分片，避免后续无法找回钱包。`,
        }),
        [{ text: t({ en: 'Continue setup', zh: '继续设置' }), onPress: () => navigation.navigate('WalletSetup') }],
      );
    } catch (e: any) {
      Alert.alert(t({ en: 'Creation failed', zh: '创建失败' }), e?.message || t({ en: 'Please try again later', zh: '请稍后重试' }));
    } finally {
      setCreatingMpc(false);
    }
  };

  const handleCopyAddress = async (address: string) => {
    await Clipboard.setStringAsync(address);
    Alert.alert(t({ en: 'Copied', zh: '已复制' }), t({ en: 'Wallet address copied to clipboard', zh: '钱包地址已复制到剪贴板' }));
  };

  const handleBindSocial = (providerType: string) => {
    Alert.alert(
      t({ en: 'Bind social account', zh: '绑定账号' }),
      t({ en: `You will be redirected to ${providerType} to authorize linking`, zh: `即将跳转到 ${providerType} 进行授权绑定` }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        { text: t({ en: 'Continue', zh: '去绑定' }), onPress: () => {
          // TODO: 实现绑定流程 — 复用 auth.ts 的 socialLogin 然后调用 /auth/social/bind
          Alert.alert(t({ en: 'Notice', zh: '提示' }), t({ en: 'Binding is under development. For now, please log in with that social account once to bind it automatically.', zh: '绑定功能开发中，请先通过该社交账号登录一次以自动绑定。' }));
        }},
      ]
    );
  };

  const handleUnbindSocial = (account: SocialAccount) => {
    if (socialAccounts.length <= 1 && !user?.email) {
      Alert.alert(t({ en: 'Cannot unbind', zh: '无法解绑' }), t({ en: 'Keep at least one login method', zh: '至少保留一个登录方式' }));
      return;
    }
    Alert.alert(
      t({ en: 'Confirm unbind', zh: '确认解绑' }),
      t({ en: `Unbind ${account.displayName || account.type}?`, zh: `确定要解绑 ${account.displayName || account.type} 吗？` }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        { text: t({ en: 'Unbind', zh: '解绑' }), style: 'destructive', onPress: async () => {
          try {
            await apiFetch(`/auth/social/unbind/${account.type}`, { method: 'DELETE' });
            setSocialAccounts(prev => prev.filter(a => a.id !== account.id));
          } catch (e: any) {
            Alert.alert(t({ en: 'Unbind failed', zh: '解绑失败' }), e?.message || t({ en: 'Please try again later', zh: '请稍后重试' }));
          }
        }},
      ]
    );
  };

  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* 用户基本信息 */}
      <View style={styles.userCard}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>
            {(user?.nickname || user?.email || 'U')[0].toUpperCase()}
          </Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user?.nickname || user?.email || t({ en: 'User', zh: '用户' })}</Text>
          <Text style={styles.userId}>{user?.agentrixId || `ID: ${user?.id?.slice(0, 8)}`}</Text>
          {user?.email && <Text style={styles.userEmail}>📧 {user.email}</Text>}
        </View>
      </View>

      {/* MPC 钱包 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔐 {t({ en: 'MPC Wallet', zh: 'MPC 钱包' })}</Text>
        <Text style={styles.sectionDesc}>{t({ en: 'Self-custodial wallet with encrypted key shards stored across your device and recovery flow.', zh: '自托管钱包，密钥会以加密分片方式存储在你的设备和恢复流程中。' })}</Text>

        {mpcWallet ? (
          <View style={styles.mpcCard}>
            <View style={styles.mpcHeader}>
              <View style={styles.mpcChainBadge}>
                <Text style={styles.mpcChainText}>{mpcWallet.chain}</Text>
              </View>
              <View style={styles.mpcStatusDot} />
              <Text style={styles.mpcStatusText}>{t({ en: 'Active', zh: '已激活' })}</Text>
            </View>
            <TouchableOpacity onPress={() => handleCopyAddress(mpcWallet.address)} activeOpacity={0.7}>
              <Text style={styles.mpcAddress}>{shortenAddress(mpcWallet.address)}</Text>
              <Text style={styles.mpcCopyHint}>{t({ en: 'Tap to copy full address', zh: '点击复制完整地址' })}</Text>
            </TouchableOpacity>
            <View style={styles.mpcFeatures}>
              <View style={styles.mpcFeature}>
                <Text style={styles.mpcFeatureIcon}>🔑</Text>
                <Text style={styles.mpcFeatureText}>{t({ en: '2/3 shards', zh: '2/3 分片' })}</Text>
              </View>
              <View style={styles.mpcFeature}>
                <Text style={styles.mpcFeatureIcon}>📱</Text>
                <Text style={styles.mpcFeatureText}>{t({ en: 'Device storage', zh: '设备存储' })}</Text>
              </View>
              <View style={styles.mpcFeature}>
                <Text style={styles.mpcFeatureIcon}>🛡️</Text>
                <Text style={styles.mpcFeatureText}>{t({ en: 'Encrypted protection', zh: '加密保护' })}</Text>
              </View>
            </View>
            <View style={[styles.backupReminderCard, mpcBackupCompleted ? styles.backupReminderDone : styles.backupReminderWarn]}>
              <Text style={styles.backupReminderTitle}>
                {mpcBackupCompleted
                  ? t({ en: '✅ Recovery shard backed up', zh: '✅ 恢复分片已备份' })
                  : t({ en: '⚠️ Back up your recovery shard now', zh: '⚠️ 请立即备份恢复分片' })}
              </Text>
              <Text style={styles.backupReminderText}>
                {mpcBackupCompleted
                  ? t({ en: 'You can review your saved backup guidance anytime.', zh: '你可以随时再次查看备份说明。' })
                  : t({ en: 'Shard C is your recovery code. Without it, device loss may make the wallet unrecoverable.', zh: '分片 C 就是你的恢复码。如果没有它，设备丢失后钱包可能无法恢复。' })}
              </Text>
              <TouchableOpacity style={styles.backupReminderBtn} onPress={() => navigation.navigate(mpcBackupCompleted ? 'WalletBackup' : 'WalletSetup')}>
                <Text style={styles.backupReminderBtnText}>
                  {mpcBackupCompleted
                    ? t({ en: 'View backup', zh: '查看备份' })
                    : t({ en: 'Continue setup', zh: '继续设置' })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.createMpcBtn}
            onPress={() => navigation.navigate('WalletSetup')}
            disabled={creatingMpc}
            activeOpacity={0.7}
          >
            {creatingMpc ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Text style={styles.createMpcIcon}>🔐</Text>
                <View>
                  <Text style={styles.createMpcTitle}>{t({ en: 'Set Up MPC Wallet', zh: '设置 MPC 钱包' })}</Text>
                  <Text style={styles.createMpcDesc}>{t({ en: 'Follow the guided flow to create, back up, and confirm your wallet safely', zh: '按引导流程完成创建、备份和确认，安全启用钱包' })}</Text>
                </View>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* 社交账号绑定 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔗 {t({ en: 'Social Accounts', zh: '社交账号' })}</Text>
        <Text style={styles.sectionDesc}>{t({ en: 'Link social accounts for faster sign-in and identity verification.', zh: '绑定社交账号可用于快速登录和身份验证。' })}</Text>

        {SOCIAL_PROVIDERS.map(provider => {
          const bound = socialAccounts.find(a => a.type === provider.type);
          return (
            <View key={provider.type} style={styles.socialRow}>
              <View style={[styles.socialIcon, { backgroundColor: provider.bgColor }]}>
                <Text style={[styles.socialIconText, { color: provider.color }]}>{provider.icon}</Text>
              </View>
              <View style={styles.socialInfo}>
                <Text style={styles.socialLabel}>{provider.label}</Text>
                {bound ? (
                  <>
                    <Text style={styles.socialBound}>
                      {bound.displayName || bound.username || t({ en: 'Linked', zh: '已绑定' })}
                    </Text>
                    {bound.permissions && bound.permissions.length > 0 && (
                      <Text style={styles.socialPermissions}>
                        {t({ en: 'Permissions', zh: '权限' })}: {bound.permissions.join(', ')}
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.socialUnbound}>{t({ en: 'Not linked', zh: '未绑定' })}</Text>
                )}
              </View>
              {bound ? (
                <TouchableOpacity
                  style={styles.unbindBtn}
                  onPress={() => handleUnbindSocial(bound)}
                >
                  <Text style={styles.unbindBtnText}>{t({ en: 'Unbind', zh: '解绑' })}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.bindBtn}
                  onPress={() => handleBindSocial(provider.type)}
                >
                  <Text style={styles.bindBtnText}>{t({ en: 'Bind', zh: '绑定' })}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>

      {/* 外部钱包 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>💳 {t({ en: 'External Wallets', zh: '外部钱包' })}</Text>
        <Text style={styles.sectionDesc}>{t({ en: 'Connect external wallets for on-chain payments and trading.', zh: '连接外部钱包用于链上交易和支付。' })}</Text>

        {wallets.length > 0 ? (
          wallets.map(w => (
            <View key={w.id} style={styles.walletRow}>
              <Text style={styles.walletTypeIcon}>
                {w.walletType === 'metamask' ? '🦊' : w.walletType === 'okx' ? '⭕' : '🔗'}
              </Text>
              <View style={styles.walletInfo}>
                <View style={styles.walletNameRow}>
                  <Text style={styles.walletName}>{shortenAddress(w.walletAddress)}</Text>
                  {w.isDefault && (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>{t({ en: 'Default', zh: '默认' })}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.walletChain}>{w.chain} · {w.walletType}</Text>
              </View>
              <TouchableOpacity onPress={() => handleCopyAddress(w.walletAddress)}>
                <Text style={styles.copyIcon}>📋</Text>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>{t({ en: 'No external wallet connected yet', zh: '暂未连接外部钱包' })}</Text>
        )}

        <TouchableOpacity
          style={styles.addWalletBtn}
          onPress={() => navigation.navigate('WalletConnect')}
          activeOpacity={0.7}
        >
          <Text style={styles.addWalletIcon}>+</Text>
          <Text style={styles.addWalletText}>{t({ en: 'Connect external wallet', zh: '连接外部钱包' })}</Text>
        </TouchableOpacity>
      </View>

      {/* 安全提示 */}
      <View style={styles.securityNote}>
        <Text style={styles.securityIcon}>🛡️</Text>
        <Text style={styles.securityText}>
          {t({ en: 'Your MPC wallet shards are encrypted with AES-256 and stored securely on device. Social account links are used only for identity verification and do not grant access to your social data.', zh: '你的 MPC 钱包密钥分片使用 AES-256 加密并安全保存在设备中。社交账号绑定仅用于身份验证，不会读取你的社交数据。' })}
        </Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  // User card
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    margin: 16,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary + '30',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 24, fontWeight: '700', color: colors.primary },
  userInfo: { marginLeft: 14, flex: 1 },
  userName: { color: colors.text, fontSize: 18, fontWeight: '700' },
  userId: { color: colors.muted, fontSize: 12, marginTop: 2 },
  userEmail: { color: colors.muted, fontSize: 12, marginTop: 2 },

  // Section
  section: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  sectionDesc: { color: colors.muted, fontSize: 12, marginBottom: 14, lineHeight: 18 },

  // MPC Wallet
  mpcCard: {
    backgroundColor: colors.primary + '10',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  mpcHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  mpcChainBadge: {
    backgroundColor: colors.primary + '25',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  mpcChainText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  mpcStatusDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.success,
    marginLeft: 10,
  },
  mpcStatusText: { color: colors.success, fontSize: 12, fontWeight: '600', marginLeft: 4 },
  mpcAddress: { color: colors.text, fontSize: 18, fontWeight: '700', fontFamily: 'monospace' },
  mpcCopyHint: { color: colors.muted, fontSize: 11, marginTop: 4 },
  mpcFeatures: { flexDirection: 'row', marginTop: 12, gap: 12 },
  mpcFeature: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mpcFeatureIcon: { fontSize: 14 },
  mpcFeatureText: { color: colors.muted, fontSize: 11 },
  backupReminderCard: {
    marginTop: 14,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  backupReminderWarn: { backgroundColor: colors.warning + '14', borderColor: colors.warning + '40' },
  backupReminderDone: { backgroundColor: colors.success + '10', borderColor: colors.success + '35' },
  backupReminderTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  backupReminderText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  backupReminderBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  backupReminderBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  createMpcBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '10',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.primary + '30',
    borderStyle: 'dashed',
    gap: 14,
  },
  createMpcIcon: { fontSize: 28 },
  createMpcTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  createMpcDesc: { color: colors.muted, fontSize: 12, marginTop: 2 },

  // Social accounts
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  socialIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  socialIconText: { fontSize: 16, fontWeight: '800' },
  socialInfo: { flex: 1, marginLeft: 12 },
  socialLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  socialBound: { fontSize: 13, color: colors.textPrimary },
  socialPermissions: { fontSize: 11, color: colors.primary, marginTop: 2, fontWeight: '500' },
  socialUnbound: { fontSize: 13, color: colors.textMuted },
  bindBtn: {
    backgroundColor: colors.primary + '15',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  bindBtnText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  unbindBtn: {
    backgroundColor: colors.danger + '15',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  unbindBtnText: { color: colors.danger, fontSize: 13, fontWeight: '600' },

  // External wallets
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  walletTypeIcon: { fontSize: 24, marginRight: 12 },
  walletInfo: { flex: 1 },
  walletNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  walletName: { color: colors.text, fontSize: 14, fontWeight: '600', fontFamily: 'monospace' },
  defaultBadge: {
    backgroundColor: colors.primary + '25',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  defaultBadgeText: { color: colors.primary, fontSize: 10, fontWeight: '700' },
  walletChain: { color: colors.muted, fontSize: 12, marginTop: 2 },
  copyIcon: { fontSize: 18, padding: 4 },
  emptyText: { color: colors.muted, fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  addWalletBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    gap: 6,
  },
  addWalletIcon: { color: colors.primary, fontSize: 18, fontWeight: '700' },
  addWalletText: { color: colors.primary, fontSize: 14, fontWeight: '600' },

  // Security note
  securityNote: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 4,
    padding: 14,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  securityIcon: { fontSize: 18 },
  securityText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 17 },
});
