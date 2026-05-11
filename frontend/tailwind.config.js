/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      container: {
        center: true,
        padding: '1rem',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'PingFang SC', 'SF Pro SC', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      colors: {
        // ===== Agentrix v4 unified design tokens (Sprint 1) =====
        // Use these in both marketing AND console pages.
        ax: {
          base: 'var(--ax-bg-base)',
          surface: 'var(--ax-bg-surface)',
          elevated: 'var(--ax-bg-elevated)',
          panel: 'var(--ax-bg-panel)',
          overlay: 'var(--ax-bg-overlay)',
          line: 'var(--ax-border)',
          lineStrong: 'var(--ax-border-strong)',
          ink: 'var(--ax-text-primary)',
          fog: 'var(--ax-text-secondary)',
          mist: 'var(--ax-text-muted)',
          accent: 'var(--ax-accent)',
          accentSoft: 'var(--ax-accent-soft)',
          warm: 'var(--ax-accent-warm)',
          warmSoft: 'var(--ax-accent-warm-soft)',
          purple: 'var(--ax-purple)',
          purpleSoft: 'var(--ax-purple-soft)',
          success: 'var(--ax-success)',
          warning: 'var(--ax-warning)',
          danger: 'var(--ax-danger)',
        },
        // Legacy: keep agentrix-* for backward compat (will gradually map to ax tokens)
        agentrix: {
          ink: '#07080B',
          inkSoft: '#0E1118',
          inkLine: '#1C2230',
          purple: '#5B21B6',
          purpleSoft: '#7C3AED',
          electric: '#22D3FF',
          electricSoft: '#7EE9FF',
          solar: '#F59E0B',
          solarSoft: '#FBBF24',
          mist: '#9AA3B2',
          fog: '#CBD5E1',
        },
        primary: {
          blue: '#3B82F6',
          cyan: '#06B6D4',
          neon: '#4FD1FF',
        },
        neutral: {
          900: '#0F1115',
          800: '#17191E',
          700: '#1E2228',
          600: '#2A2F36',
          100: '#F5F7FA',
        },
        accent: {
          green: '#22C55E',
          yellow: '#EAB308',
          red: '#EF4444',
        },
        chain: {
          purple: '#7C3AED',
          indigo: '#4F46E5',
        },
      },
      borderRadius: {
        'ax-sm': '8px',
        'ax-md': '12px',
        'ax-lg': '16px',
        'ax-xl': '20px',
        'ax-2xl': '24px',
      },
      backgroundImage: {
        'ai-gradient': 'linear-gradient(135deg, #3B82F6 0%, #06B6D4 100%)',
        'chain-gradient': 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
        'glass': 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%)',
        // New v4: hero mesh gradient
        'ax-mesh': 'radial-gradient(at 27% 37%, rgba(124,58,237,0.25) 0px, transparent 50%), radial-gradient(at 97% 21%, rgba(34,211,255,0.18) 0px, transparent 50%), radial-gradient(at 52% 99%, rgba(245,158,11,0.12) 0px, transparent 50%), radial-gradient(at 10% 90%, rgba(34,211,255,0.10) 0px, transparent 50%)',
        'ax-aurora': 'conic-gradient(from 220deg at 50% 50%, #7C3AED, #22D3FF, #F59E0B, #7C3AED)',
        'ax-card': 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
        'ax-cardHover': 'linear-gradient(135deg, rgba(34,211,255,0.08) 0%, rgba(124,58,237,0.04) 100%)',
      },
      boxShadow: {
        'glow-blue': '0 0 20px rgba(79, 209, 255, 0.5)',
        'glow-cyan': '0 0 20px rgba(6, 182, 212, 0.5)',
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
        // v4
        'ax-sm': '0 1px 2px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.02)',
        'ax-md': '0 4px 12px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.03)',
        'ax-lg': '0 12px 32px rgba(0,0,0,.55), 0 0 0 1px rgba(34,211,255,.06)',
        'ax-glow': '0 0 0 1px rgba(34,211,255,.25), 0 8px 32px rgba(34,211,255,.18)',
        'ax-glow-warm': '0 0 0 1px rgba(245,158,11,.30), 0 8px 32px rgba(245,158,11,.20)',
      },
      animation: {
        'typing': 'typing 1.5s steps(40, end) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 3s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        // v4
        'ax-aurora': 'ax-aurora 20s linear infinite',
        'ax-shimmer': 'ax-shimmer 2.5s ease-in-out infinite',
        'ax-fade-up': 'ax-fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        'ax-fade-in': 'ax-fade-in 0.3s ease-out both',
        'ax-scale-in': 'ax-scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      keyframes: {
        typing: {
          '0%': { width: '0' },
          '100%': { width: '100%' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(79, 209, 255, 0.5)' },
          '100%': { boxShadow: '0 0 20px rgba(79, 209, 255, 0.8), 0 0 30px rgba(79, 209, 255, 0.6)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 },
        },
        // v4
        'ax-aurora': {
          '0%': { transform: 'rotate(0deg) scale(1.2)' },
          '100%': { transform: 'rotate(360deg) scale(1.2)' },
        },
        'ax-shimmer': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'ax-fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'ax-fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'ax-scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
