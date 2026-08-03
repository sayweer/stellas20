import {
  useCallback,
  useEffect,
  useRef,
  useState,
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
 * Past roughly 10× the headline already covers the frame, and every further
 * step only asks the browser to re-rasterise larger text for no visible gain.
 */
const MAX_SCALE = 12
/** The headline runs ahead of the rest of the hero, which layers the movement. */
const HEADLINE_LEAD = 1.6
/** How far the hero sits above the middle of the frame, in viewport heights. */
const HERO_LIFT_VH = 7

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
  const origin = useRef<Offset | null>(null)
  const gapYPct = useRef(50)
  const [active, setActive] = useState(0)
  const [statsHidden, setStatsHidden] = useState(true)
  const painted = useRef({ step: 0, hidden: true })
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
    const open = clamp01(p / PUNCH_END)
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

    // Only touch React state when the value actually changes. Calling these on
    // every scroll frame schedules work that mutates the DOM mid-scroll, which
    // then forces ScrollTrigger's next read to reflow.
    const dwell = clamp01((p - PUNCH_END) / (DWELL_END - PUNCH_END))
    const step = Math.min(stats.length - 1, Math.floor(dwell * stats.length))
    if (step !== painted.current.step) {
      painted.current.step = step
      setActive(step)
    }
    const hide = open < 0.85 || expand > 0.15
    if (hide !== painted.current.hidden) {
      painted.current.hidden = hide
      setStatsHidden(hide)
    }
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
          <StatBand stats={stats} active={active} hidden={statsHidden} />
        </div>
      </div>
    </>
  )
}
