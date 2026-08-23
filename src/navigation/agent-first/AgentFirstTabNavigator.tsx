import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type {
  AgentFirstActionsStackParamList,
  AgentFirstAgentStackParamList,
  AgentFirstCreationStackParamList,
  AgentFirstEconomyStackParamList,
  AgentFirstTabParamList,
  AgentFirstWorkStackParamList,
} from './types';
import {
  ActionTrackingScreen,
  ActionsHomeScreen,
  AuthorityReviewScreen,
  CandidateCompareScreen,
  DestinationErrorScreen,
  GoalComposerScreen,
  HardwareAssuranceScreen,
  LsmUnavailableScreen,
} from '../../screens/agent-first/AgentEconomyScreens';
import { CreationHomeScreen } from '../../screens/agent-first/CreationHomeScreen';
import { AgentHomeScreen } from '../../screens/agent-first/work/AgentHomeScreen';
import { AgentSoulCoreScreen } from '../../screens/agent-first/work/AgentSoulCoreScreen';
import { EconomyHomeScreen } from '../../screens/agent-first/work/EconomyHomeScreen';
import { WorkHomeScreen } from '../../screens/agent-first/work/WorkHomeScreen';
import {
  WorkApprovalsScreen,
  WorkHandoffsScreen,
  WorkMachinesScreen,
  WorkReceiptsScreen,
  WorkSessionsScreen,
} from '../../screens/agent-first/work/WorkDetailScreens';
import { SummonStackNavigator } from '../SummonStackNavigator';
import { WorldStackNavigator } from '../WorldStackNavigator';
import { PlazaStackNavigator } from '../PlazaStackNavigator';
import { MeStackNavigator } from '../MeStackNavigator';
import PredictionMarketScreen from '../../screens/world/PredictionMarketScreen';
import CreationFeedScreen from '../../screens/world/CreationFeedScreen';
import CreationCreatorScreen from '../../screens/world/CreationCreatorScreen';
import CreationExperienceScreen from '../../screens/world/CreationExperienceScreen';
import CreationDetailScreen from '../../screens/world/CreationDetailScreen';
import MyWorldScreen from '../../screens/world/MyWorldScreen';
import UnifiedWorldMapScreen from '../../screens/world/UnifiedWorldMapScreen';
import WorldCreationMarketplaceScreen from '../../screens/world/WorldCreationMarketplaceScreen';
import { useColors } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { AGENT_FIRST_DEFAULT_TAB } from './iaContract';

const Tab = createBottomTabNavigator<AgentFirstTabParamList>();
const AgentStack = createNativeStackNavigator<AgentFirstAgentStackParamList>();
const WorkStack = createNativeStackNavigator<AgentFirstWorkStackParamList>();
const ActionsStack = createNativeStackNavigator<AgentFirstActionsStackParamList>();
const EconomyStack = createNativeStackNavigator<AgentFirstEconomyStackParamList>();
const CreationStack = createNativeStackNavigator<AgentFirstCreationStackParamList>();

function stackOptions(c: ReturnType<typeof useColors>) {
  return {
    headerStyle: { backgroundColor: c.bgCard },
    headerTintColor: c.textPrimary,
    contentStyle: { backgroundColor: c.bgPrimary },
    headerShadowVisible: false,
  } as const;
}

function AgentNavigator() {
  const c = useColors();
  const { t } = useI18n();
  return (
    <AgentStack.Navigator id={undefined} initialRouteName="AgentHome" screenOptions={stackOptions(c)}>
      <AgentStack.Screen name="AgentHome" component={AgentHomeScreen} options={{ headerShown: false }} />
      <AgentStack.Screen name="GoalComposer" component={GoalComposerScreen} options={{ title: t({ en: 'New goal', zh: '新目标' }) }} />
      <AgentStack.Screen name="CandidateCompare" component={CandidateCompareScreen} options={{ title: t({ en: 'Candidates', zh: '候选' }) }} />
      <AgentStack.Screen name="AuthorityReview" component={AuthorityReviewScreen} options={{ title: t({ en: 'Authority', zh: '授权' }) }} />
      <AgentStack.Screen name="ActionTracking" component={ActionTrackingScreen} options={{ title: t({ en: 'Tracking', zh: '跟踪' }) }} />
      <AgentStack.Screen name="Companion" component={SummonStackNavigator} options={{ title: t({ en: 'Companion', zh: '伙伴' }), headerShown: false }} />
      <AgentStack.Screen name="HardwareAssurance" component={HardwareAssuranceScreen} options={{ title: t({ en: 'Soul Core', zh: 'Soul Core' }) }} />
      <AgentStack.Screen name="AgentSoulCore" component={AgentSoulCoreScreen} options={{ title: 'Soul Core' }} />
      <AgentStack.Screen name="DestinationError" component={DestinationErrorScreen} options={{ title: t({ en: 'Invalid link', zh: '链接无效' }) }} />
    </AgentStack.Navigator>
  );
}

