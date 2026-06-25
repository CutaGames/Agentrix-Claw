// ClawLink Design System — Color Tokens
export const colors = {
  // ── Backgrounds ──────────────────────────────
  bg: '#0B1220',
  background: '#0B1220',
  bgPrimary: '#0B1220',
  bgSecondary: '#111827',
  bgCard: '#1a2235',
  card: '#1a2235',
  cardAlt: '#1f2d42',
  cardBackground: '#1a2235',
  input: '#162030',
  border: '#2a3a52',

  // ── Brand ────────────────────────────────────
  primary: '#1a77e0',
  primaryLight: '#3b97f5',
  accent: '#00d4ff',
  accentDark: '#009dbf',

  // ── Text ─────────────────────────────────────
  text: '#f0f6ff',
  textPrimary: '#f0f6ff',
  textSecondary: '#8ba3be',
  textMuted: '#4d6278',
  muted: '#4d6278',
  textInverse: '#0B1220',

  // ── Status ───────────────────────────────────
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  danger: '#EF4444',
  info: '#3b82f6',

  // ── Social brand ─────────────────────────────
  google: '#4285F4',
  twitter: '#1DA1F2',
  apple: '#f0f6ff',
  discord: '#5865F2',
  telegram: '#0088CC',
  openclaw: '#00d4ff',
};

// Gradient pairs [from, to]
export const gradients = {
  brand: ['#1a77e0', '#00d4ff'] as const,
  card: ['#1a2235', '#111827'] as const,
  success: ['#059669', '#10b981'] as const,
  celebrate: ['#7c3aed', '#1a77e0', '#00d4ff'] as const,
  dark: ['#0B1220', '#111827'] as const,
  openclaw: ['#00d4ff', '#0088CC'] as const,
};

export type ColorKey = keyof typeof colors;
