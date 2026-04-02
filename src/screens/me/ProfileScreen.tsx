import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useI18n } from '../../stores/i18nStore';
import type { MeStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MeStackParamList, 'Profile'>;

export function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const activeInstance = useAuthStore((s) => s.activeInstance);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const { t } = useI18n();

  const menuItems = [
    { id: 'social', icon: '🌐', label: t({ en: 'Social Bridge', zh: '社交桥接' }), route: 'SocialListener' },
    { id: 'referral', icon: '🎁', label: t({ en: 'Referrals & Earnings', zh: '推广与收益' }), route: 'ReferralDashboard' },
    { id: 'account', icon: '🔐', label: t({ en: 'Wallet & Account', zh: '钱包与账户' }), route: 'Account' },
    { id: 'wallet-backup', icon: '🧩', label: t({ en: 'Wallet Backup', zh: '钱包备份' }), route: 'WalletBackup' },
    { id: 'skills', icon: '⚡', label: t({ en: 'My Skills', zh: '我的技能' }), route: 'MySkills' },
    { id: 'orders', icon: '📦', label: t({ en: 'My Orders', zh: '我的订单' }), route: 'MyOrders' },
    { id: 'settings', icon: '⚙️', label: t({ en: 'Settings', zh: '设置' }), route: 'Settings' },
  ] as const;

  const handleShare = () => {
    navigation.navigate('ShareCard', {
      shareUrl: `https://agentrix.top/i/${user?.agentrixId ?? ''}`,
      title: t({ en: 'Agentrix-Claw — Your 24/7 AI Agent', zh: 'Agentrix-Claw —— 你的 24/7 AI 助手' }),
      userName: user?.nickname ?? undefined,
    });
  };

  const handleLogout = () => {
    Alert.alert(t({ en: 'Sign Out', zh: '退出登录' }), t({ en: 'Are you sure you want to sign out?', zh: '确定要退出登录吗？' }), [
      { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
      { text: t({ en: 'Sign Out', zh: '退出登录' }), style: 'destructive', onPress: clearAuth },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top bar: title + scan + notification bell */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>{t({ en: 'Profile', zh: '我的' })}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <TouchableOpacity style={styles.bellBtn} onPress={() => navigation.navigate('Scan')}>
          <Text style={styles.bellIcon}>📷</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bellBtn} onPress={() => navigation.navigate('NotificationCenter')}>
          <Text style={styles.bellIcon}>🔔</Text>
          {unreadCount > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        </View>
      </View>

      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.avatarUrl ? '👤' : (user?.nickname?.charAt(0)?.toUpperCase() || '?')}
          </Text>
        </View>
        <View>
          <Text style={styles.nickname}>{user?.nickname || t({ en: 'Anonymous', zh: '匿名用户' })}</Text>
          <Text style={styles.email}>{user?.email || user?.walletAddress?.slice(0, 14) || t({ en: 'Guest', zh: '访客' })}</Text>
          <View style={styles.roleRow}>
            {user?.roles?.map((r) => (
              <View key={r} style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{r}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Active Instance */}
      {activeInstance ? (
        <View style={styles.instanceCard}>
          <View style={styles.instanceLeft}>
            <Text style={styles.instanceEmoji}>🤖</Text>
            <View>
              <Text style={styles.instanceName}>{activeInstance.name}</Text>
              <View style={styles.instanceStatus}>
                <View style={[styles.statusDot, { backgroundColor: activeInstance.status === 'active' ? colors.success : colors.error }]} />
                <Text style={styles.statusText}>{activeInstance.status} · {activeInstance.deployType}</Text>
              </View>
            </View>
          </View>
          <Text style={styles.instanceUrl} numberOfLines={1}>{activeInstance.instanceUrl}</Text>
        </View>
      ) : (
        <View style={styles.noInstanceCard}>
          <Text style={styles.noInstanceText}>{t({ en: 'No agent connected', zh: '暂未连接智能体' })}</Text>
        </View>
      )}

      {/* Share CTA */}
      <TouchableOpacity style={styles.shareCard} onPress={handleShare}>
        <Text style={styles.shareEmoji}>🦀</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.shareTitle}>{t({ en: 'Invite friends, earn commissions', zh: '邀请好友，赚取佣金' })}</Text>
          <Text style={styles.shareSub}>{t({ en: 'Share Agentrix-Claw and earn 30% on every purchase', zh: '分享 Agentrix-Claw，每笔购买都可获得 30% 佣金' })}</Text>
        </View>
        <Text style={styles.shareArrow}>›</Text>
      </TouchableOpacity>

      {/* Menu */}
      <View style={styles.menu}>
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.menuItem}
            onPress={() => {
              navigation.navigate(item.route as any);
            }}
          >
            <Text style={styles.menuIcon}>{item.icon}</Text>
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>{t({ en: 'Sign Out', zh: '退出登录' })}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: 16, padding: 16, gap: 14, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 28 },
  nickname: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  email: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  roleRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  roleBadge: { backgroundColor: colors.accent + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  roleBadgeText: { fontSize: 10, color: colors.accent, fontWeight: '700', textTransform: 'uppercase' },
  instanceCard: { backgroundColor: colors.bgCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 6 },
  instanceLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  instanceEmoji: { fontSize: 24 },
  instanceName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  instanceStatus: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { fontSize: 12, color: colors.textMuted },
  instanceUrl: { fontSize: 11, color: colors.textMuted, fontFamily: 'monospace', paddingLeft: 34 },
  noInstanceCard: { backgroundColor: colors.bgCard, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  noInstanceText: { color: colors.textMuted, fontSize: 14 },
  shareCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '22', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.primary + '55', gap: 12 },
  shareEmoji: { fontSize: 28 },
  shareTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  shareSub: { fontSize: 12, color: colors.textSecondary },
  shareArrow: { fontSize: 22, color: colors.primary },
  menu: { backgroundColor: colors.bgCard, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12 },
  menuIcon: { fontSize: 20, width: 28 },
  menuLabel: { flex: 1, fontSize: 15, color: colors.textPrimary },
  menuArrow: { fontSize: 20, color: colors.textMuted },
  logoutBtn: { alignItems: 'center', padding: 14 },
  logoutText: { color: colors.error, fontSize: 15, fontWeight: '600' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  topBarTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  bellBtn: { position: 'relative', padding: 6 },
  bellIcon: { fontSize: 22 },
  bellBadge: { position: 'absolute', top: 2, right: 2, backgroundColor: colors.error, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  bellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
