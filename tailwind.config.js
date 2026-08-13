/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  future: {
    /*
     * Wraps every `hover:` utility in `@media (hover: hover)`. Without it a
     * touch device applies `:hover` on tap and leaves it applied until the
     * next tap somewhere else — so every button the reader has touched stays
     * visibly lit. There are 60-odd hover utilities in the app, and this is
     * the only fix that reaches all of them at once.
     */
    hoverOnlyWhenSupported: true,
  },
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
        /**
         * Identity tones for concept icons. Not status, not decoration — see
         * the note in `src/index.css` for the rule that keeps them apart.
         */
        figure: {
          ember: 'rgb(var(--figure-ember) / <alpha-value>)',
          ochre: 'rgb(var(--figure-ochre) / <alpha-value>)',
          verdigris: 'rgb(var(--figure-verdigris) / <alpha-value>)',
          mulberry: 'rgb(var(--figure-mulberry) / <alpha-value>)',
        },
        onAccent: 'rgb(var(--on-accent) / <alpha-value>)',
        /** Edge of an interactive control — carries the 3:1 non-text contrast. */
        boundary: 'rgb(var(--boundary) / <alpha-value>)',
        /** Decorative edge: card outlines and dividers. */
        hairline: 'rgb(var(--hairline) / <alpha-value>)',
        /** Fill of a selected, hovered or placeholder control. */
        raised: 'rgb(var(--raised) / <alpha-value>)',
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
      transitionTimingFunction: {
        /*
         * A press and its release are not the same gesture, so they do not
         * share a curve. `press` is front-loaded and decisive — the control is
         * already down by the time the finger registers it. `spring` overshoots
         * slightly on the way back, which is what reads as a physical release
         * rather than a CSS transition running backwards.
         */
        press: 'cubic-bezier(0.2, 0, 0, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'sheet-in': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        /*
         * Written as an animation rather than a transition off a starting
         * class: the global reduced-motion rule zeroes durations, which lands
         * an animation on its final frame but would leave a transition-based
         * reveal stuck on its starting `opacity: 0` forever.
         */
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'toast-in': 'toast-in 200ms cubic-bezier(0, 0, 0.2, 1)',
        'sheet-in': 'sheet-in 240ms cubic-bezier(0.2, 0, 0, 1)',
        'rise-in': 'rise-in 320ms cubic-bezier(0, 0, 0.2, 1) both',
      },
    },
  },
  plugins: [],
}
