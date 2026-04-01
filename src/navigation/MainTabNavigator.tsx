import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';
import { MainTabParamList } from './types';
import { AgentStackNavigator } from './AgentStackNavigator';
import { DiscoverStackNavigator } from './DiscoverStackNavigator';
import { TeamStackNavigator } from './TeamStackNavigator';
import { MeStackNavigator } from './MeStackNavigator';
import { colors } from '../theme/colors';
import { useNotificationStore } from '../stores/notificationStore';
import { useI18n } from '../stores/i18nStore';
import { isVoiceUiE2EEnabled } from '../testing/e2e';

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
  const initialRouteName = 'Agent';

  return (
    <Tab.Navigator id={undefined}
      initialRouteName={initialRouteName}
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
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      {/* Agent tab — now visible as Chat tab (first position) */}
      <Tab.Screen
        name="Agent"
        component={AgentStackNavigator}
        options={{
          title: t({ en: 'Chat', zh: '对话' }),
          tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Discover"
        component={DiscoverStackNavigator}
        options={{
          title: t({ en: 'Discover', zh: '发现' }),
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔍" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Team"
        component={TeamStackNavigator}
        options={{
          title: t({ en: 'Team', zh: '团队' }),
          tabBarIcon: ({ focused }) => <TabIcon emoji="👥" focused={focused} badge={approvalCount} />,
        }}
      />
      <Tab.Screen
        name="Me"
        component={MeStackNavigator}
        options={{
          title: t({ en: 'Me', zh: '我的' }),
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} badge={unreadCount} />,
        }}
      />
    </Tab.Navigator>
  );
}
