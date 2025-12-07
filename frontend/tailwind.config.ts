import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Mobile-first breakpoints (per research.md)
      screens: {
        xs: '390px', // iPhone 12 Pro baseline
        sm: '640px', // Tablets
        md: '768px', // Small laptops
        lg: '1024px', // Desktops
      },
      // Touch-friendly minimum sizes (WCAG AAA)
      minHeight: {
        '44': '44px', // 44x44px minimum touch target
        '48': '48px', // Primary action buttons
      },
      minWidth: {
        '44': '44px',
        '48': '48px',
      },
      // Midnight Supper Club color palette
      colors: {
        // Deep charcoal backgrounds
        midnight: {
          DEFAULT: '#1a1a1f',
          50: '#2d2d33',
          100: '#252529',
          200: '#1f1f24',
          300: '#1a1a1f',
          400: '#151518',
          500: '#101012',
        },
        // Warm amber/gold accents (like candlelight)
        amber: {
          DEFAULT: '#d4a574',
          50: '#faf6f1',
          100: '#f0e4d6',
          200: '#e5cfb3',
          300: '#d4a574',
          400: '#c99559',
          500: '#b8854a',
          600: '#9a6d3d',
          700: '#7a5632',
          800: '#5c412a',
          900: '#3d2c1e',
        },
        // Cream text colors
        cream: {
          DEFAULT: '#f5f0e8',
          50: '#fdfcfa',
          100: '#f5f0e8',
          200: '#ebe3d6',
          300: '#d9cfc0',
          400: '#c4b8a6',
          500: '#a8a29e',
        },
        // Semantic colors with warm undertones
        success: {
          DEFAULT: '#7cb87c',
          light: '#a8d4a8',
          dark: '#5a9a5a',
        },
        error: {
          DEFAULT: '#e07070',
          light: '#f0a0a0',
          dark: '#c05050',
        },
        warning: {
          DEFAULT: '#e0a860',
          light: '#f0c890',
          dark: '#c08840',
        },
      },
      // Typography
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      // Elegant shadows with warm glow
      boxShadow: {
        'glow': '0 0 20px rgba(212, 165, 116, 0.15)',
        'glow-lg': '0 0 40px rgba(212, 165, 116, 0.2)',
        'card': '0 4px 24px rgba(0, 0, 0, 0.4)',
        'card-hover': '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(212, 165, 116, 0.1)',
      },
      // Smooth animations
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'swipe-left': 'swipeLeft 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
        'swipe-right': 'swipeRight 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
        'card-enter': 'cardEnter 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'pulse-glow': 'pulseGlow 0.6s ease-out',
        'heart-pop': 'heartPop 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55)',
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
          '0%, 100%': { boxShadow: '0 0 20px rgba(212, 165, 116, 0.15)' },
          '50%': { boxShadow: '0 0 30px rgba(212, 165, 116, 0.25)' },
        },
        swipeLeft: {
          '0%': { transform: 'translateX(0) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateX(-150%) rotate(-30deg)', opacity: '0' },
        },
        swipeRight: {
          '0%': { transform: 'translateX(0) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateX(150%) rotate(30deg)', opacity: '0' },
        },
        cardEnter: {
          '0%': { transform: 'scale(0.9) translateY(20px)', opacity: '0' },
          '100%': { transform: 'scale(1) translateY(0)', opacity: '1' },
        },
        pulseGlow: {
          '0%': { boxShadow: '0 0 0 0 rgba(212, 165, 116, 0.6)' },
          '100%': { boxShadow: '0 0 0 20px rgba(212, 165, 116, 0)' },
        },
        heartPop: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.3)' },
          '100%': { transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;