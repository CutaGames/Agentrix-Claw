// QR 码组件 — 使用 react-native-qrcode-svg
import React from 'react';
import { View, StyleSheet } from 'react-native';

// Note: react-native-qrcode-svg requires react-native-svg
// If the package is not installed, we fallback to a text placeholder
let QRCodeSVG: any = null;
try {
  QRCodeSVG = require('react-native-qrcode-svg').default;
} catch {
  // Package not installed yet
}

interface Props {
  value: string;
  size?: number;
  bgColor?: string;
  fgColor?: string;
}

export function QrCode({ value, size = 160, bgColor = '#ffffff', fgColor = '#1e293b' }: Props) {
  if (QRCodeSVG) {
    return (
      <View style={[styles.container, { width: size + 24, height: size + 24 }]}>
        <QRCodeSVG
          value={value}
          size={size}
          backgroundColor={bgColor}
          color={fgColor}
        />
      </View>
    );
  }

  // Fallback: text-based placeholder
  return (
    <View style={[styles.container, styles.fallback, { width: size + 24, height: size + 24 }]}>
      <View style={styles.fallbackInner}>
        {Array.from({ length: 7 }).map((_, row) => (
          <View key={row} style={styles.fallbackRow}>
            {Array.from({ length: 7 }).map((_, col) => (
              <View
                key={col}
                style={[
                  styles.fallbackCell,
                  {
                    width: size / 9,
                    height: size / 9,
                    backgroundColor: (
                      (row < 3 && col < 3) ||
                      (row < 3 && col > 3) ||
                      (row > 3 && col < 3) ||
                      (row === 3 && col === 3) ||
                      ((row + col) % 3 === 0)
                    ) ? fgColor : bgColor,
                  },
                ]}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    overflow: 'hidden',
  },
  fallbackInner: {
    alignItems: 'center',
  },
  fallbackRow: {
    flexDirection: 'row',
    gap: 2,
  },
  fallbackCell: {
    borderRadius: 1,
    margin: 1,
  },
});
