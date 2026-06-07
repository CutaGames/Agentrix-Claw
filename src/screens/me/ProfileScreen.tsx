/**
 * ProfileScreen — Sprint D (Me Tab landing).
 *
 * Source spec: MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 §2.6.
 *
 * Sections (collapsible per §2.6):
 *   1. Header: avatar + nickname + subscription badge + inline CTA
 *   2. Wallet glance: user main MPC balance + AXP balance
 *   3. Quota grid: current publish counts + upsell cue
 *   4. My purchases / creations (orders / skills / favorites / promote)
 *   5. Devices & connections (collapsed by default, expandable)
 *   6. Team & family (only rendered when user has a team/family)
 *   7. Settings (pref / notif / account / security)
 *   8. Advanced (uiComplexity ≥ advanced) collapsible
 *   9. Sign out
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSoulBirthStore } from '../../stores/soulBirthStore';
import { useI18n } from '../../stores/i18nStore';
import { fetchAxpBalance } from '../../services/axp.api';
import { fetchMySubscription, fetchMyQuota, SubscriptionTier } from '../../services/subscription.api';
import { DesktopBanner } from '../../components/desktop/DesktopBanner';
import type { MeStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MeStackParamList, 'Profile'>;

const TIER_ACCENT: Record<SubscriptionTier, string> = {
  free: '#9ca3af',
  lite: '#60a5fa',
  plus: '#a78bfa',
  pro: '#f472b6',
  elite: '#fbbf24',
  enterprise: '#f97316',
};

const TIER_LABEL_EN: Record<SubscriptionTier, string> = {
  free: 'Free',
  lite: 'Lite',
  plus: 'Plus',
  pro: 'Pro',
  elite: 'Elite',
  enterprise: 'Enterprise',
};

function fmtQuota(v: number, format: 'default' | 'cents' = 'default'): string {
  if (v < 0) return '∞';
  if (format === 'cents') {
    if (v === 0) return '$0';
    return `$${(v / 100).toFixed(v < 100 ? 2 : 0)}`;
  }
  return v.toLocaleString();
}

export function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const activeInstance = useAuthStore((s) => s.activeInstance);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const uiComplexity = useSettingsStore((s) => s.uiComplexity);
  const setUiComplexity = useSettingsStore((s) => s.setUiComplexity);
  const replaySoulBirth = useSoulBirthStore((s) => s.reset);
  const { t } = useI18n();

  const [devicesOpen, setDevicesOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const axpQ = useQuery({
    queryKey: ['axp-balance'],
    queryFn: fetchAxpBalance,
    staleTime: 30_000,
    retry: 1,
  });
  const subQ = useQuery({
    queryKey: ['my-subscription'],
    queryFn: fetchMySubscription,
    staleTime: 60_000,
    retry: 1,
  });
  const quotaQ = useQuery({
    queryKey: ['me-quota'],
    queryFn: fetchMyQuota,
    staleTime: 60_000,
    retry: 1,
  });

  const handleLogout = useCallback(() => {
    Alert.alert(
      t({ en: 'Sign Out', zh: '退出登录' }),
      t({ en: 'Are you sure you want to sign out?', zh: '确定要退出登录吗？' }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        { text: t({ en: 'Sign Out', zh: '退出登录' }), style: 'destructive', onPress: clearAuth },
      ],
    );
  }, [clearAuth, t]);

  const openInbox = useCallback(() => {
    (navigation as any).getParent?.()?.getParent?.()?.navigate('Inbox');
  }, [navigation]);

  const openScan = useCallback(() => {
    (navigation as any).getParent?.()?.getParent?.()?.navigate('Scan');
  }, [navigation]);

  /**
   * 「重看引导」(R1.7):重置 Soul_Birth 进度并从 birth 步骤重新开始。
   * 调 `soulBirthStore.reset()` 置 `replaying` 抑制 recompute 回填——挂在 RootNavigator 的
   * `SoulBirthHost` 监听到 terminated 转 false、completed 清空后会自动重新挂载覆盖层,
   * 从诞生段重放整条主线(无需导航)。先弹确认避免误触(重放会重走起名/苏醒)。
   */
  const handleReplaySoulBirth = useCallback(() => {
    Alert.alert(
      t({ en: 'Replay onboarding', zh: '重看引导' }),
      t({
        en: 'Restart the Soul Birth onboarding from the very beginning?',
        zh: '从头再体验一次「灵魂诞生」首跑引导吗？',
      }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Replay', zh: '重看' }),
          onPress: () => replaySoulBirth(),
        },
      ],
    );
  }, [replaySoulBirth, t]);

  const tier = (subQ.data?.tier ?? 'free') as SubscriptionTier;
  const tierAccent = TIER_ACCENT[tier];
  const quota = quotaQ.data;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ── Top bar ─────────────────────────────────── */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>{t({ en: 'Me', zh: '我' })}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <TouchableOpacity style={styles.bellBtn} onPress={openScan} testID="me-scan-btn">
            <Text style={styles.bellIcon}>📷</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bellBtn} onPress={openInbox} testID="me-inbox-btn">
            <Text style={styles.bellIcon}>🔔</Text>
            {unreadCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Desktop cross-device banner (persistent entry, R7.1) ── */}
      <DesktopBanner variant="persistent" />

      {/* ── 1. Profile Header ───────────────────────── */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.avatarUrl ? '👤' : user?.nickname?.charAt(0)?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nickname}>
            {user?.nickname || t({ en: 'Anonymous', zh: '匿名用户' })}
          </Text>
          <Text style={styles.email}>
            {user?.email || user?.walletAddress?.slice(0, 14) || t({ en: 'Guest', zh: '访客' })}
          </Text>
          <View style={styles.tierRow}>
            <View style={[styles.tierPill, { backgroundColor: tierAccent + '22', borderColor: tierAccent + '66' }]}>
              <Text style={[styles.tierText, { color: tierAccent }]}>
                {TIER_LABEL_EN[tier]}
              </Text>
            </View>
            {tier === 'free' ? (
              <TouchableOpacity
                style={styles.upgradeBtn}
                onPress={() => navigation.navigate('Subscribe')}
                testID="me-upgrade-btn"
              >
                <Text style={styles.upgradeBtnText}>
                  ⬆ {t({ en: 'Upgrade', zh: '升级' })}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>

      {/* ── 2. Wallet glance (user + AXP) ────────────── */}
      <Pressable
        style={styles.walletCard}
        onPress={() => navigation.navigate('WalletConnect')}
        testID="me-wallet-glance"
      >
        <Text style={styles.cardLabel}>{t({ en: 'My Wallet', zh: '我的钱包' })}</Text>
        <Text style={styles.walletValue}>
          {user?.walletAddress ? `${user.walletAddress.slice(0, 6)}…${user.walletAddress.slice(-4)}` : '—'}
        </Text>
        <Text style={styles.walletMuted}>
          {t({ en: 'Tap to manage', zh: '点击管理' })}
        </Text>
      </Pressable>

      <Pressable
        style={[styles.axpCard]}
        onPress={() => navigation.navigate('AxpCenter')}
        testID="me-axp-glance"
      >
        <View style={styles.cardHead}>
          <Text style={styles.cardLabel}>💎 {t({ en: 'AXP Balance', zh: 'AXP 余额' })}</Text>
          <Text style={styles.cardArrow}>›</Text>
        </View>
        {axpQ.isLoading && !axpQ.data ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <>
            <Text style={styles.axpValue}>
              {axpQ.data?.balance?.toLocaleString() ?? '0'}
            </Text>
            <Text style={styles.walletMuted}>
              ≈ ${((axpQ.data?.usd_value_cents ?? 0) / 100).toFixed(2)}
              {' · '}
              {quota?.axp_cashback_bps
                ? t({
                    en: `${quota.axp_cashback_bps / 100}% cashback on purchases`,
                    zh: `购买返 ${quota.axp_cashback_bps / 100}% AXP`,
                  })
                : t({ en: 'Upgrade for cashback', zh: '升级解锁返现' })}
            </Text>
          </>
        )}
      </Pressable>

      {/* ── 3. Quota grid ───────────────────────────── */}
      {quota ? (
        <View style={styles.quotaCard}>
          <View style={styles.cardHead}>
            <Text style={styles.cardLabel}>
              {t({ en: 'My Creations', zh: '我的创作' })}
            </Text>
            {tier !== 'elite' && tier !== 'enterprise' ? (
              <TouchableOpacity onPress={() => navigation.navigate('Subscribe')}>
                <Text style={styles.cardCta}>{t({ en: 'Upgrade ›', zh: '升级 ›' })}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.quotaGrid}>
            <QuotaCell label={t({ en: 'Skills', zh: '技能' })} value={fmtQuota(quota.skills_publish_max)} />
            <QuotaCell label={t({ en: 'Skins', zh: '皮肤' })} value={fmtQuota(quota.skins_publish_max)} />
            <QuotaCell label={t({ en: 'Products', zh: '商品' })} value={fmtQuota(quota.products_publish_max)} />
            <QuotaCell label={t({ en: 'Hardware', zh: '硬件 SKU' })} value={fmtQuota(quota.hardware_l3_max)} />
            <QuotaCell label={t({ en: 'Games', zh: '游戏' })} value={fmtQuota(quota.games_publish_max)} />
            <QuotaCell label={t({ en: 'Pets', zh: '主宠数' })} value={fmtQuota(quota.pets_max)} />
          </View>
        </View>
      ) : null}

      {/* ── 4. My & Promote ─────────────────────────── */}
      <Section title={t({ en: 'My stuff', zh: '我的' })}>
        <MenuItem icon="📦" label={t({ en: 'Orders', zh: '订单' })} onPress={() => navigation.navigate('MyOrders')} testID="me-orders" />
        <MenuItem icon="⚡" label={t({ en: 'Installed Skills', zh: '已装技能' })} onPress={() => navigation.navigate('MySkills')} testID="me-skills" />
        <MenuItem icon="🎁" label={t({ en: 'Referrals & Earnings', zh: '推广与佣金' })} onPress={() => navigation.navigate('ReferralDashboard')} testID="me-promote" />
      </Section>

      {/* ── 5. Devices & connections (collapsible) ──── */}
      <Section
        title={t({ en: 'Devices & connections', zh: '设备与连接' })}
        collapsible
        open={devicesOpen}
        onToggle={() => setDevicesOpen((v) => !v)}
      >
        <MenuItem
          icon="⌚"
          label={t({ en: 'Wearable devices', zh: '可穿戴设备' })}
          onPress={() => navigation.navigate('WearableHub')}
        />
        <MenuItem
          icon="🔗"
          label={t({ en: 'Connect / scan', zh: '扫码 / 连接' })}
          onPress={openScan}
        />
      </Section>

      {/* ── 6. Settings ─────────────────────────────── */}
      <Section title={t({ en: 'Settings', zh: '设置' })}>
        <MenuItem icon="🔐" label={t({ en: 'Account & security', zh: '账户与安全' })} onPress={() => navigation.navigate('Account')} />
        <MenuItem icon="🔔" label={t({ en: 'Notifications', zh: '通知' })} onPress={() => navigation.navigate('NotificationCenter')} />
        <MenuItem icon="⚙️" label={t({ en: 'Preferences', zh: '偏好设置' })} onPress={() => navigation.navigate('Settings')} />
        <MenuItem
          icon="✨"
          label={t({ en: 'Replay onboarding', zh: '重看引导' })}
          onPress={handleReplaySoulBirth}
          testID="me-replay-onboarding"
        />
      </Section>

      {/* ── 7. Advanced (collapsible, requires advanced+ complexity) ── */}
      <Section
        title={
          t({ en: 'Advanced', zh: '高级' }) +
          (uiComplexity === 'beginner' ? ' 🔒' : '')
        }
        collapsible
        open={advancedOpen}
        onToggle={() => {
          if (uiComplexity === 'beginner') {
            Alert.alert(
              t({ en: 'Advanced mode', zh: '高级模式' }),
              t({
                en: 'Unlock advanced developer tools (MCP, workflows, local AI, plugin hub).',
                zh: '解锁高级开发者工具（MCP / 工作流 / 本地 AI / 插件）',
              }),
              [
                { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
                {
                  text: t({ en: 'Enable', zh: '开启' }),
                  onPress: () => {
                    setUiComplexity('advanced');
                    setAdvancedOpen(true);
                  },
                },
              ],
            );
            return;
          }
          setAdvancedOpen((v) => !v);
        }}
      >
        <MenuItem icon="🤖" label={t({ en: 'AI Providers & keys', zh: 'AI 厂商 · API Keys' })} onPress={() => navigation.navigate('ApiKeys')} />
        <MenuItem icon="🧩" label={t({ en: 'Local AI Model', zh: '本地 AI 模型' })} onPress={() => navigation.navigate('LocalAiModel')} />
        <MenuItem icon="🧵" label={t({ en: 'Wallet Backup', zh: '钱包备份' })} onPress={() => navigation.navigate('WalletBackup')} />
        <MenuItem icon="🌐" label={t({ en: 'Social Listener', zh: '社交桥接' })} onPress={() => navigation.navigate('SocialListener')} />
      </Section>

      {/* ── 8. Logout ────────────────────────────────── */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} testID="me-logout">
        <Text style={styles.logoutText}>{t({ en: 'Sign Out', zh: '退出登录' })}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Reusable UI primitives ───────────────────────────

function QuotaCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.quotaCell}>
      <Text style={styles.quotaValue}>{value}</Text>
      <Text style={styles.quotaLabel}>{label}</Text>
    </View>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} testID={testID}>
      <Text style={styles.menuIcon}>{icon}</Text>
      <Text style={styles.menuLabel}>{label}</Text>
      <Text style={styles.menuArrow}>›</Text>
    </TouchableOpacity>
  );
}

