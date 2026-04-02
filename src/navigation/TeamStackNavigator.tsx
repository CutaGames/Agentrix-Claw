import React from 'react';
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
        component={AgentAccountScreen}
        options={{ title: t({ en: 'Agent Accounts', zh: '智能体账户' }) }}
      />
      <Stack.Screen
        name="TaskBoard"
        component={TaskBoardScreen}
        options={{ title: t({ en: 'Task Board', zh: '任务看板' }) }}
      />
      <Stack.Screen
        name="TaskDetail"
        component={TaskDetailScreen}
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
