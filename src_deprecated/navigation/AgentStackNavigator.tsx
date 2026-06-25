import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AgentStackParamList } from './types';
import { colors } from '../theme/colors';
import { AgentConsoleScreen } from '../screens/agent/AgentConsoleScreen';
import { AgentChatScreen } from '../screens/agent/AgentChatScreen';
import { OpenClawBindScreen } from '../screens/agent/OpenClawBindScreen';
import { SkillInstallScreen } from '../screens/agent/SkillInstallScreen';
import { StoragePlanScreen } from '../screens/agent/StoragePlanScreen';
import { AgentLogsScreen } from '../screens/agent/AgentLogsScreen';
import { MemoryManagementScreen } from '../screens/agent/MemoryManagementScreen';
import { WorkflowListScreen } from '../screens/agent/WorkflowListScreen';
import { WorkflowDetailScreen } from '../screens/agent/WorkflowDetailScreen';
import { VoiceChatScreen } from '../screens/agent/VoiceChatScreen';
import { TeamSpaceScreen } from '../screens/agent/TeamSpaceScreen';
import { TeamInviteScreen } from '../screens/agent/TeamInviteScreen';
import { AgentAccountScreen } from '../screens/agent/AgentAccountScreen';
// Deploy screens — reused from Onboarding in post-onboarding context
import { DeploySelectScreen } from '../screens/onboarding/DeploySelectScreen';
import { CloudDeployScreen } from '../screens/onboarding/CloudDeployScreen';
import { ConnectExistingScreen } from '../screens/onboarding/ConnectExistingScreen';
import { LocalDeployScreen } from '../screens/onboarding/LocalDeployScreen';
import { SocialBindScreen } from '../screens/onboarding/SocialBindScreen';

const Stack = createNativeStackNavigator<AgentStackParamList>();

export function AgentStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgSecondary },
        headerTintColor: colors.textPrimary,
        contentStyle: { backgroundColor: colors.bgPrimary },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="AgentConsole" component={AgentConsoleScreen} options={{ title: 'My Agent' }} />
      <Stack.Screen name="AgentChat" component={AgentChatScreen} options={{ title: 'Chat' }} />
      <Stack.Screen name="OpenClawBind" component={OpenClawBindScreen} options={{ title: 'Connect OpenClaw' }} />
      <Stack.Screen name="SkillInstall" component={SkillInstallScreen} options={{ title: 'Install Skill' }} />
      <Stack.Screen name="StoragePlan" component={StoragePlanScreen} options={{ title: 'Storage Plans' }} />
      <Stack.Screen name="AgentLogs" component={AgentLogsScreen} options={{ title: 'Activity Logs' }} />
      <Stack.Screen name="MemoryManagement" component={MemoryManagementScreen} options={{ title: 'Memory Hub' }} />
      <Stack.Screen name="WorkflowList" component={WorkflowListScreen} options={{ title: 'Workflows' }} />
      <Stack.Screen name="WorkflowDetail" component={WorkflowDetailScreen} options={{ title: 'Workflow' }} />
      {/* Deploy screens — accessible post-onboarding */}
      <Stack.Screen name="DeploySelect" component={DeploySelectScreen} options={{ title: 'Connect Agent', headerShown: false }} />
      <Stack.Screen name="CloudDeploy" component={CloudDeployScreen} options={{ title: 'Cloud Deploy', headerShown: false }} />
      <Stack.Screen name="ConnectExisting" component={ConnectExistingScreen} options={{ title: 'Connect Existing', headerShown: false }} />
      <Stack.Screen name="LocalDeploy" component={LocalDeployScreen} options={{ title: 'Local Deploy', headerShown: false }} />
      <Stack.Screen name="SocialBind" component={SocialBindScreen} options={{ title: 'Link Social', headerShown: false }} />
      {/* Layer 2 */}
      <Stack.Screen name="VoiceChat" component={VoiceChatScreen} options={{ title: 'Voice Chat', headerShown: false }} />
      <Stack.Screen name="TeamSpace" component={TeamSpaceScreen} options={{ title: 'Team Spaces', headerShown: false }} />
      <Stack.Screen name="TeamInvite" component={TeamInviteScreen} options={{ title: 'Invite Members', headerShown: false }} />
      <Stack.Screen name="AgentAccount" component={AgentAccountScreen} options={{ title: 'Agent Accounts' }} />
    </Stack.Navigator>
  );
}
