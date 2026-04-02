import React from 'react';
import { View, Text } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TeamStackParamList } from './types';
import { colors } from '../theme/colors';
import { TeamDashboardScreen } from '../screens/team/TeamDashboardScreen';
import { TeamApprovalDetailScreen } from '../screens/team/TeamDashboardScreen';
import { TeamSpaceScreen } from '../screens/agent/TeamSpaceScreen';
import { TeamInviteScreen } from '../screens/agent/TeamInviteScreen';
import { AgentAccountScreen } from '../screens/agent/AgentAccountScreen';
import { TaskBoardScreen } from '../screens/team/TaskBoardScreen';
import { TaskDetailScreen } from '../screens/team/TaskDetailScreen';
import { AgentProfileScreen } from '../screens/team/AgentProfileScreen';
import { useI18n } from '../stores/i18nStore';

// ErrorBoundary for screens that may crash
class ScreenErrorBoundary extends React.Component<{ children: React.ReactNode; screenName: string }, { hasError: boolean; error?: Error }> {
  constructor(props: any) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ScreenErrorBoundary:${this.props.screenName}]`, error.message, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontSize: 40, marginBottom: 16 }}>⚠️</Text>
          <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Screen Error</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>{this.state.error?.message || 'Unknown error'}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 12 }} onPress={() => this.setState({ hasError: false, error: undefined })}>
            Tap here to retry
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function SafeAgentAccountScreen(props: any) {
  return <ScreenErrorBoundary screenName="AgentAccountScreen"><AgentAccountScreen {...props} /></ScreenErrorBoundary>;
}
function SafeTaskDetailScreen(props: any) {
  return <ScreenErrorBoundary screenName="TaskDetailScreen"><TaskDetailScreen {...props} /></ScreenErrorBoundary>;
}

const Stack = createNativeStackNavigator<TeamStackParamList>();

export function TeamStackNavigator() {
  const { t } = useI18n();

  return (
    <Stack.Navigator
      id={undefined}
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgSecondary },
        headerTintColor: colors.textPrimary,
        contentStyle: { backgroundColor: colors.bgPrimary },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="TeamDashboard"
        component={TeamDashboardScreen}
        options={{ title: t({ en: 'Team', zh: '团队' }), headerShown: false }}
      />
      <Stack.Screen
        name="TeamApprovalDetail"
        component={TeamApprovalDetailScreen}
        options={{ title: t({ en: 'Approval Detail', zh: '审批详情' }) }}
      />
      <Stack.Screen
        name="TeamSpace"
        component={TeamSpaceScreen}
        options={{ title: t({ en: 'Team Spaces', zh: '团队空间' }), headerShown: false }}
      />
      <Stack.Screen
        name="TeamInvite"
        component={TeamInviteScreen}
        options={{ title: t({ en: 'Invite Members', zh: '邀请成员' }), headerShown: false }}
      />
      <Stack.Screen
        name="TeamAgentAccounts"
        component={SafeAgentAccountScreen}
        options={{ title: t({ en: 'Agent Accounts', zh: '智能体账户' }) }}
      />
      <Stack.Screen
        name="TaskBoard"
        component={TaskBoardScreen}
        options={{ title: t({ en: 'Task Board', zh: '任务看板' }) }}
      />
      <Stack.Screen
        name="TaskDetail"
        component={SafeTaskDetailScreen}
        options={{ title: t({ en: 'Task Detail', zh: '任务详情' }) }}
      />
      <Stack.Screen
        name="AgentProfile"
        component={AgentProfileScreen}
        options={{ title: t({ en: 'Agent Profile', zh: 'Agent 详情' }) }}
      />
    </Stack.Navigator>
  );
}
