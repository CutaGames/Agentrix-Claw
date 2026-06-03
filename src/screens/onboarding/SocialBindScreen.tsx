import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Linking, Image,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { generateTelegramQr } from '../../services/openclaw.service';
import type { OnboardingStackParamList } from '../../navigation/types';

// Use OnboardingStackParamList only for route params — navigation is typed as any
// to allow this screen to work in both Onboarding and Agent stacks.
type Route = RouteProp<OnboardingStackParamList, 'SocialBind'>;

// ── Platform config ───────────────────────────────────────────────────────────

interface PlatformOption {
  id: 'telegram';
  label: string;
  icon: string;
  color: string;
  comingSoon?: boolean;
}

const PLATFORMS: PlatformOption[] = [
  {
    id: 'telegram',
    label: 'Telegram',
    icon: '✈️',
    color: colors.telegram,
  },
  {
    id: 'telegram' as any,
    label: 'WeChat',
    icon: '💬',
    color: '#07C160',
    comingSoon: true,
  },
  {
    id: 'telegram' as any,
    label: 'WhatsApp',
    icon: '📱',
    color: '#25D366',
    comingSoon: true,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function SocialBindScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<Route>();
  const { instanceId } = route.params;

  const { setOnboardingComplete } = useAuthStore.getState();

  const [selectedPlatform, setSelectedPlatform] = useState<'telegram'>('telegram');
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bound, setBound] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Generate QR / deep-link for selected platform ────────────────────────────
  const fetchDeepLink = async () => {
    setLoading(true);
    setDeepLink(null);
    try {
      const res = await generateTelegramQr(instanceId);
      setDeepLink(res.deepLink);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not generate link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeepLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlatform]);

  // ── Polling for bind confirmation ────────────────────────────────────────────
  // In a real production case we'd use a WebSocket push; polling is fine for MVP.
  // The user clicks "I've connected" after scanning — we optimistically complete onboarding.

  const handleConfirm = () => {
    setBound(true);
    if (pollingRef.current) clearInterval(pollingRef.current);
    setOnboardingComplete?.();
  };

  const handleSkip = () => {
    setOnboardingComplete?.();
  };

  const openDeepLink = () => {
    if (deepLink) {
      Linking.openURL(deepLink).catch(() =>
        Alert.alert('Error', 'Could not open link. Please install the app first.')
      );
    }
  };

  // ── Render: success state ─────────────────────────────────────────────────────
  if (bound) {
    return (
      <View style={styles.centered}>
        <Text style={styles.successEmoji}>🎉</Text>
        <Text style={styles.successTitle}>All set!</Text>
        <Text style={styles.successSubtitle}>
          Your agent is connected and ready. Message it on Telegram anytime.
        </Text>
      </View>
    );
  }

  // ── Render: main ─────────────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Connect Social</Text>
      <Text style={styles.subtitle}>
        Link a messaging app so you can chat with your agent from anywhere.
      </Text>

      {/* Platform selector */}
      <View style={styles.platformRow}>
        {PLATFORMS.map((p, idx) => (
          <TouchableOpacity
            key={idx}
            style={[
              styles.platformBtn,
              selectedPlatform === p.id && !p.comingSoon && styles.platformBtnActive,
              p.comingSoon && styles.platformBtnDisabled,
              { borderColor: p.comingSoon ? colors.border : p.color + '66' },
            ]}
            activeOpacity={p.comingSoon ? 1 : 0.8}
            onPress={() => {
              if (!p.comingSoon) setSelectedPlatform(p.id);
            }}
          >
            <Text style={styles.platformIcon}>{p.icon}</Text>
            <Text style={[styles.platformLabel, p.comingSoon && styles.platformLabelMuted]}>
              {p.label}
            </Text>
            {p.comingSoon && (
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>Soon</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* QR / Deep link area */}
      <View style={styles.qrCard}>
        {loading ? (
          <View style={styles.qrPlaceholder}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : deepLink ? (
          <>
            {/* QR code via Google Charts API (simple, no native dependency) */}
            <Image
              source={{
                uri: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(deepLink)}&bgcolor=1a2235&color=00d4ff&margin=10`,
              }}
              style={styles.qrImage}
              resizeMode="contain"
            />
            <Text style={styles.qrHint}>Scan with Telegram to connect your agent</Text>
            <TouchableOpacity
              style={styles.openLinkBtn}
              onPress={openDeepLink}
              activeOpacity={0.85}
            >
              <Text style={styles.openLinkBtnText}>✈️ Open in Telegram</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity onPress={fetchDeepLink} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry ↻</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Steps */}
      <View style={styles.stepsBox}>
        <Text style={styles.stepsTitle}>How it works</Text>
        {STEPS.map((s, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{s}</Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      <TouchableOpacity style={styles.primaryBtn} onPress={handleConfirm} activeOpacity={0.85}>
        <Text style={styles.primaryBtnText}>I've connected ✓</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={handleSkip} style={styles.skipLink}>
        <Text style={styles.skipLinkText}>Skip for now</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const STEPS = [
  'Scan the QR code or tap "Open in Telegram".',
  'Send /start in the chat that opens.',
  'Your agent is now ready to reply on Telegram.',
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 24, paddingTop: 56, paddingBottom: 48 },
  centered: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },

  title: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, marginBottom: 12 },
  subtitle: { fontSize: 15, color: colors.textSecondary, lineHeight: 22, marginBottom: 24 },

  platformRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  platformBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 12,
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.bgCard,
    position: 'relative',
  },
  platformBtnActive: {
    backgroundColor: colors.telegram + '18',
    borderColor: colors.telegram,
  },
  platformBtnDisabled: { opacity: 0.5 },
  platformIcon: { fontSize: 24 },
  platformLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  platformLabelMuted: { color: colors.textMuted },
  comingSoonBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.bgPrimary,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  comingSoonText: { fontSize: 8, color: colors.textMuted, fontWeight: '700' },

  qrCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
    minHeight: 240,
    justifyContent: 'center',
    gap: 16,
  },
  qrPlaceholder: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
  },
  qrHint: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  openLinkBtn: {
    backgroundColor: colors.telegram,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  openLinkBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryBtnText: { fontSize: 14, color: colors.accent, fontWeight: '600' },

  stepsBox: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 16,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  stepsTitle: { fontSize: 13, fontWeight: '700', color: colors.accent, marginBottom: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent + '22',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: { fontSize: 11, fontWeight: '800', color: colors.accent },
  stepText: { fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 20 },

  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: colors.bgPrimary },

  skipLink: { alignItems: 'center', paddingVertical: 8 },
  skipLinkText: { fontSize: 14, color: colors.textMuted },

  successEmoji: { fontSize: 64, marginBottom: 24 },
  successTitle: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, marginBottom: 12 },
  successSubtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
});
