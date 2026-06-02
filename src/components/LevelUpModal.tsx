/**
 * LevelUpModal — full-screen celebration modal for pet level-ups.
 *
 * Shows a centered card with confetti emoji, level transition,
 * AXP reward badge, and fires showAxpToast on mount.
 */
import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { colors } from '../theme/colors';
import { useI18n } from '../stores/i18nStore';
import { showAxpToast } from '../stores/axpToastStore';

export interface LevelUpModalProps {
  visible: boolean;
  oldLevel: number;
  newLevel: number;
  onDismiss: () => void;
}

export function LevelUpModal({
  visible,
  oldLevel,
  newLevel,
  onDismiss,
}: LevelUpModalProps) {
  const { t } = useI18n();
  const axpReward = 50 * newLevel;

  // Fire AXP toast on mount
  useEffect(() => {
    if (visible) {
      showAxpToast({
        amount: axpReward,
        emoji: '🎉',
        reason: { en: 'Pet leveled up!', zh: '主宠升级！' },
      });
    }
  }, [visible, axpReward]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Main celebration emoji */}
          <Text style={styles.mainEmoji}>🎉</Text>

          {/* Title */}
          <Text style={styles.title}>
            {t({ en: 'Level Up!', zh: '升级了！' })}
          </Text>

          {/* Level transition */}
          <View style={styles.levelRow}>
            <Text style={styles.levelOld}>Lv.{oldLevel}</Text>
            <Text style={styles.levelArrow}>→</Text>
            <Text style={styles.levelNew}>Lv.{newLevel}</Text>
          </View>

          {/* AXP reward badge */}
          <View style={styles.axpBadge}>
            <Text style={styles.axpBadgeText}>+{axpReward} AXP</Text>
          </View>

          {/* Dismiss button */}
          <TouchableOpacity
            style={styles.dismissBtn}
            onPress={onDismiss}
            activeOpacity={0.8}
          >
            <Text style={styles.dismissBtnText}>
              {t({ en: 'Continue', zh: '继续' })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const CYAN = '#22d3ee';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.bgCard,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: CYAN + '44',
  },
  mainEmoji: {
    fontSize: 72,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: CYAN,
    marginBottom: 20,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  levelOld: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textMuted,
  },
  levelArrow: {
    fontSize: 26,
    fontWeight: '700',
    color: CYAN,
  },
  levelNew: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  axpBadge: {
    backgroundColor: CYAN + '20',
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: CYAN + '55',
  },
  axpBadgeText: {
    fontSize: 18,
    fontWeight: '800',
    color: CYAN,
  },
  dismissBtn: {
    backgroundColor: CYAN,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 48,
    alignItems: 'center',
    width: '100%',
  },
  dismissBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
});
