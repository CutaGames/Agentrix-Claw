/**
 * StagingBadge — the always-on "STAGING" mark while a preview build is connected to staging
 * (I-046 item 2). Renders nothing in any other state or build. It reads the staging health route
 * once, through the normal network stack, and says when the gate key is missing or refused.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE } from '../config/env';
import { STAGING_SELECTION } from '../config/stagingMode';
import { useI18n } from '../stores/i18nStore';
import { probeStagingGate, stagingBadgeText, type StagingGateProbe } from '../services/stagingSwitch';

export function StagingBadge() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [probe, setProbe] = useState<StagingGateProbe | null>(null);
  useEffect(() => {
    if (!STAGING_SELECTION.active || !STAGING_SELECTION.key) return;
    let alive = true;
    void probeStagingGate((url) => fetch(url), API_BASE).then((result) => {
      if (alive) setProbe(result);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!STAGING_SELECTION.active) return null;
  const text = t(stagingBadgeText(STAGING_SELECTION, probe));
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 2 }]} testID="staging-badge">
      <Text style={styles.text} accessibilityRole="text" accessibilityLabel={text}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 9999, elevation: 9999 },
  // Fixed colours on purpose: the mark must look the same in every theme.
  text: {
    backgroundColor: '#b45309',
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
