import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react'
import { StatBand, type Stat } from './StatBand'
import { clamp01, useSceneProgress, useStage } from './scroll/stageContext'

/* ─────────────────────────────────────────────────────────
 * OPENING
 *
 * The hero does not slide away — the page falls into the gap between the
 * headline and the copy beneath it. Scrolling drives a punch-in centred on
 * that gap; a dark band opens from the same point, holds while the live
 * protocol figures roll through it, then grows to fill the frame and hand
 * over to the first chapter.
 *
 * Phases, in scene progress `p`:
 *   0.00 → 0.30   punch-in; band opens from the gap to BAND_VH
 *   0.30 → 0.84   band holds, figures roll
 *   0.84 → 1.00   band grows to full frame (the next chapter is dark too, so
 *                 the seam between them is invisible)
 * ───────────────────────────────────────────────────────── */

const PUNCH_END = 0.3
const DWELL_END = 0.84
/** Resting band height, in viewport heights. */
const BAND_VH = 38
/**
 * The band reaches its resting height ahead of the punch-in rather than
 * alongside it, so it arrives as the zoom is still opening up behind it.
 */
const BAND_OPEN_END = 0.18
/**
 * Past roughly 10× the headline already covers the frame, and every further
 * step only asks the browser to re-rasterise larger text for no visible gain.
 */
const MAX_SCALE = 12
/** The headline runs ahead of the rest of the hero, which layers the movement. */
const HEADLINE_LEAD = 1.6
/** How far the hero sits above the middle of the frame, in viewport heights. */
const HERO_LIFT_VH = 7
/**
 * The figures do not ride the band open from the first pixel — they start
 * rising once it is a third of the way there, and land exactly as it reaches
 * its resting height. Starting together made the band look like a container
 * being filled; starting late makes the figures look like they are what the
 * band opened for.
 */
const STATS_ENTRY_START = 1 / 3
/** How far below their resting place the figures begin, in viewport heights. */
const STATS_RISE_VH = 14
/** How far they carry on upward as the band grows past them. */
const STATS_EXIT_VH = 10
/** Ease-out cubic: fast off the mark, settled well before the band stops. */
function settle(t: number): number {
  return 1 - (1 - t) ** 3
}

/**
 * A figure holds this share of its stretch of scroll before it starts being
 * pushed out by the next one. Without the hold the belt is in permanent
 * motion and nothing can be read; with too much of one the change feels like
 * a slide show. A little under half leaves each figure a couple of wheel
 * notches at rest and gives the push about as many again to play out in.
 */
const STAT_HOLD = 0.42
/**
 * Each strip below the first waits a little longer before it moves, so the
 * three lines push each other out in sequence rather than as one block. The
 * belt is scrubbed, so this is a share of scroll, not a delay in time.
 */
const STAT_LAG = 0.07
/** Custom properties the band reads to place each strip. */
const STAT_POSITION_VARS = ['--stat-note', '--stat-value', '--stat-label'] as const

