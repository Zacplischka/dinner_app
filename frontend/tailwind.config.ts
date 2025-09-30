import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        xs: '390px', // iPhone 12 Pro baseline
      },
      minHeight: {
        '44': '44px', // Touch-friendly minimum height
      },
      minWidth: {
        '44': '44px', // Touch-friendly minimum width
      },
    },
  },
  plugins: [],
} satisfies Config;