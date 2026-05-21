import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Card } from '../components/Card';
import { colors } from '../theme/colors';
import { useIdentityStore, useCurrentIdentity, useIdentitySwitch } from '../stores/identityStore';
import { IdentityType } from '../types/identity';
import { useI18n } from '../stores/i18nStore';

// 身份内容组件
import { PersonalHomeContent } from '../components/identity/PersonalHomeContent';
import { MerchantHomeContent } from '../components/identity/MerchantHomeContent';
import { DeveloperHomeContent } from '../components/identity/DeveloperHomeContent';
import { LockedIdentityContent } from '../components/identity/LockedIdentityContent';

// 身份切换 Tab
const IdentityTabs: React.FC = () => {
  const activeIdentity = useIdentityStore((s) => s.activeIdentity);
  const { switchTo, canSwitchTo, identities } = useIdentitySwitch();
  const { t, language } = useI18n();

  const tabs: { type: IdentityType; label: string; icon: string }[] = [
    { type: 'personal', label: t({ en: 'Personal', zh: '个人' }), icon: '👤' },
    { type: 'merchant', label: t({ en: 'Merchant', zh: '商家' }), icon: '🏪' },
    { type: 'developer', label: t({ en: 'Developer', zh: '开发者' }), icon: '💻' },
  ];

  return (
    <View style={styles.tabContainer}>
      {tabs.map((tab) => {
        const isActive = activeIdentity === tab.type;
        const isLocked = !canSwitchTo(tab.type);
        const isPending = identities[tab.type]?.pending;

        return (
          <TouchableOpacity
            key={tab.type}
            style={[
              styles.tab,
              isActive && styles.tabActive,
              isLocked && styles.tabLocked,
            ]}
            onPress={() => switchTo(tab.type)}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {tab.label}
            </Text>
            {isLocked && <Text style={styles.lockIcon}>🔒</Text>}
            {isPending && <Text style={styles.pendingBadge}>{t({ en: 'Pending', zh: '审核中' })}</Text>}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

// 首页内容根据身份切换
const IdentityContent: React.FC = () => {
  const { type, status } = useCurrentIdentity();
  const navigation = useNavigation<any>();

  // 未激活身份显示锁定页面
  if (type !== 'personal' && !status?.activated) {
    return (
      <LockedIdentityContent 
        identity={type} 
        isPending={status?.pending || false}
        onActivate={() => navigation.navigate('IdentityActivation', { identity: type })}
      />
    );
  }

  // 根据身份显示不同内容
  switch (type) {
    case 'personal':
      return <PersonalHomeContent />;
    case 'merchant':
      return <MerchantHomeContent />;
    case 'developer':
      return <DeveloperHomeContent />;
    default:
      return <PersonalHomeContent />;
  }
};

export const HomeScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <IdentityTabs />
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <IdentityContent />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  // Tab 样式
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.bg,
    gap: 6,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabLocked: {
    opacity: 0.6,
  },
  tabIcon: {
    fontSize: 16,
  },
  tabLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: '#fff',
    fontWeight: '600',
  },
  lockIcon: {
    fontSize: 12,
  },
  pendingBadge: {
    fontSize: 10,
    color: colors.warning,
    marginLeft: 4,
  },
});