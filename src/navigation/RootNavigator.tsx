import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../stores/authStore';
import { AuthStackParamList, OnboardingStackParamList, RootStackParamList } from './types';
import { DrawerNavigator } from './DrawerNavigator';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { AuthCallbackScreen } from '../screens/auth/AuthCallbackScreen';
import { InvitationGateScreen } from '../screens/auth/InvitationGateScreen';
import { WalletConnectScreen } from '../screens/WalletConnectScreen';
import { DeploySelectScreen } from '../screens/onboarding/DeploySelectScreen';
import { CloudDeployScreen } from '../screens/onboarding/CloudDeployScreen';
import { ConnectExistingScreen } from '../screens/onboarding/ConnectExistingScreen';
import { LocalDeployScreen } from '../screens/onboarding/LocalDeployScreen';
import { SocialBindScreen } from '../screens/onboarding/SocialBindScreen';

const Root = createNativeStackNavigator<RootStackParamList>();
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

function MainWithFloatingBall() {
  // User requirement: NO in-app floating ball. The floating ball should
  // only appear on the Android system desktop (via the foreground
  // overlay service), not over the app UI. We used to wrap the
  // navigator with <GlobalFloatingBall/>, which produced the overlay
  // that the user saw inside the conversation screens — remove it.
  return <DrawerNavigator />;
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
        <Root.Screen name="Main" component={MainWithFloatingBall} />
      )}
    </Root.Navigator>
  );
}
