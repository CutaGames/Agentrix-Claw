import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  Modal, ScrollView, Pressable,
} from 'react-native';
import { colors } from '../theme/colors';
import { useTokenQuota, formatTokens, QuotaStatus } from '../hooks/useTokenQuota';

// ─── Energy color thresholds ──────────────────────────────────────────────────
function getEnergyColor(level: number): string {
  if (level > 50) return '#22c55e';   // green — plenty
  if (level > 20) return '#f59e0b';   // amber — getting low
  if (level > 10) return '#f97316';   // orange — low
  return '#ef4444';                   // red — critical
}

function getEnergyLabel(level: number): string {
  if (level > 80) return 'Full Power';
  if (level > 50) return 'Good';
  if (level > 20) return 'Getting Low';
  if (level > 10) return 'Low';
  if (level > 0)  return 'Critical!';
  return 'Exhausted';
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TokenEnergyBarProps {
  /** Compact variant for embedding in status cards */
  compact?: boolean;
}

export function TokenEnergyBar({ compact = false }: TokenEnergyBarProps) {
  const { data: quota, isLoading, error } = useTokenQuota();
  const [modalVisible, setModalVisible] = useState(false);
  const animWidth = useRef(new Animated.Value(0)).current;
  const glowAnim  = useRef(new Animated.Value(0)).current;

  const level = quota?.energyLevel ?? 100;
  const barColor = getEnergyColor(level);

  // Animate bar width whenever level changes
  useEffect(() => {
    Animated.spring(animWidth, {
      toValue: level,
      friction: 8,
      tension: 40,
      useNativeDriver: false,
    }).start();
  }, [level]);

  // Pulse glow when critical
  useEffect(() => {
    if (level <= 10 && !isLoading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 700, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0, duration: 700, useNativeDriver: false }),
        ]),
      ).start();
    } else {
      glowAnim.stopAnimation();
      glowAnim.setValue(0);
    }
  }, [level, isLoading]);

  if (isLoading && !quota) {
    return (
      <View style={compact ? styles.compactSkeleton : styles.skeleton}>
        <Text style={styles.skeletonText}>Loading usage…</Text>
      </View>
    );
  }

  if (error || !quota) return null;

  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.9] });

  return (
    <>
      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        activeOpacity={0.82}
        style={compact ? styles.compactWrap : styles.cardWrap}
      >
        {/* Header row */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={[styles.energyIcon, { color: barColor }]}>
              {level > 50 ? '⚡' : level > 20 ? '🔋' : level > 0 ? '⚠️' : '🪫'}
            </Text>
            <View>
              <Text style={styles.headerTitle}>AI Energy</Text>
              <Text style={[styles.energyLabel, { color: barColor }]}>
                {getEnergyLabel(level)}
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={[styles.remainingBig, { color: barColor }]}>
              {formatTokens(quota.remainingTokens)}
            </Text>
            <Text style={styles.remainingSub}>remaining</Text>
          </View>
        </View>

        {/* Animated energy bar */}
        <View style={styles.barTrack}>
          {/* Background segments for visual effect */}
          {Array.from({ length: 20 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.barSegmentBg,
                { opacity: i / 20 < level / 100 ? 0 : 0.15 },
              ]}
            />
          ))}
          {/* Actual fill */}
          <Animated.View
            style={[
              styles.barFill,
              {
                width: animWidth.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                }),
                backgroundColor: barColor,
              },
            ]}
          />
          {/* Glow overlay when critical */}
          {level <= 10 && (
            <Animated.View
              style={[
                styles.barGlow,
                { opacity: glowOpacity, backgroundColor: barColor },
              ]}
            />
          )}
        </View>

        {/* Footer: used / total */}
        {!compact && (
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>
              {formatTokens(quota.usedTokens)} used
            </Text>
            <Text style={styles.footerText}>
              {formatTokens(quota.totalQuota)} total · {quota.callCount} calls
            </Text>
          </View>
        )}

        {/* Exhausted banner */}
        {quota.quotaExhausted && (
          <View style={styles.exhaustedBanner}>
            <Text style={styles.exhaustedText}>
              Quota exhausted — tap to upgrade plan
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Detail modal */}
      <TokenUsageModal
        quota={quota}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        barColor={barColor}
        level={level}
      />
    </>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function TokenUsageModal({
  quota, visible, onClose, barColor, level,
}: {
  quota: QuotaStatus;
  visible: boolean;
  onClose: () => void;
  barColor: string;
  level: number;
}) {
  const periodEnd = new Date(quota.periodEnd);
  const daysLeft = Math.max(
    0,
    Math.ceil((periodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );

  const planLabels: Record<string, string> = {
    free_trial: 'Free Trial',
    starter: 'Starter',
    pro: 'Pro',
    unlimited: 'Unlimited',
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={modal.backdrop} onPress={onClose} />
      <View style={modal.sheet}>
        <View style={modal.handle} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
          {/* Title */}
          <View style={modal.titleRow}>
            <Text style={modal.title}>Token Usage</Text>
            <View style={[modal.planBadge, { borderColor: barColor }]}>
              <Text style={[modal.planText, { color: barColor }]}>
                {planLabels[quota.planType] ?? quota.planType}
              </Text>
            </View>
          </View>

          {/* Big stat */}
          <View style={[modal.statBox, { borderColor: barColor + '44' }]}>
            <Text style={[modal.statBig, { color: barColor }]}>{level}%</Text>
            <Text style={modal.statSub}>Energy Remaining</Text>
          </View>

          {/* Stats grid */}
          <View style={modal.grid}>
            <StatCell label="Remaining" value={formatTokens(quota.remainingTokens)} color={barColor} />
            <StatCell label="Used" value={formatTokens(quota.usedTokens)} color={colors.textPrimary} />
            <StatCell label="Total" value={formatTokens(quota.totalQuota)} color={colors.textSecondary} />
            <StatCell label="Calls" value={String(quota.callCount)} color={colors.textSecondary} />
            <StatCell label="Days Left" value={`${daysLeft}d`} color={colors.textSecondary} />
            <StatCell label="Resets" value={new Date(quota.periodEnd).toLocaleDateString()} color={colors.textMuted} />
          </View>

          {/* Usage breakdown hint */}
          <View style={modal.infoBox}>
            <Text style={modal.infoTitle}>How tokens are routed</Text>
            <Text style={modal.infoText}>
              Simple tasks (greetings, Q&A) → Nova Micro (cheapest){'\n'}
              Code & analysis → Qwen 3.5 Plus{'\n'}
              Complex reasoning → Claude Haiku 4.5{'\n'}
              Your tokens are automatically distributed to get the best value.
            </Text>
          </View>

          {/* Upgrade button (shown if low or exhausted) */}
          {level <= 20 && (
            <TouchableOpacity style={[modal.upgradeBtn, { backgroundColor: barColor }]} onPress={onClose}>
              <Text style={modal.upgradeBtnText}>
                {quota.quotaExhausted ? 'Upgrade to Continue' : 'Upgrade for More Tokens'}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={modal.statCell}>
      <Text style={[modal.statValue, { color }]}>{value}</Text>
      <Text style={modal.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  cardWrap: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  compactWrap: {
    backgroundColor: colors.bgCard,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  skeleton: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 14,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  compactSkeleton: {
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skeletonText: { fontSize: 12, color: colors.textMuted },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerRight: { alignItems: 'flex-end' },
  energyIcon: { fontSize: 22 },
  headerTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  energyLabel: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  remainingBig: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  remainingSub: { fontSize: 10, color: colors.textMuted },

  barTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
    overflow: 'hidden',
    position: 'relative',
  },
  barSegmentBg: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#fff',
    borderRadius: 1,
  },
  barFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 5,
  },
  barGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 5,
  },

  footerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 11, color: colors.textMuted },

  exhaustedBanner: {
    backgroundColor: '#ef444422',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  exhaustedText: { fontSize: 12, color: '#ef4444', fontWeight: '600' },
});

const modal = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.bgPrimary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  planBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  planText: { fontSize: 12, fontWeight: '700' },

  statBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    gap: 4,
  },
  statBig: { fontSize: 48, fontWeight: '800', lineHeight: 52 },
  statSub: { fontSize: 13, color: colors.textMuted },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCell: {
    flex: 1,
    minWidth: '28%',
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 11, color: colors.textMuted },

  infoBox: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  infoText: { fontSize: 12, color: colors.textSecondary, lineHeight: 20 },

  upgradeBtn: {
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  upgradeBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
