import React, { useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';

import { useAuthStore } from '../../stores/authStore';

const { width } = Dimensions.get('window');

const OPTIONS = [
  {
    id: 'cloud',
    emoji: '☁️',
    title: 'One-Tap Cloud Deploy',
    subtitle: 'Fastest setup. Agent live in 30 seconds. 🎁 10 GB storage gifted free.',
    badge: '10 GB FREE',
    badgeColor: colors.success,
    action: 'CloudDeploy' as const,
    highlight: true,
  },
  {
    id: 'local',
    emoji: '💻',
    title: 'Local / Private Deploy',
    subtitle: 'Scan QR to connect your PC, NAS or HomeLab. Data stays on-device.',
    badge: 'PRIVATE',
    badgeColor: colors.primary,
    action: 'LocalDeploy' as const,
    highlight: false,
  },
  {
    id: 'existing',
    emoji: '⚙️',
    title: 'BYOC · Bring Your Own',
    subtitle: 'Already have an OpenClaw or private instance? Connect it here.',
    badge: 'BYOC',
    badgeColor: colors.textMuted,
    action: 'ConnectExisting' as const,
    highlight: false,
  },
];

export function DeploySelectScreen() {
  const navigation = useNavigation<any>();
  const hasCompletedOnboarding = useAuthStore((s) => s.hasCompletedOnboarding);
  const setOnboardingComplete = useAuthStore((s) => s.setOnboardingComplete);

  const handleSkip = useCallback(() => {
    try {
      if (hasCompletedOnboarding) {
        // Already onboarded — just go back to Agent Console
        if (navigation.canGoBack()) navigation.goBack();
      } else {
        setOnboardingComplete();
      }
    } catch (e) {
      console.warn('Skip failed:', e);
    }
  }, [hasCompletedOnboarding, setOnboardingComplete, navigation]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Agentrix Claw</Text>
      <Text style={styles.subtitle}>
        Deploy your personal AI Agent in three ways. Cloud, local-private, or bring your own instance — your Agent, your rules.
      </Text>

      <View style={styles.options}>
        {OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.id}
            style={[styles.card, opt.highlight && styles.cardHighlight]}
            activeOpacity={0.8}
            onPress={() => {
              if (opt.action) {
                navigation.navigate(opt.action);
              }
            }}
          >
            <View style={styles.cardLeft}>
              <Text style={styles.cardEmoji}>{opt.emoji}</Text>
            </View>
            <View style={styles.cardBody}>
              <View style={styles.cardTitleRow}>
                <Text style={[styles.cardTitle, opt.highlight && styles.cardTitleHighlight]}>
                  {opt.title}
                </Text>
                {opt.badge && (
                  <View style={[styles.badge, { backgroundColor: opt.badgeColor + '22' }]}>
                    <Text style={[styles.badgeText, { color: opt.badgeColor! }]}>{opt.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardSubtitle}>{opt.subtitle}</Text>
            </View>
            <Text style={styles.cardArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.note}>
        🎁 Early access: New users who choose Cloud Deploy receive 10 GB cloud storage free. Upgrade to 40 GB or 100 GB anytime.
      </Text>

      <TouchableOpacity 
        style={styles.skipButton} 
        onPress={handleSkip}
      >
        <Text style={styles.skipButtonText}>Skip for now</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 24, paddingTop: 56, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, marginBottom: 12 },
  subtitle: { fontSize: 15, color: colors.textSecondary, lineHeight: 22, marginBottom: 32 },
  options: { gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  cardHighlight: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + '11',
  },
  cardLeft: { width: 44, alignItems: 'center' },
  cardEmoji: { fontSize: 28 },
  cardBody: { flex: 1, gap: 4 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  cardTitleHighlight: { color: colors.accent },
  cardSubtitle: { fontSize: 13, color: colors.textSecondary },
  cardArrow: { fontSize: 22, color: colors.textMuted },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  note: {
    marginTop: 24,
    padding: 16,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  skipButton: {
    marginTop: 24,
    alignItems: 'center',
    paddingVertical: 12,
  },
  skipButtonText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
});
