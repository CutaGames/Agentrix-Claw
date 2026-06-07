import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
export function VoiceChatScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { t } = useI18n();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('AgentChat', {
        instanceId: route.params?.instanceId,
        instanceName: route.params?.instanceName,
        voiceMode: true,
        duplexMode: true,
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [navigation, route.params?.instanceId, route.params?.instanceName]);

  return (
    <View style={styles.container}>
      <View style={styles.redirectCard}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.redirectTitle}>{t({ en: 'Restoring voice chat...', zh: '正在恢复语音对话…' })}</Text>
        <Text style={styles.redirectText}>{t({ en: 'Opening the optimized agent voice session.', zh: '正在打开优化后的智能体语音会话。' })}</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  redirectCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  redirectTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  redirectText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
