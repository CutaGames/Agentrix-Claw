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
import { LlmBudgetBar } from '../components/summon/LlmBudgetBar';
import type { SummonStackParamList } from './types';
import { useThemedStyles, type Palette } from '../theme/useTheme';

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
      return <ChatFailedView onRetry={() => this.setState({ hasError: false, error: undefined })} />;
    }
    return this.props.children;
  }
}

/**
 * What 伙伴 shows when the chat screen crashed (I-066): theme colours (the old white title disappeared on the
 * light theme), both languages, and no raw error text on screen (I-056); the error itself goes to the log.
 */
function ChatFailedView({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeChatFailedStyles);
  return (
    <View style={styles.container} testID="summon-chat-failed">
      <Text style={styles.icon} accessibilityElementsHidden importantForAccessibility="no">
        ⚠️
      </Text>
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: 'The chat did not load', zh: '对话没有加载出来' })}
      </Text>
      <Text style={styles.msg}>
        {t({ en: 'Try again. If it keeps happening, close and reopen the app.', zh: '可以再试一次；一直这样的话，关掉 App 再打开。' })}
      </Text>
      <TouchableOpacity style={styles.btn} onPress={onRetry} accessibilityRole="button" testID="summon-chat-retry">
        <Text style={styles.btnText}>{t({ en: 'Try again', zh: '再试一次' })}</Text>
      </TouchableOpacity>
    </View>
  );
}
const makeChatFailedStyles = (c: Palette) =>
  RNStyleSheet.create({
    container: { flex: 1, backgroundColor: c.bgPrimary, alignItems: 'center', justifyContent: 'center', padding: 32 },
    icon: { fontSize: 48, marginBottom: 12 },
    title: { fontSize: 18, fontWeight: '700', color: c.textPrimary, marginBottom: 8, textAlign: 'center' },
    msg: { fontSize: 14, color: c.textSecondary, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
    // Token pair: text on the accent fill is onAccent (11.4).
    btn: { backgroundColor: c.accent, borderRadius: 10, paddingHorizontal: 24, minHeight: 44, justifyContent: 'center' },
    btnText: { color: c.onAccent, fontWeight: '700', fontSize: 14 },
  });

function SummonChatRoot() {
  return (
    <View style={{ flex: 1 }}>
      <ChatScreenErrorBoundary>
        <AgentChatScreen />
        <LlmBudgetBar />
      </ChatScreenErrorBoundary>
    </View>
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
