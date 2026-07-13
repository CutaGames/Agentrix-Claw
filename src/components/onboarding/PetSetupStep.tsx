/**
 * PetSetupStep — Sprint 2 · Task 2.6
 *
 * Onboarding step that introduces the Pet Companion feature.
 * Default: Pet Companion is ON. User can toggle it off.
 * Stores preference in MMKV (or AsyncStorage fallback).
 *
 * Can be inserted into any stepper-based onboarding flow.
 */
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Switch, Pressable } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import { colors } from '../../theme/colors';
import { PetRenderer } from '../pet/PetRiveRenderer';
import { themedStyles } from '../../theme/useTheme';

const storage = new MMKV();
const PET_COMPANION_KEY = 'pet_companion_enabled';

/** Read stored preference (defaults to true = enabled) */
export function isPetCompanionEnabled(): boolean {
  if (storage.contains(PET_COMPANION_KEY)) {
    return storage.getBoolean(PET_COMPANION_KEY) ?? true;
  }
  return true; // default ON per PRD
}

/** Persist preference */
export function setPetCompanionEnabled(enabled: boolean): void {
  storage.set(PET_COMPANION_KEY, enabled);
}

interface PetSetupStepProps {
  /** Called when user taps "Continue" / "Next" */
  onNext?: () => void;
  /** Called when user taps "Skip" */
  onSkip?: () => void;
  /** Optional i18n helper — falls back to Chinese */
  t?: (v: { en: string; zh: string }) => string;
}

export function PetSetupStep({ onNext, onSkip, t: translate }: PetSetupStepProps) {
  const t = translate || ((v: { en: string; zh: string }) => v.zh);
  const [enabled, setEnabled] = useState(true);

  const handleToggle = useCallback((value: boolean) => {
    setEnabled(value);
    setPetCompanionEnabled(value);
  }, []);

  const handleNext = useCallback(() => {
    setPetCompanionEnabled(enabled);
    onNext?.();
  }, [enabled, onNext]);

  return (
    <View style={styles.container}>
      <View style={styles.previewWrap}>
        <PetRenderer clan="A" emotion="happy" width={160} height={160} />
      </View>

      <Text style={styles.title}>
        {t({ en: 'Your AI Pet Companion is Ready!', zh: '你的 AI 宠物伙伴已就绪！' })}
      </Text>
      <Text style={styles.subtitle}>
        {t({
          en: 'It will accompany you throughout the app, grow with you, and help you earn AXP.',
          zh: '它将在 App 中全程陪伴你，与你一起成长，帮你赚取 AXP。',
        })}
      </Text>

      <View style={styles.toggleRow}>
        <View style={styles.toggleLabel}>
          <Text style={styles.toggleTitle}>
            {t({ en: 'Enable Pet Companion', zh: '开启宠物陪伴' })}
          </Text>
          <Text style={styles.toggleSub}>
            {t({
              en: 'Show your pet on Home and throughout the app',
              zh: '在首页和全局展示你的宠物',
            })}
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          trackColor={{ false: colors.border, true: colors.accent + '80' }}
          thumbColor={enabled ? colors.accent : colors.textMuted}
        />
      </View>

      <Pressable style={styles.nextBtn} onPress={handleNext}>
        <Text style={styles.nextBtnText}>
          {t({ en: 'Continue', zh: '继续' })}
        </Text>
      </Pressable>

      {onSkip && (
        <Pressable style={styles.skipBtn} onPress={onSkip}>
          <Text style={styles.skipBtnText}>
            {t({ en: 'Skip for now', zh: '稍后再说' })}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewWrap: {
    marginBottom: 32,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  toggleLabel: {
    flex: 1,
    marginRight: 12,
  },
  toggleTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  toggleSub: {
    color: colors.textMuted,
    fontSize: 12,
  },
  nextBtn: {
    width: '100%',
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  nextBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  skipBtn: {
    paddingVertical: 8,
  },
  skipBtnText: {
    color: colors.textMuted,
    fontSize: 13,
  },
}));

export default PetSetupStep;
