/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /** Everspan's warm paper-to-ink surface scale. */
        neutral: {
          50: 'rgb(var(--neutral-50) / <alpha-value>)',
          100: 'rgb(var(--neutral-100) / <alpha-value>)',
          200: 'rgb(var(--neutral-200) / <alpha-value>)',
          300: 'rgb(var(--neutral-300) / <alpha-value>)',
          400: 'rgb(var(--neutral-400) / <alpha-value>)',
          500: 'rgb(var(--neutral-500) / <alpha-value>)',
          600: 'rgb(var(--neutral-600) / <alpha-value>)',
          700: 'rgb(var(--neutral-700) / <alpha-value>)',
          800: 'rgb(var(--neutral-800) / <alpha-value>)',
          850: 'rgb(var(--neutral-850) / <alpha-value>)',
          900: 'rgb(var(--neutral-900) / <alpha-value>)',
          950: 'rgb(var(--neutral-950) / <alpha-value>)',
        },
        /** Everspan red. Use cream text on 500/600 fills. */
        accent: {
          100: 'rgb(var(--accent-100) / <alpha-value>)',
          200: 'rgb(var(--accent-200) / <alpha-value>)',
          300: 'rgb(var(--accent-300) / <alpha-value>)',
          400: 'rgb(var(--accent-400) / <alpha-value>)',
          500: 'rgb(var(--accent-500) / <alpha-value>)',
          600: 'rgb(var(--accent-600) / <alpha-value>)',
        },
        /** Semantic roles derived from the brand red; icons and copy carry the status meaning. */
        positive: {
          100: 'rgb(var(--positive-100) / <alpha-value>)',
          200: 'rgb(var(--positive-200) / <alpha-value>)',
          300: 'rgb(var(--positive-300) / <alpha-value>)',
          400: 'rgb(var(--positive-400) / <alpha-value>)',
          500: 'rgb(var(--positive-500) / <alpha-value>)',
        },
        negative: {
          100: 'rgb(var(--negative-100) / <alpha-value>)',
          200: 'rgb(var(--negative-200) / <alpha-value>)',
          300: 'rgb(var(--negative-300) / <alpha-value>)',
          400: 'rgb(var(--negative-400) / <alpha-value>)',
          500: 'rgb(var(--negative-500) / <alpha-value>)',
        },
        warning: {
          100: 'rgb(var(--warning-100) / <alpha-value>)',
          200: 'rgb(var(--warning-200) / <alpha-value>)',
          300: 'rgb(var(--warning-300) / <alpha-value>)',
          400: 'rgb(var(--warning-400) / <alpha-value>)',
          500: 'rgb(var(--warning-500) / <alpha-value>)',
        },
        onAccent: 'rgb(var(--on-accent) / <alpha-value>)',
      },
      fontFamily: {
        sans: [
          "'Space Grotesk Variable'",
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      keyframes: {
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'toast-in': 'toast-in 200ms cubic-bezier(0, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