function workActionScreens(
  Stack: typeof WorkStack | typeof ActionsStack,
  t: ReturnType<typeof useI18n>['t'],
) {
  return (
    <>
      <Stack.Screen name="ActionsHome" component={ActionsHomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AuthorityReview" component={AuthorityReviewScreen} options={{ title: t({ en: 'Authority', zh: '授权' }) }} />
      <Stack.Screen name="ActionTracking" component={ActionTrackingScreen} options={{ title: t({ en: 'Tracking', zh: '跟踪' }) }} />
    </>
  );
}

function WorkNavigator() {
  const c = useColors();
  const { t } = useI18n();
  return (
    <WorkStack.Navigator id={undefined} initialRouteName="WorkHome" screenOptions={stackOptions(c)}>
      <WorkStack.Screen name="WorkHome" component={WorkHomeScreen} options={{ headerShown: false }} />
      {workActionScreens(WorkStack, t)}
      <WorkStack.Screen name="WorkMachines" component={WorkMachinesScreen} options={{ title: t({ en: 'Machines', zh: '机器' }) }} />
      <WorkStack.Screen name="WorkSessions" component={WorkSessionsScreen} options={{ title: t({ en: 'Sessions', zh: '会话' }) }} />
      <WorkStack.Screen name="WorkApprovals" component={WorkApprovalsScreen} options={{ title: t({ en: 'Approvals', zh: '审批' }) }} />
      <WorkStack.Screen name="WorkReceipts" component={WorkReceiptsScreen} options={{ title: t({ en: 'Receipts', zh: '回执' }) }} />
      <WorkStack.Screen name="WorkHandoffs" component={WorkHandoffsScreen} options={{ title: t({ en: 'Handoff', zh: '交接' }) }} />
    </WorkStack.Navigator>
  );
}

function ActionsNavigator() {
  const c = useColors();
  const { t } = useI18n();
  return (
    <ActionsStack.Navigator id={undefined} screenOptions={stackOptions(c)}>
      {workActionScreens(ActionsStack, t)}
    </ActionsStack.Navigator>
  );
}

function creationScreens(
  Stack: typeof CreationStack | typeof EconomyStack,
  t: ReturnType<typeof useI18n>['t'],
) {
  return (
    <>
      <Stack.Screen name="CreationHome" component={CreationHomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CreationFeed" component={CreationFeedScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CreationCreator" component={CreationCreatorScreen as any} options={{ title: t({ en: 'Create', zh: '创作' }), headerShown: false }} />
      <Stack.Screen name="CreationExperience" component={CreationExperienceScreen as any} options={{ headerShown: false }} />
      <Stack.Screen name="CreationDetail" component={CreationDetailScreen as any} options={{ headerShown: false }} />
      <Stack.Screen name="MyWorld" component={MyWorldScreen} options={{ headerShown: false }} />
      <Stack.Screen name="UnifiedWorldMap" component={UnifiedWorldMapScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WorldCreationMarketplace" component={WorldCreationMarketplaceScreen} options={{ headerShown: false }} />
    </>
  );
}

function EconomyNavigator() {
  const c = useColors();
  const { t } = useI18n();
  return (
    <EconomyStack.Navigator id={undefined} initialRouteName="EconomyHome" screenOptions={stackOptions(c)}>
      <EconomyStack.Screen name="EconomyHome" component={EconomyHomeScreen} options={{ headerShown: false }} />
      {creationScreens(EconomyStack, t)}
    </EconomyStack.Navigator>
  );
}

function CreationNavigator() {
  const c = useColors();
  const { t } = useI18n();
  return (
    <CreationStack.Navigator id={undefined} screenOptions={stackOptions(c)}>
      {creationScreens(CreationStack, t)}
    </CreationStack.Navigator>
  );
}

function TabIcon({ emoji, focused, badge, testID }: { emoji: string; focused: boolean; badge?: number; testID: string }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 4 }} testID={testID} accessibilityLabel={testID}>
      <View>
        <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>
        {badge && badge > 0 ? (
          <View style={{ position: 'absolute', top: -4, right: -7, minWidth: 16, height: 16, paddingHorizontal: 2, borderRadius: 8, backgroundColor: '#e05252', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const hiddenTabOptions = { tabBarButton: () => null } as const;

export function AgentFirstTabNavigator() {
  const c = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const approvalCount = useNotificationStore((state) => state.approvalCount);
  const compact = width < 360 || fontScale > 1.2;
  const bottomInset = Math.max(insets.bottom, compact ? 6 : 8);
  const contentHeight = compact ? 50 : 54;
  return (
    <Tab.Navigator
      id={undefined}
      initialRouteName={AGENT_FIRST_DEFAULT_TAB}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarAllowFontScaling: false,
        tabBarStyle: {
          backgroundColor: c.bgCard,
          borderTopColor: c.border,
          borderTopWidth: 1,
          height: contentHeight + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: compact ? 2 : 4,
        },
        tabBarItemStyle: { flex: 1, minWidth: 0, paddingHorizontal: 0 },
        tabBarIconStyle: { marginTop: compact ? -1 : 0 },
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textMuted,
        tabBarLabelStyle: {
          fontSize: compact ? 10 : 11,
          fontWeight: '600',
          marginTop: compact ? 0 : 2,
          marginHorizontal: 0,
        },
      }}
    >
      <Tab.Screen name="Agent" component={AgentNavigator} options={{ title: 'Agent', tabBarButtonTestID: 'tab-agent', tabBarIcon: ({ focused }) => <TabIcon emoji="✦" focused={focused} testID="tab-agent" /> }} />
      <Tab.Screen name="Work" component={WorkNavigator} options={{ title: t({ en: 'Work', zh: '工作' }), tabBarButtonTestID: 'tab-work', tabBarIcon: ({ focused }) => <TabIcon emoji="✓" focused={focused} badge={approvalCount} testID="tab-work" /> }} />
      <Tab.Screen name="Economy" component={EconomyNavigator} options={{ title: t({ en: 'Economy', zh: '经济' }), tabBarButtonTestID: 'tab-economy', tabBarIcon: ({ focused }) => <TabIcon emoji="◈" focused={focused} testID="tab-economy" /> }} />
      <Tab.Screen name="My" component={MeStackNavigator} options={{ title: t({ en: 'My', zh: '我的' }), tabBarButtonTestID: 'tab-my', tabBarIcon: ({ focused }) => <TabIcon emoji="●" focused={focused} badge={unreadCount} testID="tab-my" /> }} />

      {/* Hidden legacy routes keep old in-app calls, Action/Creation deep links, and regulated surfaces rollback-safe. */}
      <Tab.Screen name="Actions" component={ActionsNavigator} options={hiddenTabOptions} />
      <Tab.Screen name="Creation" component={CreationNavigator} options={hiddenTabOptions} />
      <Tab.Screen name="World" component={WorldStackNavigator} options={hiddenTabOptions} />
      <Tab.Screen name="Summon" component={SummonStackNavigator} options={hiddenTabOptions} />
      <Tab.Screen name="Plaza" component={PlazaStackNavigator} options={hiddenTabOptions} />
      <Tab.Screen name="Me" component={MeStackNavigator} options={hiddenTabOptions} />
      <Tab.Screen name="Prediction" component={PredictionMarketScreen} options={hiddenTabOptions} />
      <Tab.Screen name="Lsm" component={LsmUnavailableScreen} options={hiddenTabOptions} />
    </Tab.Navigator>
  );
}
