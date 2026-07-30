/**
 * LevelUpCelebration — full-screen modal shown when a pet levels up.
 *
 * Displays confetti-style emoji, level transition text, AXP reward,
 * and fires `showAxpToast` on mount for the level-up AXP amount.
 */
import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { colors } from '../theme/colors';
import { useI18n } from '../stores/i18nStore';
import { showAxpToast } from '../stores/axpToastStore';
import { themedStyles } from '../theme/useTheme';

export interface LevelUpCelebrationProps {
  visible: boolean;
  fromLevel: number;
  toLevel: number;
  axpEarned: number;
  petName: string;
  onDismiss: () => void;
}

export function LevelUpCelebration({
  visible,
  fromLevel,
  toLevel,
  axpEarned,
  petName,
  onDismiss,
}: LevelUpCelebrationProps) {
  const { t } = useI18n();

  // Fire AXP toast on mount when visible
  useEffect(() => {
    if (visible && axpEarned > 0) {
      showAxpToast({
        amount: axpEarned,
        reason: {
          en: `${petName} leveled up!`,
          zh: `${petName} 升级了！`,
        },
        emoji: '🎉',
      });
    }
  }, [visible, axpEarned, petName]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Confetti emojis */}
          <View style={styles.confettiRow}>
            <Text style={styles.confettiEmoji}>🎊</Text>
            <Text style={styles.confettiEmoji}>✨</Text>
            <Text style={styles.confettiEmoji}>🎊</Text>
          </View>

          {/* Main celebration emoji */}
          <Text style={styles.mainEmoji}>🎉</Text>

          {/* Pet name */}
          <Text style={styles.petName}>{petName}</Text>

          {/* Level transition */}
          <Text style={styles.levelText}>
            Level {fromLevel} → Level {toLevel}!
          </Text>

          {/* AXP reward */}
          <View style={styles.axpBadge}>
            <Text style={styles.axpText}>+{axpEarned} AXP 💎</Text>
          </View>

          {/* Flavor text */}
          <Text style={styles.flavorText}>
            {t({
              en: 'Your pet is growing stronger! Keep feeding and training.',
              zh: '你的主宠变得更强了！继续喂养和训练吧。',
            })}
          </Text>

          {/* Dismiss button */}
          <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} activeOpacity={0.8}>
            <Text style={styles.dismissBtnText}>
              {t({ en: 'Continue', zh: '继续' })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.bgCard,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.accent + '55',
  },
  confettiRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  confettiEmoji: {
    fontSize: 28,
  },
  mainEmoji: {
    fontSize: 72,
    marginBottom: 16,
  },
  petName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  levelText: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  axpBadge: {
    backgroundColor: colors.accent + '20',
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.accent + '55',
  },
  axpText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.accent,
  },
  flavorText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  dismissBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 48,
    alignItems: 'center',
  },
  dismissBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
}));
