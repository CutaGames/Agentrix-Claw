import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';
import { MainTabParamList } from './types';
import { AgentStackNavigator } from './AgentStackNavigator';
import { MarketStackNavigator } from './MarketStackNavigator';
import { SocialStackNavigator } from './SocialStackNavigator';
import { ChatStackNavigator } from './ChatStackNavigator';
import { MeStackNavigator } from './MeStackNavigator';
import { colors } from '../theme/colors';
import { useNotificationStore } from '../stores/notificationStore';

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
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  return (
    <Tab.Navigator
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
      <Tab.Screen
        name="Agent"
        component={AgentStackNavigator}
        options={{
          title: 'Agent',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🤖" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Market"
        component={MarketStackNavigator}
        options={{
          title: 'Market',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🛒" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatStackNavigator}
        options={{
          title: 'Chats',
          tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Social"
        component={SocialStackNavigator}
        options={{
          title: 'Community',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🌐" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Me"
        component={MeStackNavigator}
        options={{
          title: 'Me',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} badge={unreadCount} />,
        }}
      />
    </Tab.Navigator>
  );
}
