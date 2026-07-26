/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /**
         * Derived from the project palette: #000000, #233D4D, #FE7F2D, #EAECF0.
         *
         * One scale used in both directions — the marketing site reads it from
         * the light end, the app from the dark end — so there is a single set of
         * surfaces to maintain. The dark half interpolates black → slate, the
         * light half slate → mist, which keeps every surface on the same
         * blue-grey axis instead of drifting to a neutral grey.
         */
        neutral: {
          50: '#f3f5f7',
          100: '#eaecf0',
          200: '#d6dae0',
          300: '#bac2c9',
          400: '#9aa6af',
          500: '#778691',
          600: '#4f6471',
          700: '#1b303c',
          800: '#101b23',
          850: '#0a1116',
          900: '#060a0c',
          950: '#000000',
        },
        /**
         * The single accent. Reserved for primary action and active state —
         * never for data, so an orange number always means "interactive", not
         * "good". On the light surface it is fill-only: orange text on paper is
         * 2.3:1 and fails AA, while black on an orange fill is 8.3:1.
         */
        accent: {
          100: '#ffe4d1',
          200: '#ffcfae',
          300: '#ffb37f',
          400: '#ff9450',
          500: '#fe7f2d',
          600: '#e8681a',
        },
        /** Status colours. Kept off the accent hue so a warning never reads as a button. */
        positive: {
          100: '#d4f5e5',
          200: '#a7ebcb',
          300: '#6dd9aa',
          400: '#35c98f',
          500: '#1faa74',
        },
        negative: {
          100: '#ffdcdd',
          200: '#ffb8bb',
          300: '#ff8a90',
          400: '#f2545b',
          500: '#d93b42',
        },
        warning: {
          100: '#fdefd0',
          200: '#fadfa4',
          300: '#f7cd6f',
          400: '#f5c451',
          500: '#d9a52f',
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
