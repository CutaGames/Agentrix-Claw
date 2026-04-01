import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet as RNStyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AgentStackParamList } from './types';
import { colors } from '../theme/colors';
import { AgentConsoleScreen } from '../screens/agent/AgentConsoleScreen';
import { AgentChatScreen } from '../screens/agent/AgentChatScreen';

/** Lightweight error boundary for the chat screen so voice-init crashes don't white-screen the app. */
class ChatScreenErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false, error: undefined as Error | undefined };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ChatScreenErrorBoundary]', error.message, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={ebStyles.container}>
          <Text style={ebStyles.icon}>⚠️</Text>
          <Text style={ebStyles.title}>Chat failed to load</Text>
          <Text style={ebStyles.msg}>{this.state.error?.message ?? 'Unknown error'}</Text>
          <TouchableOpacity style={ebStyles.btn} onPress={() => this.setState({ hasError: false, error: undefined })}>
            <Text style={ebStyles.btnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
const ebStyles = RNStyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center', padding: 32 },
  icon: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 8 },
  msg: { fontSize: 13, color: '#999', textAlign: 'center', marginBottom: 16 },
  btn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});

function AgentChatScreenWithBoundary() {
  return (
    <ChatScreenErrorBoundary>
      <AgentChatScreen />
    </ChatScreenErrorBoundary>
  );
}
import { OpenClawBindScreen } from '../screens/agent/OpenClawBindScreen';
import { LocalConnectScreen } from '../screens/agent/LocalConnectScreen';
import { SkillInstallScreen } from '../screens/agent/SkillInstallScreen';
import { SkillPackScreen } from '../screens/agent/SkillPackScreen';
import { StoragePlanScreen } from '../screens/agent/StoragePlanScreen';
import { AgentLogsScreen } from '../screens/agent/AgentLogsScreen';
import { DesktopControlScreen } from '../screens/agent/DesktopControlScreen';
import { MemoryManagementScreen } from '../screens/agent/MemoryManagementScreen';
import { WorkflowListScreen } from '../screens/agent/WorkflowListScreen';
import { WorkflowDetailScreen } from '../screens/agent/WorkflowDetailScreen';
import { VoiceChatScreen } from '../screens/agent/VoiceChatScreen';
import { TeamSpaceScreen } from '../screens/agent/TeamSpaceScreen';
import { TeamInviteScreen } from '../screens/agent/TeamInviteScreen';
import { AgentAccountScreen } from '../screens/agent/AgentAccountScreen';
import { AgentBalanceScreen } from '../screens/agent/AgentBalanceScreen';
import { AgentPermissionsScreen } from '../screens/agent/AgentPermissionsScreen';
import { AgentToolsScreen } from '../screens/agent/AgentToolsScreen';
import { WearableHubScreen } from '../screens/agent/WearableHubScreen';
import { WearableMonitorScreen } from '../screens/agent/WearableMonitorScreen';
import { AgentSpaceScreen } from '../screens/agent/AgentSpaceScreen';
import { ScanScreen } from '../screens/me/ScanScreen';
// Deploy screens — reused from Onboarding in post-onboarding context
import { DeploySelectScreen } from '../screens/onboarding/DeploySelectScreen';
import { CloudDeployScreen } from '../screens/onboarding/CloudDeployScreen';
import { ConnectExistingScreen } from '../screens/onboarding/ConnectExistingScreen';
import { LocalDeployScreen } from '../screens/onboarding/LocalDeployScreen';
import { SocialBindScreen } from '../screens/onboarding/SocialBindScreen';
import { useI18n } from '../stores/i18nStore';
import { isVoiceUiE2EEnabled } from '../testing/e2e';

const Stack = createNativeStackNavigator<AgentStackParamList>();

