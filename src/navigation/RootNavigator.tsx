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
import { SoulBirthHost } from '../components/onboarding/SoulBirthHost';

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

  // 首启体验(2026-06 调整): 恢复经典登录页作为启动入口。
  //   决策回滚 — 拍照生成3D的 FirstScan 首启"wow"效果不及预期, 改回品牌登录页。
  // 未登录且非游客 → Auth(LoginScreen) 作为根入口(登录页内仍保留"免注册先逛逛"游客入口,
  //   以及"拍一下造角色"可跳 FirstScan, 不丢试用漏斗)。
  // 游客态(本地试用) → 直接进 Main(可扫描看角色卡, 保存时再引导登录)。
  // 已登录 → 进 Main(不再经过 InvitationGate / DeploySelect 强制 onboarding;
  //          部署选择已移到 设置→高级, 不挡新用户)。
  //
  // 2026-06 修复(生产真机 Bug):登录后卡在「Authentication successful!」(AuthCallbackScreen)。
  //   根因 —— `Auth` 这个 screen name 同时出现在「未登录」与「已登录/游客」两个分支。
  //   React Navigation 的 native-stack 在 routeNames 变化时执行 `getStateForRouteNamesChange`:
  //   只过滤掉「不再存在的 route」。由于 `Auth` 在切换后仍然存在(已登录分支仍注册了 Auth 模态,
  //   供游客在 Main 内登录用,见 WorldCharacterCard/CoRaisingLanding 等),当前聚焦的 `Auth`
  //   路由被原样保留 → 导航器不会自动切到 `Main`,于是停在 AuthCallbackScreen。
  //   setAuth 已正确置 isAuthenticated=true,但导航树没跟着切。
  //   修复 —— 给 Navigator 一个随「登录态边界」变化的 key:跨越 未登录↔已登录/游客 边界时
  //   整棵导航器重挂载,从 initialRoute(已登录分支首屏 = Main)干净进入,彻底绕开
  //   reconcile-保留-Auth 的坑。`Auth` 在两分支仍同名,所有 navigate('Auth') 调用点不受影响
  //   (游客在 Main 内仍可弹出 Auth 模态登录)。游客→正式登录(key 不变, 同为 'app-main')不
  //   重挂载, 不打断游客当前导航。
  const rootBranchKey = isAuthenticated || isGuest ? 'app-main' : 'app-auth';
  return (
    <>
      <Root.Navigator key={rootBranchKey} id={undefined} screenOptions={{ headerShown: false, animation: 'fade' }}>
        {!isAuthenticated && !isGuest ? (
          <>
            <Root.Screen name="Auth" component={AuthNavigator} />
            <Root.Screen
              name="FirstScan"
              component={FirstScanScreen}
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
          </>
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

      {/* Soul_Birth 首跑引导覆盖层(Design §2.2)。挂载在已登录(Main)分支之上,
          作为导航器旁的兄弟覆盖层(不替换路由树)。组件内部按 登录/游客/terminated
          自门控:未登录/游客/已终止时返回 null(C3/C9),故可在此无条件挂载。 */}
      <SoulBirthHost />
    </>
  );
}
