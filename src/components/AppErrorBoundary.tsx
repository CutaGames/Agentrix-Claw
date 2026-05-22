import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface State {
  hasError: boolean;
  error?: Error;
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
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary] Unhandled render error:', error.message);
    console.error('[AppErrorBoundary] Component stack:', info.componentStack);
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
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
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
