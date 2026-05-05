/**
 * console.theme.ts — shared design tokens for /console/** pages (WCAG AA).
 */

import type { CSSProperties } from 'react';

export const T = {
  bg: {
    page: '#0B0F19',
    panel: '#141925',
    panelHover: '#1B2333',
    sidebar: '#0F1320',
    input: '#0A0E18',
    overlay: '#000000CC',
  },
  text: {
    primary: '#F1F5F9',
    secondary: '#CBD5E1',
    muted: '#94A3B8',
    accent: '#22D3FF',
    success: '#34D399',
    warning: '#FBBF24',
    danger: '#F87171',
    inverted: '#07080B',
  },
  border: {
    subtle: '#1F2937',
    default: '#2D3748',
    accent: '#22D3FF',
  },
  radius: { sm: 6, md: 10, lg: 12, xl: 16 },
  shadow: {
    card: '0 1px 2px rgba(0,0,0,.3)',
    cardHover: '0 4px 12px rgba(34,211,255,.08)',
  },
  font: {
    family:
      '"Inter", "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", system-ui, -apple-system, sans-serif',
    sizeBody: 15,
    sizeSmall: 13,
    sizeCaption: 12,
    sizeTiny: 11,
    sizeH1: 22,
    sizeH2: 17,
    weightBold: 700,
    weightSemibold: 600,
    weightRegular: 400,
  },
} as const;

export const cardStyle: CSSProperties = {
  background: T.bg.panel,
  border: `1px solid ${T.border.subtle}`,
  borderRadius: T.radius.lg,
  padding: 20,
};

export const inputStyle: CSSProperties = {
  background: T.bg.input,
  border: `1px solid ${T.border.subtle}`,
  color: T.text.primary,
  padding: '10px 14px',
  borderRadius: T.radius.sm,
  fontSize: T.font.sizeSmall,
  fontFamily: T.font.family,
  outline: 'none',
};

export const selectStyle: CSSProperties = { ...inputStyle, cursor: 'pointer' };

export const btnPrimaryStyle: CSSProperties = {
  padding: '10px 18px',
  background: T.text.accent,
  color: T.text.inverted,
  border: 0,
  borderRadius: T.radius.sm,
  fontSize: T.font.sizeSmall,
  fontWeight: T.font.weightSemibold,
  fontFamily: T.font.family,
  cursor: 'pointer',
  transition: 'background .15s, transform .05s',
};

export const btnSecondaryStyle: CSSProperties = {
  padding: '10px 18px',
  background: T.bg.panel,
  color: T.text.primary,
  border: `1px solid ${T.border.default}`,
  borderRadius: T.radius.sm,
  fontSize: T.font.sizeSmall,
  fontWeight: T.font.weightSemibold,
  fontFamily: T.font.family,
  cursor: 'pointer',
};

export const btnDangerStyle: CSSProperties = {
  padding: '8px 14px',
  background: T.bg.panel,
  color: T.text.danger,
  border: '1px solid #7F1D1D',
  borderRadius: T.radius.sm,
  fontSize: T.font.sizeCaption,
  fontWeight: T.font.weightSemibold,
  fontFamily: T.font.family,
  cursor: 'pointer',
};

export const emptyStateStyle: CSSProperties = {
  padding: 48,
  textAlign: 'center',
  background: T.bg.panel,
  border: `1px dashed ${T.border.subtle}`,
  borderRadius: T.radius.lg,
  color: T.text.muted,
  fontSize: T.font.sizeSmall,
};

export const pillStyle = (variant: 'accent' | 'success' | 'warning' | 'danger' | 'subtle' = 'subtle'): CSSProperties => {
  const palette: Record<string, { bg: string; fg: string }> = {
    accent: { bg: 'rgba(34,211,255,.12)', fg: T.text.accent },
    success: { bg: 'rgba(52,211,153,.12)', fg: T.text.success },
    warning: { bg: 'rgba(251,191,36,.12)', fg: T.text.warning },
    danger: { bg: 'rgba(248,113,113,.12)', fg: T.text.danger },
    subtle: { bg: T.border.subtle, fg: T.text.secondary },
  };
  const p = palette[variant];
  return {
    fontSize: T.font.sizeTiny,
    padding: '3px 10px',
    background: p.bg,
    color: p.fg,
    borderRadius: 999,
    fontWeight: T.font.weightSemibold,
    display: 'inline-block',
  };
};
