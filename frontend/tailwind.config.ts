import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#FFF4E8',
        surface: '#FFFBF6',
        raised: '#F3E7DC',
        line: '#D6C5BA',
        text: '#302331',
        muted: '#73616C',
        coral: {
          DEFAULT: '#EA7058',
          strong: '#A63D2D',
          soft: '#A63D2D',
        },
        cyan: '#302331',
        lime: '#36704D',
        amber: '#885914',
        violet: '#795184',
      },
      fontFamily: {
        display: ['ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'market-md': '18px',
        'market-lg': '28px',
      },
      // Retain existing utility names so every flow inherits the new identity.
      boxShadow: {
        'glow-coral': '0 2px 5px rgb(48 35 49 / 8%)',
        'glow-cyan': '0 2px 5px rgb(48 35 49 / 6%)',
        'glow-lime': '0 2px 5px rgb(48 35 49 / 6%)',
        match: '0 4px 16px rgb(54 112 77 / 10%)',
        card: '0 4px 18px rgb(48 35 49 / 6%)',
        'card-hover': '0 6px 22px rgb(48 35 49 / 9%)',
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
          '0%': { boxShadow: '0 0 0 0 rgb(54 112 77 / 50%)' },
          '75%, 100%': { boxShadow: '0 0 0 14px rgb(54 112 77 / 0%)' },
        },
        pulseGlow: {
          '0%': { boxShadow: '0 0 0 0 rgb(234 112 88 / 60%)' },
          '100%': { boxShadow: '0 0 0 20px rgb(234 112 88 / 0%)' },
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
