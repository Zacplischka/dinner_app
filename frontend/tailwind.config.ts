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
      // WCAG AA compliant colors
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb', // Primary blue (4.5:1 contrast on white)
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;