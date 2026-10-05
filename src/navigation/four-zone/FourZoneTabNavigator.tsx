/**
 * FourZoneTabNavigator — M1 skeleton of the 伙伴 / 事项 / 分身 / 我的 IA
 * (D3 / D14, product doc 5.3). Behind `mobile.four_zone_ia`, default off.
 *
 * - Tab and screen names match `fourZoneRoutes.ts` (tests check it).
 * - Labels come from the navigation catalog so every surface uses the same
 *   names (8.1).
 * - World / Summon / Plaza / Me stay as hidden routes so existing in-app
 *   calls and links keep resolving during rollout (D7: moved out of the
 *   default IA, not deleted).
 */
import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useColors } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { SummonStackNavigator } from '../SummonStackNavigator';
import { WorldStackNavigator } from '../WorldStackNavigator';
import { PlazaStackNavigator } from '../PlazaStackNavigator';
import { MeStackNavigator } from '../MeStackNavigator';
import { NAV_CATALOG } from '../navCatalog';
import { FOUR_ZONE_HIDDEN_TAB_OPTIONS } from './fourZoneRoutes';
import { DesktopControlScreen } from '../../screens/agent/DesktopControlScreen';
import { MattersHomeScreen } from '../../screens/four-zone/MattersHomeScreen';
import { TwinHomeScreen } from '../../screens/four-zone/TwinHomeScreen';
import { TwinIncomeScreen } from '../../screens/four-zone/TwinIncomeScreen';
import { TwinPassportScreen } from '../../screens/four-zone/TwinPassportScreen';
import { TwinStatusScreen } from '../../screens/four-zone/TwinStatusScreen';
import { TwinChannelsScreen } from '../../screens/four-zone/TwinChannelsScreen';
import { TwinChannelMessagesScreen } from '../../screens/four-zone/TwinChannelMessagesScreen';
import { CHANNEL_INBOX_ENABLED } from '../../services/channelInbox';
import { TwinAutomationsScreen } from '../../screens/four-zone/TwinAutomationsScreen';
import { AGENT_AUTOMATIONS_ENABLED } from '../../services/agentAutomations';
import { TwinVoiceScreen } from '../../screens/four-zone/TwinVoiceScreen';
import { TWIN_VOICE_ENABLED } from '../../services/twinVoice';

type FourZoneTabParamList = {
  Companion: undefined;
  Matters: undefined;
  Twin: undefined;
  My: undefined;
  World: undefined;
  Summon: undefined;
  Plaza: undefined;
  Me: undefined;
};
type CompanionStackParamList = { CompanionHome: undefined };
type MattersStackParamList = { MattersHome: { tab?: string; ref?: string } | undefined; MattersDesktop: { tab?: string; ref?: string } | undefined };
type TwinStackParamList = {
  TwinHome: { tab?: string; ref?: string } | undefined;
  TwinPassport: { tab?: string; ref?: string } | undefined;
  TwinStatus: { tab?: string; ref?: string } | undefined;
  TwinIncome: { tab?: string; ref?: string } | undefined;
  TwinVoice: undefined;
};

const Tab = createBottomTabNavigator<FourZoneTabParamList>();
const CompanionStack = createNativeStackNavigator<CompanionStackParamList>();
const MattersStack = createNativeStackNavigator<MattersStackParamList>();
const TwinStack = createNativeStackNavigator<TwinStackParamList>();

function stackOptions(c: ReturnType<typeof useColors>) {
  return {
    headerStyle: { backgroundColor: c.bgCard },
    headerTintColor: c.textPrimary,
    contentStyle: { backgroundColor: c.bgPrimary },
    headerShadowVisible: false,
  } as const;
}

function CompanionNavigator() {
  const c = useColors();
  return (
    <CompanionStack.Navigator id={undefined} screenOptions={stackOptions(c)}>
      <CompanionStack.Screen name="CompanionHome" component={SummonStackNavigator} options={{ headerShown: false }} />
    </CompanionStack.Navigator>
  );
}

function MattersNavigator() {
  const c = useColors();
  const { t } = useI18n();
  return (
    <MattersStack.Navigator id={undefined} screenOptions={stackOptions(c)}>
      <MattersStack.Screen name="MattersHome" component={MattersHomeScreen} options={{ headerShown: false }} />
      <MattersStack.Screen
        name="MattersDesktop"
        component={DesktopControlScreen}
        options={{ title: t({ en: 'On your computer', zh: '电脑上' }) }}
      />
    </MattersStack.Navigator>
  );
}

