/**
 * CoRaisingLandingScreen — Sprint A placeholder.
 *
 * Landing page for `agentrix://home/co-raising/:token` invite links.
 * Real implementation in Sprint C1 will:
 *   - Validate the invite token (backend: pet_coraising_invites.token)
 *   - Show the target pet's avatar + current Lv/energy
 *   - Offer "Feed" action (guest-friendly — no account required for 1st tap)
 *   - Prompt registration for ongoing participation + AXP reward
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import type { HomeStackParamList } from '../../navigation/types';

type Route = RouteProp<HomeStackParamList, 'CoRaisingLanding'>;

export function CoRaisingLandingScreen() {
  const route = useRoute<Route>();
  const { t } = useI18n();
  const token = route.params?.token;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.emoji}>🐾</Text>
      <Text style={styles.title}>
        {t({ en: 'A friend wants you to help raise their pet', zh: '有朋友想让你帮养宠物' })}
      </Text>
      <Text style={styles.body}>
        {t({
          en: 'This invite flow activates in Sprint C. Token:',
          zh: '此邀请流程在 Sprint C 激活。Token:',
        })}{' '}
        {token ?? '—'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 24, alignItems: 'center' },
  emoji: { fontSize: 64, marginTop: 48, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 12 },
  body: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
