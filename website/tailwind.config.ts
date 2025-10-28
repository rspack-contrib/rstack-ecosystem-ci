import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'rgba(255,255,255,0.08)',
        input: 'rgba(255,255,255,0.04)',
        ring: '#111111',
        background: '#000000',
        foreground: '#FDFDFD',
        muted: {
          DEFAULT: '#111111',
          foreground: '#A3A3A3',
        },
        accent: {
          DEFAULT: '#181818',
          foreground: '#FDFDFD',
        },
        popover: {
          DEFAULT: '#0A0A0A',
          foreground: '#F5F5F5',
        },
        card: {
          DEFAULT: '#0A0A0A',
          foreground: '#F5F5F5',
        },
        destructive: {
          DEFAULT: '#7F1D1D',
          foreground: '#FEE2E2',
        },
        success: {
          DEFAULT: '#22C55E',
          foreground: '#DCFCE7',
        },
        warning: {
          DEFAULT: '#F97316',
          foreground: '#FFEDD5',
        },
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.65rem',
        sm: '0.5rem',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
      boxShadow: {
        glow: '0 12px 28px -18px rgba(0, 0, 0, 0.55)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