function TwinNavigator() {
  const c = useColors();
  const { t } = useI18n();
  return (
    <TwinStack.Navigator id={undefined} screenOptions={stackOptions(c)}>
      <TwinStack.Screen name="TwinHome" component={TwinHomeScreen} options={{ headerShown: false }} />
      <TwinStack.Screen name="TwinPassport" component={TwinPassportScreen} options={{ title: t({ en: 'Agent passport', zh: 'Agent 护照' }) }} />
      <TwinStack.Screen name="TwinStatus" component={TwinStatusScreen} options={{ title: t({ en: 'Visibility', zh: '公开状态' }) }} />
      <TwinStack.Screen name="TwinIncome" component={TwinIncomeScreen} options={{ title: t({ en: 'Income', zh: '收入与回执' }) }} />
      {/* A2 channel inbox (E98): registered only in builds with EXPO_PUBLIC_CHANNEL_INBOX=1. */}
      {CHANNEL_INBOX_ENABLED ? (
        <>
          <TwinStack.Screen name="TwinChannels" component={TwinChannelsScreen} options={{ title: t({ en: 'Chats', zh: '渠道对话' }) }} />
          <TwinStack.Screen name="TwinChannelMessages" component={TwinChannelMessagesScreen} options={{ title: t({ en: 'Chat', zh: '对话' }) }} />
        </>
      ) : null}
      {/* E1 / E2 automations: registered only in builds with EXPO_PUBLIC_AGENT_AUTOMATIONS=1. */}
      {AGENT_AUTOMATIONS_ENABLED ? (
        <TwinStack.Screen name="TwinAutomations" component={TwinAutomationsScreen} options={{ title: t({ en: 'Automations', zh: '自动化' }) }} />
      ) : null}
      {/* Twin voice from the owner's own ElevenLabs: registered only in builds with EXPO_PUBLIC_TWIN_VOICE_ELEVENLABS_ENABLED=1. */}
      {TWIN_VOICE_ENABLED ? (
        <TwinStack.Screen name="TwinVoice" component={TwinVoiceScreen} options={{ title: t({ en: 'Twin voice', zh: '分身的声音' }) }} />
      ) : null}
    </TwinStack.Navigator>
  );
}

/** 我的 opens the catalog-driven MyHome; every Me route stays registered (M1-d). */
function FourZoneMyNavigator() {
  return <MeStackNavigator initialRouteName="MyHome" />;
}

function TabIcon({ glyph, focused, badge, testID }: { glyph: string; focused: boolean; badge?: number; testID: string }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 4 }} testID={testID}>
      <View>
        <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }} accessibilityElementsHidden importantForAccessibility="no">
          {glyph}
        </Text>
        {badge && badge > 0 ? (
          <View style={{ position: 'absolute', top: -4, right: -7, minWidth: 16, height: 16, paddingHorizontal: 2, borderRadius: 8, backgroundColor: '#e05252', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const hiddenTabOptions = FOUR_ZONE_HIDDEN_TAB_OPTIONS;

export function FourZoneTabNavigator() {
  const c = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const approvals = useNotificationStore((state) => state.approvalCount);
  const unread = useNotificationStore((state) => state.unreadCount);
  const compact = width < 360 || fontScale > 1.2;
  const bottomInset = Math.max(insets.bottom, compact ? 6 : 8);
  const contentHeight = compact ? 50 : 54;

  return (
    <Tab.Navigator
      id={undefined}
      initialRouteName="Companion"
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: c.bgCard,
          borderTopColor: c.border,
          borderTopWidth: 1,
          height: contentHeight + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: compact ? 2 : 4,
        },
        tabBarItemStyle: { flex: 1, minWidth: 0, paddingHorizontal: 0 },
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textMuted,
        tabBarLabelStyle: { fontSize: compact ? 10 : 11, fontWeight: '600', marginTop: compact ? 0 : 2, marginHorizontal: 0 },
      }}
    >
      <Tab.Screen
        name="Companion"
        component={CompanionNavigator}
        options={{
          title: t(NAV_CATALOG.companion.label),
          tabBarAccessibilityLabel: t(NAV_CATALOG.companion.label),
          tabBarButtonTestID: 'tab-companion',
          tabBarIcon: ({ focused }) => <TabIcon glyph="◉" focused={focused} testID="tab-companion-icon" />,
        }}
      />
      <Tab.Screen
        name="Matters"
        component={MattersNavigator}
        options={{
          title: t(NAV_CATALOG.matters.label),
          tabBarAccessibilityLabel: t(NAV_CATALOG.matters.label),
          tabBarButtonTestID: 'tab-matters',
          tabBarIcon: ({ focused }) => <TabIcon glyph="✓" focused={focused} badge={approvals} testID="tab-matters-icon" />,
        }}
      />
      <Tab.Screen
        name="Twin"
        component={TwinNavigator}
        options={{
          title: t(NAV_CATALOG.twin.label),
          tabBarAccessibilityLabel: t(NAV_CATALOG.twin.label),
          tabBarButtonTestID: 'tab-twin',
          tabBarIcon: ({ focused }) => <TabIcon glyph="◐" focused={focused} testID="tab-twin-icon" />,
        }}
      />
      <Tab.Screen
        name="My"
        component={FourZoneMyNavigator}
        options={{
          title: t(NAV_CATALOG.my.label),
          tabBarAccessibilityLabel: t(NAV_CATALOG.my.label),
          tabBarButtonTestID: 'tab-my',
          tabBarIcon: ({ focused }) => <TabIcon glyph="●" focused={focused} badge={unread} testID="tab-my-icon" />,
        }}
      />
      {/* Hidden legacy routes (D7): reachable from old calls and links, not from the tab bar. */}
      <Tab.Screen name="World" component={WorldStackNavigator} options={hiddenTabOptions} />
      <Tab.Screen name="Summon" component={SummonStackNavigator} options={hiddenTabOptions} />
      <Tab.Screen name="Plaza" component={PlazaStackNavigator} options={hiddenTabOptions} />
      <Tab.Screen name="Me" component={MeStackNavigator} options={hiddenTabOptions} />
    </Tab.Navigator>
  );
}
