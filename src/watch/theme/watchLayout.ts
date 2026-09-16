import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

// Round watch: inscribed safe area = diameter * (1 - cos(45°)) ≈ 0.29 * r padding
const isRound = true; // Wear OS reports shape; default assume round
const ROUND_INSET = Math.round(width * 0.146); // ~29% of radius

export const watchLayout = {
  screenWidth: width,
  screenHeight: height,

  // Safe area for round screens (content inside inscribed square)
  safeInset: isRound ? ROUND_INSET : 8,
  safePadding: isRound ? ROUND_INSET + 4 : 12,

  // Touch targets (Wear OS min = 48dp)
  touchMin: 48,
  buttonHeight: 48,
  listItemHeight: 56,

  // Typography scale (sp)
  fontHero: 40,    // big numbers (heart rate, steps)
  fontTitle: 18,
  fontBody: 14,
  fontCaption: 12,
  fontMicro: 10,

  // Spacing
  gap: 8,
  gapSm: 4,
  gapLg: 16,

  // Border radius
  radius: 24,
  radiusSm: 12,
  radiusFull: 999,

  // Card
  cardPadding: 12,
};
