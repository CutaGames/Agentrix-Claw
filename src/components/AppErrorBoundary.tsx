import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface State {
  hasError: boolean;
  error?: Error;
  retryCount: number;
}

interface Props {
  children: React.ReactNode;
}

/**
 * Global error boundary — catches unhandled render errors that would otherwise
 * crash the app into an unrecoverable state.
 *
 * If the app enters a crash loop (persistent error on startup), the user can
 * press "Reset App State" to clear persisted auth/onboarding data and restart
 * the onboarding flow cleanly.
 *
 * Wave 17 v3 (2026-05-23) — auto-retry up to twice on first cold-launch
 * error. Many transient errors (e.g. "Couldn't get the navigation state"
 * during SplashScreen → RootNavigator hand-off, Reanimated worklet
 * timing issues) self-heal on the next render. Only show the manual
 * Reset UI after 3 consecutive failures.
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  private autoRetryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary] Unhandled render error:', error.message);
    console.error('[AppErrorBoundary] Component stack:', info.componentStack);

    // Auto-retry up to 2 times for transient cold-launch errors. Many
    // navigation / reanimated mount-order issues self-heal on the next
    // render. After 3 failures (initial + 2 retries) we surface the
    // manual Reset UI.
    if (this.state.retryCount < 2) {
      const delay = 200 * (this.state.retryCount + 1); // 200ms, 400ms
      this.autoRetryTimer = setTimeout(() => {
        this.setState((prev) => ({
          hasError: false,
          error: undefined,
          retryCount: prev.retryCount + 1,
        }));
      }, delay);
    }
  }

  componentWillUnmount() {
    if (this.autoRetryTimer) {
      clearTimeout(this.autoRetryTimer);
      this.autoRetryTimer = null;
    }
  }

  handleReset = async () => {
    try {
      // Clear all persisted state so the app can restart cleanly
      await AsyncStorage.multiRemove([
        'clawlink-auth-storage',
        'clawlink-settings',
        'clawlink-notifications',
      ]);
    } catch (e) {
      console.warn('Failed to clear storage on reset:', e);
    }
    this.setState({ hasError: false, error: undefined, retryCount: 0 });
  };

  render() {
    if (this.state.hasError) {
      // While auto-retrying, render an empty splash so the user doesn't
      // see the scary error UI for a flash of 200-400ms.
      if (this.state.retryCount < 2) {
        return <View style={[styles.container, { gap: 0 }]} />;
      }
      return (
        <View style={styles.container}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </Text>
          <TouchableOpacity style={styles.resetBtn} onPress={this.handleReset}>
            <Text style={styles.resetBtnText}>Reset App State</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>
            Resetting will clear saved session data and return to the setup screen.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  icon: { fontSize: 52, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center' },
  message: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  resetBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
    marginTop: 8,
  },
  resetBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  hint: { fontSize: 12, color: '#555', textAlign: 'center', marginTop: 8, lineHeight: 18 },
});
