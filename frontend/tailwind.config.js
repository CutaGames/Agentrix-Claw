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
      colors: {
        // Agentrix v3 marketing tokens (黑 + 深紫 + 电光蓝 + 橘黄强调)
        agentrix: {
          ink: '#07080B',          // marketing 背景
          inkSoft: '#0E1118',
          inkLine: '#1C2230',
          purple: '#5B21B6',       // soul / 主宠
          purpleSoft: '#7C3AED',
          electric: '#22D3FF',     // 跨端 / 数据
          electricSoft: '#7EE9FF',
          solar: '#F59E0B',        // CTA / Auto-Earn 数字
          solarSoft: '#FBBF24',
          mist: '#9AA3B2',
          fog: '#CBD5E1',
        },
        // Agentrix V3.0 标准配色
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
      backgroundImage: {
        'ai-gradient': 'linear-gradient(135deg, #3B82F6 0%, #06B6D4 100%)',
        'chain-gradient': 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
        'glass': 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
      },
      boxShadow: {
        'glow-blue': '0 0 20px rgba(79, 209, 255, 0.5)',
        'glow-cyan': '0 0 20px rgba(6, 182, 212, 0.5)',
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
      },
      animation: {
        'typing': 'typing 1.5s steps(40, end) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 3s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
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
      },
    },
  },
  plugins: [],
}
