/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /**
         * One scale, used in both directions: the marketing site reads it from
         * the light end (paper 50 on ink text), the app from the dark end.
         * Both ends are the brand mark's own colours — 950 is the logo plate,
         * 50 is the star. The middle deliberately drops to ~4-5% saturation so
         * the hue can travel from cool ink (210°) to warm cream (48°) without
         * passing through a visible green.
         */
        neutral: {
          50: '#f7f6f2',
          100: '#efeeeb',
          200: '#e3e2de',
          300: '#cfcec9',
          400: '#b1b0a9',
          500: '#898980',
          600: '#61686b',
          700: '#3f464a',
          800: '#282e33',
          900: '#171c21',
          950: '#0e1216',
        },
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
