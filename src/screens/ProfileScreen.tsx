// 我的/个人中心页面
import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Card } from '../components/Card';
import { colors } from '../theme/colors';
import { useIdentityStore } from '../stores/identityStore';
import { useI18n } from '../stores/i18nStore';

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { t, language } = useI18n();
  const user = useIdentityStore((s) => s.user);
  const logout = useIdentityStore((s) => s.logout);

  // Mock 用户数据
  const mockUser = {
    name: 'Kevin Wang',
    email: 'kevin@example.com',
    avatar: null,
    walletAddress: '0x1234...5678',
  };

  const menuItems = [
    { icon: '🔔', title: t({ en: 'Notification Settings', zh: '通知设置' }), screen: 'Settings' },
    { icon: '🔐', title: t({ en: 'Security Settings', zh: '安全设置' }), screen: 'Settings' },
    { icon: '🌐', title: t({ en: 'Environment Switch', zh: '环境切换' }), screen: 'Settings' },
    { icon: '💳', title: t({ en: 'Wallet Management', zh: '钉包管理' }), screen: 'Settings' },
    { icon: '📖', title: t({ en: 'Help Center', zh: '帮助中心' }), screen: null },
    { icon: '📝', title: t({ en: 'About Us', zh: '关于我们' }), screen: null },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 用户信息卡片 */}
      <Card>
        <View style={styles.userHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {mockUser.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{mockUser.name}</Text>
            <Text style={styles.userEmail}>{mockUser.email}</Text>
            <Text style={styles.userWallet}>{mockUser.walletAddress}</Text>
          </View>
          <TouchableOpacity style={styles.editBtn}>
            <Text style={styles.editIcon}>✏️</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* 身份状态 */}
      <Card>
        <Text style={styles.sectionTitle}>{t({ en: 'My Identity', zh: '我的身份' })}</Text>
        <View style={styles.identityList}>
          <View style={styles.identityItem}>
            <Text style={styles.identityIcon}>👤</Text>
            <Text style={styles.identityName}>{t({ en: 'Personal', zh: '个人' })}</Text>
            <View style={[styles.identityStatus, styles.statusActive]}>
              <Text style={styles.statusText}>{t({ en: 'Active', zh: '已激活' })}</Text>
            </View>
          </View>
          <View style={styles.identityItem}>
            <Text style={styles.identityIcon}>🏪</Text>
            <Text style={styles.identityName}>{t({ en: 'Merchant', zh: '商户' })}</Text>
            <View style={[styles.identityStatus, styles.statusActive]}>
              <Text style={styles.statusText}>{t({ en: 'Active', zh: '已激活' })}</Text>
            </View>
          </View>
          <View style={styles.identityItem}>
            <Text style={styles.identityIcon}>💻</Text>
            <Text style={styles.identityName}>{t({ en: 'Developer', zh: '开发者' })}</Text>
            <TouchableOpacity 
              style={[styles.identityStatus, styles.statusLocked]}
              onPress={() => navigation.navigate('IdentityActivation', { identity: 'developer' })}
            >
              <Text style={styles.statusTextLocked}>{t({ en: 'Apply', zh: '申请激活' })}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Card>

      {/* 菜单列表 */}
      <Card>
        <View style={styles.menuList}>
          {menuItems.map((item, index) => (
            <TouchableOpacity 
              key={index}
              style={styles.menuItem}
              onPress={() => item.screen && navigation.navigate(item.screen as any)}
            >
              <Text style={styles.menuIcon}>{item.icon}</Text>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      {/* 退出登录 */}
      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutText}>{t({ en: 'Sign Out', zh: '退出登录' })}</Text>
      </TouchableOpacity>

      {/* 版本信息 */}
      <Text style={styles.version}>Agentrix Mobile v2.0.0</Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  // 用户头部
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  userEmail: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 2,
  },
  userWallet: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  editBtn: {
    padding: 8,
  },
  editIcon: {
    fontSize: 16,
  },
  // 身份状态
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  identityList: {
    gap: 8,
  },
  identityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  identityIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  identityName: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  identityStatus: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  statusActive: {
    backgroundColor: '#059669',
  },
  statusLocked: {
    backgroundColor: colors.primary,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  statusTextLocked: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  // 菜单
  menuList: {
    gap: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  menuTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  menuArrow: {
    color: colors.muted,
    fontSize: 18,
  },
  // 退出登录
  logoutBtn: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f87171',
  },
  logoutText: {
    color: '#f87171',
    fontSize: 16,
    fontWeight: '500',
  },
  // 版本
  version: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
});
