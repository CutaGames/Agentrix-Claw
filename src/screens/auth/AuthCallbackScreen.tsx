import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { handleOAuthCallback } from '../../services/auth';
import type { AuthStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'AuthCallback'>;
type RouteT = RouteProp<AuthStackParamList, 'AuthCallback'>;

export function AuthCallbackScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteT>();
  const { setAuth } = useAuthStore.getState();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing authentication...');

  useEffect(() => {
    const processCallback = async () => {
      try {
        // Get params from deep link or route
        const url = await Linking.getInitialURL();
        const params = route.params;
        const token = params?.token || (url ? extractParam(url, 'token') : null);
        const code = params?.code || (url ? extractParam(url, 'code') : null);
        const provider = params?.provider || (url ? extractParam(url, 'provider') : null);

        if (!token && !code) {
          setStatus('error');
          setMessage('No authentication token received. Please try again.');
          setTimeout(() => navigation.navigate('Login'), 2500);
          return;
        }

        const result = await handleOAuthCallback({ token, code, provider });
        if (result?.user && result?.token) {
          await setAuth(result.user, result.token);

          // handleOAuthCallback calls fetchCurrentUserWithToken which now
          // returns openClawInstances from /auth/me. But the returned user
          // needs to be set properly. Re-fetch to ensure instances are loaded.
          try {
            const { fetchCurrentUser } = await import('../../services/auth');
            const fullUser = await fetchCurrentUser();
            if (fullUser) {
              const state = useAuthStore.getState();
              if (state.token) {
                await state.setAuth(fullUser, state.token);
                if (!state.activeInstance && fullUser.openClawInstances?.length) {
                  useAuthStore.setState({ activeInstance: fullUser.openClawInstances[0] });
                }
              }
            }
          } catch { /* non-blocking */ }

          setStatus('success');
          setMessage('Authentication successful!');
          // 2026-05-29 fix: Auth 现在是挂在 Main 之上的 modal(首启游客流程改造后)。
          // setAuth 把 isAuthenticated=true / isGuest=false, 但 RootNavigator 已在
          // 渲染 Main 分支(游客态也渲染 Main), 分支不变 → Auth modal 不会自动消失,
          // 用户卡在"Authentication successful"。这里主动关闭 Auth modal 回到 Main。
          setTimeout(() => {
            try {
              const parent = navigation.getParent?.();
              if (parent?.canGoBack?.()) {
                parent.goBack();
              } else if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                (navigation as any).navigate('Main');
              }
            } catch {
              try { (navigation as any).navigate('Main'); } catch { /* noop */ }
            }
          }, 600);
        } else {
          throw new Error('Invalid response from server');
        }
      } catch (err: any) {
        setStatus('error');
        setMessage(err?.message || 'Authentication failed. Please try again.');
        setTimeout(() => navigation.navigate('Login'), 2500);
      }
    };

    processCallback();
  }, []);

  return (
    <View style={styles.container}>
      {status === 'loading' && <ActivityIndicator size="large" color={colors.accent} />}
      {status === 'success' && <Text style={styles.successIcon}>✅</Text>}
      {status === 'error' && <Text style={styles.errorIcon}>❌</Text>}
      <Text style={[styles.message, status === 'error' && { color: colors.error }]}>{message}</Text>
    </View>
  );
}

function extractParam(url: string, key: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get(key);
  } catch {
    const match = url.match(new RegExp(`[?&]${key}=([^&]+)`));
    return match ? decodeURIComponent(match[1]) : null;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center', gap: 16 },
  message: { fontSize: 16, color: colors.textPrimary, textAlign: 'center', paddingHorizontal: 32 },
  successIcon: { fontSize: 48 },
  errorIcon: { fontSize: 48 },
});
