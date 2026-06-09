/**
 * MainTabNavigator — P-9 Companion Redesign T2.2.
 *
 * Source spec: requirements.md R3 / R11.1-R11.6.
 *
 * Visible tabs: 🌍 World · 🔮 Summon · 🎪 Plaza · 👤 Me
 *   - Default initialRoute = 'World' (R3.1 / D5.A — kill the "Home" tab,
 *     promote World Engine to tier-1 default).
 *   - Pet/Wallet/Agent/Discover/Team/Today/Home legacy tabs are GONE
 *     (R11.3, R11.10). The legacyRouteTable.ts redirects all old deep
 *     links to the new IA before React Navigation parses them, so old
 *     `agentrix://home/...` / `agentrix://pet/...` URLs still resolve.
 *
 * Notes:
 *   - The companion floating ball is visible in World/Plaza/Me but NOT
 *     in Summon (Summon = the conversation surface itself; the ball would
 *     duplicate the destination). See CompanionLayer.tsx.
 *   - All old Pet drawer screens (Wardrobe / SoulPicker / Breed / etc.)
 *     are re-mounted under MeStack (T6.7) and reachable via PetDetailSheet
 *     (T6.6) instead of a dedicated Pet tab.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from './types';
import { WorldStackNavigator } from './WorldStackNavigator';
import { SummonStackNavigator } from './SummonStackNavigator';
import { PlazaStackNavigator } from './PlazaStackNavigator';
import { MeStackNavigator } from './MeStackNavigator';

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

export function MainTabNavigator() {
  const { t } = useI18n();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const approvalCount = useNotificationStore((s) => s.approvalCount);

  return (
    <Tab.Navigator
      id={undefined}
      initialRouteName="World"
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
      <Tab.Screen
        name="World"
        component={WorldStackNavigator}
        options={{
          title: t({ en: 'World', zh: '世界' }),
          tabBarButtonTestID: 'tab-world',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🌍" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Summon"
        component={SummonStackNavigator}
        options={{
          title: t({ en: 'Summon', zh: '召唤' }),
          tabBarButtonTestID: 'tab-summon',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔮" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Plaza"
        component={PlazaStackNavigator}
        options={{
          title: t({ en: 'Plaza', zh: '集市' }),
          tabBarButtonTestID: 'tab-plaza',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🎪" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Me"
        component={MeStackNavigator}
        options={{
          title: t({ en: 'Me', zh: '我' }),
          tabBarButtonTestID: 'tab-me',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="👤" focused={focused} badge={unreadCount + approvalCount} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
