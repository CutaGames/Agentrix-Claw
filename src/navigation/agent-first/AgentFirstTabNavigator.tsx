import React from 'react';
import { Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type {
  AgentFirstActionsStackParamList,
  AgentFirstAgentStackParamList,
  AgentFirstCreationStackParamList,
  AgentFirstTabParamList,
} from './types';
import {
  ActionTrackingScreen,
  ActionsHomeScreen,
  AgentHomeScreen,
  AgentSoulCoreRedirectScreen,
  AuthorityReviewScreen,
  CandidateCompareScreen,
  DestinationErrorScreen,
  GoalComposerScreen,
  HardwareAssuranceScreen,
  LsmUnavailableScreen,
} from '../../screens/agent-first/AgentEconomyScreens';
import { CreationHomeScreen } from '../../screens/agent-first/CreationHomeScreen';
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

const Tab = createBottomTabNavigator<AgentFirstTabParamList>();
const AgentStack = createNativeStackNavigator<AgentFirstAgentStackParamList>();
const ActionsStack = createNativeStackNavigator<AgentFirstActionsStackParamList>();
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
    <AgentStack.Navigator id={undefined} screenOptions={stackOptions(c)}>
      <AgentStack.Screen name="AgentHome" component={AgentHomeScreen} options={{ headerShown: false }} />
      <AgentStack.Screen name="GoalComposer" component={GoalComposerScreen} options={{ title: t({ en: 'New goal', zh: '新目标' }) }} />
      <AgentStack.Screen name="CandidateCompare" component={CandidateCompareScreen} options={{ title: t({ en: 'Candidates', zh: '候选' }) }} />
      <AgentStack.Screen name="AuthorityReview" component={AuthorityReviewScreen} options={{ title: t({ en: 'Authority', zh: '授权' }) }} />
      <AgentStack.Screen name="ActionTracking" component={ActionTrackingScreen} options={{ title: t({ en: 'Tracking', zh: '跟踪' }) }} />
      <AgentStack.Screen name="Companion" component={SummonStackNavigator} options={{ title: t({ en: 'Companion', zh: '伙伴' }), headerShown: false }} />
      <AgentStack.Screen name="Prediction" component={PredictionMarketScreen} options={{ title: t({ en: 'Prediction', zh: '预测' }), headerShown: false }} />
      <AgentStack.Screen name="Lsm" component={LsmUnavailableScreen} options={{ title: 'LSM' }} />
      <AgentStack.Screen name="HardwareAssurance" component={HardwareAssuranceScreen} options={{ title: t({ en: 'Soul Core', zh: 'Soul Core' }) }} />
      <AgentStack.Screen name="AgentSoulCore" component={AgentSoulCoreRedirectScreen} options={{ title: 'Soul Core' }} />
      <AgentStack.Screen name="DestinationError" component={DestinationErrorScreen} options={{ title: t({ en: 'Invalid link', zh: '链接无效' }) }} />
    </AgentStack.Navigator>
  );
}

function ActionsNavigator() {
  const c = useColors();
  const { t } = useI18n();
  return (
    <ActionsStack.Navigator id={undefined} screenOptions={stackOptions(c)}>
      <ActionsStack.Screen name="ActionsHome" component={ActionsHomeScreen} options={{ headerShown: false }} />
      <ActionsStack.Screen name="AuthorityReview" component={AuthorityReviewScreen} options={{ title: t({ en: 'Authority', zh: '授权' }) }} />
      <ActionsStack.Screen name="ActionTracking" component={ActionTrackingScreen} options={{ title: t({ en: 'Tracking', zh: '跟踪' }) }} />
    </ActionsStack.Navigator>
  );
}

function CreationNavigator() {
  const c = useColors();
  const { t } = useI18n();
  return (
    <CreationStack.Navigator id={undefined} screenOptions={stackOptions(c)}>
      <CreationStack.Screen name="CreationHome" component={CreationHomeScreen} options={{ headerShown: false }} />
      <CreationStack.Screen name="CreationFeed" component={CreationFeedScreen} options={{ headerShown: false }} />
      <CreationStack.Screen name="CreationCreator" component={CreationCreatorScreen as any} options={{ title: t({ en: 'Create', zh: '创作' }), headerShown: false }} />
      <CreationStack.Screen name="CreationExperience" component={CreationExperienceScreen as any} options={{ headerShown: false }} />
      <CreationStack.Screen name="CreationDetail" component={CreationDetailScreen as any} options={{ headerShown: false }} />
      <CreationStack.Screen name="MyWorld" component={MyWorldScreen} options={{ headerShown: false }} />
      <CreationStack.Screen name="UnifiedWorldMap" component={UnifiedWorldMapScreen} options={{ headerShown: false }} />
      <CreationStack.Screen name="WorldCreationMarketplace" component={WorldCreationMarketplaceScreen} options={{ headerShown: false }} />
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
  const badge = useNotificationStore((state) => state.unreadCount + state.approvalCount);
  return (
    <Tab.Navigator
      id={undefined}
      initialRouteName="Agent"
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: c.bgCard, borderTopColor: c.border, borderTopWidth: 1, height: 64, paddingBottom: 10, paddingTop: 4 },
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
      }}
    >
      <Tab.Screen name="Agent" component={AgentNavigator} options={{ title: 'Agent', tabBarButtonTestID: 'tab-agent', tabBarIcon: ({ focused }) => <TabIcon emoji="✦" focused={focused} testID="tab-agent" /> }} />
      <Tab.Screen name="Actions" component={ActionsNavigator} options={{ title: t({ en: 'Actions', zh: '行动' }), tabBarButtonTestID: 'tab-actions', tabBarIcon: ({ focused }) => <TabIcon emoji="✓" focused={focused} testID="tab-actions" /> }} />
      <Tab.Screen name="Creation" component={CreationNavigator} options={{ title: t({ en: 'Creation', zh: '创作' }), tabBarButtonTestID: 'tab-creation', tabBarIcon: ({ focused }) => <TabIcon emoji="✨" focused={focused} testID="tab-creation" /> }} />
      <Tab.Screen name="My" component={MeStackNavigator} options={{ title: t({ en: 'My', zh: '我的' }), tabBarButtonTestID: 'tab-my', tabBarIcon: ({ focused }) => <TabIcon emoji="●" focused={focused} badge={badge} testID="tab-my" /> }} />

      {/* Hidden legacy routes keep old in-app calls and Companion shell destinations valid during rollback. */}
      <Tab.Screen name="World" component={WorldStackNavigator} options={hiddenTabOptions} />
      <Tab.Screen name="Summon" component={SummonStackNavigator} options={hiddenTabOptions} />
      <Tab.Screen name="Plaza" component={PlazaStackNavigator} options={hiddenTabOptions} />
      <Tab.Screen name="Me" component={MeStackNavigator} options={hiddenTabOptions} />
    </Tab.Navigator>
  );
}
