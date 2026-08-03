import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react'
import { StatBand, type Stat } from './StatBand'
import { clamp01, useSceneProgress, useStage } from './scroll/stageContext'

/* ─────────────────────────────────────────────────────────
 * OPENING
 *
 * The hero does not slide away — the page falls into the full stop at the end
 * of the headline. Scrolling drives a punch-in centred on that red dot; a dark
 * band opens from the same point, holds while the live protocol figures roll
 * through it, then grows to fill the frame and hand over to the first chapter.
 *
 * Phases, in scene progress `p`:
 *   0.00 → 0.30   punch-in; band opens from the dot to BAND_VH
 *   0.30 → 0.84   band holds, figures roll
 *   0.84 → 1.00   band grows to full frame (the next chapter is dark too, so
 *                 the seam between them is invisible)
 * ───────────────────────────────────────────────────────── */

const PUNCH_END = 0.3
const DWELL_END = 0.84
/** Where the band starts opening — slightly after the zoom, so it reads as a consequence. */
const BAND_START = 0.06
/** Resting band height, in viewport heights. */
const BAND_VH = 38
const MAX_SCALE = 30
/** The headline runs ahead of the rest of the hero, which layers the movement. */
const HEADLINE_LEAD = 1.6

type Offset = { x: number; y: number }

export function OpeningScene({
  stats,
  children,
  headline,
}: {
  stats: Stat[]
  /** Hero copy and actions — everything that rides the zoom. */
  children: ReactNode
  /**
   * Rendered inside the zoom wrapper. It must attach the given ref to the
   * element the punch-in centres on — the full stop that ends the headline.
   */
  headline: (dotRef: RefObject<HTMLElement | null>) => ReactNode
}): ReactElement {
  const zoomRef = useRef<HTMLDivElement>(null)
  const headlineRef = useRef<HTMLDivElement>(null)
  const bandRef = useRef<HTMLDivElement>(null)
  const dot = useRef<HTMLElement | null>(null)
  const origin = useRef<Offset | null>(null)
  const dotYPct = useRef(50)
  const [active, setActive] = useState(0)
  const [statsHidden, setStatsHidden] = useState(true)
  const pinned = useStage()?.pinned ?? false

  /**
   * Reads the dot's position with the zoom reset, since a measurement taken
   * mid-zoom would be scaled and would drift the origin every refresh.
   */
  const measure = useCallback(() => {
    const zoom = zoomRef.current
    const target = dot.current
    if (!zoom || !target) return
    const previous = zoom.style.transform
    zoom.style.transform = 'none'
    const dotRect = target.getBoundingClientRect()
    const zoomRect = zoom.getBoundingClientRect()
    origin.current = {
      x: dotRect.left + dotRect.width / 2 - zoomRect.left,
      y: dotRect.top + dotRect.height / 2 - zoomRect.top,
    }
    dotYPct.current = ((dotRect.top + dotRect.height / 2) / window.innerHeight) * 100
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
    zoom.style.opacity = String(1 - clamp01((punch - 0.5) / 0.4))
    if (headlineRef.current) {
      headlineRef.current.style.transform = `scale(${Math.exp(punch * Math.log(HEADLINE_LEAD))})`
    }

    const open = clamp01((p - BAND_START) / (PUNCH_END - BAND_START))
    const expand = clamp01((p - DWELL_END) / (1 - DWELL_END))
    const height = BAND_VH * open + (100 - BAND_VH) * expand
    // The band starts at the dot and settles to the middle of the frame as it
    // opens, so it grows out of the punctuation rather than out of nowhere.
    const centre = dotYPct.current + (50 - dotYPct.current) * open
    const top = Math.max(0, centre - height / 2)
    const bottom = Math.max(0, 100 - centre - height / 2)
    band.style.clipPath = `inset(${top}% 0% ${bottom}% 0%)`

    const dwell = clamp01((p - PUNCH_END) / (DWELL_END - PUNCH_END))
    setActive(Math.min(stats.length - 1, Math.floor(dwell * stats.length)))
    setStatsHidden(open < 0.85 || expand > 0.15)
  })

  // Without the stage there is no progress to paint from, so the zoom and the
  // band never run. The figures still have to reach the reader: they become an
  // ordinary dark panel under the hero.
  if (!pinned) {
    return (
      <>
        <div className="w-full">
          {headline(dot)}
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
      <div ref={zoomRef} className="relative w-full will-change-transform">
        <div ref={headlineRef} className="will-change-transform">
          {headline(dot)}
        </div>
        {children}
      </div>

      <div
        ref={bandRef}
        className="pointer-events-none absolute inset-0 bg-neutral-950"
        style={{ clipPath: 'inset(50% 0% 50% 0%)' }}
      >
        <div className="grid h-full place-items-center px-5">
          <StatBand stats={stats} active={active} hidden={statsHidden} />
        </div>
      </div>
    </>
  )
}
