/**
 * The class vocabulary every pressable control in Everspan is built from.
 *
 * Kept here rather than beside the components on purpose: five link-shaped
 * controls (`<a>` / `<Link>`) need the same look without being a `<button>`,
 * and a plain function lets them have it without a polymorphic `as` prop. It
 * also keeps `src/components/Button.tsx` exporting components only, which is
 * what `react-refresh/only-export-components` asks for.
 *
 * ── Why the press treatment is what it is ─────────────────────────────────
 * A phone has no hover. Whatever a control does while the finger is down is
 * the only feedback it will ever give, so it has to arrive inside the ~100ms
 * the reader still attributes to their own touch. The press and the release
 * deliberately use different curves: `ease-press` is front-loaded, so the
 * control is already down by the time the touch registers, and `ease-spring`
 * overshoots slightly on the way back, which reads as a released object
 * rather than as a transition playing backwards.
 *
 * ── Why `outline` and not `ring` ──────────────────────────────────────────
 * `ring-offset` paints an opaque band that has to be told the colour of
 * whatever sits behind the control — which is why the app had four different
 * `ring-offset-*` colours, some of them wrong for the surface they landed on.
 * `outline-offset` leaves a real gap that the actual backdrop shows through,
 * so one string is correct on the canvas, on a panel and inside an inset box.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonStyleOptions {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Fill the width of the parent — the default for a submit on a phone. */
  full?: boolean
}

/**
 * The focus treatment on its own, for controls that are not buttons (rows,
 * disclosure summaries, links in prose) but still owe the reader a ring.
 */
export const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-300'

const base = [
  'relative inline-flex select-none items-center justify-center gap-2 rounded-full',
  'font-semibold no-underline',
  // Kills the 300ms tap delay and the grey flash iOS paints over a tapped
  // control — both are tells that nobody styled this for a finger.
  '[touch-action:manipulation] [-webkit-tap-highlight-color:transparent]',
  'transition-[background-color,border-color,color,transform] duration-100 ease-spring',
  'motion-safe:active:scale-[0.97] active:duration-75 active:ease-press',
  focusRing,
  'disabled:cursor-not-allowed',
  // `pending` is spelled as `aria-disabled` rather than `disabled` so the
  // control keeps its place in the focus order while it works.
  'aria-disabled:cursor-wait aria-disabled:opacity-80',
].join(' ')

const SIZES: Record<ButtonSize, string> = {
  /*
   * 36px tall but still a 44px target: the pseudo-element extends the hit area
   * past the paint. Only safe where no ancestor clips overflow, which is true
   * of the two places it is used (the MAX button inside the amount field's
   * absolute cluster, and the slippage presets).
   */
  sm: "min-h-9 px-3 text-xs after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
  md: 'min-h-11 px-4 py-2 text-sm',
  /** The submit size — matches the geometry the action cards already use. */
  lg: 'min-h-11 px-5 py-2.5 text-sm',
}

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
  lg: 'h-12 w-12',
}

/*
 * One `disabled:` spelling per variant, where the app previously had five
 * across the codebase. `danger` keeps its own slot even though `negative-*`
 * currently resolves to the same blue as the accent: the meaning is carried by
 * the icon and the copy, per brand.md, and the ramp can diverge later without
 * touching a call site.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-500 text-onAccent hover:bg-accent-400 active:bg-accent-600 disabled:bg-raised disabled:text-neutral-600',
  secondary:
    'border border-boundary bg-neutral-900 text-neutral-200 hover:bg-raised hover:text-neutral-100 active:bg-raised disabled:border-hairline disabled:bg-transparent disabled:text-neutral-600',
  ghost:
    'text-neutral-400 hover:bg-raised hover:text-neutral-100 active:bg-raised disabled:text-neutral-600',
  danger:
    'border border-negative-300 text-negative-100 hover:bg-negative-500/10 active:bg-negative-500/20 disabled:border-hairline disabled:text-neutral-600',
}

/**
 * Classes for a text button. Anything passed alongside this should be layout
 * only — margin, width, grid placement — because those never collide with the
 * tokens chosen here, and Tailwind's output order, not string order, decides
 * which of two colliding utilities wins.
 */
export function buttonClasses({
  variant = 'secondary',
  size = 'md',
  full = false,
}: ButtonStyleOptions = {}): string {
  return `${base} ${SIZES[size]} ${VARIANTS[variant]}${full ? ' w-full' : ''}`
}

/** Classes for a square icon-only control. */
export function iconButtonClasses({
  variant = 'secondary',
  size = 'md',
}: Omit<ButtonStyleOptions, 'full'> = {}): string {
  return `${base} shrink-0 ${ICON_SIZES[size]} ${VARIANTS[variant]}`
}

/**
 * The three segmented controls in the app (mode toggle, slippage presets,
 * market switcher) look identical and behave identically under the finger, but
 * each carries different ARIA — `aria-pressed`, `aria-checked` and a roving
 * radiogroup. They share the paint from here and keep their own semantics.
 */
/**
 * The track carries no radius of its own: a control that stays on one line
 * wants a pill, and one that stacks its options on a narrow screen wants a
 * rounded box — a pill there leaves the corner of the top option sitting
 * outside the curve. The caller knows which it is.
 */
export const segmentTrackClass = 'border border-boundary p-1'

/**
 * `size` is a parameter rather than something a caller appends, because
 * `px-3 text-xs` bolted onto a string that already says `px-4 text-sm` is
 * decided by Tailwind's output order, not by the order of the strings — the
 * override silently loses about half the time.
 */
export function segmentClasses(selected: boolean, size: 'sm' | 'md' = 'md'): string {
  return [
    'relative min-h-11 rounded-full font-medium leading-snug',
    size === 'sm' ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm',
    'select-none whitespace-normal [touch-action:manipulation] [-webkit-tap-highlight-color:transparent]',
    'transition-[background-color,color,transform] duration-100 ease-spring',
    'motion-safe:active:scale-[0.97] active:duration-75 active:ease-press',
    // A tighter offset than a standalone button: the track's 4px padding is
    // the only room the ring has to sit in.
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-300',
    selected ? 'bg-raised text-neutral-100' : 'text-neutral-400 hover:text-neutral-200',
  ].join(' ')
}
