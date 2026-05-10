/**
 * CoRaisingInviteScreen — Sprint A placeholder.
 *
 * Real implementation in Sprint C1:
 *   - Select active pet
 *   - Generate invite link (backend: pet_coraising_invites table)
 *   - Share via ShareCard (universal link lands on CoRaisingLandingScreen)
 *   - Configure split ratio (commission V4: feeder gets 5% of pet earnings)
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';

export function CoRaisingInviteScreen() {
  const { t } = useI18n();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.emoji}>🌱</Text>
      <Text style={styles.title}>
        {t({ en: 'Co-Raising (coming in Sprint C)', zh: '共养 (Sprint C 开放)' })}
      </Text>
      <Text style={styles.body}>
        {t({
          en: 'Friends will be able to help feed your pet, earn 5% of its earnings, and get AXP rewards. This flow is being built.',
          zh: '好友将可以帮你喂宠、分享 5% 收益、获得 AXP 奖励。功能正在开发中。',
        })}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 24, alignItems: 'center' },
  emoji: { fontSize: 56, marginTop: 40, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 12 },
  body: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
