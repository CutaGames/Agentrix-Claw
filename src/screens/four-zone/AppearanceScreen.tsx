/**
 * AppearanceScreen — 我的 → 外观 (D11, product doc 11.3). Mode: 跟随系统 /
 * 浅色 / 深色; accent: 曜石青 (default) / 晴空蓝 / 星云紫 / 墨石. Labels and
 * colours come from `shared/design-tokens/`, so all three surfaces say the
 * same thing. Synced through the backend 外观偏好 contract (REQ-backend-014):
 * a pick applies at once, is remembered as not uploaded and sent when signed
 * in; opening the screen pulls the value set on another surface.
 */
import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useI18n } from '../../stores/i18nStore';
import { useAppearance, useThemedStyles, type Palette } from '../../theme/useTheme';
import { changeAppearance, syncAppearanceNow } from '../../services/appearanceSyncRuntime';
import {
  ACCENT_IDS,
  ACCENT_LABELS,
  APPEARANCE_MODES,
  APPEARANCE_MODE_LABELS,
  resolvePalette,
} from '../../../shared/design-tokens';
import { getThemeMode, isTokenThemed } from '../../theme/colors';

export function AppearanceScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const [appearance] = useAppearance();
  useEffect(() => {
    void syncAppearanceNow();
  }, []);
  const scheme = getThemeMode();
  const tokenThemed = isTokenThemed();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="appearance-screen">
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: 'Appearance', zh: '外观' })}
      </Text>

      <Text style={styles.section}>{t({ en: 'Mode', zh: '模式' })}</Text>
      <View style={styles.group} accessibilityRole="radiogroup">
        {APPEARANCE_MODES.filter((mode) => tokenThemed || mode !== 'system').map((mode) => {
          const selected = appearance.mode === mode || (!tokenThemed && mode === scheme);
          return (
            <TouchableOpacity
              key={mode}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => changeAppearance({ ...appearance, mode })}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={t(APPEARANCE_MODE_LABELS[mode])}
              testID={`appearance-mode-${mode}`}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{t(APPEARANCE_MODE_LABELS[mode])}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tokenThemed ? (
        <>
          <Text style={styles.section}>{t({ en: 'Accent', zh: '主题色' })}</Text>
          <View style={styles.group} accessibilityRole="radiogroup">
            {ACCENT_IDS.map((accent) => {
              const selected = appearance.accent === accent;
              const swatch = resolvePalette(scheme, accent);
              return (
                <TouchableOpacity
                  key={accent}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => changeAppearance({ ...appearance, accent })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={t(ACCENT_LABELS[accent])}
                  testID={`appearance-accent-${accent}`}
                >
                  <View style={styles.swatchRow}>
                    <View style={[styles.swatch, { backgroundColor: swatch.accent }]} />
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{t(ACCENT_LABELS[accent])}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.helper}>
            {t({
              en: 'Status colours (done, needs confirmation, stop, twin) never change with the accent.',
              zh: '完成、待确认、急停、分身这些状态色不随主题色变化。',
            })}
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 20, gap: 10 },
    title: { color: c.textPrimary, fontSize: 26, fontWeight: '800' },
    section: { color: c.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 10 },
    group: { gap: 8 },
    option: {
      minHeight: 48,
      backgroundColor: c.bgCard,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      justifyContent: 'center',
    },
    optionSelected: { borderColor: c.accent, borderWidth: 2 },
    optionText: { color: c.textPrimary, fontSize: 15, fontWeight: '600' },
    optionTextSelected: { color: c.accent },
    swatchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    swatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: c.border },
    helper: { color: c.textMuted, fontSize: 13, lineHeight: 18, marginTop: 6 },
  });
