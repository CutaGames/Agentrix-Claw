/**
 * PosterShareCard — 1080×1920 vertical poster for social sharing.
 *
 * Renders a beautiful dark-gradient poster with pet info, stats, and QR
 * placeholder. Designed to be captured as an image via react-native-view-shot.
 *
 * Layout (vertical):
 *  - Top: Agentrix logo + brand text
 *  - Middle: Pet emoji avatar + name + Lv badge + soul type badge
 *  - Stats row: Skills count | Earnings | Streak days
 *  - Bottom: QR placeholder + invite code + "Scan to join" CTA
 *  - Footer: agentrix.top watermark
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { useI18n } from '../stores/i18nStore';

export interface PosterShareCardProps {
  petName: string;
  petLevel: number;
  soulType: string;
  skillCount: number;
  earnings: number;
  streakDays: number;
  inviteCode: string;
}

export function PosterShareCard({
  petName,
  petLevel,
  soulType,
  skillCount,
  earnings,
  streakDays,
  inviteCode,
}: PosterShareCardProps) {
  const { t } = useI18n();

  return (
    <View style={styles.poster}>
      {/* ── Top: Logo + Brand ─────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🤖</Text>
          </View>
          <Text style={styles.brandText}>Agentrix</Text>
        </View>
      </View>

      {/* ── Middle: Pet Avatar + Info ─────────────────────── */}
      <View style={styles.petSection}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarEmoji}>🐾</Text>
          </View>
        </View>

        <Text style={styles.petName}>{petName}</Text>

        <View style={styles.badgeRow}>
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>Lv.{petLevel}</Text>
          </View>
          <View style={styles.soulBadge}>
            <Text style={styles.soulBadgeText}>{soulType}</Text>
          </View>
        </View>
      </View>

      {/* ── Stats Row: 3 columns ──────────────────────────── */}
      <View style={styles.statsCard}>
        <View style={styles.statCol}>
          <Text style={styles.statValue}>{skillCount}</Text>
          <Text style={styles.statLabel}>
            {t({ en: 'Skills', zh: '技能' })}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCol}>
          <Text style={styles.statValue}>${earnings.toFixed(2)}</Text>
          <Text style={styles.statLabel}>
            {t({ en: 'Earnings', zh: '收益' })}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCol}>
          <Text style={styles.statValue}>{streakDays}</Text>
          <Text style={styles.statLabel}>
            {t({ en: 'Streak', zh: '连续' })}
          </Text>
        </View>
      </View>

      {/* ── Bottom: QR + Invite Code ──────────────────────── */}
      <View style={styles.qrSection}>
        <View style={styles.qrBox}>
          <Text style={styles.qrPlaceholderText}>QR</Text>
        </View>
        <View style={styles.inviteArea}>
          <Text style={styles.inviteLabel}>
            {t({ en: 'Invite Code', zh: '邀请码' })}
          </Text>
          <Text style={styles.inviteCode}>{inviteCode}</Text>
          <Text style={styles.scanCta}>
            {t({ en: 'Scan to join', zh: '扫码加入' })}
          </Text>
        </View>
      </View>

      {/* ── Footer: Watermark ─────────────────────────────── */}
      <View style={styles.footer}>
        <Text style={styles.watermark}>agentrix.top</Text>
      </View>
    </View>
  );
}

const CYAN = '#22d3ee';

const styles = StyleSheet.create({
  poster: {
    width: 1080,
    height: 1920,
    backgroundColor: '#0B1220',
    padding: 60,
    justifyContent: 'space-between',
  },

  // ── Header ──────────────────────────────────────────────
  header: {
    alignItems: 'center',
    paddingTop: 20,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: CYAN + '20',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: CYAN + '55',
  },
  logoEmoji: {
    fontSize: 32,
  },
  brandText: {
    fontSize: 52,
    fontWeight: '900',
    color: CYAN,
    letterSpacing: -1,
  },

  // ── Pet Section ─────────────────────────────────────────
  petSection: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  avatarContainer: {
    marginBottom: 24,
  },
  avatarCircle: {
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#1a1a2e',
    borderWidth: 4,
    borderColor: CYAN + '66',
    alignItems: 'center',
    justifyContent: 'center',
    // Glassmorphism feel
    shadowColor: CYAN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 10,
  },
  avatarEmoji: {
    fontSize: 96,
  },
  petName: {
    fontSize: 56,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  levelBadge: {
    backgroundColor: CYAN + '25',
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: CYAN + '66',
  },
  levelBadgeText: {
    fontSize: 28,
    fontWeight: '800',
    color: CYAN,
  },
  soulBadge: {
    backgroundColor: '#7c3aed25',
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#7c3aed66',
  },
  soulBadgeText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#a78bfa',
  },

  // ── Stats Card ──────────────────────────────────────────
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderRadius: 24,
    paddingVertical: 36,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: CYAN + '33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 48,
    backgroundColor: colors.border,
  },
  statValue: {
    fontSize: 44,
    fontWeight: '800',
    color: CYAN,
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 24,
    color: colors.textMuted,
    fontWeight: '500',
  },

  // ── QR Section ──────────────────────────────────────────
  qrSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
    paddingVertical: 20,
  },
  qrBox: {
    width: 180,
    height: 180,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrPlaceholderText: {
    fontSize: 36,
    fontWeight: '800',
    color: '#0B1220',
    letterSpacing: 2,
  },
  inviteArea: {
    alignItems: 'flex-start',
  },
  inviteLabel: {
    fontSize: 22,
    color: colors.textMuted,
    marginBottom: 8,
  },
  inviteCode: {
    fontSize: 40,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 3,
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  scanCta: {
    fontSize: 24,
    fontWeight: '600',
    color: CYAN,
  },

  // ── Footer ──────────────────────────────────────────────
  footer: {
    alignItems: 'center',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border + '66',
  },
  watermark: {
    fontSize: 28,
    color: colors.textMuted,
    fontWeight: '500',
    letterSpacing: 1,
  },
});
