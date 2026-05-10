/**
 * CoRaisingActivityScreen — Sprint A placeholder.
 *
 * Shows timeline of friends who have co-raised your pet. Real data wiring
 * lands in Sprint C1.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';

export function CoRaisingActivityScreen() {
  const { t } = useI18n();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.emoji}>📖</Text>
      <Text style={styles.title}>
        {t({ en: 'Co-raising activity', zh: '共养活动' })}
      </Text>
      <Text style={styles.body}>
        {t({
          en: 'Friends who help feed your pet will appear here (Sprint C).',
          zh: '帮你喂宠的朋友会出现在这里（Sprint C 上线）。',
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
