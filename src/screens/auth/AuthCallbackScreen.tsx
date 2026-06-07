import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { handleOAuthCallback } from '../../services/auth';
import { navRefReset } from '../../navigation/navigationRef';
import type { AuthStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'AuthCallback'>;
type RouteT = RouteProp<AuthStackParamList, 'AuthCallback'>;

/**
 * 成功落地后自动进入 Main 的时延:留一拍给用户看到"已认证"的反馈,再无条件前进。
 * 关键:这一步保证 AuthCallbackScreen **永不**成为死胡同(2026-06 真机 Bug)。
 */
const PROCEED_TO_MAIN_DELAY_MS = 700;

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
          // 没有任何凭据:若用户其实已登录(例如已认证后又被一条游离的 deep link 带回此屏),
          // 绝不能停在此屏,也不该退回 Login——直接前进到 Main(下方 success effect 兜底)。
          if (useAuthStore.getState().isAuthenticated) {
            setStatus('success');
            setMessage('Authentication successful!');
            return;
          }
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
          // success effect 会无条件前进到 Main(见下方 useEffect)。
        } else {
          throw new Error('Invalid response from server');
        }
      } catch (err: any) {
        // 即便回调处理失败,只要此前已认证(token 已落地),仍前进到 Main 而非卡在此屏。
        if (useAuthStore.getState().isAuthenticated) {
          setStatus('success');
          setMessage('Authentication successful!');
          return;
        }
        setStatus('error');
        setMessage(err?.message || 'Authentication failed. Please try again.');
        setTimeout(() => navigation.navigate('Login'), 2500);
      }
    };

    processCallback();
  }, []);

  // 成功(或确认已认证)后无条件前进到 Main —— 此屏永不成为死胡同。
  //
  // 2026-06 真机 Bug 根因:登录 OAuth 的回跳 deep link 是 `agentrix://auth/callback`,
  // 会被路由到本屏。正常路径下 `openAuthSessionAsync` 会内联拦截、根本不展示本屏;但当
  // 回跳以"真实 deep link"形式到达、且用户**已经认证**(已处于 Main 分支,Auth 仅作模态
  // 注册)时,RootNavigator 的 `key`(随登录态边界变化)不会改变 → 不会自动切到 Main,
  // 本屏就停在「Authentication successful!」成为死胡同。修复:这里通过共享 navigationRef
  // 主动 reset 到 Main(跨 Auth 栈 → 根 Main 边界),无论从登录还是任何 OAuth 回调进入都前进。
  useEffect(() => {
    if (status !== 'success') return;
    const timer = setTimeout(() => {
      navRefReset('Main');
    }, PROCEED_TO_MAIN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status]);

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
