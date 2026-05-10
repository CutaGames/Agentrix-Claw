/**
 * SummonStackNavigator — 🔮 召唤 Tab (Sprint A).
 *
 * "召唤" = calling a pet Agent into a conversation. Per
 * MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 §2.4, this tab hosts the
 * full-screen multi-session chat. Sprint A reuses the existing
 * `AgentChatScreen` + `VoiceChatScreen` as-is; Sprint A5 will decompose
 * AgentChatScreen into smaller hooks/components, but the navigation
 * shell stays stable.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet as RNStyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { useI18n } from '../stores/i18nStore';
import { AgentChatScreen } from '../screens/agent/AgentChatScreen';
import { VoiceChatScreen } from '../screens/agent/VoiceChatScreen';
import type { SummonStackParamList } from './types';

// Lightweight error boundary kept identical to the existing one in
// AgentStackNavigator so voice-init crashes don't white-screen the app.
class ChatScreenErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false, error: undefined as Error | undefined };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[SummonChatErrorBoundary]', error.message, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={ebStyles.container}>
          <Text style={ebStyles.icon}>⚠️</Text>
          <Text style={ebStyles.title}>Chat failed to load</Text>
          <Text style={ebStyles.msg}>{this.state.error?.message ?? 'Unknown error'}</Text>
          <TouchableOpacity
            style={ebStyles.btn}
            onPress={() => this.setState({ hasError: false, error: undefined })}
          >
            <Text style={ebStyles.btnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
const ebStyles = RNStyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center', padding: 32 },
  icon: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 8 },
  msg: { fontSize: 13, color: '#999', textAlign: 'center', marginBottom: 16 },
  btn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});

function SummonChatRoot() {
  return (
    <ChatScreenErrorBoundary>
      <AgentChatScreen />
    </ChatScreenErrorBoundary>
  );
}

const Stack = createNativeStackNavigator<SummonStackParamList>();

export function SummonStackNavigator() {
  const { t } = useI18n();
  return (
    <Stack.Navigator
      id={undefined}
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgSecondary },
        headerTintColor: colors.textPrimary,
        contentStyle: { backgroundColor: colors.bgPrimary },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="SummonRoot"
        component={SummonChatRoot}
        options={{ title: t({ en: 'Summon', zh: '召唤' }), headerShown: false }}
      />
      <Stack.Screen
        name="VoiceChat"
        component={VoiceChatScreen}
        options={{ title: t({ en: 'Voice', zh: '语音' }), headerShown: false }}
      />
    </Stack.Navigator>
  );
}
