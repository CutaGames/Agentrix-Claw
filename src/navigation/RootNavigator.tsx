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
import { AuthStackParamList, RootStackParamList } from './types';
import { MainTabNavigator } from './MainTabNavigator';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { AuthCallbackScreen } from '../screens/auth/AuthCallbackScreen';
import { WalletConnectScreen } from '../screens/WalletConnectScreen';
import { FirstScanScreen } from '../screens/onboarding/FirstScanScreen';
import { InboxScreen } from '../screens/inbox/InboxScreen';
import { GlobalScanScreen } from '../screens/scan/GlobalScanScreen';

const Root = createNativeStackNavigator<RootStackParamList & { Inbox: undefined; Scan: undefined; FirstScan: undefined; Auth: undefined }>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator id={undefined} screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="AuthCallback" component={AuthCallbackScreen} />
      <AuthStack.Screen name="WalletConnect" component={WalletConnectScreen} />
    </AuthStack.Navigator>
  );
}

export function RootNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isGuest = useAuthStore((s) => s.isGuest);
  const hasCompletedOnboarding = useAuthStore((s) => s.hasCompletedOnboarding);

  // 首启体验(2026-05): 邀请码墙已移除(决策: 暂不保留邀请制)。
  // 未登录且非游客 → FirstScan 落地页(可一键试用首扫 or 登录)。
  // 游客态(本地试用) → 直接进 Main(可扫描看角色卡, 保存时再引导登录)。
  // 已登录 → 进 Main(不再经过 InvitationGate / DeploySelect 强制 onboarding;
  //          部署选择已移到 设置→高级, 不挡新用户)。
  return (
    <Root.Navigator id={undefined} screenOptions={{ headerShown: false, animation: 'fade' }}>
      {!isAuthenticated && !isGuest ? (
        <Root.Screen name="FirstScan" component={FirstScanScreen} />
      ) : (
        <>
          <Root.Screen name="Main" component={MainTabNavigator} />
          <Root.Screen
            name="Auth"
            component={AuthNavigator}
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
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
