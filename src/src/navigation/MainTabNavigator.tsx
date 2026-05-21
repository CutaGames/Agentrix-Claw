/**
 * MainTabNavigator — Sprint A refactor.
 *
 * Source spec: MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 §2.
 *
 * Visible tabs: 🏠 Home · 🔮 Summon · 🎪 Plaza · 👤 Me
 * Hidden legacy tabs kept mounted as back-compat so call sites like
 * `navigate('Agent', ...)` / `navigate('Discover', ...)` keep working
 * during the transition. They will be removed in Sprint D after all
 * call sites are migrated.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from './types';
import { HomeStackNavigator } from './HomeStackNavigator';
import { SummonStackNavigator } from './SummonStackNavigator';
import { PlazaStackNavigator } from './PlazaStackNavigator';
import { MeStackNavigator } from './MeStackNavigator';

// Legacy stacks kept mounted (hidden from tab bar) so existing
// navigate('Agent' | 'Discover' | 'Team' | 'Pet' | 'Wallet', ...) calls
// still reach the right Stack without crashing during migration.
import { AgentStackNavigator } from './AgentStackNavigator';
import { DiscoverStackNavigator } from './DiscoverStackNavigator';
import { TeamStackNavigator } from './TeamStackNavigator';
import { PetStackNavigator } from './PetStackNavigator';
import { WalletStackNavigator } from './WalletStackNavigator';

import { colors } from '../theme/colors';
import { useNotificationStore } from '../stores/notificationStore';
import { useI18n } from '../stores/i18nStore';

const Tab = createBottomTabNavigator<MainTabParamList>();

function TabIcon({ emoji, focused, badge }: { emoji: string; focused: boolean; badge?: number }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 4 }}>
      <View>
        <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>
        {badge && badge > 0 ? (
          <View style={{
            position: 'absolute', top: -4, right: -6,
            backgroundColor: '#ef4444',
            borderRadius: 8, minWidth: 16, height: 16,
            alignItems: 'center', justifyContent: 'center',
            paddingHorizontal: 2,
          }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
              {badge > 99 ? '99+' : badge}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const HIDDEN_TAB_OPTIONS = {
  tabBarItemStyle: { display: 'none' as const },
  tabBarButton: () => null,
};

export function MainTabNavigator() {
  const { t } = useI18n();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const approvalCount = useNotificationStore((s) => s.approvalCount);

  return (
    <Tab.Navigator
      id={undefined}
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgCard,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 10,
          paddingTop: 4,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
      }}
    >
      {/* ── Canonical 4 tabs ─────────────────────────────────── */}
      <Tab.Screen
        name="Home"
        component={HomeStackNavigator}
        options={{
          title: t({ en: 'Home', zh: '家' }),
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Summon"
        component={SummonStackNavigator}
        options={{
          title: t({ en: 'Summon', zh: '召唤' }),
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔮" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Plaza"
        component={PlazaStackNavigator}
        options={{
          title: t({ en: 'Plaza', zh: '集市' }),
          tabBarIcon: ({ focused }) => <TabIcon emoji="🎪" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Me"
        component={MeStackNavigator}
        options={{
          title: t({ en: 'Me', zh: '我' }),
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="👤" focused={focused} badge={unreadCount + approvalCount} />
          ),
        }}
      />

      {/* ── Hidden legacy tabs (back-compat) ─────────────────── */}
      <Tab.Screen
        name="Today"
        component={HomeStackNavigator}
        options={HIDDEN_TAB_OPTIONS}
      />
      <Tab.Screen
        name="Agent"
        component={AgentStackNavigator}
        options={HIDDEN_TAB_OPTIONS}
      />
      <Tab.Screen
        name="Pet"
        component={PetStackNavigator}
        options={HIDDEN_TAB_OPTIONS}
      />
      <Tab.Screen
        name="Team"
        component={TeamStackNavigator}
        options={HIDDEN_TAB_OPTIONS}
      />
      <Tab.Screen
        name="Wallet"
        component={WalletStackNavigator}
        options={HIDDEN_TAB_OPTIONS}
      />
      <Tab.Screen
        name="Discover"
        component={DiscoverStackNavigator}
        options={HIDDEN_TAB_OPTIONS}
      />
    </Tab.Navigator>
  );
}
