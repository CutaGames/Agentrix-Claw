// MVP "我的" 页面 — 含卖家看板入口、Agent预留入口
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { colors } from '../theme/colors';
import { authApi } from '../services/api';
import { referralApi } from '../services/referral.api';
import { useAuthStore } from '../stores/authStore';

interface Props {
  navigation: any;
}

interface MenuItem {
  icon: string;
  label: string;
  sublabel?: string;
  route?: string;
  badge?: string;
  disabled?: boolean;
  onPress?: () => void;
}

export function MvpProfileScreen({ navigation }: Props) {
  const authUser = useAuthStore((s) => s.user);
  const [user, setUser] = useState<any>(null);
  const [commission, setCommission] = useState(0);

  useEffect(() => {
    loadUser();
  }, [authUser]);

  const loadUser = async () => {
    // Use auth store user as primary, fetch fresh data from API
    if (authUser) {
      setUser(authUser);
    }
    try {
      const userData = await authApi.getCurrentUser();
      setUser(userData);
    } catch {
      // Use auth store user as fallback
    }
    try {
      const stats = await referralApi.getStats();
      setCommission(stats.totalCommission);
    } catch {
      // Ignore
    }
  };

  const menuItems: MenuItem[] = [
    {
      icon: '📦',
      label: 'My Skills',
      sublabel: 'View published skill analytics',
      route: 'MySkills',
    },
    {
      icon: '💰',
      label: 'Commission',
      sublabel: `Total $${commission.toFixed(2)}`,
      route: 'CommissionEarnings',
    },
    {
      icon: '📋',
      label: 'My Orders',
      sublabel: 'View purchase history',
      route: 'MyOrders',
    },
    {
      icon: '❤️',
      label: 'Favorites',
      sublabel: 'Saved skills',
      route: 'MyFavorites',
    },
    {
      icon: '🔐',
      label: 'Account',
      sublabel: 'Social accounts · MPC Wallet · External wallets',
      route: 'Account',
    },
    {
      icon: '🤖',
      label: 'My Agent',
      sublabel: 'Coming soon',
      disabled: true,
      onPress: () => Alert.alert('Coming Soon', 'Agent features are under development. Stay tuned!'),
    },
    {
      icon: '⚙️',
      label: 'Settings',
      route: 'Settings',
    },
  ];

  const handleLogin = () => {
    navigation.navigate('Login');
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* 用户信息卡片 */}
      <View style={styles.userCard}>
        {user ? (
          <>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user.nickname || user.email || 'U')[0].toUpperCase()}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{user.nickname || user.email || 'User'}</Text>
              <Text style={styles.userId}>{user.agentrixId || `ID: ${user.id?.slice(0, 8) || '...'}`}</Text>
            </View>
          </>
        ) : (
          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>👤</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.loginText}>Sign In / Register</Text>
              <Text style={styles.loginSubtext}>Sign in to unlock all features</Text>
            </View>
            <Text style={styles.loginArrow}>→</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 快捷统计 */}
      <View style={styles.quickStats}>
        <TouchableOpacity
          style={styles.quickStatItem}
          onPress={() => navigation.navigate('MyOrders')}
        >
          <Text style={styles.quickStatValue}>-</Text>
          <Text style={styles.quickStatLabel}>Orders</Text>
        </TouchableOpacity>
        <View style={styles.quickStatDivider} />
        <TouchableOpacity
          style={styles.quickStatItem}
          onPress={() => navigation.navigate('MyFavorites')}
        >
          <Text style={styles.quickStatValue}>-</Text>
          <Text style={styles.quickStatLabel}>Saved</Text>
        </TouchableOpacity>
        <View style={styles.quickStatDivider} />
        <TouchableOpacity
          style={styles.quickStatItem}
          onPress={() => navigation.navigate('MySkills')}
        >
          <Text style={styles.quickStatValue}>-</Text>
          <Text style={styles.quickStatLabel}>Skills</Text>
        </TouchableOpacity>
      </View>

      {/* 菜单列表 */}
      <View style={styles.menuSection}>
        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.menuItem, item.disabled && styles.menuItemDisabled]}
            onPress={() => {
              if (item.onPress) {
                item.onPress();
              } else if (item.route) {
                navigation.navigate(item.route);
              }
            }}
            activeOpacity={item.disabled ? 1 : 0.7}
          >
            <Text style={styles.menuIcon}>{item.icon}</Text>
            <View style={styles.menuContent}>
              <Text style={[styles.menuLabel, item.disabled && styles.menuLabelDisabled]}>
                {item.label}
              </Text>
              {item.sublabel && (
                <Text style={styles.menuSublabel}>{item.sublabel}</Text>
              )}
            </View>
            {item.badge && (
              <View style={styles.menuBadge}>
                <Text style={styles.menuBadgeText}>{item.badge}</Text>
              </View>
            )}
            {item.disabled && (
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>Soon</Text>
              </View>
            )}
            {!item.disabled && (
              <Text style={styles.menuArrow}>›</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* 发布引导 */}
      <View style={styles.publishGuide}>
        <Text style={styles.publishIcon}>💻</Text>
        <View style={styles.publishContent}>
          <Text style={styles.publishTitle}>Want to publish a new skill?</Text>
          <Text style={styles.publishSubtitle}>
            Visit agentrix.top on desktop for full publishing features: Markdown editor, API config, pricing & more
          </Text>
        </View>
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  // User card
  userCard: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
  },
  userInfo: {
    marginLeft: 14,
    flex: 1,
  },
  userName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  userId: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loginText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  loginSubtext: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  loginArrow: {
    color: colors.muted,
    fontSize: 20,
  },
  // Quick stats
  quickStats: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  quickStatValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  quickStatLabel: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  quickStatDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  // Menu
  menuSection: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemDisabled: {
    opacity: 0.6,
  },
  menuIcon: {
    fontSize: 20,
    marginRight: 14,
  },
  menuContent: {
    flex: 1,
  },
  menuLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  menuLabelDisabled: {
    color: colors.muted,
  },
  menuSublabel: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  menuBadge: {
    backgroundColor: colors.danger,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 8,
  },
  menuBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  comingSoonBadge: {
    backgroundColor: colors.muted + '30',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  comingSoonText: {
    color: colors.muted,
    fontSize: 11,
  },
  menuArrow: {
    color: colors.muted,
    fontSize: 20,
  },
  // Publish guide
  publishGuide: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  publishIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  publishContent: {
    flex: 1,
  },
  publishTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  publishSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
});
