/** A selectable chip shared by the twin-ask screens. */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useThemedStyles, type Palette } from '../../theme/useTheme';

export function TwinAskChip(props: { label: string; on: boolean; onPress: () => void; testID: string; disabled?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const blocked = Boolean(props.disabled) && !props.on;
  return (
    <TouchableOpacity
      style={[styles.chip, props.on && styles.chipOn, blocked && styles.dim]}
      onPress={props.onPress}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityState={{ selected: props.on, disabled: blocked }}
      testID={props.testID}
    >
      <Text style={props.on ? styles.chipTextOn : styles.chipText}>{props.label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.bgCard, justifyContent: 'center' },
    chipOn: { backgroundColor: c.accent, borderColor: c.accent },
    chipText: { color: c.textPrimary, fontSize: 14 },
    chipTextOn: { color: c.onAccent, fontSize: 14, fontWeight: '700' },
    dim: { opacity: 0.45 },
  });