export function AgentStackNavigator() {
  const { t } = useI18n();
  const initialRouteName = 'AgentChat';

  return (
    <Stack.Navigator id={undefined}
      initialRouteName={initialRouteName}
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgSecondary },
        headerTintColor: colors.textPrimary,
        contentStyle: { backgroundColor: colors.bgPrimary },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="AgentChat" component={AgentChatScreenWithBoundary} options={{ title: t({ en: 'Chat', zh: '对话' }), headerShown: false }} />
      <Stack.Screen name="AgentConsole" component={AgentConsoleScreen} options={{ title: t({ en: 'Agent Settings', zh: '智能体管理' }) }} />
      <Stack.Screen name="WearableHub" component={WearableHubScreen} options={{ title: t({ en: 'Wearable Devices', zh: '可穿戴设备' }) }} />
      <Stack.Screen name="WearableMonitor" component={WearableMonitorScreen} options={{ title: t({ en: 'Wearable Monitor', zh: '穿戴设备监控' }) }} />
      <Stack.Screen name="OpenClawBind" component={OpenClawBindScreen} options={{ title: t({ en: 'Connect OpenClaw', zh: '连接 OpenClaw' }) }} />
      <Stack.Screen name="LocalConnect" component={LocalConnectScreen} options={{ title: t({ en: 'Link Local Agent', zh: '关联本地智能体' }) }} />
      <Stack.Screen name="Scan" component={ScanScreen} options={{ title: t({ en: 'Scan QR', zh: '扫一扫' }) }} />
      <Stack.Screen name="SkillInstall" component={SkillInstallScreen} options={{ title: t({ en: 'Install Skill', zh: '安装技能' }) }} />
      <Stack.Screen name="SkillPack" component={SkillPackScreen} options={{ title: t({ en: 'Skill Pack', zh: '技能快充' }), headerShown: false }} />
      <Stack.Screen name="StoragePlan" component={StoragePlanScreen} options={{ title: t({ en: 'Storage Plans', zh: '存储方案' }) }} />
      <Stack.Screen name="AgentLogs" component={AgentLogsScreen} options={{ title: t({ en: 'Activity Logs', zh: '活动日志' }) }} />
      <Stack.Screen name="DesktopControl" component={DesktopControlScreen} options={{ title: t({ en: 'Desktop Control', zh: '桌面控制' }) }} />
      <Stack.Screen name="MemoryManagement" component={MemoryManagementScreen} options={{ title: t({ en: 'Memory Hub', zh: '记忆中心' }) }} />
      <Stack.Screen name="WorkflowList" component={WorkflowListScreen} options={{ title: t({ en: 'Workflows', zh: '工作流' }) }} />
      <Stack.Screen name="WorkflowDetail" component={WorkflowDetailScreen} options={{ title: t({ en: 'Workflow', zh: '工作流' }) }} />
      {/* Deploy screens — accessible post-onboarding */}
      <Stack.Screen name="DeploySelect" component={DeploySelectScreen} options={{ title: t({ en: 'Connect Agent', zh: '连接智能体' }), headerShown: false }} />
      <Stack.Screen name="CloudDeploy" component={CloudDeployScreen} options={{ title: t({ en: 'Cloud Deploy', zh: '云端部署' }), headerShown: false }} />
      <Stack.Screen name="ConnectExisting" component={ConnectExistingScreen} options={{ title: t({ en: 'Connect Existing', zh: '连接已有实例' }), headerShown: false }} />
      <Stack.Screen name="LocalDeploy" component={LocalDeployScreen} options={{ title: t({ en: 'Local Deploy', zh: '本地部署' }), headerShown: false }} />
      <Stack.Screen name="SocialBind" component={SocialBindScreen} options={{ title: t({ en: 'Link Social', zh: '绑定社交平台' }), headerShown: false }} />
      {/* Layer 2 */}
      <Stack.Screen name="VoiceChat" component={VoiceChatScreen} options={{ title: t({ en: 'Voice Chat', zh: '语音对话' }), headerShown: false }} />
      <Stack.Screen name="TeamSpace" component={TeamSpaceScreen} options={{ title: t({ en: 'Team Spaces', zh: '团队空间' }), headerShown: false }} />
      <Stack.Screen name="TeamInvite" component={TeamInviteScreen} options={{ title: t({ en: 'Invite Members', zh: '邀请成员' }), headerShown: false }} />
      <Stack.Screen name="AgentAccount" component={AgentAccountScreen} options={{ title: t({ en: 'Agent Accounts', zh: '智能体账户' }) }} />
      <Stack.Screen name="AgentBalance" component={AgentBalanceScreen} options={{ title: t({ en: 'Balance & Transactions', zh: '余额与交易' }) }} />
      <Stack.Screen name="AgentPermissions" component={AgentPermissionsScreen} options={{ title: t({ en: 'Permissions & Security', zh: '权限与安全' }) }} />
      <Stack.Screen name="AgentTools" component={AgentToolsScreen} options={{ title: t({ en: 'Agent Tools', zh: '系统工具' }) }} />
      <Stack.Screen name="AgentSpace" component={AgentSpaceScreen} options={{ title: t({ en: 'Agent Space', zh: 'Agent 协作空间' }) }} />
    </Stack.Navigator>
  );
}
