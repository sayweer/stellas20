import { useEffect, useId, useRef, type ReactElement, type ReactNode } from 'react'

/* ─────────────────────────────────────────────────────────
 * PIXEL REVEAL
 *
 * The line arrives as coarse blocks, half-resolves, breaks up again, then
 * lands sharp. The step list is deliberately non-monotonic — a straight
 * fade from blocky to sharp reads as a blur, not as type being assembled.
 *
 * `px` is the block size in CSS pixels, `sx` stretches the line sideways and
 * `dx` nudges it off centre; both settle at rest on the last step.
 * ───────────────────────────────────────────────────────── */

const STEPS = [
  { px: 12, sx: 1.12, dx: -7 },
  { px: 5, sx: 0.93, dx: 6 },
  { px: 10, sx: 1.07, dx: 5 },
  { px: 3, sx: 0.97, dx: -4 },
  { px: 7, sx: 1.04, dx: 3 },
  { px: 2, sx: 0.99, dx: -2 },
  { px: 4, sx: 1.02, dx: 1 },
  { px: 0, sx: 1, dx: 0 },
] as const

const STEP_MS = 85

export function PixelText({
  children,
  /** Staggers this line behind the one above it. */
  delay = 0,
}: {
  children: ReactNode
  delay?: number
}): ReactElement {
  // `useId` returns a value containing ':', which is not valid inside url(#…).
  const filterId = `pixel-${useId().replace(/:/g, '')}`
  const textRef = useRef<HTMLSpanElement>(null)
  const floodRef = useRef<SVGFEFloodElement>(null)
  const cellRef = useRef<SVGFECompositeElement>(null)
  const morphRef = useRef<SVGFEMorphologyElement>(null)

  useEffect(() => {
    const text = textRef.current
    const flood = floodRef.current
    const cell = cellRef.current
    const morph = morphRef.current
    if (!text || !flood || !cell || !morph) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const paint = (step: (typeof STEPS)[number]): void => {
      // A zero-radius dilate erases the glyphs entirely, so the last step
      // hands the line back to the browser unfiltered.
      if (step.px === 0) {
        text.style.filter = ''
        text.style.transform = ''
        return
      }
      flood.setAttribute('x', String(step.px / 2))
      flood.setAttribute('y', String(step.px / 2))
      cell.setAttribute('width', String(step.px))
      cell.setAttribute('height', String(step.px))
      morph.setAttribute('radius', String(step.px / 2))
      text.style.filter = `url(#${filterId})`
      text.style.transform = `translateX(${step.dx}px) scaleX(${step.sx})`
    }

    let index = 0
    let ticker: ReturnType<typeof setInterval>
    paint(STEPS[0])

    // Holding the first block state through the delay is what makes the
    // stagger visible: the second line is already coarse before it moves.
    const starter = setTimeout(() => {
      ticker = setInterval(() => {
        index += 1
        const step = STEPS[index]
        if (!step) {
          clearInterval(ticker)
          return
        }
        paint(step)
      }, STEP_MS)
    }, delay)

    return () => {
      clearTimeout(starter)
      clearInterval(ticker)
      text.style.filter = ''
      text.style.transform = ''
    }
  }, [delay, filterId])

  return (
    <>
      {/* Samples the line on a grid of single points, then grows each point
          back into a full cell — a mosaic, not a blur. */}
      <svg aria-hidden="true" focusable="false" className="pointer-events-none absolute h-0 w-0">
        <filter
          id={filterId}
          x="-8%"
          y="-40%"
          width="116%"
          height="180%"
          colorInterpolationFilters="sRGB"
        >
          <feFlood ref={floodRef} x="6" y="6" width="1" height="1" />
          <feComposite ref={cellRef} width="12" height="12" />
          <feTile result="grid" />
          <feComposite in="SourceGraphic" in2="grid" operator="in" />
          <feMorphology ref={morphRef} operator="dilate" radius="6" />
        </filter>
      </svg>
      {/* Inline-block so the sideways stretch applies at all — `transform` is
          a no-op on an inline box. */}
      <span ref={textRef} className="inline-block">
        {children}
      </span>
    </>
  )
}
