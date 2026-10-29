import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { describeContextWithheld, describeRiskLabel, type ChatRiskLabels as Labels } from '../services/chatRiskLabels';

/** The two small labels under an assistant reply. Renders nothing when the server sent neither. */
export function ChatRiskLabels({ labels, testID }: { labels: Labels; testID?: string }) {
  if (!labels.riskLabel && !labels.contextWithheld) return null;
  return (
    <View style={styles.box} testID={testID}>
      {labels.contextWithheld ? (
        <Text style={styles.hint} accessibilityRole="text">{describeContextWithheld(labels.contextWithheld)}</Text>
      ) : null}
      {labels.riskLabel ? (
        <Text style={[styles.hint, styles.warn]} accessibilityRole="text">{describeRiskLabel(labels.riskLabel)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingHorizontal: 12, paddingBottom: 6, gap: 2 },
  hint: { fontSize: 11, lineHeight: 16, color: '#94a3b8' },
  warn: { color: '#d97706' },
});
