/**
 * RootNavigator — Sprint A refactor.
 *
 * Changes from previous version:
 *   - Drawer废除: 4 底部 Tab 完全承载导航，不再需要左滑抽屉 (§2.2 §7.7)
 *   - Inbox (全局 🔔 铃铛): 审批 + Handoff + 通知统一入口 (§2.3 / §2.5 顶栏)
 *   - Scan  (全局 📷 扫码): 取代原来 Me/Agent/Drawer 三处 Scan 挂载
 *
 * The legacy `DrawerNavigator` file is kept on disk but no longer wired
 * here; it will be removed in Sprint D.
 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../stores/authStore';
import { AuthStackParamList, OnboardingStackParamList, RootStackParamList } from './types';
import { MainTabNavigator } from './MainTabNavigator';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { AuthCallbackScreen } from '../screens/auth/AuthCallbackScreen';
import { InvitationGateScreen } from '../screens/auth/InvitationGateScreen';
import { WalletConnectScreen } from '../screens/WalletConnectScreen';
import { DeploySelectScreen } from '../screens/onboarding/DeploySelectScreen';
import { CloudDeployScreen } from '../screens/onboarding/CloudDeployScreen';
import { ConnectExistingScreen } from '../screens/onboarding/ConnectExistingScreen';
import { LocalDeployScreen } from '../screens/onboarding/LocalDeployScreen';
import { SocialBindScreen } from '../screens/onboarding/SocialBindScreen';
import { InboxScreen } from '../screens/inbox/InboxScreen';
import { GlobalScanScreen } from '../screens/scan/GlobalScanScreen';

const Root = createNativeStackNavigator<RootStackParamList & { Inbox: undefined; Scan: undefined }>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const OnboardingStack = createNativeStackNavigator<OnboardingStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator id={undefined} screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="AuthCallback" component={AuthCallbackScreen} />
      <AuthStack.Screen name="WalletConnect" component={WalletConnectScreen} />
    </AuthStack.Navigator>
  );
}

function OnboardingNavigator() {
  return (
    <OnboardingStack.Navigator id={undefined} screenOptions={{ headerShown: false }}>
      <OnboardingStack.Screen name="DeploySelect" component={DeploySelectScreen} />
      <OnboardingStack.Screen name="CloudDeploy" component={CloudDeployScreen} />
      <OnboardingStack.Screen name="ConnectExisting" component={ConnectExistingScreen} />
      <OnboardingStack.Screen name="LocalDeploy" component={LocalDeployScreen} />
      <OnboardingStack.Screen name="SocialBind" component={SocialBindScreen} />
    </OnboardingStack.Navigator>
  );
}

export function RootNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasCompletedOnboarding = useAuthStore((s) => s.hasCompletedOnboarding);
  const hasValidInvitation = useAuthStore((s) => s.hasValidInvitation);

  return (
    <Root.Navigator id={undefined} screenOptions={{ headerShown: false, animation: 'fade' }}>
      {!isAuthenticated ? (
        <Root.Screen name="Auth" component={AuthNavigator} />
      ) : !hasValidInvitation ? (
        <Root.Screen name="InvitationGate" component={InvitationGateScreen} />
      ) : !hasCompletedOnboarding ? (
        <Root.Screen name="Onboarding" component={OnboardingNavigator} />
      ) : (
        <>
          <Root.Screen name="Main" component={MainTabNavigator} />
          <Root.Screen
            name="Inbox"
            component={InboxScreen}
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Root.Screen
            name="Scan"
            component={GlobalScanScreen}
            options={{ presentation: 'modal' }}
          />
        </>
      )}
    </Root.Navigator>
  );
}
