import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../stores/authStore';
import { AuthStackParamList, OnboardingStackParamList, RootStackParamList } from './types';
import { MainTabNavigator } from './MainTabNavigator';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { AuthCallbackScreen } from '../screens/auth/AuthCallbackScreen';
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
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="AuthCallback" component={AuthCallbackScreen} />
    </AuthStack.Navigator>
  );
}

function OnboardingNavigator() {
  return (
    <OnboardingStack.Navigator screenOptions={{ headerShown: false }}>
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

  return (
    <Root.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      {!isAuthenticated ? (
        <Root.Screen name="Auth" component={AuthNavigator} />
      ) : !hasCompletedOnboarding ? (
        <Root.Screen name="Onboarding" component={OnboardingNavigator} />
      ) : (
        <Root.Screen name="Main" component={MainTabNavigator} />
      )}
    </Root.Navigator>
  );
}