/** Smoothstep: leaves and arrives gently, linear through the middle. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

type Offset = { x: number; y: number }

export function OpeningScene({
  stats,
  children,
  headline,
}: {
  stats: Stat[]
  /** Hero copy and actions — everything that rides the zoom. */
  children: ReactNode
  /** Rendered inside the zoom wrapper, above the copy. */
  headline: ReactNode
}): ReactElement {
  const zoomRef = useRef<HTMLDivElement>(null)
  const headlineRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const bandRef = useRef<HTMLDivElement>(null)
  const statsRef = useRef<HTMLDivElement>(null)
  const origin = useRef<Offset | null>(null)
  const gapYPct = useRef(50)
  const pinned = useStage()?.pinned ?? false

  /**
   * Locates the gap between the headline and the copy — the point the page
   * falls into. Read with the zoom reset, since a measurement taken mid-zoom
   * would be scaled and would drift the origin on every refresh.
   */
  const measure = useCallback(() => {
    const zoom = zoomRef.current
    const head = headlineRef.current
    const body = bodyRef.current
    if (!zoom || !head || !body) return
    const previous = zoom.style.transform
    zoom.style.transform = 'none'
    const zoomRect = zoom.getBoundingClientRect()
    const gapY = (head.getBoundingClientRect().bottom + body.getBoundingClientRect().top) / 2
    // Horizontally the punch-in stays dead centre; anchoring it to anything
    // off-centre sweeps the headline sideways instead of opening around it.
    origin.current = { x: zoomRect.width / 2, y: gapY - zoomRect.top }
    gapYPct.current = (gapY / window.innerHeight) * 100
    zoom.style.transform = previous
  }, [])

  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  useSceneProgress((p) => {
    const zoom = zoomRef.current
    const band = bandRef.current
    if (!zoom || !band) return
    if (!origin.current) measure()

    const punch = clamp01(p / PUNCH_END)
    if (origin.current) {
      zoom.style.transformOrigin = `${origin.current.x}px ${origin.current.y}px`
    }
    // Exponential, so the last stretch of scroll travels as far as the first.
    zoom.style.transform = `scale(${Math.exp(punch * Math.log(MAX_SCALE))})`
    const fade = 1 - clamp01((punch - 0.45) / 0.3)
    zoom.style.opacity = String(fade)
    // Once it is invisible, take it out of the frame entirely; otherwise the
    // browser keeps rasterising hugely scaled text nobody can see.
    zoom.style.visibility = fade > 0 ? 'visible' : 'hidden'
    if (headlineRef.current) {
      headlineRef.current.style.transform = `scale(${Math.exp(punch * Math.log(HEADLINE_LEAD))})`
    }

    // Opens from the very first pixel of scroll — any head start reads as the
    // page moving before anything happens.
    const open = clamp01(p / BAND_OPEN_END)
    const expand = clamp01((p - DWELL_END) / (1 - DWELL_END))
    const height = BAND_VH * open + (100 - BAND_VH) * expand
    // Born in the gap between the two blocks of type, settling to the middle
    // of the frame as it grows.
    const centre = gapYPct.current + (50 - gapYPct.current) * open
    const top = Math.max(0, centre - height / 2)
    const bottom = Math.max(0, 100 - centre - height / 2)
    band.style.clipPath = `inset(${top}% 0% ${bottom}% 0%)`
    // A zero-height clip still leaves a hairline once the two percentages are
    // rounded to device pixels independently, which draws a stray rule across
    // the resting hero.
    band.style.visibility = height > 0 ? 'visible' : 'hidden'

    // The figures rise with the band rather than appearing once it settles, so
    // the two movements read as one. They keep travelling upward as the band
    // grows past them, which hands the frame to the next chapter.
    const figures = statsRef.current
    if (!figures) return
    const rise = 1 - settle(clamp01((open - STATS_ENTRY_START) / (1 - STATS_ENTRY_START)))
    const leave = clamp01((expand - 0.02) / 0.28)
    figures.style.transform = `translateY(${rise * STATS_RISE_VH - leave * STATS_EXIT_VH}vh)`
    figures.style.opacity = String(1 - leave)

    // The belt is scrubbed rather than stepped: each figure gets an equal
    // stretch of the dwell, holds still through the first part of it, then is
    // pushed out over the rest. Scrolling drives that push directly, so it
    // stops where the reader stops. Publishing it as custom properties keeps
    // this to one DOM write per strip and leaves the band purely declarative —
    // React state would re-render on every scroll frame.
    const dwell = clamp01((p - PUNCH_END) / (DWELL_END - PUNCH_END))
    const last = stats.length - 1
    const reached = Math.min(last, Math.floor(dwell * stats.length))
    const within = dwell * stats.length - reached
    STAT_POSITION_VARS.forEach((property, strip) => {
      const hold = STAT_HOLD + strip * STAT_LAG
      const push = smooth(clamp01((within - hold) / (1 - hold)))
      figures.style.setProperty(property, Math.min(last, reached + push).toFixed(4))
    })
  })

  // Without the stage there is no progress to paint from, so the zoom and the
  // band never run. The figures still have to reach the reader: they become an
  // ordinary dark panel under the hero.
  if (!pinned) {
    return (
      <>
        <div className="w-full">
          {headline}
          {children}
        </div>
        <dl className="mt-20 grid grid-cols-1 gap-px bg-neutral-50/15 sm:grid-cols-2">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0 bg-neutral-950 px-5 py-10 text-neutral-50">
              <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                {stat.note}
              </dt>
              <dd className="mt-4 break-words text-4xl font-medium tracking-[-0.045em] tabular-nums">
                {stat.value}
              </dd>
              <dd className="mt-2 text-sm text-accent-300">{stat.label}</dd>
            </div>
          ))}
        </dl>
      </>
    )
  }

  return (
    <>
      {/* The lift sits outside the zoom wrapper, whose `transform` is rewritten
          on every scroll frame and would overwrite it. */}
      <div className="w-full" style={{ transform: `translateY(-${HERO_LIFT_VH}vh)` }}>
        <div ref={zoomRef} className="relative w-full will-change-transform">
          <div ref={headlineRef} className="will-change-transform">
            {headline}
          </div>
          <div ref={bodyRef}>{children}</div>
        </div>
      </div>

      <div
        ref={bandRef}
        className="pointer-events-none absolute inset-0 bg-neutral-950"
        style={{ clipPath: 'inset(50% 0% 50% 0%)', visibility: 'hidden' }}
      >
        <div className="grid h-full place-items-center px-5">
          <div
            ref={statsRef}
            className="will-change-transform"
            style={
              {
                transform: `translateY(${STATS_RISE_VH}vh)`,
                '--stat-note': '0',
                '--stat-value': '0',
                '--stat-label': '0',
              } as CSSProperties
            }
          >
            <StatBand stats={stats} />
          </div>
        </div>
      </div>
    </>
  )
}
