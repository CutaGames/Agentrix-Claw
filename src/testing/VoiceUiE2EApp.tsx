import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GlobalFloatingBall } from '../components/GlobalFloatingBall';
import type { AgentStackParamList } from '../navigation/types';
import { useAuthStore } from '../stores/authStore';

type VoiceUiE2EStackParamList = AgentStackParamList & {
  LocalAiModel: undefined;
};

const Stack = createNativeStackNavigator<VoiceUiE2EStackParamList>();

function AgentConsoleE2EScreen(props: any) {
  const { AgentConsoleScreen } = require('../screens/agent/AgentConsoleScreen');
  const activeInstance = useAuthStore((state) => state.activeInstance);

  return (
    <View style={styles.wrapper}>
      <AgentConsoleScreen {...props} />
      <GlobalFloatingBall
        onVoiceActivate={() => props.navigation.navigate('AgentChat', {
          instanceId: activeInstance?.id,
          instanceName: activeInstance?.name || 'Agent',
          voiceMode: true,
          duplexMode: true,
        })}
      />
    </View>
  );
}

function AgentChatE2EScreen(props: any) {
  const { AgentChatScreen } = require('../screens/agent/AgentChatScreen');
  return (
    <View style={styles.wrapper}>
      <AgentChatScreen {...props} />
      <GlobalFloatingBall />
    </View>
  );
}

function LocalAiModelE2EScreen(props: any) {
  const { LocalAiModelScreen } = require('../screens/me/LocalAiModelScreen');
  return (
    <View style={styles.wrapper}>
      <LocalAiModelScreen {...props} />
    </View>
  );
}

function resolveInitialRouteName(): keyof VoiceUiE2EStackParamList {
  if (typeof window === 'undefined') {
    return 'AgentChat';
  }

  try {
    const screen = new URLSearchParams(window.location.search).get('screen');
    return screen === 'local-ai' ? 'LocalAiModel' : 'AgentChat';
  } catch {
    return 'AgentChat';
  }
}

export function VoiceUiE2EApp() {
  return (
    <Stack.Navigator id={undefined} initialRouteName={resolveInitialRouteName()} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AgentChat" component={AgentChatE2EScreen} />
      <Stack.Screen name="AgentConsole" component={AgentConsoleE2EScreen} />
      <Stack.Screen name="LocalAiModel" component={LocalAiModelE2EScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
});