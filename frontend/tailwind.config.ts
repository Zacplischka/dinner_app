import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#030712',
        surface: '#07111f',
        raised: '#0c1727',
        line: '#243044',
        text: '#f8fafc',
        muted: '#94a3b8',
        coral: {
          DEFAULT: '#ff3858',
          soft: '#ff6b7e',
        },
        cyan: '#35e7ff',
        lime: '#c7ff1a',
        amber: '#ffb627',
        violet: '#b146ff',
      },
      fontFamily: {
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'market-md': '18px',
        'market-lg': '28px',
      },
      boxShadow: {
        'glow-coral': '0 0 12px rgb(255 56 88 / 70%), 0 0 36px rgb(255 56 88 / 28%)',
        'glow-cyan': '0 0 12px rgb(53 231 255 / 60%), 0 0 30px rgb(53 231 255 / 20%)',
        'glow-lime': '0 0 12px rgb(199 255 26 / 55%), 0 0 28px rgb(199 255 26 / 18%)',
        'match': '0 0 18px rgb(199 255 26 / 85%), 0 0 54px rgb(199 255 26 / 42%)',
        'card': '0 24px 70px rgb(0 0 0 / 40%)',
        'card-hover': '0 28px 80px rgb(0 0 0 / 48%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'glow-pulse': 'glowPulse 1.8s ease-out infinite',
        'pulse-glow': 'pulseGlow 0.6s ease-out',
        'heart-pop': 'heartPop 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55)',
        'match-pop': 'matchPop 0.6s ease-out both',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glowPulse: {
          '0%': { boxShadow: '0 0 0 0 rgb(199 255 26 / 50%)' },
          '75%, 100%': { boxShadow: '0 0 0 14px rgb(199 255 26 / 0%)' },
        },
        pulseGlow: {
          '0%': { boxShadow: '0 0 0 0 rgb(255 56 88 / 60%)' },
          '100%': { boxShadow: '0 0 0 20px rgb(255 56 88 / 0%)' },
        },
        heartPop: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.3)' },
          '100%': { transform: 'scale(1)' },
        },
        matchPop: {
          '0%': { opacity: '0', transform: 'scale(0.65) rotate(7deg)' },
          '70%': { opacity: '1', transform: 'scale(1.16) rotate(-4deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(0)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
