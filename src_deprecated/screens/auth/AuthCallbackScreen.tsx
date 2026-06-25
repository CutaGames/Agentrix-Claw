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
          setStatus('success');
          setMessage('Authentication successful!');
          // RootNavigator will handle redirect to Main/Onboarding
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