function Section({
  title,
  children,
  collapsible = false,
  open = true,
  onToggle,
}: {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  const Header = (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionHeader}>{title}</Text>
      {collapsible ? <Text style={styles.sectionCaret}>{open ? '▾' : '▸'}</Text> : null}
    </View>
  );
  if (collapsible) {
    return (
      <View>
        <TouchableOpacity onPress={onToggle}>{Header}</TouchableOpacity>
        {open ? <View style={styles.sectionCard}>{children}</View> : null}
      </View>
    );
  }
  return (
    <View>
      {Header}
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  topBarTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  bellBtn: { position: 'relative', padding: 6 },
  bellIcon: { fontSize: 22 },
  bellBadge: { position: 'absolute', top: 2, right: 2, backgroundColor: colors.error, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  bellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  // Profile header
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 26, fontWeight: '800', color: '#fff' },
  nickname: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  email: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  tierPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  tierText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  upgradeBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.accent },
  upgradeBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  // Wallet cards
  walletCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  axpCard: {
    backgroundColor: colors.accent + '12',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.accent + '55',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  cardLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  cardArrow: { fontSize: 16, color: colors.textMuted },
  cardCta: { fontSize: 12, fontWeight: '700', color: colors.accent },
  walletValue: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, fontFamily: 'monospace' },
  walletMuted: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  axpValue: { fontSize: 24, fontWeight: '800', color: colors.accent },
  // Quota grid
  quotaCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quotaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  quotaCell: {
    width: '31%',
    backgroundColor: colors.bgPrimary,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  quotaValue: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  quotaLabel: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  // Section / menu
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 6,
    marginBottom: 8,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCaret: { fontSize: 14, color: colors.textMuted },
  sectionCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  menuIcon: { fontSize: 20, width: 28 },
  menuLabel: { flex: 1, fontSize: 15, color: colors.textPrimary },
  menuArrow: { fontSize: 20, color: colors.textMuted },
  // Logout
  logoutBtn: { alignItems: 'center', padding: 14, marginTop: 10 },
  logoutText: { color: colors.error, fontSize: 15, fontWeight: '600' },
});
